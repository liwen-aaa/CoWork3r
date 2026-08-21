/**
 * T10 老仓库四份真实报告 → 全部 block
 *
 * **这是本层的回归证据。** 输入是当年真实出过事的文件，不是我造的样本：
 *
 *   四份 test-report 全部缺「文档一致性」节（实测 0/4），而 tester 规约明文写
 *   「缺节 = FAIL」。四个里程碑全部静默通过，零信号。
 *
 * 判据变了但输入仍然有效——这正是这条测试的价值：
 *   当年：因为缺「文档一致性」节该被拦（而没拦住）
 *   现在：因为缺断言编号覆盖被拦（判据换了，同一批输入照样抓得住）
 *
 * 另一半是**防误伤**：`paper-dev-output-M4.md` 是当年三小节齐全的合格产出（3/3）。
 * 它在新判据下也不合格（没有断言编号），但拦它的理由必须是「缺编号」，
 * 不能是「格式不对」——判据只看断言覆盖，不看形状。这个区分在最后一条。
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { checkDevOutput, checkTestReport } from "../../src/gates/index.ts";
import { PAPER, REPO_ROOT, deriveTestReport, makeProject, realMilestone } from "./_fixture.ts";

describe("T10 老仓库真实产物回归", () => {
  it("四份 test-report 全部 block", () => {
    const m = realMilestone("M1");
    for (const rel of PAPER.reports) {
      const r = checkTestReport(REPO_ROOT, rel, m);
      expect(r.ok, `${rel} 应该被拦`).toBe(false);
    }
  });

  it("四份的 reason 都列出了缺失的断言编号", () => {
    const m = realMilestone("M1");
    for (const rel of PAPER.reports) {
      const r = checkTestReport(REPO_ROOT, rel, m);
      if (r.ok) throw new Error(`${rel} 应该被拦`);
      for (const a of m.assertions) {
        expect(r.reason, `${rel} 的 reason 该提到 ${a.id}`).toContain(a.id);
      }
    }
  });

  it("前提：四份报告里确实没有断言编号（否则这条测试什么也没测）", () => {
    // 这不是多余的自检。如果哪天有人「顺手把 fixture 补上编号」，
    // 上面两条会变成恒绿而我们不会知道——fixture 的价值就是它不合格
    for (const rel of PAPER.reports) {
      const text = readFileSync(rel, "utf-8");
      expect(text, `${rel} 不该含 M1.x 形式的断言编号`).not.toMatch(/M1\.\d/);
    }
  });

  it("四份报告都写着判定 PASS —— 当年就是这样静默通过的", () => {
    for (const rel of PAPER.reports) {
      const text = readFileSync(rel, "utf-8");
      expect(text).toMatch(/判定|PASS/);
    }
  });

  it("dev 产出那份（当年 3/3 合格）在新判据下也 block，理由是缺编号", () => {
    const m = realMilestone("M1");
    const r = checkDevOutput(REPO_ROOT, PAPER.devOutput, m);
    expect(r.ok).toBe(false);
    if (r.ok) return;

    // 拦它的理由必须是断言覆盖
    for (const a of m.assertions) expect(r.reason).toContain(a.id);

    // 而不是小节名。判据已经不认固定小节，所以这三个名字不应在任何
    // 拦截文案里出现——它们是老仓库那套仪式的具体形态（含那个 0/4 的节）。
    // 第一版我写的是 `not.toMatch(/小节|章节|格式/)`，它拿 reason 里
    // 「不要求任何固定小节」这句话当成了违规——而那句话正是 D-22 要说的。
    // 用正则去猜「这句话是在要求小节还是在否定小节」是没头的，改查具体名字。
    for (const oldSection of ["文档一致性", "修改的文件", "已知未完成"]) {
      expect(r.reason).not.toContain(oldSection);
    }
  });

  it("防误伤对照组：从断言表推导的报告放行", () => {
    // 只测「坏输入被拦」会漏掉误伤。这条确认 gate 不是「一律拦」
    const m = realMilestone("M1");
    const p = makeProject("t10-good");
    try {
      const rel = p.file("good.md", deriveTestReport(m, "PASS"));
      expect(checkTestReport(p.root, rel, m).ok).toBe(true);
    } finally {
      p.cleanup();
    }
  });

  it("fixture 文件都还在（留档仓库可能被清理，这批是唯一副本）", () => {
    for (const rel of [...PAPER.reports, PAPER.devOutput]) {
      expect(readFileSync(rel, "utf-8").length).toBeGreaterThan(100);
    }
  });
});
