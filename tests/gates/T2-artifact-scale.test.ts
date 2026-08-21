/**
 * T2 G-artifact：仪式量从断言表推导（D-22）
 *
 * 这道 gate 的形状与老仓库不同，本文件是那个差别的落点。
 *
 * 老仓库硬性要求固定小节（dev 三节、tester 两节）。后果是改一行代码也得凑五份格式，
 * 于是长出 S 档位来豁免仪式，然后档位判定自己又需要治理——一个机制生出两个机制。
 *
 * 新判据：**每条断言一行结论。** 两条断言的里程碑，产出就是两行（tester 报告多一个
 * 判定行）。仪式量线性缩放，S/L 档位这个概念直接不需要存在。
 *
 * 本文件同时是「不误伤」的证据：`paper-dev-output-M4.md`（真实的、当年三小节齐全的
 * 合格产出）不该因为「格式不同」被拦——它该因为「没有断言编号」被拦，那是判据变了，
 * 不是形状变了。这条区分写在 T3。
 */
import { describe, expect, it } from "vitest";

import { checkDevOutput, checkTestReport } from "../../src/gates/index.ts";
import { deriveDevOutput, deriveTestReport, makeProject, realMilestone } from "./_fixture.ts";

describe("T2 G-artifact 随断言数缩放", () => {
  it("两条断言 → 两行结论即通过，不要求任何固定小节", () => {
    const m = realMilestone("M1");
    expect(m.assertions).toHaveLength(2); // 前提：模板 M1 是一 auto 一 human
    const p = makeProject("t2-ok");
    try {
      const rel = p.file("out.md", deriveDevOutput(m));
      const r = checkDevOutput(p.root, rel, m);
      expect(r.ok).toBe(true);
    } finally {
      p.cleanup();
    }
  });

  it("一条断言的里程碑 → 一行结论即通过（塌缩到下限仍成立）", () => {
    const m = realMilestone("M1");
    const one = { ...m, assertions: [m.assertions[0]!] };
    const p = makeProject("t2-one");
    try {
      const rel = p.file("out.md", deriveDevOutput(one));
      const r = checkDevOutput(p.root, rel, one);
      expect(r.ok).toBe(true);
      // 「一行就够」的反面：这份产出里没有任何小节标题，也必须通过
      expect(deriveDevOutput(one)).not.toContain("##");
    } finally {
      p.cleanup();
    }
  });

  it("小节标题多寡不影响判定（形状自由，判据只看断言覆盖）", () => {
    const m = realMilestone("M1");
    const p = makeProject("t2-shape");
    try {
      const withSections = [
        "# 产出",
        "## 修改的文件",
        "一堆散文",
        "## 结论",
        ...m.assertions.map((a) => `- ${a.id} 完成`),
      ].join("\n");
      const relA = p.file("a.md", withSections);
      const relB = p.file("b.md", deriveDevOutput(m));
      expect(checkDevOutput(p.root, relA, m).ok).toBe(true);
      expect(checkDevOutput(p.root, relB, m).ok).toBe(true);
    } finally {
      p.cleanup();
    }
  });

  it("tester 报告要判定行 + 每条断言一行", () => {
    const m = realMilestone("M1");
    const p = makeProject("t2-report");
    try {
      const rel = p.file("report.md", deriveTestReport(m, "PASS"));
      expect(checkTestReport(p.root, rel, m).ok).toBe(true);
    } finally {
      p.cleanup();
    }
  });

  it("报告缺判定行 → block（这是 tester 报告与 dev 产出的唯一结构差别）", () => {
    const m = realMilestone("M1");
    const p = makeProject("t2-noverdict");
    try {
      // 断言全覆盖，只把判定行删掉
      const rel = p.file("r.md", deriveDevOutput(m));
      const r = checkTestReport(p.root, rel, m);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/判定|PASS|FAIL/);
      // 同一份文件当 dev 产出则通过——差别只在判定行
      expect(checkDevOutput(p.root, rel, m).ok).toBe(true);
    } finally {
      p.cleanup();
    }
  });

  it("空文件 → block", () => {
    const m = realMilestone("M1");
    const p = makeProject("t2-empty");
    try {
      const rel = p.file("empty.md", "");
      expect(checkDevOutput(p.root, rel, m).ok).toBe(false);
    } finally {
      p.cleanup();
    }
  });

  it("文件不存在 → block 而不是抛异常", () => {
    const m = realMilestone("M1");
    const p = makeProject("t2-missing");
    try {
      const r = checkDevOutput(p.root, "nope.md", m);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toContain("nope.md");
    } finally {
      p.cleanup();
    }
  });
});
