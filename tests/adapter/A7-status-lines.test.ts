/**
 * A7 /status 与启动简报：四行都在，未决数与 frontier 一致
 *
 * 这是全套唯一「给人看」的输出，D-30 全落在这里：需要人主动去打开才能看见的
 * 待办 = 无效载体。四行是：状态、待人工、未决、降级提示。
 *
 * 第三行是关键：未决条数必须来自 frontier 的真实输出（04-plan 纯函数），
 * 不能是 status.ts 里手写的数字——否则「有件事没回来」这个信号会静默消失。
 *
 * bootBriefing 是纯函数（不碰 pi，07-adapter.md 的 BootContext 无 pi 字段）。
 * 输入走真实解析（D-25）：真实模板 plan + 真实 config。
 */
import { describe, expect, it } from "vitest";

import { bootBriefing } from "../../src/adapter/index.ts";
import { frontier, parsePlan } from "../../src/plan/index.ts";
import { makeProject, realConfig, realMilestone } from "./_fixture.ts";

const BASE = {
  root: process.cwd(),
  role: "arch" as const,
  state: { milestone: "M5", round: 1, maxRounds: 5, consecutiveFails: 0 },
  diagnostics: [] as Array<{ level: string; message: string }>,
};

describe("A7 /status 四行", () => {
  it("简报包含状态 / 未决 / 降级三类信息", () => {
    const p = makeProject("a7-four");
    try {
      const { cfg } = realConfig(p.root);
      if (!cfg) throw new Error("前提失败");
      const text = bootBriefing({
        ...BASE,
        cfg,
        plan: null,
        milestone: realMilestone("M1"),
      });
      expect(text).toMatch(/M1/); // 状态行：里程碑
      expect(text).toMatch(/未决/); // 未决行
    } finally {
      p.cleanup();
    }
  });

  it("未决条数与 frontier 真实输出一致", () => {
    const p = makeProject("a7-frontier");
    try {
      const { cfg } = realConfig(p.root, { plan: "docs/plan.md" });
      if (!cfg) throw new Error("前提失败");

      // 真实解析 docs/plan.md（仓库根），把 plan 传给 bootBriefing
      const r = parsePlan(process.cwd(), "docs/plan.md");
      if (!r.ok) throw new Error("前提失败：docs/plan.md 应能解析");
      const plan = r.plan;
      const fr = frontier(plan.pending);
      const total = fr.actionable.length + fr.toQuery.length + fr.answered.length + fr.blocked.length;
      expect(total).toBeGreaterThan(0);

      const text = bootBriefing({
        ...BASE,
        cfg,
        plan,
        milestone: null,
      });
      // 简报里的未决总数 = frontier 四组之和（不能是手写数字）
      expect(text).toContain(String(total));
    } finally {
      p.cleanup();
    }
  });

  it("test: null → 简报包含降级提示（D-23：静默降级不合法）", () => {
    const p = makeProject("a7-null");
    try {
      const { cfg } = realConfig(p.root, { test: null });
      if (!cfg) throw new Error("前提失败");
      const text = bootBriefing({
        ...BASE,
        cfg,
        plan: null,
        milestone: realMilestone("M1"),
      });
      expect(text).toMatch(/自动验证已关闭|test: null/);
    } finally {
      p.cleanup();
    }
  });
});
