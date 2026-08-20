/**
 * L4 `[auto]` 必须含命令或路径，否则 `checkAssertion` 失败
 *
 * 判据比老仓库那个大正则窄得多，因为**分类已经把大部分工作做完了**。
 * 老仓库要用一个正则同时判断「这条能不能自动测」和「这条是不是空话」，于是
 * 既误伤（`需人工验证` 得特判）又漏放（`完成三个模块` 含数字就过）。
 *
 * 现在：你自己标了 auto，我只问你命令在哪。写不出命令怎么办？那它就是 human——
 * 这不是妥协，是让分类承载信息。
 *
 * 注意 `checkAssertion` 与 `parsePlan` 分开：解析成功 ≠ 可测。
 * 不可测的断言是 arch 分发前被 G-plan 拦（05-gates），不是解析报错——
 * 因为规划书写到一半就该能解析，可测性是分发时的门槛。
 */
import { describe, expect, it } from "vitest";

import { verbatim } from "./_fixture.ts";
import { checkAssertion, parsePlan } from "../../src/plan/index.ts";

/** 从真实样本取一条 auto 断言当模板，只改 text——不手写 Assertion 字面量（D-25） */
function anAuto(kind: "auto" | "human" = "auto") {
  const f = verbatim("own");
  try {
    const r = parsePlan(f.root, f.rel);
    if (!r.ok) throw new Error("前提失败：本项目 plan.md 应能解析");
    const a = r.plan.milestones.flatMap((m) => m.assertions).find((x) => x.kind === kind);
    if (!a) throw new Error(`前提失败：找不到 ${kind} 断言`);
    return a;
  } finally {
    f.cleanup();
  }
}

describe("L4 auto 的可测性", () => {
  it("真实的 auto 断言全部通过 checkAssertion", () => {
    const f = verbatim("own");
    try {
      const r = parsePlan(f.root, f.rel);
      if (!r.ok) throw new Error("应解析成功");
      const bad = r.plan.milestones
        .flatMap((m) => m.assertions)
        .filter((a) => a.kind === "auto")
        .map((a) => ({ id: a.id, ...checkAssertion(a) }))
        .filter((x) => !x.ok);
      // 本项目自己的规划书是第三个真实样本，它必须自洽
      expect(bad).toEqual([]);
    } finally {
      f.cleanup();
    }
  });

  it("含反引号命令 → 通过", () => {
    expect(checkAssertion({ ...anAuto(), text: "`npm test` 全绿" }).ok).toBe(true);
  });

  it("含路径 → 通过（可检查存在性）", () => {
    expect(checkAssertion({ ...anAuto(), text: "存在 src/channel/watch.ts" }).ok).toBe(true);
  });

  it("纯空话无命令无路径 → 失败，reason 说清缺什么", () => {
    const r = checkAssertion({ ...anAuto(), text: "完成三个模块" });
    expect(r.ok).toBe(false);
    // 老仓库那个正则会放过它（含数字就算可测）
    if (!r.ok) expect(r.reason).toMatch(/命令|路径/);
  });

  it("「需人工验证」这类不再需要特判（它本来就该标 human）", () => {
    // 老仓库为这个字符串加过特例。分类之后特例消失：
    // 标了 auto 就得给命令，标了 human 就走 L5 的判据
    const r = checkAssertion({ ...anAuto(), text: "需人工验证" });
    expect(r.ok).toBe(false);
  });

  it("空文本 → 失败", () => {
    expect(checkAssertion({ ...anAuto(), text: "   " }).ok).toBe(false);
  });
});
