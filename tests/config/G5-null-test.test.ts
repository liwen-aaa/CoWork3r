/**
 * G5 `test: null` → info；`test` 字段缺失 → fatal
 *
 * **这两者必须区分，这是本模块存在的核心判据。**
 *
 * 老仓库的 `testCmd` 不配就静默降级：所有 gate 关闭，而配置者以为自己配了。
 * 实证——work-flow-paper 全程没配 `sourceDir`，快照校验从未生效，
 * M1-R3 出现 dev 零改动投递，靠 tester 手查 mtime 才发现。
 *
 * 所以 D-23 要求显式降级：写 `null` = 「我知道这个项目没法自动测」，是一个**声明**；
 * 字段缺失 = 遗漏，不许含糊过去。
 */
import { describe, expect, it } from "vitest";

import { inspectConfig } from "../../src/config/index.ts";
import { MINIMAL, makeProject } from "./_fixture.ts";

describe("G5 test 字段的两种「没有」", () => {
  it("test: null → info（不是 fatal，也不是零诊断）", () => {
    const p = makeProject("G5-null");
    try {
      p.writeJson({ ...MINIMAL, test: null });
      const { cfg, diagnostics } = inspectConfig(p.root);

      expect(cfg).not.toBeNull();
      expect(cfg?.test).toBeNull();

      expect(diagnostics.filter((d) => d.level === "fatal")).toEqual([]);
      const infos = diagnostics.filter((d) => d.level === "info");
      expect(infos.length).toBe(1);
      // 常驻提示的措辞：人要知道现在少了什么保护
      expect(infos[0]?.message).toMatch(/自动验证|已关闭|无法自动测/);
    } finally {
      p.cleanup();
    }
  });

  it("test 字段整个缺失 → fatal", () => {
    const p = makeProject("G5-absent");
    try {
      const { test: _drop, ...rest } = MINIMAL;
      p.writeJson(rest);
      const { cfg, diagnostics } = inspectConfig(p.root);

      expect(cfg).toBeNull();
      expect(diagnostics.some((d) => d.level === "fatal")).toBe(true);
    } finally {
      p.cleanup();
    }
  });

  it("两者的诊断级别不同（防「都当没配」）", () => {
    const withNull = makeProject("G5-cmp-null");
    const withAbsent = makeProject("G5-cmp-absent");
    try {
      withNull.writeJson({ ...MINIMAL, test: null });
      const { test: _drop, ...rest } = MINIMAL;
      withAbsent.writeJson(rest);

      const a = inspectConfig(withNull.root);
      const b = inspectConfig(withAbsent.root);

      // 一个能继续工作，一个不能 —— 这就是「主动不配」与「配错」的分界
      expect(a.cfg).not.toBeNull();
      expect(b.cfg).toBeNull();
    } finally {
      withNull.cleanup();
      withAbsent.cleanup();
    }
  });

  it("test: 空字符串 → fatal（空串不是声明，是没写完）", () => {
    const p = makeProject("G5-empty");
    try {
      p.writeJson({ ...MINIMAL, test: "   " });
      const { cfg, diagnostics } = inspectConfig(p.root);
      expect(cfg).toBeNull();
      expect(diagnostics.some((d) => d.level === "fatal")).toBe(true);
    } finally {
      p.cleanup();
    }
  });
});
