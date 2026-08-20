/**
 * L1 最小合法规划书 —— 可省节全部缺失时解析成功
 *
 * D-16：规划书要能塌缩。最小合法形态 = 一个里程碑 + 一条断言 + 未决表「无」。
 * 模板撑不住这个塌缩即为超重。
 *
 * 输入是 `templates/plan.minimal.md` 本体，不是字面量（D-25）。那份文件同时是
 * 05-gates T2/T10 的 Milestone 来源与 e2e fixture 项目的规划书——一处定义，四处消费。
 */
import { describe, expect, it } from "vitest";

import { INPUTS, verbatim } from "./_fixture.ts";
import { parsePlan } from "../../src/plan/index.ts";

describe("L1 最小合法形态", () => {
  it("可省节全省 → 解析成功", () => {
    const f = verbatim("minimal");
    try {
      const r = parsePlan(f.root, f.rel);
      if (!r.ok) throw new Error(`应解析成功，实际报错：${JSON.stringify(r.errors)}`);
      expect(r.plan.milestones).toHaveLength(1);
    } finally {
      f.cleanup();
    }
  });

  it("`### 涉及` / `### 依赖` / `### 风险与未决` 缺失 → 空数组，不是错误", () => {
    const f = verbatim("minimal");
    try {
      const r = parsePlan(f.root, f.rel);
      if (!r.ok) throw new Error("应解析成功");
      const m = r.plan.milestones[0]!;
      expect(m.involves).toEqual([]);
      expect(m.dependsOn).toEqual([]);
      expect(m.risks).toEqual([]);
    } finally {
      f.cleanup();
    }
  });

  it("`## 未决` / `## 说不清的` / `## 不做` 缺失 → 空数组", () => {
    const f = verbatim("minimal");
    try {
      const r = parsePlan(f.root, f.rel);
      if (!r.ok) throw new Error("应解析成功");
      expect(r.plan.pending).toEqual([]);
      expect(r.plan.fog).toEqual([]);
      expect(r.plan.outOfScope).toEqual([]);
    } finally {
      f.cleanup();
    }
  });

  it("里程碑 id 从标题取，不合成", () => {
    const f = verbatim("minimal");
    try {
      const r = parsePlan(f.root, f.rel);
      if (!r.ok) throw new Error("应解析成功");
      // 老仓库存数字 current_milestone: 1 再靠 WF_MILESTONE_PREFIX 拼回 "M1"，
      // 于是代码要「猜」里程碑叫什么，猜错就产生 dev-output-M0.md 指向 P0
      expect(r.plan.milestones[0]!.id).toBe("M1");
    } finally {
      f.cleanup();
    }
  });

  it("两条断言各自的 kind 被解出（一 auto 一 human）", () => {
    const f = verbatim("minimal");
    try {
      const r = parsePlan(f.root, f.rel);
      if (!r.ok) throw new Error("应解析成功");
      const kinds = r.plan.milestones[0]!.assertions.map((a) => a.kind);
      // minimal 那份必须一 auto 一 human：e2e 要走人工关卡，
      // 没有 [human] 条目就走不到 verdict_pass（见该文件头）
      expect(kinds).toEqual(["auto", "human"]);
    } finally {
      f.cleanup();
    }
  });

  it("路径不存在 → 报错而不是抛异常", () => {
    const r = parsePlan(process.cwd(), "docs/does-not-exist.md");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]?.message).toBeTruthy();
  });

  it("输入是真实文件而非字面量（D-25 的自检）", () => {
    // 这条看起来多余，但它锁的是「测试与语法同源」：
    // 有人把 verbatim 换成内联字符串时，这条会红
    expect(INPUTS.minimal).toBe("templates/plan.minimal.md");
  });
});
