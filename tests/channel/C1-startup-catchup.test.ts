/**
 * C1 启动补收：窗口关闭期间到的消息，启动后必须被处理一次
 *
 * 老仓库 `setTimeout(check, 500)`。数字是试出来的（reuse.md 要求照抄）。
 * 症状形态：窗口重开后什么都没发生，而消息就在文件里躺着。
 */
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { channelPaths, watchInbox } from "../../src/channel/index.ts";
import { buildMessage, makeRoot, sleep, waitFor } from "./_fixture.ts";

describe("C1 启动补收", () => {
  it("启动前已存在的消息，启动后被处理恰好一次", async () => {
    const { root, cleanup } = makeRoot("C1-catchup");
    const p = channelPaths(root);

    // 先写消息，后启动监听——模拟「窗口关着的时候消息到了」
    const msg = buildMessage("task_assignment", "arch", { milestone: "M1" });
    writeFileSync(p.inbox("dev"), JSON.stringify(msg), "utf-8");

    const seen: string[] = [];
    const stop = watchInbox(root, "dev", (m) => void seen.push(m.type), {
      watch: null,
      pollMs: 5_000, // 轮询周期故意远大于补收延迟，确保处理来自补收而非轮询
    });

    try {
      await waitFor(() => seen.length > 0, 3_000);
      // 再等一个补收周期，确认没有第二次
      await sleep(800);
      expect(seen).toEqual(["task_assignment"]);
    } finally {
      stop();
      cleanup();
    }
  });
});
