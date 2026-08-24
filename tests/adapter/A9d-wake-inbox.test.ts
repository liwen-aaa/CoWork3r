/**
 * A9d 唤醒链路（M6-010 的回归防线）：消息落盘 → 窗口被唤醒。
 *
 * M6.6 真跑判 FAIL 的根因：wire 从未接线 watchInbox——消息落盘后无任何通知，
 * pi agent 只在收到 user 消息时跑，窗口永远等不到消息、全靠人踢
 * （M6.6-fail.md 判据 1「无静默故障」不成立）。本文件钉五件事：
 *   ① session_start（tui）→ 投真实消息进收件箱 → 窗口被唤醒（sendUserMessage 带内容）
 *   ② 触发源日志可观测（onWake → wire 的 log）——M6.6 判据 1 的观测点
 *   ③ 唤醒即消费：消息处理后收件箱清空（C2 与唤醒的衔接）
 *   ④ print 模式不启动唤醒（无会话窗口，sendUserMessage 会与处理中的消息冲突）
 *   ⑤ 同 root 重复 session_start → 旧句柄被停（窗口重开不泄漏）
 *
 * 为什么是真实行为不是仪式（D-41 构成 diff）：每条对应 M6.6-fail.md 里的真实失败点
 * 或通道语义——①/②是「窗口不自动处理」的直接判据，③是 C2 真实路径，④防 print
 * 模式定时器卡住进程（P2 已实测 pi -e --print 会跑扩展），⑤是窗口重开的句柄管理。
 * 删任一 guard 对应用例红。
 *
 * 时序控制：注入 watch = 真实 watchInbox + 窄参数（watch: null + 小 pollMs，C1 同款）。
 * 消息由真实 build + deliver 落盘（D-25：被测对象消费的结构不由测试手写）。
 */
import { describe, expect, it } from "vitest";

import { wire } from "../../src/adapter/index.ts";
import { deliver, peek, watchInbox } from "../../src/channel/index.ts";
import type { Stop, WatchOptions } from "../../src/channel/watch.ts";
import { build, checkRoute } from "../../src/protocol/index.ts";
import type { Message, Role } from "../../src/protocol/index.ts";
import { fakePi, installPlan, makeProject, realConfig, waitFor } from "./_fixture.ts";

describe("A9d 唤醒链路", () => {
  function setup(role: "arch" | "dev" | "tester" = "dev") {
    const p = makeProject("a9d");
    installPlan(p.root);
    realConfig(p.root);
    const pi = fakePi();
    const logs: string[] = [];
    const stopped: Array<{ role: Role; at: number }> = [];
    // 注入窄参数的真实 watchInbox（C1 同款：watch: null + 小 pollMs）。
    // 消息仍走真实 deliver 落盘——只把时序压小让测试跑得快
    const watch = (root: string, r: Role, onMessage: (m: Message) => void, o: WatchOptions): Stop => {
      const inner = watchInbox(root, r, onMessage, {
        watch: null,
        pollMs: 40,
        catchupMs: 20,
        ...(o.onWake ? { onWake: o.onWake } : {}),
      });
      return () => {
        stopped.push({ role: r, at: stopped.length });
        inner();
      };
    };
    const stopAll = wire(role, pi as never, { watch, log: (l) => logs.push(l) });
    return { ...p, pi, logs, stopped, stopAll };
  }

  it("tui 模式：消息落盘 → 窗口被唤醒（内容带全）→ 收件箱清空", async () => {
    const { root, pi, logs, stopAll, cleanup } = setup();
    pi.emit("session_start", {}, { cwd: root, mode: "tui" });

    // 共识 ② widget：简报进常驻状态条（给人看、零 token），不再 sendUserMessage 复述状态
    const wf = pi.widgets.find((w) => w.name === "wf");
    expect(wf).toBeDefined();
    expect(wf?.lines.join("\n")).toMatch(/未决/);
    expect(pi.sent.some((s) => s.text.includes("就绪"))).toBe(false); // 转述形态已删

    // 投真实消息（arch → dev 的 task_assignment，走真实 build + deliver）
    const msg = build("task_assignment", "arch", { body: "造 src/hello.txt", milestone: "M1" });
    expect(deliver(root, msg, checkRoute).ok).toBe(true);

    await waitFor(() => pi.sent.some((s) => s.text.includes("task_assignment")));
    const wake = pi.sent.find((s) => s.text.includes("task_assignment"));
    expect(wake?.text).toContain("arch → dev");
    expect(wake?.text).toContain("M1");
    expect(wake?.text).toContain("造 src/hello.txt");
    expect(wake?.opts).toEqual({ deliverAs: "followUp" });
    // 触发源日志（M6.6 判据 1 的观测点）：catchup 或 poll 先到都算
    expect(logs[0]).toMatch(/dev 由 (catchup|poll) 唤醒（task_assignment）/);
    // C2 真实路径：唤醒即消费，收件箱已清空
    expect(peek(root, "dev")).toBeNull();

    stopAll();
    cleanup();
  });

  it("print 模式 → 不启动唤醒（无会话窗口）", async () => {
    const { root, pi, stopAll, cleanup } = setup();
    pi.emit("session_start", {}, { cwd: root, mode: "print" });

    const msg = build("task_assignment", "arch", { body: "x", milestone: "M1" });
    deliver(root, msg, checkRoute);
    // 若错误地启动了唤醒，poll 40ms 早该触发
    await waitFor(() => pi.sent.length > 0, 500).catch(() => undefined);
    expect(pi.sent).toHaveLength(0);

    stopAll();
    cleanup();
  });

  it("同 root 重复 session_start → 旧句柄被停（窗口重开不泄漏）", async () => {
    const { root, pi, stopped, stopAll, cleanup } = setup();
    pi.emit("session_start", {}, { cwd: root, mode: "tui" });
    pi.emit("session_start", {}, { cwd: root, mode: "tui" });
    expect(stopped).toHaveLength(1); // 第二个 session_start 停掉了第一个

    const msg = build("task_assignment", "arch", { body: "造 src/hello.txt", milestone: "M1" });
    deliver(root, msg, checkRoute);
    await waitFor(() => pi.sent.some((s) => s.text.includes("task_assignment")));
    // 只唤醒一次：旧句柄若还活着，两个 watchInbox 各持水位 0 会双处理同一条消息
    expect(pi.sent.filter((s) => s.text.includes("task_assignment"))).toHaveLength(1);

    stopAll();
    cleanup();
  });
});
