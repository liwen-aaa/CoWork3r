/**
 * G1 缺任一必填 → fatal
 *
 * 三项必填：plan（断言源在哪）／source（改了它才算真产出）／test（PASS 前真跑什么）。
 * 少一项，对应的整类 gate 就没有依据，所以是 fatal 而不是 warn。
 *
 * fatal 的语义是「开发可以继续，但不能宣布完成」——配置坏了不该阻止你写代码，
 * 必须阻止你说「测过了」。这个不对称在 05-gates 那边兑现（拦 verdict_pass，
 * 放行 review_request）。
 */
import { describe, expect, it } from "vitest";

import { inspectConfig } from "../../src/config/index.ts";
import { MINIMAL, makeProject } from "./_fixture.ts";

describe("G1 必填", () => {
  it("三项齐 → 零 fatal", () => {
    const p = makeProject("G1-ok");
    try {
      p.writeJson(MINIMAL);
      const { cfg, diagnostics } = inspectConfig(p.root);
      expect(diagnostics.filter((d) => d.level === "fatal")).toEqual([]);
      expect(cfg).not.toBeNull();
    } finally {
      p.cleanup();
    }
  });

  for (const missing of ["plan", "source", "test"] as const) {
    it(`缺 ${missing} → fatal，且 message 含字段名`, () => {
      const p = makeProject(`G1-no-${missing}`);
      try {
        const partial = { ...MINIMAL };
        delete (partial as Record<string, unknown>)[missing];
        p.writeJson(partial);

        const { cfg, diagnostics } = inspectConfig(p.root);
        const fatals = diagnostics.filter((d) => d.level === "fatal");
        expect(fatals.length).toBeGreaterThan(0);
        expect(fatals.map((d) => d.message).join(" ")).toContain(missing);
        expect(cfg).toBeNull();
      } finally {
        p.cleanup();
      }
    });
  }

  it("文件不存在 → fatal（三项必填拿不到，不是「主动不配」）", () => {
    const p = makeProject("G1-nofile");
    try {
      const { cfg, diagnostics } = inspectConfig(p.root);
      expect(diagnostics.some((d) => d.level === "fatal")).toBe(true);
      expect(cfg).toBeNull();
    } finally {
      p.cleanup();
    }
  });

  it("缺省值到位：maxRounds=5 / testTimeoutMs=120000", () => {
    const p = makeProject("G1-defaults");
    try {
      p.writeJson(MINIMAL);
      const { cfg } = inspectConfig(p.root);
      expect(cfg?.maxRounds).toBe(5);
      expect(cfg?.testTimeoutMs).toBe(120_000);
    } finally {
      p.cleanup();
    }
  });
});
