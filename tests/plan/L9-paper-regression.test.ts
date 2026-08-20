/**
 * L9 老仓库那份 plan.md → 报错，且错误指出缺什么、在哪一行
 *
 * **回归证据。** 拿真实出过事的输入当测试用例。
 *
 * 实测确认过的事实：`planQualityGate('work-flow-paper', 'docs/plan.md', 'M1')` → false，
 * M2/M3/M4 同样 false。四个里程碑全部通不过 gate，而它们全都真的通过了人工验收——
 * 因为**没人真跑过 arch 分发那条路径**，所以那个 false 从来没被看见。
 *
 * 根因是格式分裂：模板产出行内 `验收：...`，gate 认 `### 验收断言方向` 小节。
 * 这份 fixture 保留了那个形态：`## 里程碑 M1：Introduction ✅（...）` 后面直接跟
 * 一行 `验收：...`，没有 `### 断言` 节。
 *
 * 现在它必须**有声地**失败——不只是返回 false，而是说清缺什么、在第几行。
 * 老仓库那个 false 是静默的，这是全套东西里最贵的一次教训。
 */
import { describe, expect, it } from "vitest";

import { verbatim } from "./_fixture.ts";
import { parsePlan } from "../../src/plan/index.ts";

describe("L9 老仓库规划书回归", () => {
  it("解析失败（当年它静默通不过 gate，现在必须有声）", () => {
    const f = verbatim("paper");
    try {
      const r = parsePlan(f.root, f.rel);
      expect(r.ok).toBe(false);
    } finally {
      f.cleanup();
    }
  });

  it("错误带行号，且行号落在真实的里程碑标题附近", () => {
    const f = verbatim("paper");
    try {
      const r = parsePlan(f.root, f.rel);
      if (r.ok) throw new Error("应失败");
      for (const e of r.errors) {
        expect(e.line, JSON.stringify(e)).toBeGreaterThan(0);
        expect(e.message.trim().length).toBeGreaterThan(0);
      }
      // 「格式不对」这种提示会让人放弃修，所以要能跳到那一行
      expect(r.errors.length).toBeGreaterThan(0);
    } finally {
      f.cleanup();
    }
  });

  it("错误说清缺的是断言节（不是笼统说格式错）", () => {
    const f = verbatim("paper");
    try {
      const r = parsePlan(f.root, f.rel);
      if (r.ok) throw new Error("应失败");
      const msg = r.errors.map((e) => e.message).join(" ");
      expect(msg).toMatch(/断言/);
    } finally {
      f.cleanup();
    }
  });

  it("四个里程碑各自报一次（不是撞到第一个就停）", () => {
    const f = verbatim("paper");
    try {
      const r = parsePlan(f.root, f.rel);
      if (r.ok) throw new Error("应失败");
      // paper 有 M1–M4，每个都缺 `### 断言` 节。人要一次看到全部四处，
      // 而不是修一个跑一次
      expect(r.errors.length).toBeGreaterThanOrEqual(4);
    } finally {
      f.cleanup();
    }
  });

  it("行内「验收：」不被当成断言（那正是分裂点）", () => {
    const f = verbatim("paper");
    try {
      const r = parsePlan(f.root, f.rel);
      // 关键：解析器**不能**为了兼容而去认「验收：」。
      // 认了就等于承认两种格式，而两种格式互不校验正是这次失效的形态。
      // 所以这里断言的是「它失败了」，而不是「它宽容地接受了」
      expect(r.ok).toBe(false);
    } finally {
      f.cleanup();
    }
  });

  it("失败时不返回半成品 plan（与 config 的 cfg===null 同一条判据）", () => {
    const f = verbatim("paper");
    try {
      const r = parsePlan(f.root, f.rel);
      expect(r.ok).toBe(false);
      // 类型上就没有 plan 字段可拿——下游拿不到「看起来能用」的解析结果
      expect("plan" in r).toBe(false);
    } finally {
      f.cleanup();
    }
  });
});
