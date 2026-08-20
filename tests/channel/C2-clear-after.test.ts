/**
 * C2 上半：处理后清空
 *
 * 单槽位文件只在投递时被覆盖，所以已处理的消息内容会留在原地。
 * 重启或水位标记异常时，它会被当成新任务重放。
 * 老仓库 2026-08-18 的缺陷修复：dev 的「快照错位」误判就是旧消息重放。
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { channelPaths, deliver, watchInbox } from "../../src/channel";
import { buildMessage, makeRoot, routeValidate, waitFor } from "./_fixture";

describe("C2 处理后清空", () => {
  it("消息被处理后 inbox 为空", async () => {
    const { root, cleanup } = makeRoot("C2-clear");
    const p = channelPaths(root);

    const seen: string[] = [];
    const stop = watchInbox(root, "dev", (m) => void seen.push(m.type), {
      watch: null,
      pollMs: 200,
    });

    try {
      const msg = buildMessage("task_assignment", "arch", { milestone: "M1" });
      deliver(root, msg, routeValidate);

      await waitFor(() => seen.length > 0, 5_000);
      // 清空发生在 onMessage 返回之后，给一个轮询周期
      await waitFor(() => readFileSync(p.inbox("dev"), "utf-8").trim() === "", 3_000);

      expect(readFileSync(p.inbox("dev"), "utf-8").trim()).toBe("");
    } finally {
      stop();
      cleanup();
    }
  });
});
