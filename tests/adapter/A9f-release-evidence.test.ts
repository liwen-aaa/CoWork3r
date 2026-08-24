/**
 * A9f 放行凭证三段校验（共识 ② 方案 A 的 D-01 守门员）
 *
 * arch 代理化后，milestone_passed 由 arch 代发（ROUTES from 改 arch），
 * D-01 的最后一米从「tester 规约的一句话」升级为 gate 判据：
 * **evidence 必须含三段——人原话 + arch 整理 + 确认标记，缺一段 block。**
 *
 * 这堵的是：arch 自己宣布完成（它拿不出「人的原话」那段）、
 * 以及「tester 不经人直接放行」的旧路径（from 改 arch 后 tester 根本发不出）。
 *
 * **本文件只管凭证那一道。** 放行还有一道前置（state 里真的在等人判定）在 A9h——
 * 因为三段凭证是 arch 自己写的字符串，光查它挡不住「人从未参与」（实测过）。
 * 所以下面的 setup 先让 tester 真发一条 verdict_pass 把前置建好，再验凭证判据：
 * 两道各测各的，否则本文件会因别人的 block 而“绿”（红因不唯一）。
 */
import { describe, expect, it } from "vitest";

import { writeState } from "../../src/channel/index.ts";
import { wire } from "../../src/adapter/index.ts";
import { fakePi, installPlan, makeProject, realConfig } from "./_fixture.ts";

/** 前置：tester 真发一条 verdict_pass（走真实 execute → FLOW 写下放行许可）*/
async function grantPermit(root: string, file: (rel: string, c: string) => string) {
  const tester = fakePi();
  const stop = wire("tester", tester as never);
  file("wf/test-report-M1.md", "# report M1\n\n判定：PASS\n\n- M1.1 通过\n- M1.2 通过\n");
  const def = tester.tools.find((t) => t.name === "send_task")!.def as {
    execute: (...a: unknown[]) => Promise<unknown>;
  };
  await def.execute(
    "v",
    { type: "verdict_pass", milestone: "M1", artifact: "wf/test-report-M1.md", questions: ["M1.2 是人话吗"] },
    undefined,
    undefined,
    { cwd: root },
  );
  stop();
}

async function setup(label: string) {
  const p = makeProject(label);
  const root = p.root;
  realConfig(root, { plan: installPlan(root), test: null });
  writeState(root, { milestone: "M1", round: 1, maxRounds: 5, consecutiveFails: 0 });
  await grantPermit(root, p.file); // 前置已立，下面只验凭证那一道
  const pi = fakePi();
  const stop = wire("arch", pi as never);
  return { p, root, pi, stop };
}

function emit(pi: ReturnType<typeof fakePi>, root: string, evidence: string) {
  return pi.emit(
    "tool_call",
    { toolName: "send_task", input: { type: "milestone_passed", milestone: "M1", evidence } },
    { cwd: root },
  );
}

describe("A9f 放行凭证三段", () => {
  it("evidence 三段齐全（人原话 + arch 整理 + 确认）→ 放行", async () => {
    const { p, root, pi, stop } = await setup("a9f-ok");
    try {
      const r = emit(pi, root, "人原话:「M1 可以过」 arch 整理:已核对断言 确认:Y");
      expect(r).toBeUndefined();
    } finally {
      stop();
      p.cleanup();
    }
  });

  it("缺「人原话」→ block（arch 拿不出人的话 = 自行宣布完成）", async () => {
    const { p, root, pi, stop } = await setup("a9f-no-human");
    try {
      const r = emit(pi, root, "arch 整理:已核对断言 确认:Y");
      expect(r).toMatchObject({ block: true });
      expect((r as { reason: string }).reason).toContain("人原话");
    } finally {
      stop();
      p.cleanup();
    }
  });

  it("缺「确认」→ block（人没点头 = 放行无效）", async () => {
    const { p, root, pi, stop } = await setup("a9f-no-confirm");
    try {
      const r = emit(pi, root, "人原话:「M1 可以过」 arch 整理:已核对断言");
      expect(r).toMatchObject({ block: true });
      expect((r as { reason: string }).reason).toContain("确认");
    } finally {
      stop();
      p.cleanup();
    }
  });

  it("tester 发 milestone_passed → block（from 已改 arch，tester 无此通道）", () => {
    const p = makeProject("a9f-wrong-from");
    try {
      const root = p.root;
      realConfig(root, { plan: installPlan(root) });
      writeState(root, { milestone: "M1", round: 1, maxRounds: 5, consecutiveFails: 0 });
      const pi = fakePi();
      const stop = wire("tester", pi as never);
      const r = pi.emit(
        "tool_call",
        { toolName: "send_task", input: { type: "milestone_passed", milestone: "M1", evidence: "人原话:x arch 整理:x 确认:Y" } },
        { cwd: root },
      );
      // 拦在哪里：`CHAINS` 无 `tester:milestone_passed` 键 → chainFor 返回 null → block
      // （不是“协议层”：resolveType 不校 input.type 的归属，真正的协议层报错在 execute 的 build 里）。
      // 写清楚是因为：哪天有人往 CHAINS 加一行 `"tester:milestone_passed": []`，
      // 本用例会静默变成测别的东西（绿得理由与标题不再是一件事）。
      expect(r).toMatchObject({ block: true });
      expect((r as { reason: string }).reason).toContain("tester:milestone_passed");
      stop();
    } finally {
      p.cleanup();
    }
  });
});
