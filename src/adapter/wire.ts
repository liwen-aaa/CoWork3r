/**
 * 三个角色共用的接线逻辑（差异全在数据里）。只做四件事：查表、挂钩子、转交、推进。
 * 业务判断一律看不到——判据在 05-gates，消息在 02-protocol，状态在 01-channel。
 *
 * ── pi 只以类型存在（D-07）─────────────────────────────────
 * 本文件对 pi 只有 `import type`。pi 与 ctx 一路作为参数传，**不存进模块作用域**
 * （A9 验的：同进程三次 wire，root 必须互不相同）。root 从 ctx.cwd 来，
 * 每次事件独立解析，不缓存。
 *
 * ── 角色激活在 extensions/*.ts ─────────────────────────────
 * 07-adapter.md：「读 WF_ROLE，调 wire()」。本文件不重复检查（A1/A2 测那边）。
 * 窗口只有「自己那份」的工具与钩子——`wire(role, pi)` 的 role 决定一切。
 *
 * ── 四个钩子 + 一个工具 ────────────────────────────────────
 * session_start → 简报+就绪；before_agent_start → 注入规约；tool_call → 跑链；
 * agent_end → 未投递提醒。send_task 工具 = LLM 唯一投递口（build+deliver+flow）。
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { build, checkRoute, sendTaskDescription, sendTaskSchema, typesFrom } from "../protocol/index.ts";
import type { MsgType } from "../protocol/message.ts";
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
import type { WindowRole } from "./activate.ts";

export function wire(role: WindowRole, pi: ExtensionAPI): void {
  /** 投递 + 推进状态。from 由 role 决定（越权在类型层不可能）；to 由 ROUTES 决定 */
  const deliverMsg = (cwd: string, input: Record<string, unknown>): { ok: true } | { ok: false; reason: string } => {
    const { cfg } = inspectConfig(cwd);
    if (!cfg) return { ok: false, reason: "配置解析失败" };
    const parsed = parsePlan(cwd, cfg.plan);
    if (!parsed.ok) return { ok: false, reason: parsed.errors[0]!.message };
    // 单 type 角色（dev 只有 review_request）：schema 省掉了 type，LLM 不会传——从 role 推导；多 type 角色 schema 有枚举必须由 LLM 选
    const types = typesFrom(role);
    const type = (input.type as MsgType | undefined) ?? (types.length === 1 ? types[0] : undefined);
    if (!type) return { ok: false, reason: `缺少 type（${role} 可发：${types.join(" / ")}）` };
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

  // 六个命令：/status /pass /fail /role /doctor /research（集中注册，见 commands.ts）
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
    // --print / rpc 模式没有可投递的会话窗口：sendUserMessage 会与正在处理的
    // 消息冲突（"Agent is already processing"）。身份注入走 before_agent_start
    // 改 systemPrompt，不依赖这里。TUI 才发就绪通知。
    if (ctx.mode === "tui") {
      pi.sendUserMessage(`wf: ${role} 就绪\n${brief}`, { deliverAs: "followUp" });
    }
  });

  pi.on("before_agent_start", (event) => ({
    systemPrompt: buildSystemPrompt(role as SpecRole, event.systemPrompt),
  }));

  // 注入自检（P1 的机制落点）：agent_start 在 systemPrompt 定稿后触发，
  // 检查规约特征串还在不在——被别的扩展整体替换掉时无任何症状，必须出声。
  pi.on("agent_start", (_event, ctx) => {
    checkInjectedSpec(role, ctx.getSystemPrompt());
  });

  pi.on("tool_call", (event, ctx) => {
    if (event.toolName !== "send_task") return;
    const { cfg } = inspectConfig(ctx.cwd);
    if (!cfg) return;
    const parsed = parsePlan(ctx.cwd, cfg.plan);
    if (!parsed.ok) return;
    const m = milestone(parsed.plan, readState(ctx.cwd).milestone);
    const chain = CHAINS[`${role}:${String(event.input.type)}`];
    if (!chain) return;
    const r = runChain(chain, { root: ctx.cwd, cfg, milestone: m as never, input: event.input });
    if (!r.ok) return { block: true, reason: r.reason };
  });

  pi.on("agent_end", (_event, ctx) => {
    if (readState(ctx.cwd).milestone === "") return;
    if (ctx.mode !== "tui") return; // print/rpc 无会话窗口，投递会冲突
    pi.sendUserMessage("wf: 本轮结束。若已完成请调 send_task 投出去。", { deliverAs: "followUp" });
  });
}
