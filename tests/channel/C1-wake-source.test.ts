/**
 * C1 唤醒来源可观测（onWake）
 *
 * 三个触发源（启动补收 / fs.watch 事件 / 轮询）共用同一个 check()，所以从行为上
 * 分不出消息是谁唤醒的。而 plan.md M1 有一条人工断言要求「日志里有明确的轮询触发标记」
 * ——没有这个口，那条断言无法执行：人只能看到「消息被处理了」，看不到「是轮询干的」。
 *
 * 本用例锁两件事：标记与来源一致，且只在真的处理了消息时才报（不是每次 check）。
 * 后者是防噪声：10 秒一行「我查过了」会训练人忽略日志。
 */
import { describe, expect, it } from "vitest";

import { deliver, watchInbox } from "../../src/channel/index.ts";
import { buildMessage, makeRoot, routeValidate, waitFor } from "./_fixture.ts";

describe("C1 唤醒来源可观测", () => {
  it("禁用 fs.watch 时，标记为 poll", async () => {
    const { root, cleanup } = makeRoot("C1-wake-poll");
    const wakes: string[] = [];
    let stop: (() => void) | undefined;

    try {
      stop = watchInbox(root, "dev", () => {}, {
        watch: null, // 拔掉事件通道 —— Windows 漏事件时就是这个样子
        pollMs: 120,
        catchupMs: 10_000, // 推远，确保不是补收抢到的
        onWake: (source) => wakes.push(source),
      });

      deliver(root, buildMessage("task_assignment", "arch", { milestone: "M1" }), routeValidate);
      await waitFor(() => wakes.length > 0, 3000);

      expect(wakes).toEqual(["poll"]);
    } finally {
      stop?.();
      cleanup();
    }
  });

  it("空收件箱不产生标记（只在真的处理了消息时才报）", async () => {
    const { root, cleanup } = makeRoot("C1-wake-quiet");
    const wakes: string[] = [];
    let stop: (() => void) | undefined;

    try {
      stop = watchInbox(root, "dev", () => {}, {
        watch: null,
        pollMs: 30,
        catchupMs: 10_000,
        onWake: (source) => wakes.push(source),
      });

      // 什么都不投，让它空转十几个周期
      await new Promise((r) => setTimeout(r, 500));

      expect(wakes).toEqual([]);
    } finally {
      stop?.();
      cleanup();
    }
  });

  it("启动前已存在的消息，标记为 catchup", async () => {
    const { root, cleanup } = makeRoot("C1-wake-catchup");
    const wakes: string[] = [];
    let stop: (() => void) | undefined;

    try {
      // 先落盘，后开监听 —— 窗口关闭期间到的消息
      deliver(root, buildMessage("task_assignment", "arch", { milestone: "M1" }), routeValidate);

      stop = watchInbox(root, "dev", () => {}, {
        watch: null,
        pollMs: 10_000, // 推远，确保不是轮询抢到的
        catchupMs: 20,
        onWake: (source) => wakes.push(source),
      });

      await waitFor(() => wakes.length > 0, 3000);
      expect(wakes).toEqual(["catchup"]);
    } finally {
      stop?.();
      cleanup();
    }
  });
});
