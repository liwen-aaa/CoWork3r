/**
 * T8 配置 fatal → 拦「宣布完成」，放行「继续开发」
 *
 * 这个不对称是有意的，判据在 03-config 的文件头也写着一遍：
 * **配置坏了不该阻止 dev 写代码和投递，只该阻止任何人说「验证过了」。**
 *
 * 所以 `verdict_pass` / `milestone_passed` 拦，`review_request` 放行。
 *
 * 老仓库的 `catch { return {} }` 把「配错」和「主动不配」当成同一件事——一个逗号
 * 写错就能让整条验证链无声关闭，而配置者以为自己配了。fatal 时 `cfg` 是 `null`
 * 而不是半成品，类型层面就不给「拿到一个看起来能用的配置」这个机会。
 */
import { describe, expect, it } from "vitest";

import { configGate } from "../../src/gates/index.ts";
import { makeProject, realConfig } from "./_fixture.ts";

/** 造一个 fatal：坏正则（03-config 的 G3 判它 fatal，因为 gate 层会 new RegExp 它） */
const BAD_REGEX = { testPass: "([unclosed" };

describe("T8 配置 fatal 的不对称拦截", () => {
  it("fatal 时 verdict_pass 被拦", () => {
    const p = makeProject("t8-pass");
    try {
      const { cfg, diagnostics } = realConfig(p.root, BAD_REGEX);
      expect(cfg).toBeNull(); // 前提：坏正则是 fatal
      const r = configGate(diagnostics, "verdict_pass");
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.failedGate).toBe("G_config");
        expect(r.reason).toContain("testPass");
      }
    } finally {
      p.cleanup();
    }
  });

  it("fatal 时 milestone_passed 也被拦（放行必须带凭证，而凭证依赖配置）", () => {
    const p = makeProject("t8-mp");
    try {
      const { diagnostics } = realConfig(p.root, BAD_REGEX);
      expect(configGate(diagnostics, "milestone_passed").ok).toBe(false);
    } finally {
      p.cleanup();
    }
  });

  it("fatal 时 review_request 放行（dev 照样能写代码、能投递）", () => {
    const p = makeProject("t8-rr");
    try {
      const { diagnostics } = realConfig(p.root, BAD_REGEX);
      expect(configGate(diagnostics, "review_request").ok).toBe(true);
    } finally {
      p.cleanup();
    }
  });

  it("fatal 时 fix_request 放行（打回也不是「宣布完成」）", () => {
    const p = makeProject("t8-fr");
    try {
      const { diagnostics } = realConfig(p.root, BAD_REGEX);
      expect(configGate(diagnostics, "fix_request").ok).toBe(true);
    } finally {
      p.cleanup();
    }
  });

  it("fatal 时 stuck / escalation 放行（求助不该被配置问题堵死）", () => {
    const p = makeProject("t8-help");
    try {
      const { diagnostics } = realConfig(p.root, BAD_REGEX);
      expect(configGate(diagnostics, "stuck").ok).toBe(true);
      expect(configGate(diagnostics, "escalation").ok).toBe(true);
    } finally {
      p.cleanup();
    }
  });

  it("无 fatal 时全部放行（对照组）", () => {
    const p = makeProject("t8-clean");
    try {
      const { cfg, diagnostics } = realConfig(p.root);
      expect(cfg).not.toBeNull();
      for (const t of ["verdict_pass", "milestone_passed", "review_request"] as const) {
        expect(configGate(diagnostics, t).ok).toBe(true);
      }
    } finally {
      p.cleanup();
    }
  });

  it("warn 不拦（拼错字段名只让那项不生效，不该关掉整条链）", () => {
    const p = makeProject("t8-warn");
    try {
      const { cfg, diagnostics } = realConfig(p.root, { tesDir: "src" });
      expect(cfg).not.toBeNull();
      expect(diagnostics.some((d) => d.level === "warn")).toBe(true);
      expect(configGate(diagnostics, "verdict_pass").ok).toBe(true);
    } finally {
      p.cleanup();
    }
  });

  it("reason 里带上是哪个字段坏了（不是笼统说「配置有问题」）", () => {
    const p = makeProject("t8-reason");
    try {
      const { diagnostics } = realConfig(p.root, BAD_REGEX);
      const r = configGate(diagnostics, "verdict_pass");
      if (r.ok) throw new Error("应 block");
      expect(r.reason).toContain("([unclosed");
    } finally {
      p.cleanup();
    }
  });
});
