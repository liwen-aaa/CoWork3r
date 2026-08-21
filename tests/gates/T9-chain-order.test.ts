/**
 * T9 链是数据，顺序有讲究：便宜的先跑，贵的不白跑
 *
 * 结构不对就没必要跑测试套件。这不只是性能——一个跑 5 分钟的套件在结构必然会被
 * 拦下来的情况下跑完，是把「你的产出不完整」这条反馈延迟五分钟。
 *
 * 本文件用 spy 计数验「贵的那个真的没被调用」，而不是只验最终 block。
 * 两者的差别是真实的：链如果先跑命令再看结构，最终结果一样 block，但代价不同。
 *
 * 另一半是「链是数据」：CHAINS 是一张表，07-adapter 只查表按序跑。
 * 表里每个键都得能查到，否则某条通道的 gate 就静默不存在了（老仓库那个
 * ticket_result 的形状：七处声明、零处工作）。
 */
import { describe, expect, it, vi } from "vitest";

import { CHAINS, chainFor, runChain } from "../../src/gates/index.ts";
import { ROUTES } from "../../src/protocol/index.ts";
import { makeProject, realConfig, realMilestone } from "./_fixture.ts";
import type { Gate } from "../../src/gates/index.ts";

describe("T9 拦截链的顺序与完整性", () => {
  it("前一道不过 → 后一道不被调用（spy 计数）", () => {
    const m = realMilestone("M1");
    const p = makeProject("t9-order");
    try {
      const { cfg } = realConfig(p.root);
      if (!cfg) throw new Error("前提失败");

      const cheap = vi.fn(() => ({ ok: false as const, reason: "结构不对", failedGate: "G_cheap" }));
      const expensive = vi.fn(() => ({ ok: true as const }));
      Object.defineProperty(cheap, "name", { value: "G_cheap" });
      Object.defineProperty(expensive, "name", { value: "G_expensive" });

      const r = runChain([cheap as unknown as Gate, expensive as unknown as Gate], {
        root: p.root,
        cfg,
        milestone: m,
        input: {},
      });

      expect(r.ok).toBe(false);
      expect(cheap).toHaveBeenCalledTimes(1);
      expect(expensive).toHaveBeenCalledTimes(0);
    } finally {
      p.cleanup();
    }
  });

  it("第一个不过就返回它的 failedGate（不是最后一个，也不是汇总）", () => {
    const m = realMilestone("M1");
    const p = makeProject("t9-first");
    try {
      const { cfg } = realConfig(p.root);
      if (!cfg) throw new Error("前提失败");
      const a: Gate = () => ({ ok: false, reason: "A 不过", failedGate: "G_a" });
      const b: Gate = () => ({ ok: false, reason: "B 不过", failedGate: "G_b" });
      const r = runChain([a, b], { root: p.root, cfg, milestone: m, input: {} });
      if (r.ok) throw new Error("应 block");
      expect(r.failedGate).toBe("G_a");
      expect(r.reason).toContain("A 不过");
      expect(r.reason).not.toContain("B 不过");
    } finally {
      p.cleanup();
    }
  });

  it("全过 → ok，且每道都被调用过一次", () => {
    const m = realMilestone("M1");
    const p = makeProject("t9-all");
    try {
      const { cfg } = realConfig(p.root);
      if (!cfg) throw new Error("前提失败");
      const g1 = vi.fn(() => ({ ok: true as const }));
      const g2 = vi.fn(() => ({ ok: true as const }));
      const r = runChain([g1 as unknown as Gate, g2 as unknown as Gate], {
        root: p.root,
        cfg,
        milestone: m,
        input: {},
      });
      expect(r.ok).toBe(true);
      expect(g1).toHaveBeenCalledTimes(1);
      expect(g2).toHaveBeenCalledTimes(1);
    } finally {
      p.cleanup();
    }
  });

  it("空链 → ok（无 gate 的通道是合法的，如 arch:report）", () => {
    const m = realMilestone("M1");
    const p = makeProject("t9-empty");
    try {
      const { cfg } = realConfig(p.root);
      if (!cfg) throw new Error("前提失败");
      expect(runChain([], { root: p.root, cfg, milestone: m, input: {} }).ok).toBe(true);
      expect(chainFor("arch", "report")).toHaveLength(0);
    } finally {
      p.cleanup();
    }
  });

  it("verdict_pass 链里 G_command 排在结构 gate 之后（贵的在后）", () => {
    const chain = chainFor("tester", "verdict_pass");
    if (chain === null) throw new Error("CHAINS 缺 tester:verdict_pass");
    const names = chain.map((g) => g.name);
    const iCmd = names.indexOf("G_command");
    expect(iCmd).toBeGreaterThan(-1);
    // 结构检查必须在它之前
    const iArtifact = names.findIndex((n) => /artifact/i.test(n));
    expect(iArtifact).toBeGreaterThan(-1);
    expect(iArtifact).toBeLessThan(iCmd);
  });

  it("chainFor 查不到返回 null，不是空数组（区分「声明无 gate」与「键写错了」）", () => {
    // 这两者混同正是老仓库 ticket_result 那个 bug 能活两个月的原因
    expect(chainFor("arch", "report")).toEqual([]);
    expect(chainFor("dev", "verdict_pass")).toBeNull();
    expect(chainFor("nobody", "nothing")).toBeNull();
  });

  it("ROUTES 里每个 type 都能在 CHAINS 里查到（不许某条通道静默无 gate）", () => {
    // 老仓库 ticket_result 的形状：七处声明这条通道存在、零处让它工作。
    // 「无 gate」必须是表里写着的空数组，不能是查不到键
    for (const [type, route] of Object.entries(ROUTES)) {
      const key = `${route.from}:${type}`;
      expect(Object.hasOwn(CHAINS, key), `CHAINS 缺键 ${key}`).toBe(true);
    }
  });

  it("CHAINS 里没有 ROUTES 之外的键（反向：不许有查不到通道的死链）", () => {
    const valid = new Set(Object.entries(ROUTES).map(([type, r]) => `${r.from}:${type}`));
    for (const key of Object.keys(CHAINS)) {
      expect(valid.has(key), `CHAINS 多了键 ${key}`).toBe(true);
    }
  });
});
