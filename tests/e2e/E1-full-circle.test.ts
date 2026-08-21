/**
 * E1 完整一圈：临时目录 fixture 项目跑完整流水线
 *
 * 分发 → 产出 → FAIL → 修 → PASS → /pass → 回 arch，逐步断言消息落点与状态变化。
 *
 * 这是 M6 的核心验收：mock-pi 同进程驱动三个适配器，验的是**接线正确**——
 * wire 把 01–05 层接成一条能跑通的流水线。它不验 pi 的真实行为（事件时序、
 * sendUserMessage 语义、系统提示注入链）——那是 M6 那条 [human]（真开三窗口）
 * 存在的理由，不能用 E1 顶掉。
 *
 * 驱动方式：不真的开进程、不真的等 watchInbox 轮询。每个角色 = 一个 fake pi，
 * wire 注册好工具与拦截后，测试扮演 LLM：
 *   ① 调 `send_task` 工具前，先 emit tool_call（wire 的拦截 handler 跑链）
 *   ② 没被拦 → 调工具的 execute（deliver 消息）
 *   ③ 断言收件箱落点 + state 变化
 * 「收到消息后 LLM 该怎么反应」不测（那是 M6 [human]），测的是机器部分。
 *
 * 工具 execute 的 root 从 ctx.cwd 来（pi 文档：execute 最后一个参数是 ctx）。
 * 产出文件路径走 `artifact` 字段（G_artifact 读它），source 目录里放真文件（G_source）。
 */
import { describe, expect, it } from "vitest";

import { peek, readState, writeState } from "../../src/channel/index.ts";
import { wire } from "../../src/adapter/index.ts";
import { fakePi, installPlan, makeProject, realConfig } from "../adapter/_fixture.ts";

/** 找到 send_task 工具的 execute（fakePi 记录了 registerTool 的 def） */
function sendTask(pi: ReturnType<typeof fakePi>) {
  const def = pi.tools.find((t) => t.name === "send_task")?.def as
    | { execute: (...args: unknown[]) => Promise<unknown> | unknown }
    | undefined;
  if (!def?.execute) throw new Error("send_task 工具未注册");
  return (params: Record<string, unknown>, root: string) =>
    def.execute("e1", params, undefined, undefined, { cwd: root });
}

