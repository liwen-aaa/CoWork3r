/**
 * T3 漏一条断言 → reason 明文列出缺的编号
 *
 * **这条是整层里最重要的一条。** 它是 dev 那 4/4 与 tester 那 0/4 的唯一差别来源。
 *
 * 老仓库的实测：tester 规约明文写「报告缺『文档一致性』节 = FAIL」，四份报告 0/4
 * 写了该节，四个里程碑全部通过、零信号。同期 dev 的产出三小节 4/4 齐全。
 * 唯一差别是 dev 的拦截提示文案里**明文列了小节名**。
 *
 * 所以这里的判据不是「有没有拦住」，是「拦住之后那句话有没有告诉你缺什么」。
 * reason 里必须出现缺失的断言编号本身，不能只说「产出不完整」。
 */
import { describe, expect, it } from "vitest";

import { checkDevOutput, checkTestReport } from "../../src/gates/index.ts";
import { deriveDevOutput, deriveTestReport, makeProject, realMilestone } from "./_fixture.ts";

describe("T3 漏断言的 reason", () => {
  it("漏掉第二条 → reason 含 M1.2，且不含已覆盖的 M1.1", () => {
    const m = realMilestone("M1");
    const p = makeProject("t3-miss");
    try {
      // 从推导物出发，只删掉最后一条断言那一行
      const full = deriveDevOutput(m).trimEnd().split("\n");
      const rel = p.file("out.md", full.slice(0, -1).join("\n") + "\n");
      const r = checkDevOutput(p.root, rel, m);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.reason).toContain(m.assertions[1]!.id);
      // 已覆盖的那条不该出现在「缺什么」里——否则人不知道该补哪个
      expect(r.reason).not.toContain(m.assertions[0]!.id);
    } finally {
      p.cleanup();
    }
  });

  it("全漏 → 两条编号都在 reason 里（一次报全部，不是撞到第一个就停）", () => {
    const m = realMilestone("M1");
    const p = makeProject("t3-all");
    try {
      const rel = p.file("out.md", "# 产出\n\n做完了。\n");
      const r = checkDevOutput(p.root, rel, m);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      for (const a of m.assertions) expect(r.reason).toContain(a.id);
    } finally {
      p.cleanup();
    }
  });

  it("reason 里的编号是可搜索的原文（人复制它就能在 plan.md 里找到）", () => {
    const m = realMilestone("M1");
    const p = makeProject("t3-searchable");
    try {
      const rel = p.file("out.md", "# 产出\n\n无结论\n");
      const r = checkDevOutput(p.root, rel, m);
      if (r.ok) throw new Error("应 block");
      // 形如 M1.1，不是「第 1 条」这种需要自己数的说法
      expect(r.reason).toMatch(/M1\.\d/);
    } finally {
      p.cleanup();
    }
  });

  it("tester 报告同一条判据（报告漏断言也要列编号）", () => {
    const m = realMilestone("M1");
    const p = makeProject("t3-report");
    try {
      const lines = deriveTestReport(m).trimEnd().split("\n");
      // 删掉提到 M1.2 的那些行，保留判定行
      const kept = lines.filter((l) => !l.includes(m.assertions[1]!.id));
      const rel = p.file("r.md", kept.join("\n") + "\n");
      const r = checkTestReport(p.root, rel, m);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toContain(m.assertions[1]!.id);
    } finally {
      p.cleanup();
    }
  });

  it("弱匹配是有意的：提到编号就算覆盖，不校验那行说得对不对", () => {
    const m = realMilestone("M1");
    const p = makeProject("t3-weak");
    try {
      // 每条断言一行，但内容是废话。仍然通过——
      // 强检查需要理解自然语言，做不到；弱检查的价值是「让漏掉一条变得可见」
      const rel = p.file("out.md", m.assertions.map((a) => `- ${a.id} 呃`).join("\n") + "\n");
      expect(checkDevOutput(p.root, rel, m).ok).toBe(true);
    } finally {
      p.cleanup();
    }
  });
});
