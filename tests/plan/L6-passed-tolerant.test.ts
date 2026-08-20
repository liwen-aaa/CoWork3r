/**
 * L6 标题含 ✅ 与括注日期 → 仍解出 id，`passed: true`
 *
 * S2。arch 会往标题里写状态（它的判定权包括「里程碑是否真的结束了」），
 * 所以解析器必须容忍 ✅、括注、日期。机器不读这个标记——01-channel 的 state
 * 才是运行时权威；标记的用途是给人看，以及 `progress.md` 的生成源。
 *
 * 这条从假设变成了实测前提：本项目 plan.md 的 M1/M2/M3 三个标题现在都带 ✅
 * （M3 收尾时补的），所以 L6 直接吃到真实输入，不需要造样本。
 *
 * 老仓库的 paper-plan.md 是另一种真实形态：`## 里程碑 M1：Introduction ✅（2026-08-18
 * 人工验证通过，R3 tester PASS）`——冒号分隔、括注很长。L9 会整体拒它（因为缺
 * `### 断言` 节），但标题这一层要能解析出 id，否则报错说不清是哪个里程碑。
 */
import { describe, expect, it } from "vitest";

import { derive, lineOf, verbatim } from "./_fixture.ts";
import { parsePlan } from "../../src/plan/index.ts";

describe("L6 已验收标记的容忍", () => {
  it("本项目 plan.md：M1/M2/M3 带 ✅ → passed=true，M4–M6 → false", () => {
    const f = verbatim("own");
    try {
      const r = parsePlan(f.root, f.rel);
      if (!r.ok) throw new Error(`应解析成功：${JSON.stringify(r.errors)}`);
      const byId = new Map(r.plan.milestones.map((m) => [m.id, m.passed]));
      expect(byId.get("M1")).toBe(true);
      expect(byId.get("M2")).toBe(true);
      expect(byId.get("M3")).toBe(true);
      expect(byId.get("M4")).toBe(false);
      expect(byId.get("M5")).toBe(false);
      expect(byId.get("M6")).toBe(false);
    } finally {
      f.cleanup();
    }
  });

  it("✅ 不进 id，也不进 title", () => {
    const f = verbatim("own");
    try {
      const r = parsePlan(f.root, f.rel);
      if (!r.ok) throw new Error("应解析成功");
      for (const m of r.plan.milestones) {
        expect(m.id).not.toContain("✅");
        expect(m.title).not.toContain("✅");
        expect(m.id.trim()).toBe(m.id);
      }
    } finally {
      f.cleanup();
    }
  });

  it("括注日期与说明 → 容忍，id 仍是第一个 token", () => {
    const f = derive("own", (lines) => {
      const at = lineOf(lines, /^## 里程碑 M4 /);
      lines[at] = "## 里程碑 M4 规划书解析 ✅（2026-08-21 人工验证通过，R2 tester PASS）";
      return lines;
    });
    try {
      const r = parsePlan(f.root, f.rel);
      if (!r.ok) throw new Error("应解析成功");
      const m4 = r.plan.milestones.find((m) => m.id === "M4")!;
      expect(m4.passed).toBe(true);
      expect(m4.title).toContain("规划书解析");
    } finally {
      f.cleanup();
    }
  });

  it("老仓库那种冒号形态的标题 → 仍解出 id（用于报错定位）", () => {
    const f = derive("minimal", (lines) => {
      const at = lineOf(lines, /^## 里程碑 M1 /);
      lines[at] = "## 里程碑 M1：造一个文件 ✅（2026-08-18 人工验证通过，R3 tester PASS）";
      return lines;
    });
    try {
      const r = parsePlan(f.root, f.rel);
      // 整体可能报错（那是 L9 的事），但里程碑 id 必须能被认出来——
      // 否则报错只能说「某个里程碑格式不对」，人不知道去哪一节改
      const ids = r.ok ? r.plan.milestones.map((m) => m.id) : [];
      const mentioned = r.ok ? "" : r.errors.map((e) => e.message).join(" ");
      expect(ids.includes("M1") || ids.includes("M1：造一个文件") || mentioned.includes("M1")).toBe(true);
    } finally {
      f.cleanup();
    }
  });

  it("passed 的里程碑仍然解出全部断言（冻结不等于不可读）", () => {
    const f = verbatim("own");
    try {
      const r = parsePlan(f.root, f.rel);
      if (!r.ok) throw new Error("应解析成功");
      const m1 = r.plan.milestones.find((m) => m.id === "M1")!;
      // D-14 冻结的是「不许改」，不是「不许读」——tester 复核往期里程碑要读它
      expect(m1.passed).toBe(true);
      expect(m1.assertions.length).toBeGreaterThan(0);
    } finally {
      f.cleanup();
    }
  });
});
