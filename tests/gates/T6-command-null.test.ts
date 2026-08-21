/**
 * T6 `test: null` → gate 为空且不 block，但提示常驻
 *
 * D-23：**无自动化基建时显式降级。** 空 gate 是合法的，静默的空 gate 不是。
 *
 * 两种「没有」必须区分（03-config 的 G5 已经在配置层分开了，这里是它在拦截层的后果）：
 *   `test: null`  → 人主动声明「本项目没法自动测」→ 合法，gate 为空，但简报常驻一行
 *   字段整个缺失   → fatal，配置层就拦下了（T8）
 *
 * 老仓库的 `testCmd` 不配就静默降级：所有 gate 关闭，而配置者以为自己配了。
 */
import { describe, expect, it } from "vitest";

import { commandGateStatus, runChain, chainFor } from "../../src/gates/index.ts";
import { makeProject, realConfig, realMilestone } from "./_fixture.ts";

describe("T6 test: null 的显式降级", () => {
  it("test: null → 这道 gate 报告自己为空，且不 block", () => {
    const p = makeProject("t6-null");
    try {
      const { cfg } = realConfig(p.root, { test: null, gate: undefined, gatePass: undefined });
      if (!cfg) throw new Error("前提失败：test: null 应是合法配置");
      const st = commandGateStatus(cfg);
      expect(st.empty).toBe(true);
      expect(st.notice).toBeTruthy();
      expect(st.notice).toMatch(/自动验证已关闭|已关闭/);
    } finally {
      p.cleanup();
    }
  });

  it("test: null 时 verdict_pass 不因为「没跑测试」而被拦", () => {
    const m = realMilestone("M1");
    const p = makeProject("t6-pass");
    try {
      const { cfg } = realConfig(p.root, { test: null, gate: undefined, gatePass: undefined });
      if (!cfg) throw new Error("前提失败");
      // 只验 G_command 那一环为空；结构与 [human] 覆盖是别的 gate 的事（T2/T7）
      const full = chainFor("tester", "verdict_pass");
      if (full === null) throw new Error("CHAINS 缺 tester:verdict_pass");
      const chain = full.filter((g) => g.name === "G_command");
      expect(chain).toHaveLength(1); // 前提：确实滤到了那一道，不是空链恰好绿
      const r = runChain(chain, { root: p.root, cfg, milestone: m, input: {} });
      expect(r.ok).toBe(true);
    } finally {
      p.cleanup();
    }
  });

  it("配了 test 则不为空（对照组：确认 empty 不是恒真）", () => {
    const p = makeProject("t6-have");
    try {
      const { cfg } = realConfig(p.root, { test: "npm test" });
      if (!cfg) throw new Error("前提失败");
      expect(commandGateStatus(cfg).empty).toBe(false);
    } finally {
      p.cleanup();
    }
  });

  it("提示文本要说清后果，不只说「关闭了」", () => {
    const p = makeProject("t6-notice");
    try {
      const { cfg } = realConfig(p.root, { test: null, gate: undefined, gatePass: undefined });
      if (!cfg) throw new Error("前提失败");
      const st = commandGateStatus(cfg);
      expect(st.empty).toBe(true);
      const notice = st.notice;
      if (notice === undefined) throw new Error("empty 时必须给 notice（D-23）");
      // 人看到这句话要知道「那现在靠什么」——结构检查 + 人工关卡
      expect(notice).toMatch(/结构|人工/);
    } finally {
      p.cleanup();
    }
  });

  it("info 级诊断里也有这句（启动简报的来源，D-30 视线路径）", () => {
    const p = makeProject("t6-diag");
    try {
      const { diagnostics } = realConfig(p.root, { test: null, gate: undefined, gatePass: undefined });
      expect(diagnostics.some((d) => d.level === "info" && /自动验证已关闭/.test(d.message))).toBe(true);
    } finally {
      p.cleanup();
    }
  });
});
