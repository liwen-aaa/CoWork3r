/**
 * G4 未知字段 → warn，其余字段仍生效
 *
 * warn 而不是 fatal：拼错一个字段名的后果是「那项不生效」，而不是「整条链关闭」。
 * 但必须出声——老仓库这里零校验，写错 `tesDir` 就等于那个 gate 静默不存在。
 *
 * 顺带锁一件事：字段表不可扩展。有人会想「让项目加自定义字段」，
 * 不做——那等于给漂移开一个官方入口。所以未知字段永远是 warn，不会变成「随你」。
 */
import { describe, expect, it } from "vitest";

import { inspectConfig } from "../../src/config/index.ts";
import { MINIMAL, makeProject } from "./_fixture.ts";

describe("G4 未知字段与类型", () => {
  it("拼错的字段名 → warn，含该名字", () => {
    const p = makeProject("G4-typo");
    try {
      p.writeJson({ ...MINIMAL, tesTimeoutMs: 5000 });
      const { cfg, diagnostics } = inspectConfig(p.root);

      const warns = diagnostics.filter((d) => d.level === "warn");
      expect(warns.length).toBe(1);
      expect(warns[0]?.message).toContain("tesTimeoutMs");
      // 其余字段仍生效
      expect(cfg).not.toBeNull();
      expect(cfg?.plan).toBe(MINIMAL.plan);
      expect(cfg?.testTimeoutMs).toBe(120_000); // 缺省仍在
    } finally {
      p.cleanup();
    }
  });

  it("老仓库删掉的字段名也算未知（不静默兼容）", () => {
    const p = makeProject("G4-legacy");
    try {
      // 这五个是老仓库有、我们删掉的。写了它们说明人拿着旧文档在配
      p.writeJson({
        ...MINIMAL,
        testDir: "tests",
        sBlacklist: ["db/schema.sql"],
        buildCmd: "npm run build",
        statusFile: "docs/plan.md",
        conventionsFile: "CONVENTIONS.md",
      });
      const { diagnostics } = inspectConfig(p.root);
      const warns = diagnostics.filter((d) => d.level === "warn");
      expect(warns.length).toBe(5);
    } finally {
      p.cleanup();
    }
  });

  it("类型不符 → warn（行为未定义，但不阻断）", () => {
    const p = makeProject("G4-type");
    try {
      p.writeJson({ ...MINIMAL, maxRounds: "五" });
      const { diagnostics } = inspectConfig(p.root);
      const warns = diagnostics.filter((d) => d.level === "warn");
      expect(warns.length).toBeGreaterThan(0);
      expect(warns.map((d) => d.message).join(" ")).toContain("maxRounds");
    } finally {
      p.cleanup();
    }
  });

  it("类型不符时该字段回退到缺省，不是带着坏值往下传", () => {
    const p = makeProject("G4-fallback");
    try {
      p.writeJson({ ...MINIMAL, maxRounds: "五" });
      const { cfg } = inspectConfig(p.root);
      expect(cfg?.maxRounds).toBe(5);
    } finally {
      p.cleanup();
    }
  });
});
