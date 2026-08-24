/**
 * 三个角色共用的接线逻辑（差异全在数据里）。只做四件事：查表、挂钩子、转交、推进。
 * 业务判断一律看不到——判据在 05-gates，消息在 02-protocol，状态在 01-channel。
 * ── pi 只以类型存在（D-07）─────────────────────────────────
 * 本文件对 pi 只有 `import type`，pi 与 ctx 一路作参数传，不存模块作用域（A9 验的）；
 * root 从 ctx.cwd 来，每次事件独立解析，不缓存。角色激活判定在 activate.ts。
 * ── 钩子与工具 ────────────────────────────────────────────
 * session_start → 简报 + 唤醒接线（wireWake）+ 人的收件箱代排（wireHumanDrain，arch 才有）；
 * before/agent_start → 注入与自检；tool_call → 跑链；agent_end → 未投递提醒（A9c）。
 * send_task = 唯一投递口。
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { build, checkRoute, resolveType, sendTaskDescription, sendTaskSchema, typesFrom } from "../protocol/index.ts";
import { inspectConfig } from "../config/index.ts";
import { parsePlan, milestone } from "../plan/index.ts";
import { deliver, readState } from "../channel/index.ts";
import { G_source_chained, chainFor, configGate, runChain, takeSourceBaseline } from "../gates/index.ts";
import { buildSystemPrompt } from "../roles/index.ts";
import type { SpecRole } from "../roles/index.ts";
import { briefingFor } from "./status.ts";
import { FLOW } from "./flow.ts";
import { registerCommands } from "./commands.ts";
import { checkInjectedSpec } from "./selfcheck.ts";
import { guardNoMilestone } from "./guard.ts";
import type { WindowRole } from "./activate.ts";
import { wireWake, type WakeOptions } from "./wake.ts";
import { wireHumanDrain } from "./drain.ts";

export function wire(role: WindowRole, pi: ExtensionAPI, opts: WakeOptions = {}): () => void {
  const wake = wireWake(role, pi, opts); // 唤醒接线（M6-010）：句柄 keyed by root，见 wake.ts
  // 人的收件箱代排（A9g）：human 无窗口，槽位不排就是永久锁。只在 arch 生效，见 drain.ts
  const drain = wireHumanDrain(role, pi, opts.watch === undefined ? {} : { watch: opts.watch });
  /** 投递 + 推进状态。from 由 role 决定（越权在类型层不可能）；to 由 ROUTES 决定 */
  const deliverMsg = (cwd: string, input: Record<string, unknown>): { ok: true } | { ok: false; reason: string } => {
    const { cfg } = inspectConfig(cwd);
    if (!cfg) return { ok: false, reason: "配置解析失败" };
    const parsed = parsePlan(cwd, cfg.plan);
    if (!parsed.ok) return { ok: false, reason: parsed.errors[0]!.message };
    const type = resolveType(role, input);
    if (!type) return { ok: false, reason: `缺少 type（${role} 可发：${typesFrom(role).join(" / ")}）` };
    const msg = build(type, role, { ...input, from: role });
    const r = deliver(cwd, msg, checkRoute);
    if (!r.ok) return { ok: false, reason: r.reason };
    FLOW[msg.type]({ root: cwd, msg, milestone: milestone(parsed.plan, msg.milestone ?? "") });
    return { ok: true };
  };

  pi.registerTool({
    name: "send_task",
    label: "投递任务",
    // 工具面按角色生成（P2 已测）：dev 的 schema 里没有 arch 的 type——越权在类型层不可能
    description: sendTaskDescription(role),
    parameters: sendTaskSchema(role),
    execute: async (_id, input, _s, _u, ctx) => {
      const r = deliverMsg(ctx.cwd, input as Record<string, unknown>);
      if (!r.ok) throw new Error(r.reason);
      return { content: [{ type: "text", text: "已投递" }], details: {} };
    },
  });

  registerCommands(role, pi);

  pi.on("session_start", (_event, ctx) => {
    const brief = briefingFor(ctx.cwd, role); // 拼装在 status.ts（与 /status 共用一份，D-03）
    if (brief === null) return; // 配置不可用：窗口静默起来，/doctor 负责报诊断
    // TUI 才发就绪 + 启动唤醒（print/rpc 无会话窗口：sendUserMessage 会与处理中的消息冲突）
    if (ctx.mode === "tui") {
      pi.sendUserMessage(`wf: ${role} 就绪\n${brief}`, { deliverAs: "followUp" });
      wake.start(ctx.cwd);
      drain.start(ctx.cwd); // arch 才真启（其它角色是空句柄）
    }
  });

  pi.on("before_agent_start", (event) => ({
    systemPrompt: buildSystemPrompt(role as SpecRole, event.systemPrompt),
  }));

  // 注入自检（P1 机制落点）：agent_start 时查特征串，被替换必须出声（静默症状）
  pi.on("agent_start", (_event, ctx) => {
    checkInjectedSpec(role, ctx.getSystemPrompt());
  });

  pi.on("tool_call", (event, ctx) => {
    if (event.toolName !== "send_task") return;
    const { cfg, diagnostics } = inspectConfig(ctx.cwd);
    if (!cfg) {
      // 配置坏：拦「宣布完成」，放行「继续开发」（configGate 的不对称，03-config 文件头同一条）。
      // 不能整链跳过——那等于配置坏了什么都能宣布（fail-open，自检缺陷 #2）。
      const type = resolveType(role, event.input);
      if (type) {
        const g = configGate(diagnostics, type);
        if (!g.ok) return { block: true, reason: g.reason };
      }
      return;
    }
    const parsed = parsePlan(ctx.cwd, cfg.plan);
    if (!parsed.ok) return;
    const type = resolveType(role, event.input);
    if (!type) return { block: true, reason: `缺少 type（${role} 可发：${typesFrom(role).join(" / ")}）` };
    const stateM = milestone(parsed.plan, readState(ctx.cwd).milestone);
    const guard = guardNoMilestone(type, stateM, event.input.milestone, parsed.plan);
    if (!guard.allow) return { block: true, reason: guard.reason };
    // chainFor 而非 CHAINS[key]：查不到返回 null（区分「声明无 gate」与「键写错了」）——
    // 键写错不再静默放行（D-49：chainFor 曾是零调用点的哑弹）
    const chain = chainFor(role, type);
    if (chain === null) {
      return { block: true, reason: `内部错误：${role}:${type} 不在拦截链表（CHAINS）里。加一道 gate 只改表，不动接线` };
    }
    const r = runChain(chain, { root: ctx.cwd, cfg, milestone: guard.milestone as never, input: event.input });
    if (!r.ok) return { block: true, reason: r.reason };
    // 链含 G_source：本次投递通过后把源码基线推进到当前快照。
    // 否则基线永不存在、G_source 恒放行——「只写产出说明不改代码」防线是空的（D-49 哑弹）
    if (chain.includes(G_source_chained)) takeSourceBaseline(ctx.cwd, cfg.source);
  });

  pi.on("agent_end", (event, ctx) => {
    if (readState(ctx.cwd).milestone === "" || ctx.mode !== "tui") return; // 无里程碑或 print/rpc 无会话窗口
    const ms = event.messages;
    // 本轮没有「wf: 收到…」唤醒消息（无任务上下文：空转/闲聊轮次）→ 不提醒。
    // 提醒语义是「有活该投」，没活提醒 = 逼 LLM 自问该不该投（M6-013，retro 八）
    const hasWork = ms.some((m) => m.role === "user" && (typeof m.content === "string" ? m.content : m.content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("")).startsWith("wf: 收到"));
    if (!hasWork) return;
    // 已投递或本轮由上一条提醒触发 → 不再提醒（followUp 自触发新回合 = 死循环，实测 2026-08-22）。
    // user 文本兼容 string 与数组两形态：真实 followUp 的 content 是 [{type:"text",text}]
    // （pi agent-session.js _queueFollowUp 构造），只认 string 会漏判 → 循环继续烧
    const sent = ms.some((m) => (m.role === "assistant" && m.content.some((c) => c.type === "toolCall" && c.name === "send_task")) || (m.role === "user" && (typeof m.content === "string" ? m.content : m.content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("")).startsWith("wf: 本轮结束")));
    if (sent) return;
    pi.sendUserMessage("wf: 本轮结束。若已完成请调 send_task 投出去。", { deliverAs: "followUp" });
  });

  return () => {
    wake.stopAll();
    drain.stopAll();
  }; // 关掉全部句柄（activate 不消费；测试/热重载用）
}
