/**
 * L8 `templates/plan.md` 本体能被解析 —— **防漂移的关键**
 *
 * 老仓库最核心的失效在这里：模板产出的是行内 `验收：...`，而 gate 认的是
 * `### 验收断言方向` 小节。两种格式从来没对齐过，而且**没人发现**——因为没人
 * 真跑过 arch 分发那条路径。实测确认：paper 四个里程碑全部通不过 gate，
 * 但它们全都真的通过了人工验收。
 *
 * 模板和解析器同源的保证方式就是让模板进测试。这条红了只有两种可能：
 * 改了语法忘了改模板，或改了模板写错了语法——两者都必须立刻知道。
 *
 * 与 G7（`templates/wf.config.json` 进测试）是同一个模式。
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { INPUTS, verbatim } from "./_fixture.ts";
import { assertionHash, milestone, parsePlan } from "../../src/plan/index.ts";

describe("L8 模板即语法示例", () => {
  it("模板本体解析成功", () => {
    const f = verbatim("template");
    try {
      const r = parsePlan(f.root, f.rel);
      if (!r.ok) {
        throw new Error(
          `templates/plan.md 解析失败——语法与模板已分裂：\n` +
            r.errors.map((e) => `  行 ${e.line}: ${e.message}`).join("\n"),
        );
      }
      expect(r.plan.milestones.length).toBeGreaterThan(0);
    } finally {
      f.cleanup();
    }
  });

  it("模板里的占位符尖括号不妨碍解析", () => {
    // 模板用 <id> <一句话标题> 这类占位槽，它们必须能过解析器——
    // 否则「模板是可运行示例」这句话不成立
    const src = readFileSync(INPUTS.template, "utf-8");
    expect(src).toMatch(/<[^>]+>/);
    const f = verbatim("template");
    try {
      expect(parsePlan(f.root, f.rel).ok).toBe(true);
    } finally {
      f.cleanup();
    }
  });

  it("模板展示了全部可省节（否则它教不出完整语法）", () => {
    const src = readFileSync(INPUTS.template, "utf-8");
    for (const section of ["### 断言", "### 涉及", "### 依赖", "### 风险与未决", "## 未决", "## 说不清的", "## 不做"]) {
      expect(src, `模板缺 ${section}`).toContain(section);
    }
  });

  it("本项目 plan.md 解析成功且解出 6 个里程碑（M4 的第五条断言）", () => {
    const f = verbatim("own");
    try {
      const r = parsePlan(f.root, f.rel);
      if (!r.ok) throw new Error(`应解析成功：${JSON.stringify(r.errors)}`);
      expect(r.plan.milestones.map((m) => m.id)).toEqual(["M1", "M2", "M3", "M4", "M5", "M6"]);
      expect(r.plan.goal.trim().length).toBeGreaterThan(0);
    } finally {
      f.cleanup();
    }
  });

  it("milestone() 按 id 取，取不到返回 null", () => {
    const f = verbatim("own");
    try {
      const r = parsePlan(f.root, f.rel);
      if (!r.ok) throw new Error("应解析成功");
      expect(milestone(r.plan, "M4")?.id).toBe("M4");
      expect(milestone(r.plan, "M99")).toBeNull();
    } finally {
      f.cleanup();
    }
  });

  it("assertionHash 稳定且只随断言节变化", () => {
    const f = verbatim("own");
    try {
      const r = parsePlan(f.root, f.rel);
      if (!r.ok) throw new Error("应解析成功");
      const m4 = milestone(r.plan, "M4")!;
      const h1 = assertionHash(m4);
      const h2 = assertionHash(m4);
      expect(h1).toBe(h2);
      expect(h1).toMatch(/^[0-9a-f]{64}$/);
      // 不同里程碑的断言节不同 → hash 不同
      expect(assertionHash(milestone(r.plan, "M5")!)).not.toBe(h1);
    } finally {
      f.cleanup();
    }
  });
});
