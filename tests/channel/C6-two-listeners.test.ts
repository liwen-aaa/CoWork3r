/**
 * C6 同角色单实例 —— 固定事实，非期望行为
 *
 * 同一角色开两个窗口 → 两个都在监听同一收件箱 → 消息被你看不见的那个窗口
 * 先处理并清空 → 你盯的窗口永远没反应。**这个故障没有任何可见症状。**
 *
 * 本层不解决它（进程管理是 08-dist 的事）。本用例的作用是把「两个监听者会争抢」
 * 钉成一条测试，防止有人以为多实例是安全的。
 *
 * 所以这里断言的是「总处理次数为 1」，不是「哪一个处理了」——后者是竞态，
 * 断言它会让用例本身变成 flaky 的来源。
 */
import { describe, expect, it } from "vitest";

import { deliver, watchInbox } from "../../src/channel";
import { buildMessage, makeRoot, routeValidate, sleep } from "./_fixture";

describe("C6 两个监听者", () => {
  it("同一收件箱两个监听者：消息总共只被处理一次", async () => {
    const { root, cleanup } = makeRoot("C6-two");
    const a: string[] = [];
    const b: string[] = [];

    const stopA = watchInbox(root, "dev", (m) => void a.push(m.type), {
      watch: null,
      pollMs: 150,
    });
    const stopB = watchInbox(root, "dev", (m) => void b.push(m.type), {
      watch: null,
      pollMs: 150,
    });

    try {
      deliver(root, buildMessage("task_assignment", "arch", { milestone: "M1" }), routeValidate);
      await sleep(1_500); // 十个轮询周期，两边都有充分机会

      // 水位落盘且两个实例共享同一个文件，所以后到的那个看到 mtime <= processed
      expect(a.length + b.length).toBe(1);
    } finally {
      stopA();
      stopB();
      cleanup();
    }
  });
});
