/**
 * A9h 放行的前置与锚（D-01 最后一米的第二半）
 *
 * A9f 把「放行凭证要有三段」升成了 gate，但那三段是 **arch 自己写的字符串**——
 * 2026-08-24 实测：全程无人参与、人的收件箱从来是空的（连 verdict_pass 都没发过），
 * arch 直接捏 `人原话：行，过了 / arch 整理：都过了 / 确认：Y` 就放行成功。
 * `evidence.includes("人原话")` 检查的是产出者自己提供的凭证里有没有三个中文标签，
 * 而 D-01 说的是「判定完成的一方，其产出不被自己评判」——形状没变，只是从规约里的
 * 一句话变成三个可以照抄的词。顺带：block reason 原文列出三段名，等于在教该写哪三个词。
 *
 * 所以锚必须在 arch 写不到的地方。这里用 `state.awaitingHuman`：
 *   - tester 发 verdict_pass 时由 FLOW **机械写入**（arch 的 LLM 没有写 state 的工具，
 *     它只有 send_task；而 send_task 的每个 type 都会经过拦截链）
 *   - tester 发 fix_request 时**作废**（那一轮的验收已经被推翻，旧许可不能续用）
 *   - milestone_passed 消费掉它（一次许可一次放行，单向门不能重放）
 *
 * 五个用例（旧实现下 ①②④⑤ 必红）：
 *   ① 没有 verdict_pass 就放行 → block（arch 捏三段凭证也没用）
 *   ② 有 verdict_pass → 放行；且 state 里的许可被消费
 *   ③ 有许可但凭证缺段 → 仍 block（A9f 的判据不被本条替代，两道都要过）
 *   ④ 放行一次后再放行 → block（许可已消费，不能重放）
 *   ⑤ verdict_pass 后又来 fix_request → 许可作废，放行 block
 */
import { describe, expect, it } from "vitest";

import { readState, writeState } from "../../src/channel/index.ts";
import { wire } from "../../src/adapter/index.ts";
import { fakePi, installPlan, makeProject, realConfig } from "./_fixture.ts";

const EVIDENCE = "人原话:「M1 可以过」 arch 整理:已对照 M1 两条断言均通过 确认:Y";

function setup(label: string) {
  const p = makeProject(label);
  installPlan(p.root);
  realConfig(p.root, { test: null });
  writeState(p.root, { milestone: "M1", round: 1, maxRounds: 5, consecutiveFails: 0 });
  const arch = fakePi();
  const tester = fakePi();
  const stopArch = wire("arch", arch as never);
  const stopTester = wire("tester", tester as never);
  const def = (pi: ReturnType<typeof fakePi>) =>
    pi.tools.find((t) => t.name === "send_task")!.def as {
      execute: (...a: unknown[]) => Promise<unknown>;
    };
  return {
    ...p,
    arch,
    tester,
    /** tester 真发一条 verdict_pass（走真实 execute → FLOW），报告文件先备好 */
    async testerVerdict() {
      p.file("wf/test-report-M1.md", "# report M1\n\n判定：PASS\n\n- M1.1 通过\n- M1.2 通过\n");
      await def(tester).execute(
        "v",
        {
          type: "verdict_pass",
          milestone: "M1",
          artifact: "wf/test-report-M1.md",
          questions: ["M1.2 内容读起来是句人话吗"],
        },
        undefined,
        undefined,
        { cwd: p.root },
      );
    },
    /** tester 真发一条 fix_request（推翻上一轮验收） */
    async testerFix() {
      p.file("wf/test-report-M1.md", "# report M1\n\n判定：FAIL\n\n- M1.1 未过\n- M1.2 未过\n");
      await def(tester).execute(
        "f",
        {
          type: "fix_request",
          milestone: "M1",
          artifact: "wf/test-report-M1.md",
          issues: [{ id: "M1-001", severity: "serious", description: "又发现一处" }],
        },
        undefined,
        undefined,
        { cwd: p.root },
      );
    },
    /** arch 尝试放行：先过拦截链（返回 undefined = 放行），再真投递 */
    release(evidence = EVIDENCE) {
      return arch.emit(
        "tool_call",
        { toolName: "send_task", input: { type: "milestone_passed", milestone: "M1", evidence } },
        { cwd: p.root },
      );
    },
    async releaseDeliver(evidence = EVIDENCE) {
      return def(arch).execute(
        "r",
        { type: "milestone_passed", milestone: "M1", evidence },
        undefined,
        undefined,
        { cwd: p.root },
      );
    },
    stopAll: () => {
      stopArch();
      stopTester();
    },
  };
}

describe("A9h 放行的前置与锚", () => {
  it("没有 verdict_pass 就放行 → block（arch 捏满三段凭证也没用）", () => {
    const t = setup("a9h-no-verdict");
    try {
      const r = t.release();
      expect(r, "凭证三段齐全但人从未被问过，必须拦").toMatchObject({ block: true });
      expect((r as { reason: string }).reason).toMatch(/verdict_pass|没有.*验收|等人/);
    } finally {
      t.stopAll();
      t.cleanup();
    }
  });

  it("tester 发过 verdict_pass → 放行，且许可被消费", async () => {
    const t = setup("a9h-ok");
    try {
      await t.testerVerdict();
      expect(readState(t.root).awaitingHuman, "verdict_pass 应机械写下许可").toBe("M1");

      expect(t.release()).toBeUndefined();
      await t.releaseDeliver();
      expect(readState(t.root).awaitingHuman, "放行后许可应被消费").toBe("");
    } finally {
      t.stopAll();
      t.cleanup();
    }
  });

  it("有许可但凭证缺段 → 仍 block（A9f 的判据不被替代）", async () => {
    const t = setup("a9h-both");
    try {
      await t.testerVerdict();
      const r = t.release("arch 整理:已核对 确认:Y"); // 缺「人原话」
      expect(r).toMatchObject({ block: true });
      expect((r as { reason: string }).reason).toContain("人原话");
    } finally {
      t.stopAll();
      t.cleanup();
    }
  });

  it("放行一次后再放行 → block（单向门不能重放）", async () => {
    const t = setup("a9h-replay");
    try {
      await t.testerVerdict();
      expect(t.release()).toBeUndefined();
      await t.releaseDeliver();

      const again = t.release();
      expect(again, "同一份许可不能放行两次").toMatchObject({ block: true });
    } finally {
      t.stopAll();
      t.cleanup();
    }
  });

  it("verdict_pass 后又来 fix_request → 许可作废（那一轮验收已被推翻）", async () => {
    const t = setup("a9h-revoked");
    try {
      await t.testerVerdict();
      expect(readState(t.root).awaitingHuman).toBe("M1");

      await t.testerFix();
      expect(readState(t.root).awaitingHuman, "FAIL 推翻了上一轮 PASS，许可必须作废").toBe("");

      const r = t.release();
      expect(r, "许可已作废，不能凭旧许可放行").toMatchObject({ block: true });
    } finally {
      t.stopAll();
      t.cleanup();
    }
  });
});
