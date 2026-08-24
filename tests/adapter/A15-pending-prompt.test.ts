/**
 * A15 待签提醒：有人工关卡在等，就把它推到人眼前（不用人主动查）
 *
 * 来源（2026-08-24 wf-demo 真跑）：人在 M1 问「内容在哪」、M2 说「/pending 要我
 * 主动确认感觉还是太麻烦了」。两次都是同一件事——**待签的内容不会自己出现**。
 * 状态条是「看一眼才知道」，/pending 是「主动跑一下才知道」，两者都要求人
 * 的注意力在场。而 D-30 的判据是「需要人主动去打开才能看见的待办 = 无效载体」。
 *
 * 现状的缺口：tester 报 verdict_pass → arch 代排进台账 → **arch 被唤醒，人没有**。
 * 提醒机制（remind.ts）只对 LLM 说「有活该投」，对人什么都没说。
 *
 * 方案：arch 窗口的 agent_end 里，台账有待办时发一条**待签提醒**，内容直接带上
 * 第一条待办的问题原文。防循环与投递提醒同构（「已提醒过」这个 user 消息是锚），
 * 但用独立前缀——否则会互相误判（投递提醒的锚是「wf: 本轮结束」）。
 */
import { describe, expect, it } from "vitest";

import { wire } from "../../src/adapter/index.ts";
import { appendHumanLedger, watchInbox, writeState } from "../../src/channel/index.ts";
import type { Stop, WatchOptions } from "../../src/channel/watch.ts";
import { build } from "../../src/protocol/index.ts";
import type { Message, Role } from "../../src/protocol/index.ts";
import { fakePi, installPlan, makeProject, realConfig } from "./_fixture.ts";

const fastWatch = (root: string, r: Role, onMessage: (m: Message) => void, o: WatchOptions): Stop =>
  watchInbox(root, r, onMessage, { ...o, watch: null, pollMs: 40, catchupMs: 20 });

const QUESTION = "M2.5 long 形态的单复数在边界值上读起来自然吗？1.5 分钟该叫什么：89999ms → 1 minute、90000ms → 2 minutes";

function setup(label: string) {
  const p = makeProject(label);
  installPlan(p.root);
  realConfig(p.root, { test: null });
  writeState(p.root, { milestone: "M2", round: 1, maxRounds: 3, consecutiveFails: 0 });
  const pi = fakePi();
  const stopAll = wire("arch", pi as never, { watch: fastWatch });
  pi.emit("session_start", {}, { cwd: p.root, mode: "tui" });
  return { ...p, pi, stopAll };
}

/** 台账里放一条待签的 verdict_pass（走真实渲染） */
function pending(root: string): void {
  appendHumanLedger(
    root,
    build("verdict_pass", "tester", { milestone: "M2", artifact: "wf/test-report-M2.md", questions: [QUESTION] }),
  );
}

/** 一条「本轮结束」agent_end：有任务上下文、没投递——投递提醒不该在这轮发，但待签该发 */
function endTurn(pi: ReturnType<typeof fakePi>, root: string): void {
  pi.emit(
    "agent_end",
    {
      messages: [
        { role: "user", content: "wf: 收到 verdict_pass（tester → arch，M2）：验收通过", timestamp: 1 },
      ],
    },
    { cwd: root, mode: "tui" },
  );
}

describe("A15 待签提醒", () => {
  it("台账有待办 → arch 回合结束时提醒带问题原文（不用人主动 /pending）", () => {
    const t = setup("a15-prompt");
    try {
      pending(t.root);
      endTurn(t.pi, t.root);

      const remind = t.pi.sent.find((s) => s.text.startsWith("wf: 待你判定"));
      expect(remind, "待签事项没被推给 arch 窗口").toBeDefined();
      expect(remind!.text).toContain("M2.5");
      expect(remind!.text, "提醒必须带要签的问题本身，不能只有条数").toContain("1.5 分钟");
      // 投递提醒不该发（本轮有活但没投，是投递提醒的场景）——两条提醒独立
      expect(t.pi.sent.some((s) => s.text.startsWith("wf: 本轮结束"))).toBe(false);
    } finally {
      t.stopAll();
      t.cleanup();
    }
  });

  it("没有待办 → 不发待签提醒（空转轮次不被骚扰）", () => {
    const t = setup("a15-none");
    try {
      endTurn(t.pi, t.root);
      expect(t.pi.sent.some((s) => s.text.startsWith("wf: 待你判定"))).toBe(false);
    } finally {
      t.stopAll();
      t.cleanup();
    }
  });

  it("发过一次就不再发（防 followUp 自循环，锚 = 已提醒过的 user 消息）", () => {
    const t = setup("a15-once");
    try {
      pending(t.root);
      endTurn(t.pi, t.root);
      expect(t.pi.sent.some((s) => s.text.startsWith("wf: 待你判定"))).toBe(true);

      // 下一轮：上一条提醒触发的回合（user 消息带提醒前缀）
      t.pi.emit(
        "agent_end",
        {
          messages: [
            { role: "user", content: "wf: 待你判定：…（M2.5 等人签）", timestamp: 2 },
          ],
        },
        { cwd: t.root, mode: "tui" },
      );
      const count = t.pi.sent.filter((s) => s.text.startsWith("wf: 待你判定")).length;
      expect(count, "提醒只该出现一次，否则三窗口死循环复发").toBe(1);
    } finally {
      t.stopAll();
      t.cleanup();
    }
  });

  it("非 arch 窗口不提醒（dev/tester 的回合结束只走投递提醒）", () => {
    const p = makeProject("a15-notarch");
    try {
      installPlan(p.root);
      realConfig(p.root, { test: null });
      writeState(p.root, { milestone: "M2", round: 1, maxRounds: 3, consecutiveFails: 0 });
      const dev = fakePi();
      const stop = wire("dev", dev as never, { watch: fastWatch });
      dev.emit("session_start", {}, { cwd: p.root, mode: "tui" });
      pending(p.root); // 台账有待办，但这是 dev 窗口

      dev.emit(
        "agent_end",
        { messages: [{ role: "user", content: "wf: 收到 fix_request（tester → dev，M2）", timestamp: 1 }] },
        { cwd: p.root, mode: "tui" },
      );
      expect(dev.sent.some((s) => s.text.startsWith("wf: 待你判定")), "只有 arch 代管人的判定").toBe(false);
      stop();
    } finally {
      p.cleanup();
    }
  });
});
