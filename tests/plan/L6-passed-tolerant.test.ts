/**
 * L6 标题含 ✅ 与括注日期 → 仍解出 id，`passed: true`
 *
 * S2。arch 会往标题里写状态（它的判定权包括「里程碑是否真的结束了」），
 * 所以解析器必须容忍 ✅、括注、日期。机器不读这个标记——01-channel 的 state
 * 才是运行时权威；标记的用途是给人看，以及 `progress.md` 的生成源。
 *
 * 这条从假设变成了实测前提：本项目 plan.md 里已验收的里程碑都带 ✅，所以 L6
 * 直接吃到真实输入，不需要造样本。但**判据是对应关系，不是哪几个里程碑带 ✅**：
 * 第一版写成「M1/M2/M3 → true，M4–M6 → false」，M4 验收那天它就红了——
 * 而那次变更是合法的（人签字 + 打 ✅ 正是这条语法存在的理由）。
 *
 * 锁状态的测试会在状态合法变更时拦路，锁规则的不会。同一份文件里两种写法共存过：
 * L7 那条「缺号被保留」锁的是规则，所以删 P8 之后照绿；本条第一版锁的是状态。
 *
 * 老仓库的 paper-plan.md 是另一种真实形态：`## 里程碑 M1：Introduction ✅（2026-08-18
 * 人工验证通过，R3 tester PASS）`——冒号分隔、括注很长。L9 会整体拒它（因为缺
 * `### 断言` 节），但标题这一层要能解析出 id，否则报错说不清是哪个里程碑。
 */
import { describe, expect, it } from "vitest";

import { derive, lineOf, verbatim } from "./_fixture.ts";
import { parsePlan } from "../../src/plan/index.ts";

describe("L6 已验收标记的容忍", () => {
  it("标题带 ✅ ⇔ passed=true（逐条对齐原文，不写死哪几个）", () => {
    // 期望值从**原文那一行**读。写死 M1–M3 true / M4–M6 false 的那一版，
    // 在 M4 合法验收那天红了，而它拦住的不是 bug 是正常流程。
    const f = derive("own", (lines) => lines); // 恒等 derive：不改一个字，只为拿到原文行
    try {
      const r = parsePlan(f.root, f.rel);
      if (!r.ok) throw new Error(`应解析成功：${JSON.stringify(r.errors)}`);

      for (const m of r.plan.milestones) {
        // sourceRange[0] 就是标题行自己（1-indexed）。derive 给的是原始行，
        // 本仓库磁盘上是 CRLF，所以要剔 `\r`（归一在解析器里，不在这里）
        const heading = (f.lines[m.sourceRange[0] - 1] ?? "").replace(/\r$/, "");
        expect(heading).toContain(`里程碑 ${m.id}`);
        expect(m.passed).toBe(heading.includes("✅"));
      }

      // 前提断言：真实文件里两种都得有。否则只有对应关系的话，
      // 全部不带 ✅ 也能绿——那是让数据自己定义通过条件（与 L7 那条 owner
      // 被写松同一个坑）。
      expect(r.plan.milestones.some((m) => m.passed)).toBe(true);
      expect(r.plan.milestones.some((m) => !m.passed)).toBe(true);
    } finally {
      f.cleanup();
    }
  });

  it("✅ 与标题之间有无空格都认，但 title 里不能残留它", () => {
    // 真实发生过：M4 打 ✅ 时写成了 `规划书解析✅`（无空格）。
    // 解析器容忍它（passed 判据是 includes），但两种写法都不能把 ✅ 泄进 title。
    for (const heading of [
      "## 里程碑 M4 规划书解析 ✅",
      "## 里程碑 M4 规划书解析✅",
    ]) {
      const f = derive("own", (lines) => {
        lines[lineOf(lines, /^## 里程碑 M4 /)] = heading;
        return lines;
      });
      try {
        const r = parsePlan(f.root, f.rel);
        if (!r.ok) throw new Error(`应解析成功：${JSON.stringify(r.errors)}`);
        const m4 = r.plan.milestones.find((m) => m.id === "M4")!;
        expect(m4.passed).toBe(true);
        expect(m4.title).not.toContain("✅");
        expect(m4.title.trim()).toBe(m4.title);
        expect(m4.title).toBe("规划书解析");
      } finally {
        f.cleanup();
      }
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
