/**
 * G3 testPass / gatePass 不是合法正则 → fatal
 *
 * 为什么是 fatal 而不是 warn：这两个字段在 05-gates 里被 `new RegExp(...)`，
 * 非法正则会抛未捕获异常。而抛异常的时机是「tester 正要报 PASS」——
 * 也就是最不该崩的时刻。宁可启动时就红。
 */
import { describe, expect, it } from "vitest";

import { inspectConfig } from "../../src/config/index.ts";
import { MINIMAL, makeProject } from "./_fixture.ts";

describe("G3 正则字段", () => {
  for (const field of ["testPass", "gatePass"] as const) {
    it(`${field} 非法正则 → fatal，message 含字段名`, () => {
      const p = makeProject(`G3-${field}`);
      try {
        p.writeJson({ ...MINIMAL, [field]: "([unclosed" });
        const { cfg, diagnostics } = inspectConfig(p.root);
        const fatals = diagnostics.filter((d) => d.level === "fatal");
        expect(fatals.length).toBeGreaterThan(0);
        expect(fatals.map((d) => d.message).join(" ")).toContain(field);
        expect(cfg).toBeNull();
      } finally {
        p.cleanup();
      }
    });

    it(`${field} 合法正则 → 零诊断`, () => {
      const p = makeProject(`G3-${field}-ok`);
      try {
        p.writeJson({ ...MINIMAL, [field]: "(passed|ok|PASS)" });
        const { diagnostics } = inspectConfig(p.root);
        expect(diagnostics).toEqual([]);
      } finally {
        p.cleanup();
      }
    });
  }

  it("未配这两个字段 → 零诊断（可选字段，不配是合法选择）", () => {
    const p = makeProject("G3-absent");
    try {
      p.writeJson(MINIMAL);
      const { diagnostics } = inspectConfig(p.root);
      expect(diagnostics).toEqual([]);
    } finally {
      p.cleanup();
    }
  });
});