describe("E1 完整一圈", () => {
  it("分发 → 产出 → FAIL → 修 → PASS → /pass → 回 arch", async () => {
    const p = makeProject("e1-circle");
    const root = p.root;
    try {
      const { cfg } = realConfig(root, {
        plan: installPlan(root),
        source: "src",
        test: `node -e "console.log('passed')"`,
        gate: `node -e "console.log('ok')"`,
      });
      if (!cfg) throw new Error("前提失败");

      const arch = fakePi();
      const dev = fakePi();
      const tester = fakePi();
      wire("arch", arch as never);
      wire("dev", dev as never);
      wire("tester", tester as never);

      const send = {
        arch: sendTask(arch),
        dev: sendTask(dev),
        tester: sendTask(tester),
      };
      const intercept = {
        arch: (params: Record<string, unknown>) => arch.emit("tool_call", { toolName: "send_task", input: params }, { cwd: root }),
        dev: (params: Record<string, unknown>) => dev.emit("tool_call", { toolName: "send_task", input: params }, { cwd: root }),
        tester: (params: Record<string, unknown>) => tester.emit("tool_call", { toolName: "send_task", input: params }, { cwd: root }),
      };

      writeState(root, { milestone: "M1", round: 1, maxRounds: 5, consecutiveFails: 0 });

      // ── 1. arch 分发 task_assignment → dev 收件箱 ──────────────
      const assign = { type: "task_assignment", milestone: "M1", body: "造 src/hello.txt" };
      expect(intercept.arch(assign)).toBeUndefined(); // 链放行
      await send.arch(assign, root);
      const got1 = peek(root, "dev");
      expect(got1?.type).toBe("task_assignment");
      expect(got1?.milestone).toBe("M1");

      // ── 2. dev 产出缺断言结论 → G-artifact 拦 ───────────────────
      // 产出文件存在但只写了 M1.1（漏 M1.2）——uncovered 判定会列缺的编号
      p.file(
        "wf/dev-output-M1.md",
        `# dev 产出 M1\n\n- M1.1 已完成：src/hello.txt 已创建\n`,
      );
      const bad = { type: "review_request", milestone: "M1", body: "做完了", artifact: "wf/dev-output-M1.md" };
      const blocked = intercept.dev(bad);
      expect(blocked).toMatchObject({ block: true });
      expect((blocked as { reason: string }).reason).toContain("M1.2");
      expect(peek(root, "tester")).toBeNull(); // 没投出去

      // ── 3. dev 补全（每条断言一行）再投 → 放行，tester 收到 ─────
      p.file(
        "wf/dev-output-M1.md",
        `# dev 产出 M1\n\n- M1.1 已完成：src/hello.txt 已创建\n- M1.2 已完成：内容读起来是句人话\n`,
      );
      p.file("src/hello.txt", "ok\n"); // source 真改了（G_source 要看到变化）
      const good = { type: "review_request", milestone: "M1", body: "做完了", artifact: "wf/dev-output-M1.md" };
      expect(intercept.dev(good)).toBeUndefined();
      await send.dev(good, root);
      const got2 = peek(root, "tester");
      expect(got2?.type).toBe("review_request");

      // ── 4. tester 验收：报告缺判定行 → fix_request 回 dev ───────
      // tester 发 fix_request 前先写自己的报告（G_artifact_report 挂在
      // tester:fix_request 链上，检查的就是这份文件）
      p.file(
        "wf/test-report-M1.md",
        `# test report M1\n\n判定：FAIL\n\n- M1.1 未过：缺 src/hello.txt\n- M1.2 未过\n`,
      );
      const fix = {
        type: "fix_request",
        milestone: "M1",
        artifact: "wf/test-report-M1.md",
        issues: [{ id: "M1-001", severity: "serious", assertion: "M1.1", description: "报告缺判定行" }],
      };
      expect(intercept.tester(fix)).toBeUndefined();
      await send.tester(fix, root);
      const got3 = peek(root, "dev");
      expect(got3?.type).toBe("fix_request");
      const s1 = readState(root);
      expect(s1.round).toBe(2);
      expect(s1.consecutiveFails).toBe(1);

      // ── 5. dev 补判定行，重投 → PASS，verdict_pass 发给人 ────────
      const retry = { type: "review_request", milestone: "M1", body: "补了判定行", artifact: "wf/dev-output-M1.md" };
      expect(intercept.dev(retry)).toBeUndefined();
      await send.dev(retry, root);

      // tester 给报告（verdict_pass 需要 questions 覆盖 [human] 断言）
      // 链上 G_artifact_report 检查报告：判定行 + 每条断言一行
      p.file(
        "wf/test-report-M1.md",
        `# test report M1\n\n判定：PASS\n\n- M1.1 通过：src/hello.txt 存在\n- M1.2 通过：内容读起来是句人话\n`,
      );
      const verdict = { type: "verdict_pass", milestone: "M1", artifact: "wf/test-report-M1.md", questions: ["M1.2 内容读起来是句人话吗"] };
      expect(intercept.tester(verdict)).toBeUndefined();
      await send.tester(verdict, root);
      const human = peek(root, "human");
      expect(human?.type).toBe("verdict_pass");

      // ── 6. 人 /pass → milestone_passed 回 arch，状态重置 ─────────
      const passed = { type: "milestone_passed", milestone: "M1", evidence: "已对照断言逐条核对" };
      expect(intercept.tester(passed)).toBeUndefined();
      await send.tester(passed, root);
      const archGot = peek(root, "arch");
      expect(archGot?.type).toBe("milestone_passed");
      const s2 = readState(root);
      expect(s2.consecutiveFails).toBe(0);
      expect(s2.round).toBe(1);
    } finally {
      p.cleanup();
    }
  });
});
