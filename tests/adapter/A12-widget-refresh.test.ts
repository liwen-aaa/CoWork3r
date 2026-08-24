/**
 * A12 状态条随状态刷新（RUN-1 真跑照出：widget 是一次性快照）
 *
 * 来源事故（2026-08-24 wf-demo 真跑，RUN1-001 [serious]）：`setWidget` 只挂在
 * `session_start`（全项目唯一调用点）。arch 分发 M1、tester 报 verdict_pass 之后，
 * 状态条仍显示 `（未开始） R1 失败 0/5`，而 state 里是 `M1 / maxRounds 3 /
 * awaitingHuman M1`、台账已生成。
 *
 * **后果是挡主流程，不是显示美观**：「待你判定：1 条（见 wf/human-pending.md）」
 * 这行指路信息一直在生成（`/status` 敲出来是对的），只是从未进过状态条——
 * 于是人在人工关卡上问「我没看到 to-human 的内容啊？在哪里」。D-30 要的是
 * 「不看就会漏的东西出现在视线路径上」，而它退化成了「手动刷新的状态快照」
 * （人 `/reload` 后就更新，印证唯一刷新途径是重启会话）。
 *
 * **为什么 mock 没抓到**：fakePi 记录 `setWidget` 调用，测试问的是「session_start
 * 后 widget 被设过吗」（设过了），真跑问的是「它一直是对的吗」（不是）。
 * 判据脱钩——与 A9c 用例③（前置先拦，停止条件走不到）、A4 的 maxRounds 撞值、
 * A9f setup 不建前置同形状。这是本项目第四次同形状。
 *
 * 判据（本文件全部用它）：**状态变化后，widget 最新内容 == briefingFor 的当前输出。**
 * 不是「被调过 N 次」——那还是「设过了」的变体。
 */
import { describe, expect, it } from "vitest";

import { wire } from "../../src/adapter/index.ts";
import { briefingFor } from "../../src/adapter/status.ts";
import { deliver, readState, watchInbox, writeState } from "../../src/channel/index.ts";
import type { Stop, WatchOptions } from "../../src/channel/watch.ts";
import { build, checkRoute } from "../../src/protocol/index.ts";
import type { Message, Role } from "../../src/protocol/index.ts";
import { fakePi, installPlan, makeProject, realConfig, waitFor } from "./_fixture.ts";

const fastWatch = (root: string, r: Role, onMessage: (m: Message) => void, o: WatchOptions): Stop =>
  watchInbox(root, r, onMessage, {
    watch: null,
    pollMs: 40,
    catchupMs: 20,
    ...(o.onWake ? { onWake: o.onWake } : {}),
  });

/** 状态条当前显示的内容（fakePi 记录了每次 setWidget，取最后一次） */
function widgetNow(pi: ReturnType<typeof fakePi>): string {
  const last = pi.widgets.at(-1);
  return (last?.lines ?? []).join("\n");
}

/** 真实状态该显示成什么（与 /status 同一个拼装口） */
function truth(root: string, role: "arch" | "dev" | "tester"): string {
  return briefingFor(root, role) ?? "";
}

function setup(role: "arch" | "dev" | "tester", label: string) {
  const p = makeProject(label);
  installPlan(p.root);
  realConfig(p.root, { test: null, maxRounds: 3 });
  const pi = fakePi();
  const stopAll = wire(role, pi as never, { watch: fastWatch });
  pi.emit("session_start", {}, { cwd: p.root, mode: "tui" });
  return { ...p, pi, stopAll };
}

