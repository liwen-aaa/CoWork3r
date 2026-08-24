/**
 * A9i roleNotes 真的进 system prompt（半接线：函数被调了，参数没用满）
 *
 * 来源事故（2026-08-24 实测）：`wire.ts` 写的是
 *   `buildSystemPrompt(role as SpecRole, event.systemPrompt)`
 * ——第三个参数 `notes` 永远 undefined，于是 `cfg.roleNotes` 从未进过任何窗口的
 * system prompt。而它有四处声明存在：D-18 一整条纪律、`decisions.md` 一条决策
 * （「一段而不是三段」）、`templates/wf.config.json` 的示例、本仓库自己的
 * `wf.config.json`。R3 测的是纯函数 `buildSystemPrompt(role, base, notes)`
 * 直接传 notes——所以那三条用例永远绿，而真实链路上没人传。
 *
 * **这是 D-49 抓不到的形态。** `check-wiring` 问「导出有没有生产调用点」，
 * 而 `buildSystemPrompt` 有调用点、活得好好的；死的是它的一个参数。
 * 哑弹的伪装又深了一层：不是「函数没接线」，是「接了但没接全」。
 *
 * 本文件从 wire 的公共入口（`before_agent_start` 事件）验证四件事：
 *   ① 配置里有 roleNotes → 它出现在返回的 systemPrompt 里
 *   ② 位置正确：规约之后、特征串之前（D-18 的追加语义，R3 的真实链路版）
 *   ③ 三个角色都注入（不是只有 arch 拿到项目事实）
 *   ④ 配置里没写 roleNotes → 不留空段（也不崩）
 */
import { describe, expect, it } from "vitest";

import { wire } from "../../src/adapter/index.ts";
import { loadRoleSpec, specMark } from "../../src/roles/index.ts";
import { fakePi, installPlan, makeProject, realConfig } from "./_fixture.ts";

const NOTES = "本仓库的项目事实：改 XYZ-MARKER 之前先看 docs/。";

/** 触发 before_agent_start，拿回 handler 返回的 systemPrompt */
function promptOf(role: "arch" | "dev" | "tester", root: string, base = "BASE"): string {
  const pi = fakePi();
  const stop = wire(role, pi as never);
  const res = pi.emit("before_agent_start", { systemPrompt: base }, { cwd: root }) as
    | { systemPrompt?: string }
    | undefined;
  stop();
  return res?.systemPrompt ?? "";
}

describe("A9i roleNotes 进 system prompt", () => {
  it("配置里的 roleNotes 出现在注入结果里（旧实现：第三参没传，永远 undefined）", () => {
    const p = makeProject("a9i-present");
    try {
      const { cfg } = realConfig(p.root, { plan: installPlan(p.root), roleNotes: NOTES });
      expect(cfg?.roleNotes, "前提：配置真的读到了 roleNotes").toBe(NOTES);

      const prompt = promptOf("dev", p.root);
      expect(prompt, "roleNotes 有四处声明存在，而真实链路上没人传它").toContain("XYZ-MARKER");
    } finally {
      p.cleanup();
    }
  });

  it("位置正确：base → 规约 → roleNotes → 特征串（D-18 追加语义的真实链路版）", () => {
    const p = makeProject("a9i-order");
    try {
      realConfig(p.root, { plan: installPlan(p.root), roleNotes: NOTES });
      const prompt = promptOf("tester", p.root);

      const iBase = prompt.indexOf("BASE");
      const iSpec = prompt.indexOf(loadRoleSpec("tester").trimEnd().slice(0, 20));
      const iNotes = prompt.indexOf("XYZ-MARKER");
      const iMark = prompt.indexOf(specMark("tester"));
      expect(iBase).toBeGreaterThanOrEqual(0);
      expect(iSpec).toBeGreaterThan(iBase);
      expect(iNotes, "roleNotes 在规约之后").toBeGreaterThan(iSpec);
      expect(iMark, "特征串在最后（自检靠它，被整份替换时才检得出）").toBeGreaterThan(iNotes);
    } finally {
      p.cleanup();
    }
  });

  it("三个角色都拿到项目事实（不是只有 arch）", () => {
    const p = makeProject("a9i-all");
    try {
      realConfig(p.root, { plan: installPlan(p.root), roleNotes: NOTES });
      for (const role of ["arch", "dev", "tester"] as const) {
        expect(promptOf(role, p.root), `${role} 没拿到 roleNotes`).toContain("XYZ-MARKER");
      }
    } finally {
      p.cleanup();
    }
  });

  it("配置没写 roleNotes → 不留空段，规约与特征串仍在", () => {
    const p = makeProject("a9i-absent");
    try {
      // 模板本身带 roleNotes，显式设空串 = 「没写」的等价形态（config 层不收空串字段）
      realConfig(p.root, { plan: installPlan(p.root), roleNotes: "" });
      const prompt = promptOf("arch", p.root);
      expect(prompt).toContain(specMark("arch"));
      expect(prompt).not.toMatch(/关于这个项目\s*$/);
      expect(prompt).not.toMatch(/\n{4,}/); // 没有连续空段
    } finally {
      p.cleanup();
    }
  });
});
