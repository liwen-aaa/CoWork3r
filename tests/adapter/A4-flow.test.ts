/**
 * A4 flow：遍历状态表，收到 X → 状态变成 Y
 *
 * flow.ts 是整套东西里**唯一的状态机，而且是确定性的**——不交给 LLM 判断
 * （老仓库 L14：arch 闲是设计不是浪费）。它必须覆盖 ROUTES 全部 9 个 type，
 * 缺一个就是「某条消息到了没人推进状态」的静默故障。
 *
 * 本文件不手写期望表——状态变化判据在 07-adapter.md 的流转表里，但测试从
 * `FLOW` 导出本身断言「9 个 type 全覆盖 + 每个 type 的 patch 符合语义」。
 * 用真实消息（build() 构造，D-25）驱动。
 */
import { describe, expect, it } from "vitest";

import { build } from "../../src/protocol/index.ts";
import { ROUTES } from "../../src/protocol/routes.ts";
import { readState } from "../../src/channel/index.ts";
import { FLOW } from "../../src/adapter/index.ts";
import { makeProject, realConfig, realMilestone } from "./_fixture.ts";

describe("A4 flow 状态表", () => {
  it("FLOW 覆盖 ROUTES 全部 9 个 type", () => {
    const keys = Object.keys(ROUTES).sort();
    const flowKeys = Object.keys(FLOW).sort();
    expect(flowKeys).toEqual(keys);
    expect(flowKeys.length).toBe(9);
  });

  it("task_assignment → round=1、fails=0（重置轮次，新的开始）", () => {
    const p = makeProject("a4-task");
    try {
      const m = realMilestone("M1");
      const msg = build("task_assignment", "arch", { milestone: "M1", body: "去干" });
      FLOW.task_assignment({ root: p.root, msg, milestone: m });
      const s = readState(p.root);
      expect(s.milestone).toBe("M1");
      expect(s.round).toBe(1);
      expect(s.consecutiveFails).toBe(0);
    } finally {
      p.cleanup();
    }
  });

  it("fix_request → round+1、fails+1（收到 FAIL 就记一笔）", () => {
    const p = makeProject("a4-fix");
    try {
      const m = realMilestone("M1");
      // 先分发到 round 1
      FLOW.task_assignment({ root: p.root, msg: build("task_assignment", "arch", { milestone: "M1", body: "去干" }), milestone: m });
      FLOW.fix_request({
        root: p.root,
        msg: build("fix_request", "tester", { milestone: "M1", artifact: "wf/test-report-M1.md", issues: [{ id: "M1-001", severity: "serious", description: "不行" }] }),
        milestone: m,
      });
      const s = readState(p.root);
      expect(s.round).toBe(2);
      expect(s.consecutiveFails).toBe(1);
    } finally {
      p.cleanup();
    }
  });

  it("milestone_passed → round=1、fails=0（验收通过，下一里程碑从零开始）", () => {
    const p = makeProject("a4-passed");
    try {
      const m = realMilestone("M1");
      FLOW.task_assignment({ root: p.root, msg: build("task_assignment", "arch", { milestone: "M1", body: "去干" }), milestone: m });
      FLOW.fix_request({
        root: p.root,
        msg: build("fix_request", "tester", { milestone: "M1", artifact: "wf/test-report-M1.md", issues: [{ id: "M1-001", severity: "serious", description: "不行" }] }),
        milestone: m,
      });
      FLOW.milestone_passed({
        root: p.root,
        msg: build("milestone_passed", "arch", { milestone: "M1", evidence: "人原话:「M1 可以过」 arch 整理:已核对确认 确认:Y" }),
        milestone: m,
      });
      const s = readState(p.root);
      expect(s.milestone).toBe("M1");
      expect(s.round).toBe(1);
      expect(s.consecutiveFails).toBe(0);
    } finally {
      p.cleanup();
    }
  });

  it("fix_request 且 fails ≥ maxRounds → 转发 stuck 给人（wake=human + stuck 信号）", () => {
    const p = makeProject("a4-stuck");
    try {
      const m = realMilestone("M1");
      // maxRounds 来自真实 config（模板里 5）。连发 5 次 fix_request 应触发 stuck
      const { cfg } = realConfig(p.root);
      if (!cfg) throw new Error("前提失败");
      let last: ReturnType<typeof FLOW.fix_request> | undefined;
      for (let i = 0; i < cfg.maxRounds; i++) {
        last = FLOW.fix_request({
          root: p.root,
          msg: build("fix_request", "tester", { milestone: "M1", artifact: "wf/test-report-M1.md", issues: [{ id: `M1-00${i}`, severity: "serious", description: `第 ${i + 1} 次` }] }),
          milestone: m,
        });
      }
      // 第 maxRounds 次：fails == maxRounds → stuck
      expect(last).toBeDefined();
      expect(last!.wake).toBe("human");
      expect(last!.stuck).toBe(true);
      const s = readState(p.root);
      expect(s.consecutiveFails).toBe(cfg.maxRounds);
    } finally {
      p.cleanup();
    }
  });

  it("verification / review_request / escalation / report / stuck → 状态不变", () => {
    const p = makeProject("a4-unchanged");
    try {
      const m = realMilestone("M1");
      // 先造一个 round=2 fails=1 的现场
      FLOW.task_assignment({ root: p.root, msg: build("task_assignment", "arch", { milestone: "M1", body: "去干" }), milestone: m });
      FLOW.fix_request({
        root: p.root,
        msg: build("fix_request", "tester", { milestone: "M1", artifact: "wf/test-report-M1.md", issues: [{ id: "M1-001", severity: "serious", description: "不行" }] }),
        milestone: m,
      });
      const before = readState(p.root);

      // verdict_pass **不在这组**：它写 awaitingHuman（放行许可，A9h）——下一个 it 单独钉
      FLOW.verification({ root: p.root, msg: build("verification", "arch", { milestone: "M1", body: "核对一下" }), milestone: m });
      FLOW.review_request({ root: p.root, msg: build("review_request", "dev", { milestone: "M1", body: "做完了", artifact: "wf/dev-output-M1.md" }), milestone: m });
      FLOW.escalation({ root: p.root, msg: build("escalation", "tester", { milestone: "M1", body: "有问题" }), milestone: m });
      FLOW.report({ root: p.root, msg: build("report", "arch", { body: "进度汇报" }), milestone: m });
      FLOW.stuck({ root: p.root, msg: build("stuck", "tester", { milestone: "M1", body: "卡住了" }), milestone: m });

      const after = readState(p.root);
      expect(after).toEqual(before);
    } finally {
      p.cleanup();
    }
  });

  /**
   * 放行许可的三个转换（A9h 的纯函数侧）。为何在 flow 而不在 gate：
   * 许可必须是**机械写入**的，arch 拿不到写 state 的路，那是 D-01 在最后一米的全部依据。
   */
  it("verdict_pass 写许可 / fix_request 作废 / milestone_passed 消费", () => {
    const p = makeProject("a4-awaiting");
    try {
      const m = realMilestone("M1");
      const fix = build("fix_request", "tester", { milestone: "M1", artifact: "wf/test-report-M1.md", issues: [{ id: "M1-001", severity: "serious", description: "不行" }] });
      FLOW.task_assignment({ root: p.root, msg: build("task_assignment", "arch", { milestone: "M1", body: "去干" }), milestone: m });
      expect(readState(p.root).awaitingHuman, "分发时不应有许可").toBe("");

      FLOW.verdict_pass({ root: p.root, msg: build("verdict_pass", "tester", { milestone: "M1", questions: ["能过吗"], artifact: "wf/test-report-M1.md" }), milestone: m });
      expect(readState(p.root).awaitingHuman, "许可绑里程碑 id，不是布尔").toBe("M1");

      FLOW.fix_request({ root: p.root, msg: fix, milestone: m });
      expect(readState(p.root).awaitingHuman, "FAIL 推翻上一轮 PASS，许可作废").toBe("");

      FLOW.verdict_pass({ root: p.root, msg: build("verdict_pass", "tester", { milestone: "M1", questions: ["这回行吗"], artifact: "wf/test-report-M1.md" }), milestone: m });
      FLOW.milestone_passed({ root: p.root, msg: build("milestone_passed", "arch", { milestone: "M1", evidence: "人原话:x arch 整理:x 确认:Y" }), milestone: m });
      expect(readState(p.root).awaitingHuman, "一次许可一次放行（单向门不能重放）").toBe("");
    } finally {
      p.cleanup();
    }
  });
});
