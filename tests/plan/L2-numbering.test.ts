/**
 * L2 编号从位置来 —— `M1` 的第 3 条断言 = `M1.3`
 *
 * S4。这看起来像缺陷（往中间插一条会导致后面重编），实际是把 D-14 编码进了
 * 数据结构：想插断言就得动已有编号，动了就露馅。给断言配显式 id 反而会让
 * 「悄悄改一条断言的内容」变得无痕。
 *
 * 与 S5 相反：未决表定了就删行、位置会漂，所以那边必须用稳定 id（L7）。
 * 断言只追加不删，位置编号才成立。
 */
import { describe, expect, it } from "vitest";

import { derive, lineOf, verbatim } from "./_fixture.ts";
import { parsePlan } from "../../src/plan/index.ts";

describe("L2 断言编号", () => {
  it("本项目 plan.md 的 M1 第 3 条 id === \"M1.3\"", () => {
    const f = verbatim("own");
    try {
      const r = parsePlan(f.root, f.rel);
      if (!r.ok) throw new Error(`应解析成功：${JSON.stringify(r.errors)}`);
      const m1 = r.plan.milestones.find((m) => m.id === "M1")!;
      expect(m1.assertions[2]!.id).toBe("M1.3");
    } finally {
      f.cleanup();
    }
  });

  it("编号前缀跟随里程碑 id，不是全局序号", () => {
    const f = verbatim("own");
    try {
      const r = parsePlan(f.root, f.rel);
      if (!r.ok) throw new Error("应解析成功");
      for (const m of r.plan.milestones) {
        for (const [i, a] of m.assertions.entries()) {
          expect(a.id).toBe(`${m.id}.${i + 1}`);
        }
      }
    } finally {
      f.cleanup();
    }
  });

  it("往中间插一条 → 后面全部重编（这是有意的，D-14）", () => {
    const f = derive("own", (lines) => {
      const at = lineOf(lines, /^- \[auto\] `npm test -- tests\/channel` 全绿/);
      // 在 M1 第一条断言之前插一条，原第 1 条应变成 M1.2
      lines.splice(at, 0, "- [auto] 插进来的一条 `npm test`");
      return lines;
    });
    try {
      const r = parsePlan(f.root, f.rel);
      if (!r.ok) throw new Error("应解析成功");
      const m1 = r.plan.milestones.find((m) => m.id === "M1")!;
      expect(m1.assertions[0]!.text).toContain("插进来的一条");
      expect(m1.assertions[1]!.id).toBe("M1.2");
      expect(m1.assertions[1]!.text).toContain("tests/channel");
    } finally {
      f.cleanup();
    }
  });

  it("每条断言带行号（报错要能跳到那一行）", () => {
    const f = verbatim("own");
    try {
      const r = parsePlan(f.root, f.rel);
      if (!r.ok) throw new Error("应解析成功");
      const all = r.plan.milestones.flatMap((m) => m.assertions);
      for (const a of all) expect(a.line).toBeGreaterThan(0);
      // 行号严格递增：解析顺序 = 文件顺序
      const lines = all.map((a) => a.line);
      expect([...lines].sort((x, y) => x - y)).toEqual(lines);
    } finally {
      f.cleanup();
    }
  });

  it("sourceRange 覆盖里程碑节的行号范围", () => {
    const f = verbatim("own");
    try {
      const r = parsePlan(f.root, f.rel);
      if (!r.ok) throw new Error("应解析成功");
      for (const m of r.plan.milestones) {
        const [start, end] = m.sourceRange;
        expect(start).toBeGreaterThan(0);
        expect(end).toBeGreaterThanOrEqual(start);
        // 该里程碑的断言必须落在范围内——assertionHash 依赖这个
        for (const a of m.assertions) {
          expect(a.line).toBeGreaterThanOrEqual(start);
          expect(a.line).toBeLessThanOrEqual(end);
        }
      }
    } finally {
      f.cleanup();
    }
  });
});
