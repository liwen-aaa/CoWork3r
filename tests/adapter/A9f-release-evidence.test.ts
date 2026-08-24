/**
 * A9f 放行凭证三段校验（共识 ② 方案 A 的 D-01 守门员）
 *
 * arch 代理化后，milestone_passed 由 arch 代发（ROUTES from 改 arch），
 * D-01 的最后一米从「tester 规约的一句话」升级为 gate 判据：
 * **evidence 必须含三段——人原话 + arch 整理 + 确认标记，缺一段 block。**
 *
 * 这堵的是：arch 自己宣布完成（它拿不出「人的原话」那段）、
 * 以及「tester 不经人直接放行」的旧路径（from 改 arch 后 tester 根本发不出）。
 */
import { describe, expect, it } from "vitest";

import { writeState } from "../../src/channel/index.ts";
import { wire } from "../../src/adapter/index.ts";
import { fakePi, installPlan, makeProject, realConfig } from "./_fixture.ts";

function setup(label: string) {
  const p = makeProject(label);
  const root = p.root;
  realConfig(root, { plan: installPlan(root) });
  writeState(root, { milestone: "M1", round: 1, maxRounds: 5, consecutiveFails: 0 });
  const pi = fakePi();
  wire("arch", pi as never);
  return { p, root, pi };
}

function emit(pi: ReturnType<typeof fakePi>, root: string, evidence: string) {
  return pi.emit(
    "tool_call",
    { toolName: "send_task", input: { type: "milestone_passed", milestone: "M1", evidence } },
    { cwd: root },
  );
}

describe("A9f 放行凭证三段", () => {
  it("evidence 三段齐全（人原话 + arch 整理 + 确认）→ 放行", () => {
    const { p, root, pi } = setup("a9f-ok");
    try {
      const r = emit(pi, root, "人原话:「M1 可以过」 arch 整理:已核对断言 确认:Y");
      expect(r).toBeUndefined();
    } finally {
      p.cleanup();
    }
  });

  it("缺「人原话」→ block（arch 拿不出人的话 = 自行宣布完成）", () => {
    const { p, root, pi } = setup("a9f-no-human");
    try {
      const r = emit(pi, root, "arch 整理:已核对断言 确认:Y");
      expect(r).toMatchObject({ block: true });
      expect((r as { reason: string }).reason).toContain("人原话");
    } finally {
      p.cleanup();
    }
  });

  it("缺「确认」→ block（人没点头 = 放行无效）", () => {
    const { p, root, pi } = setup("a9f-no-confirm");
    try {
      const r = emit(pi, root, "人原话:「M1 可以过」 arch 整理:已核对断言");
      expect(r).toMatchObject({ block: true });
      expect((r as { reason: string }).reason).toContain("确认");
    } finally {
      p.cleanup();
    }
  });

  it("tester 发 milestone_passed → 协议层拒（from 已改 arch，越权在类型层不可能）", () => {
    const p = makeProject("a9f-wrong-from");
    try {
      const root = p.root;
      realConfig(root, { plan: installPlan(root) });
      writeState(root, { milestone: "M1", round: 1, maxRounds: 5, consecutiveFails: 0 });
      const pi = fakePi();
      wire("tester", pi as never);
      const r = pi.emit(
        "tool_call",
        { toolName: "send_task", input: { type: "milestone_passed", milestone: "M1", evidence: "人原话:x arch 整理:x 确认:Y" } },
        { cwd: root },
      );
      // resolveType 不校验 input.type 的归属，但 build 会在 execute 抛错；
      // 拦截层：tester 的 typesFrom 没有 milestone_passed → 走 resolveType 返回输入值
      // 再由 CHAINS 查不到 tester:milestone_passed → chainFor null → block
      expect(r).toMatchObject({ block: true });
    } finally {
      p.cleanup();
    }
  });
});
