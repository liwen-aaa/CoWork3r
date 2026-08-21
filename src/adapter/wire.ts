/**
 * 三个角色共用的接线逻辑（差异全在数据里）。只做四件事：查表、挂钩子、转交、推进。
 * 业务判断一律看不到——判据在 05-gates，消息在 02-protocol，状态在 01-channel。
 * ── pi 只以类型存在（D-07）─────────────────────────────────
 * 本文件对 pi 只有 `import type`。pi 与 ctx 一路作参数传，**不存模块作用域**
 * （A9 验的）。root 从 ctx.cwd 来，每次事件独立解析，不缓存。
 *
 * ── 角色激活在 activate.ts ─────────────────────────────────
 * 三份 extensions 各调 `activate(role, pi)`，匹配 WF_ROLE 才到这里。
 *
 * ── 钩子与工具 ────────────────────────────────────────────
 * session_start → 简报；before/agent_start → 注入与自检；tool_call → 跑链；
 * agent_end → 未投递提醒（防 followUp 自循环，见 A9c）。send_task = 唯一投递口。
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { build, checkRoute, resolveType, sendTaskDescription, sendTaskSchema, typesFrom } from "../protocol/index.ts";
import { inspectConfig } from "../config/index.ts";
import { parsePlan, milestone } from "../plan/index.ts";
import { deliver, readState } from "../channel/index.ts";
import { CHAINS, runChain } from "../gates/index.ts";
import { buildSystemPrompt } from "../roles/index.ts";
import type { SpecRole } from "../roles/index.ts";
import { bootBriefing } from "./status.ts";
import { FLOW } from "./flow.ts";
import { registerCommands } from "./commands.ts";
import { checkInjectedSpec } from "./selfcheck.ts";
import { guardNoMilestone } from "./guard.ts";
import type { WindowRole } from "./activate.ts";

export function wire(role: WindowRole, pi: ExtensionAPI): void {
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
    // 工具面按角色生成（P2 已测内容）：dev 的 schema 里根本没有 arch 的 type——
    // 「越权在类型层不可能」的机制落点。description 同理（省 token + 隔离）。
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
    const { cfg, diagnostics } = inspectConfig(ctx.cwd);
    if (!cfg) return;
    const parsed = parsePlan(ctx.cwd, cfg.plan);
    const st = readState(ctx.cwd);
    const m = parsed.ok ? milestone(parsed.plan, st.milestone) : null;
    const brief = bootBriefing({
      root: ctx.cwd,
      role,
      cfg,
      state: st,
      plan: parsed.ok ? parsed.plan : null,
      milestone: m,
      diagnostics,
    });
    // --print / rpc 无会话窗口：sendUserMessage 会与处理中的消息冲突，TUI 才发就绪
    // （身份注入走 before_agent_start 改 systemPrompt，不依赖这里）
    if (ctx.mode === "tui") {
      pi.sendUserMessage(`wf: ${role} 就绪\n${brief}`, { deliverAs: "followUp" });
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
    const { cfg } = inspectConfig(ctx.cwd);
    if (!cfg) return;
    const parsed = parsePlan(ctx.cwd, cfg.plan);
    if (!parsed.ok) return;
    const type = resolveType(role, event.input);
    if (!type) return { block: true, reason: `缺少 type（${role} 可发：${typesFrom(role).join(" / ")}）` };
    const stateM = milestone(parsed.plan, readState(ctx.cwd).milestone);
    const guard = guardNoMilestone(type, stateM, event.input.milestone, parsed.plan);
    if (!guard.allow) return { block: true, reason: guard.reason };
    const chain = CHAINS[`${role}:${type}`];
    if (!chain) return;
    const r = runChain(chain, { root: ctx.cwd, cfg, milestone: guard.milestone as never, input: event.input });
    if (!r.ok) return { block: true, reason: r.reason };
  });

  pi.on("agent_end", (event, ctx) => {
    if (readState(ctx.cwd).milestone === "" || ctx.mode !== "tui") return; // 无里程碑或 print/rpc 无会话窗口
    // 已投递或本轮由上一条提醒触发 → 不再提醒（followUp 自触发新回合 = 死循环，实测 2026-08-22）。
    // user 文本兼容 string 与数组两形态：真实 followUp 的 content 是 [{type:"text",text}]
    // （pi agent-session.js _queueFollowUp 构造），只认 string 会漏判 → 循环继续烧
    const sent = event.messages.some((m) => (m.role === "assistant" && m.content.some((c) => c.type === "toolCall" && c.name === "send_task")) || (m.role === "user" && (typeof m.content === "string" ? m.content : m.content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("")).startsWith("wf: 本轮结束")));
    if (sent) return;
    pi.sendUserMessage("wf: 本轮结束。若已完成请调 send_task 投出去。", { deliverAs: "followUp" });
  });
}
