/**
 * L3 断言必须标 `[auto]` 或 `[human]`，否则报错含行号
 *
 * S3 + D-20。这条分类不是元数据，它**承载判据**：标了 auto 我只问你命令在哪，
 * 标了 human 我只问你说清了没有（L4/L5）。所以不标 = 解析器无法判断该拿什么问它。
 *
 * 报错必须带行号。规划书是人写的，「格式不对」这种提示会让人放弃修——
 * 老仓库四份规划书全部通不过 gate 而没人发现，一半原因是报错不可操作。
 */
import { describe, expect, it } from "vitest";

import { derive, lineOf } from "./_fixture.ts";
import { parsePlan } from "../../src/plan/index.ts";

describe("L3 kind 必填", () => {
  it("断言未标 kind → 报错，且 message 含行号", () => {
    const f = derive("minimal", (lines) => {
      const at = lineOf(lines, /^- \[auto\] 存在/);
      lines[at] = "- 存在 `src/hello.txt`，内容含 `ok`";
      return lines;
    });
    try {
      const r = parsePlan(f.root, f.rel);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      const at = lineOf(f.lines, /^- 存在/) + 1; // 1-indexed
      expect(r.errors.some((e) => e.line === at)).toBe(true);
      expect(r.errors.map((e) => e.message).join(" ")).toMatch(/auto|human/);
    } finally {
      f.cleanup();
    }
  });

  it("标记拼错（`[AUTO]`）→ 报错，不静默当成 auto", () => {
    const f = derive("minimal", (lines) => {
      const at = lineOf(lines, /^- \[auto\] 存在/);
      lines[at] = lines[at]!.replace("[auto]", "[AUTO]");
      return lines;
    });
    try {
      const r = parsePlan(f.root, f.rel);
      expect(r.ok).toBe(false);
    } finally {
      f.cleanup();
    }
  });

  it("标记不在行首（写成 `- 说明 [auto] ...`）→ 报错", () => {
    const f = derive("minimal", (lines) => {
      const at = lineOf(lines, /^- \[auto\] 存在/);
      lines[at] = "- 存在 `src/hello.txt` [auto]";
      return lines;
    });
    try {
      const r = parsePlan(f.root, f.rel);
      expect(r.ok).toBe(false);
    } finally {
      f.cleanup();
    }
  });

  it("断言节为空（一条都没有）→ 报错", () => {
    const f = derive("minimal", (lines) =>
      lines.filter((l) => !/^- \[(auto|human)\]/.test(l)),
    );
    try {
      const r = parsePlan(f.root, f.rel);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.map((e) => e.message).join(" ")).toMatch(/断言/);
    } finally {
      f.cleanup();
    }
  });

  it("多个错误一次全报（不是撞到第一个就停）", () => {
    const f = derive("own", (lines) =>
      lines.map((l) => (/^- \[auto\]/.test(l) ? l.replace("[auto] ", "") : l)),
    );
    try {
      const r = parsePlan(f.root, f.rel);
      expect(r.ok).toBe(false);
      // 人改规划书时想一次看到所有问题，而不是修一条跑一次
      if (!r.ok) expect(r.errors.length).toBeGreaterThan(3);
    } finally {
      f.cleanup();
    }
  });

  it("非断言节里的 `- ` 列表项不受此约束", () => {
    // 「涉及」「未决」「不做」里的列表项不是断言，不该被要求标 kind
    const f = derive("own", (lines) => lines);
    try {
      const r = parsePlan(f.root, f.rel);
      expect(r.ok).toBe(true);
    } finally {
      f.cleanup();
    }
  });
});
