/**
 * C2 下半：清空前必须比对（四字段：from / type / milestone / round）
 *
 * 只清不比对 → 误删处理期间刚到的新消息。
 * 只比对不清 → 旧消息重放。
 * **两半都是必需的**，而且这个结论是踩了才知道的（reuse.md）。
 *
 * `to` 不进比对：它在读入口已经校过（`msg.to !== role` 就不认）。
 *
 * 2026-08-24（共识 #4）：单槽位升级为锁后，「处理期间到达的新消息」由锁挡住
 * （投递被拒，投递方重试），不再发生「覆盖 + 误清」。本文件改为验证锁 + 重试
 * 流程：处理期间投递被拒 → 处理完清空（文件删除）→ 重试成功。
 */
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { channelPaths, deliver, watchInbox } from "../../src/channel/index.ts";
import { build, checkRoute } from "../../src/protocol/index.ts";
import { makeRoot, sleep, waitFor } from "./_fixture.ts";

describe("C2 条件清空", () => {
  it("处理期间投递 → 被锁拒 → 清空后重试成功，旧消息不重放", async () => {
    const { root, cleanup } = makeRoot("C2-cond");
    const rounds: number[] = [];
    let blockedDuringProcessing = false;
    let firstDone = false;

    const stop = watchInbox(
      root,
      "dev",
      (m) => {
        rounds.push(m.round);
        if (!firstDone) {
          firstDone = true;
          // 处理第一条期间投递第二条：锁应拒绝（round 3 还在收件箱）
          const r = deliver(root, build("task_assignment", "arch", { body: "通道层测试消息", milestone: "M1", round: 4 }), checkRoute);
          blockedDuringProcessing = !r.ok;
        }
      },
      { watch: null, pollMs: 200 },
    );

    try {
      deliver(root, build("task_assignment", "arch", { body: "通道层测试消息", milestone: "M1", round: 3 }), checkRoute);

      // 第一条被处理，处理期间的第二条投递被锁拒
      await waitFor(() => rounds.includes(3), 8_000);
      await sleep(300);
      expect(blockedDuringProcessing).toBe(true);

      // 处理完清空（文件删除）→ 锁释放 → 重试投递成功
      await waitFor(() => !existsSync(channelPaths(root).inbox("dev")), 5_000);
      const retry = deliver(root, build("task_assignment", "arch", { body: "通道层测试消息", milestone: "M1", round: 4 }), checkRoute);
      expect(retry).toEqual({ ok: true });

      await waitFor(() => rounds.includes(4), 8_000);
      // 再等两个周期，确认没有重放
      await sleep(600);
      expect(rounds.filter((r) => r === 3)).toHaveLength(1);
      expect(rounds.filter((r) => r === 4)).toHaveLength(1);
    } finally {
      stop();
      cleanup();
    }
  });
});
