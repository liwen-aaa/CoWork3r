/**
 * C2 下半：清空前必须比对（四字段：from / type / milestone / round）
 *
 * 只清不比对 → 误删处理期间刚到的新消息。
 * 只比对不清 → 旧消息重放。
 * **两半都是必需的**，而且这个结论是踩了才知道的（reuse.md）。
 *
 * `to` 不进比对：它在读入口已经校过（`msg.to !== role` 就不认）。
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { channelPaths, deliver, watchInbox } from "../../src/channel";
import { buildMessage, makeRoot, routeValidate, sleep, waitFor } from "./_fixture";

describe("C2 条件清空", () => {
  it("处理期间投递的新消息不被误清，且恰好处理一次", async () => {
    const { root, cleanup } = makeRoot("C2-cond");
    const rounds: number[] = [];
    let firstDone = false;

    const stop = watchInbox(
      root,
      "dev",
      (m) => {
        rounds.push(m.round);
        if (!firstDone) {
          firstDone = true;
          // 在 onMessage 执行期间投递第二条：round 不同，四字段比对应当判定「内容已变」
          deliver(root, buildMessage("task_assignment", "arch", { milestone: "M1", round: 4 }), routeValidate);
        }
      },
      { watch: null, pollMs: 200 },
    );

    try {
      deliver(root, buildMessage("task_assignment", "arch", { milestone: "M1", round: 3 }), routeValidate);

      await waitFor(() => rounds.includes(3) && rounds.includes(4), 8_000);
      // 再等两个周期，确认没有重放
      await sleep(600);

      expect(rounds.filter((r) => r === 3)).toHaveLength(1);
      expect(rounds.filter((r) => r === 4)).toHaveLength(1);

      const p = channelPaths(root);
      expect(readFileSync(p.inbox("dev"), "utf-8").trim()).toBe("");
    } finally {
      stop();
      cleanup();
    }
  });
});
