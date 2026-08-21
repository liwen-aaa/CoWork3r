/**
 * A3 链分发：各角色各 type 命中正确的链（遍历 CHAINS）
 *
 * wire 的 tool_call 钩子只做一件事：`CHAINS[`${role}:${type}`]` 查表跑链。
 * 不许在 wire 里出现任何针对具体 type 的 if——加一道 gate 只改 CHAINS 表，
 * 不动接线。本文件遍历 CHAINS 全部键，逐条验证 wire 真的把它接上了：
 *
 *   对一个「必然 block 的输入」，返回的 reason 必须来自 CHAINS 里那张链的
 *   某个 gate，而不是一个笼统的「拒绝」。reason 带 gate 名（G_xxx）——
 *   failedGate 字段就是证据。
 *
 * 输入的 Milestone / Config 全部来自真实模板（D-25）。
 */
import { describe, expect, it } from "vitest";

import { CHAINS, runChain } from "../../src/gates/index.ts";
import { wire } from "../../src/adapter/index.ts";
import { writeState } from "../../src/channel/index.ts";
import { fakePi, installPlan, makeProject, realConfig, realMilestone } from "./_fixture.ts";
import type { GateContext } from "../../src/gates/index.ts";

function ctxFor(root: string): GateContext {
  const { cfg } = realConfig(root, { plan: installPlan(root) });
  if (!cfg) throw new Error("前提失败：模板配置应可解析");
  // wire 的拦截从 state.milestone 读当前里程碑——测试必须先把 state 写好
  writeState(root, { milestone: "M1", round: 1, maxRounds: 5, consecutiveFails: 0 });
  return {
    root,
    cfg,
    milestone: realMilestone("M1"),
    input: {},
  };
}

describe("A3 链分发", () => {
  it("遍历 CHAINS：wire 注册的拦截对每个 role:type 都接到 CHAINS 那张链上", () => {
    // 对每个键：wire 一个该角色的 fake pi，触发 tool_call，断言拦截结果
    // 与直接跑 CHAINS 的结果一致（reason / failedGate 相同）。
    const p = makeProject("a3-all");
    try {
      const root = p.root;
      const base = ctxFor(root);

      for (const key of Object.keys(CHAINS) as Array<keyof typeof CHAINS>) {
        const [role, type] = key.split(":") as [string, string];
        const pi = fakePi();
        wire(role as "arch" | "dev" | "tester", pi as never);

        // 从 CHAINS 拿链，构造一个必失败的输入（空 input 对结构 gate 必 block）
        const chain = CHAINS[key];
        const expected = runChain(chain ?? [], { ...base, input: {} });

        // 触发 wire 的 tool_call 拦截
        const result = pi.emit(
          "tool_call",
          { toolName: "send_task", input: { type, ...{} } },
          { cwd: root },
        );

        // 与 runChain 等价：链放行 → wire 不拦（undefined）；链 block → 拦且 reason 一致。
        // 注意不能假设必 block——arch 的链（G_plan）在合法 milestone 下会放行。
        if (expected.ok) {
          expect(result).toBeUndefined();
        } else {
          expect(result).toEqual({ block: true, reason: expected.reason });
        }
      }
    } finally {
      p.cleanup();
    }
  });

  it("非 send_task 工具不拦截", () => {
    const p = makeProject("a3-other");
    try {
      const pi = fakePi();
      wire("dev", pi as never);
      const r = pi.emit("tool_call", { toolName: "bash", input: {} }, { cwd: p.root });
      expect(r).toBeUndefined();
    } finally {
      p.cleanup();
    }
  });
});
