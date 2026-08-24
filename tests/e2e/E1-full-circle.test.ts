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
 * 驱动方式：不真的开进程。每个角色 = 一个 fake pi，wire 注册好工具与拦截后，
 * 测试扮演 LLM：
 *   ① 调 `send_task` 工具前，先 emit tool_call（wire 的拦截 handler 跑链）
 *   ② 没被拦 → 调工具的 execute（deliver 消息）
 *   ③ 断言收件箱落点 + 状态变化
 * 唤醒层（M6-010）走真实 watchInbox（注入窄参数：watch: null + 小 pollMs，C1 同款）——
 * 消息落盘 → 窗口收到通知，收件箱被消费清空（C2）。“收到消息后 LLM 该怎么反应”
 * 不测（那是 M6 [human]），测的是机器部分。
 *
 * 工具 execute 的 root 从 ctx.cwd 来（pi 文档：execute 最后一个参数是 ctx）。
 * 产出文件路径走 `artifact` 字段（G_artifact 读它），source 目录里放真文件（G_source）。
 */
import { describe, expect, it } from "vitest";

import { peek, readState, watchInbox } from "../../src/channel/index.ts";
import type { Stop, WatchOptions } from "../../src/channel/watch.ts";
import type { Message, Role } from "../../src/protocol/index.ts";
import { wire } from "../../src/adapter/index.ts";
import { fakePi, installPlan, makeProject, realConfig, assertParamsMatchSchema, waitFor } from "../adapter/_fixture.ts";

/** 找到 send_task 工具的 execute（fakePi 记录了 registerTool 的 def） */
function sendTask(pi: ReturnType<typeof fakePi>) {
  const def = pi.tools.find((t) => t.name === "send_task")?.def as
    | { parameters?: unknown; execute: (...args: unknown[]) => Promise<unknown> | unknown }
    | undefined;
  if (!def?.execute) throw new Error("send_task 工具未注册");
  const params = def.parameters;
  return (input: Record<string, unknown>, root: string) => {
    // 真实 pi 在 execute 前按注册的 schema 校验参数（additionalProperties/required）——
    // 直调 execute 会绕过这层（M6-004：schema 删字段测试照样绿）。这里把校验搬回来：
    // 参数与 schema 脱钩立刻抛错，测试红。
    assertParamsMatchSchema(params, input);
    return def.execute("e1", input, undefined, undefined, { cwd: root });
  };
}

describe("E1 完整一圈", () => {
  it("分发 → 产出 → FAIL → 修 → PASS → /pass → 回 arch", async () => {
    const p = makeProject("e1-circle");
    const root = p.root;
    const stops: Array<() => void> = []; // 唤醒句柄：finally 里必须全停（watchInbox 有定时器）
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
      // 唤醒接线（M6-010）：消息落盘 → 窗口被唤醒。注入窄参数的真实 watchInbox
      // （C1 同款：watch: null + 小 pollMs），消息走真实 deliver 落盘（D-25）
      const watch = (root: string, role: Role, onMessage: (m: Message) => void, o: WatchOptions): Stop =>
        watchInbox(root, role, onMessage, { watch: null, pollMs: 40, catchupMs: 20, ...(o.onWake ? { onWake: o.onWake } : {}) });
      stops.push(
        wire("arch", arch as never, { watch }),
        wire("dev", dev as never, { watch }),
        wire("tester", tester as never, { watch }),
      );
      // session_start 启动各窗口的唤醒（tui 才有会话窗口）
      arch.emit("session_start", {}, { cwd: root, mode: "tui" });
      dev.emit("session_start", {}, { cwd: root, mode: "tui" });
      tester.emit("session_start", {}, { cwd: root, mode: "tui" });

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

      // 不预写 state：模拟空项目首次分发（state 无里程碑）。
      // plan.md 风险节：「空 state 的首个 task_assignment 必崩」的回归防线——
      // wire 必须从 event.input.milestone 解析里程碑再进链，否则 G_plan 收 null 崩。

      // ── 1. arch 分发 task_assignment → dev 收件箱 ──────────────
      const assign = { type: "task_assignment", milestone: "M1", body: "造 src/hello.txt" };
      expect(intercept.arch(assign)).toBeUndefined(); // 链放行
      await send.arch(assign, root);
      // 消息落盘 → dev 窗口被唤醒（M6-010 真实路径）；唤醒消息带全内容
      await waitFor(() => dev.sent.some((s) => s.text.includes("task_assignment")));
      const devWake = dev.sent.find((s) => s.text.includes("task_assignment"));
      expect(devWake?.text).toContain("arch → dev");
      expect(devWake?.text).toContain("M1");
      expect(peek(root, "dev")).toBeNull(); // C2：唤醒即消费，收件箱清空

      // ── 2. dev 产出缺断言结论 → G-artifact 拦 ───────────────────
      // 产出文件存在但只写了 M1.1（漏 M1.2）——uncovered 判定会列缺的编号
      p.file(
        "wf/dev-output-M1.md",
        `# dev 产出 M1\n\n- M1.1 已完成：src/hello.txt 已创建\n`,
      );
      const bad = { milestone: "M1", body: "做完了", artifact: "wf/dev-output-M1.md" };
      // dev 单 type：schema 里没有 type 字段（省掉），按真实路径不传
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
      const good = { milestone: "M1", body: "做完了", artifact: "wf/dev-output-M1.md" };
      expect(intercept.dev(good)).toBeUndefined();
      await send.dev(good, root);
      await waitFor(() => tester.sent.some((s) => s.text.includes("review_request")));
      expect(tester.sent.find((s) => s.text.includes("review_request"))?.text).toContain("dev → tester");
      expect(peek(root, "tester")).toBeNull();

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
      await waitFor(() => dev.sent.some((s) => s.text.includes("fix_request")));
      expect(peek(root, "dev")).toBeNull();
      const s1 = readState(root);
      expect(s1.round).toBe(2);
      expect(s1.consecutiveFails).toBe(1);

      // ── 5. dev 补判定行 + 真改源码，重投 → PASS，verdict_pass 发给人 ──
      //（G_source 要求每次 review_request 时源码比上次投递点有变化——修复轮只改
      //  产出文档会被拦「没有变化」；dev 的修复必须真动了东西，这是它的判据）
      p.file("src/hello.txt", "ok\nok\n"); // 源码变化：修复轮真改了
      const retry = { milestone: "M1", body: "补了判定行", artifact: "wf/dev-output-M1.md" };
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

      // ── 6. arch 代发 milestone_passed（人的放行经 arch 翻译 + 凭证三段），状态重置 ──
      //（共识 ② 方案 A：from 改 arch；G_release 检查凭证三段缺一即 block）
      const passed = {
        type: "milestone_passed",
        milestone: "M1",
        evidence: "人原话:「M1 可以过」 arch 整理:已对照 M1 两条断言均通过 确认:Y",
      };
      expect(intercept.arch(passed)).toBeUndefined();
      await send.arch(passed, root);
      await waitFor(() => arch.sent.some((s) => s.text.includes("milestone_passed")));
      expect(peek(root, "arch")).toBeNull();
      expect(peek(root, "human")).toBeNull(); // 人的收件箱被清（flow 的表里有、实现曾只 writeState）
      const s2 = readState(root);
      expect(s2.consecutiveFails).toBe(0);
      expect(s2.round).toBe(1);
    } finally {
      for (const s of stops) s(); // 唤醒句柄必须全停，否则定时器让进程不退出（M1 断言同判据）
      p.cleanup();
    }
  });
});
