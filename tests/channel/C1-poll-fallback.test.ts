/**
 * C1 事件不可靠，必须有轮询兜底
 *
 * Windows 上 `fs.watch` 会漏事件——消息写进去了，回调不触发，整条流水线静默停住。
 * 所以唤醒是双通道：`fs.watch` 给低延迟，`setInterval` 给保底。
 *
 * 本用例验函数行为：禁掉 fs.watch，轮询仍在 10s 内触发处理。
 * plan.md M1 那条 `[human]` 验的是另一半——真实事件循环里 setInterval 没被饿死。
 * 两条都需要：这条用注入的 fake watcher，证明不了真实进程里定时器活着。
 */
import { renameSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { channelPaths, watchInbox } from "../../src/channel/index.ts";
import { build } from "../../src/protocol/index.ts";
import { makeRoot, waitFor } from "./_fixture.ts";

describe("C1 轮询兜底", () => {
  it("禁用 fs.watch 后，轮询在 10s 内触发处理", async () => {
    const { root, cleanup } = makeRoot("C1-poll");
    const seen: string[] = [];

    // watch 传 null = 明确禁用事件通道，只留轮询。
    // 这个开关是接口的一部分，不是测试后门：C1 的判据就是「没有 fs.watch 也能工作」，
    // 而 fs.watch 在 Windows 上漏事件时的表现，正是这个开关关掉的样子。
    const stop = watchInbox(root, "dev", (m) => void seen.push(m.type), {
      watch: null,
      pollMs: 1_000,
    });

    try {
      const p = channelPaths(root);
      const msg = build("task_assignment", "arch", { body: "通道层测试消息", milestone: "M1" });
      // 直接落盘，绕过 deliver——本用例验的是唤醒侧，不是投递侧
      writeFileSync(`${p.inbox("dev")}.tmp`, JSON.stringify(msg), "utf-8");
      renameSync(`${p.inbox("dev")}.tmp`, p.inbox("dev"));

      const elapsed = await waitFor(() => seen.length > 0, 10_000);
      expect(seen).toEqual(["task_assignment"]);
      // 轮询周期 1s，10s 是 C1 的契约上限。真跑一次事件循环，不用 fake timers：
      // fake timers 下这条断言恒真，也就恒不检查任何东西。
      expect(elapsed).toBeLessThan(10_000);
    } finally {
      stop();
      cleanup();
    }
  });

  it("Stop 之后轮询不再触发（否则套件不会自行退出）", async () => {
    const { root, cleanup } = makeRoot("C1-stop");
    const seen: string[] = [];
    const stop = watchInbox(root, "dev", (m) => void seen.push(m.type), {
      watch: null,
      pollMs: 200,
    });

    stop();

    try {
      const p = channelPaths(root);
      const msg = build("task_assignment", "arch", { body: "通道层测试消息", milestone: "M1" });
      writeFileSync(p.inbox("dev"), JSON.stringify(msg), "utf-8");

      // 给足三个轮询周期。Stop 生效则永远等不到。
      await new Promise((r) => setTimeout(r, 700));
      expect(seen).toEqual([]);
    } finally {
      cleanup();
    }
  });
});