describe("A12 状态条随状态刷新", () => {
  it("本窗口投递后 → 状态条 == 当前真实状态（旧实现停在 session_start 快照）", async () => {
    const t = setup("arch", "a12-deliver");
    try {
      // 分发前：状态条 == 真实状态（session_start 刚设过，这一步本来就该绿）
      expect(widgetNow(t.pi)).toBe(truth(t.root, "arch"));

      const def = t.pi.tools.find((x) => x.name === "send_task")!.def as {
        execute: (...a: unknown[]) => Promise<unknown>;
      };
      // ctx 走 fakePi.toolCtx：真实 pi 给 execute 的是完整 ExtensionContext（带 ui.setWidget），
      // 手拼 { cwd } 会与真实脉冲脱钩（D-25）——A12 第一版就因此误判「投递后不刷新」
      await def.execute("d", { type: "task_assignment", milestone: "M1", body: "去干" }, undefined, undefined, t.pi.toolCtx(t.root));

      // 分发后 state 变了（milestone M1 + maxRounds 从 cfg 落盘）
      expect(readState(t.root).milestone).toBe("M1");
      expect(readState(t.root).maxRounds).toBe(3);
      // 判据：状态条必须跟上。旧实现这里显示「（未开始） R1 失败 0/5」
      expect(widgetNow(t.pi), "投递改了状态，状态条却停在分发前").toBe(truth(t.root, "arch"));
      expect(widgetNow(t.pi)).toContain("M1");
      expect(widgetNow(t.pi)).toContain("0/3");
    } finally {
      t.stopAll();
      t.cleanup();
    }
  });

  it("收到消息被唤醒后 → 状态条 == 当前真实状态（消息由别的窗口投来）", async () => {
    const t = setup("dev", "a12-wake");
    try {
      writeState(t.root, { milestone: "M1", round: 1, maxRounds: 3, consecutiveFails: 0 });
      // 别的窗口（arch）投来一条：本窗口没调过 send_task，状态却变了
      expect(deliver(t.root, build("task_assignment", "arch", { milestone: "M1", body: "去干" }), checkRoute).ok).toBe(true);
      await waitFor(() => t.pi.sent.some((s) => s.text.includes("task_assignment")));

      expect(widgetNow(t.pi), "被唤醒后状态条要反映新状态").toBe(truth(t.root, "dev"));
    } finally {
      t.stopAll();
      t.cleanup();
    }
  });

  it("arch 代排 human 槽位后 → 状态条的「待你判定」跟着变（RUN1-001 的原始症状）", async () => {
    const t = setup("arch", "a12-drain");
    try {
      writeState(t.root, { milestone: "M1", round: 1, maxRounds: 3, consecutiveFails: 0 });
      // tester 报 verdict_pass → 落 human 槽位 → arch 代排进台账
      const v = build("verdict_pass", "tester", {
        milestone: "M1",
        artifact: "wf/test-report-M1.md",
        questions: ["M1.5 报错读起来知道该怎么改吗"],
      });
      expect(deliver(t.root, v, checkRoute).ok).toBe(true);
      // 等产品行为本身（widget 内容），不等盘上 truth：deliver 写槽位那一刻 truth 就含
      // 「待你判定」（status.ts humanPending 把槽位消息计入），而 drain 是 pollMs 40 的
      // 异步 watcher——等 truth 会在刷新发生前通过。判据声明（widget == 当前输出）被
      // 跳过 = 同形状第四次（文件头 A9c/A4/A9f 三次）
      await waitFor(() => widgetNow(t.pi).includes("待你判定") && widgetNow(t.pi).includes("wf/human-pending.md"));

      // 判据：台账有待办 → 状态条必须出现「待你判定」+ 指路（人在真跑里就是这里卡住的）
      const w = widgetNow(t.pi);
      expect(w, "待你判定这行没进状态条 → 人不知道该去哪看").toBe(truth(t.root, "arch"));
      expect(w).toContain("待你判定");
      expect(w).toContain("wf/human-pending.md");
    } finally {
      t.stopAll();
      t.cleanup();
    }
  });

  it("回合结束时兜一次（外部改动：另一个窗口投递 / 人手改文件）", async () => {
    const t = setup("tester", "a12-agentend");
    try {
      // 不经本窗口任何钩子，直接改盘（等价于另一个窗口投递后本窗口还没被唤醒）
      writeState(t.root, { milestone: "M2", round: 4, maxRounds: 3, consecutiveFails: 2 });
      t.pi.emit("agent_end", { messages: [] }, { cwd: t.root, mode: "tui" });

      const w = widgetNow(t.pi);
      expect(w, "回合边界该兜住外部改动").toBe(truth(t.root, "tester"));
      expect(w).toContain("M2");
      expect(w).toContain("2/3");
    } finally {
      t.stopAll();
      t.cleanup();
    }
  });

  it("print/rpc 模式不设状态条（无会话窗口）", async () => {
    const p = makeProject("a12-print");
    try {
      installPlan(p.root);
      realConfig(p.root, { test: null });
      const pi = fakePi();
      const stop = wire("arch", pi as never, { watch: fastWatch });
      pi.emit("session_start", {}, { cwd: p.root, mode: "print" });
      pi.emit("agent_end", { messages: [] }, { cwd: p.root, mode: "print" });
      expect(pi.widgets).toHaveLength(0);
      stop();
    } finally {
      p.cleanup();
    }
  });
});
