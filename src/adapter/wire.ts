/**
 * 三个角色共用的接线逻辑（差异全在数据里）：查表、挂钩子、转交、推进。
 * 业务判据在 05-gates / 02-protocol / 01-channel；pi 只以类型存在（D-07）——pi 与 ctx
 * 一路作参数、不存模块作用域（A9）；root 从 ctx.cwd 来，不缓存。角色激活见 activate.ts。
 * 钩子：session_start → widget+唤醒+代排；before/agent_start → 注入+自检；tool_call → 跑链；
 * agent_end → 提醒（A9c）。send_task = 唯一投递口。
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
import { REMIND_TEXT, shouldRemind } from "./remind.ts";
import { consumeFlowSignals } from "./signals.ts";
import { refreshWidget, type WidgetContext } from "./widget.ts";
export function wire(role: WindowRole, pi: ExtensionAPI, opts: WakeOptions = {}): () => void {
  // A12：四入口共用刷新。唤醒/代排回调拿不到 ctx.ui，记 session_start 那个（root 不缓存，D-07）
  let uiCtx: WidgetContext | null = null;
  const refresh = (ctx: WidgetContext): void => {
    uiCtx = ctx;
    refreshWidget(ctx, role);
  };
  /** 被唤醒/代排后刷新：用记下的 ui，root 用启动时那个（同一窗口同一 root） */
  const refreshFromWake = (): void => {
    if (uiCtx !== null) refreshWidget(uiCtx, role);
  };
  const wake = wireWake(role, pi, { ...opts, onHandled: refreshFromWake }); // 唤醒接线（M6-010）+ 状态条刷新（A12）
  // 人的收件箱代排（A9g）：human 无窗口，槽位不排就是永久锁。只在 arch 生效，见 drain.ts
  const drain = wireHumanDrain(role, pi, { ...(opts.watch === undefined ? {} : { watch: opts.watch }), onHandled: refreshFromWake });
  /** 投递 + 推进状态。from 由 role 决定（越权在类型层不可能）；to 由 ROUTES 决定 */
  const deliverMsg = (ctx: WidgetContext, input: Record<string, unknown>): { ok: true } | { ok: false; reason: string } => {
    const cwd = ctx.cwd;
    const { cfg } = inspectConfig(cwd);
    if (!cfg) return { ok: false, reason: "配置解析失败" };
    const parsed = parsePlan(cwd, cfg.plan);
    if (!parsed.ok) return { ok: false, reason: parsed.errors[0]!.message };
    const type = resolveType(role, input);
    if (!type) return { ok: false, reason: `缺少 type（${role} 可发：${typesFrom(role).join(" / ")}）` };
    const msg = build(type, role, { ...input, from: role });
    const r = deliver(cwd, msg, checkRoute);
    if (!r.ok) return { ok: false, reason: r.reason };
    // maxRounds 从配置来（D-52）；escalate/stuck 信号消费见 signals.ts（自检缺陷 #3）
    const flow = FLOW[msg.type]({ root: cwd, msg, milestone: milestone(parsed.plan, msg.milestone ?? ""), maxRounds: cfg.maxRounds });
    consumeFlowSignals(cwd, flow, msg.milestone ?? "");
    refresh(ctx); // 状态刚变（A12）：不刷则状态条停在投递前
    return { ok: true };
  };

  pi.registerTool({
    name: "send_task",
    label: "投递任务",
    // 工具面按角色生成（P2 已测）：dev 的 schema 里没有 arch 的 type——越权在类型层不可能
    description: sendTaskDescription(role),
    parameters: sendTaskSchema(role),
    execute: async (_id, input, _s, _u, ctx) => {
      const r = deliverMsg(ctx as WidgetContext, input as Record<string, unknown>);
      if (!r.ok) throw new Error(r.reason);
      return { content: [{ type: "text", text: "已投递" }], details: {} };
    },
  });

  registerCommands(role, pi);

  pi.on("session_start", (_event, ctx) => {
    // TUI 才设常驻状态条 + 启动唤醒（print/rpc 无会话窗口）。widget 替代简报（共识 ②）：
    // 零 token、给人看；只在这里设 = 一次性快照，真跑停在「（未开始） R1 失败 0/5」（RUN1-001）
    if (ctx.mode === "tui") {
      refresh(ctx as WidgetContext);
      wake.start(ctx.cwd);
      drain.start(ctx.cwd); // arch 才真启（其它角色是空句柄）
    }
  });
  // 注入规约 + 项目事实。`roleNotes` 从 cfg 取（A9i：第三参曾长期不传，D-18 整条纪律变空）；
  // 配置不可用也要注规约（D-01：角色认同不能依赖配置能不能解析）
  pi.on("before_agent_start", (event, ctx) => ({
    systemPrompt: buildSystemPrompt(
      role as SpecRole,
      event.systemPrompt,
      inspectConfig(ctx.cwd).cfg?.roleNotes,
    ),
  }));
  // 注入自检（P1 机制落点）：agent_start 时查特征串，被替换必须出声（静默症状）
  pi.on("agent_start", (_event, ctx) => {
    checkInjectedSpec(role, ctx.getSystemPrompt());
  });
  pi.on("tool_call", (event, ctx) => {
    if (event.toolName !== "send_task") return;
    const { cfg, diagnostics } = inspectConfig(ctx.cwd);
    if (!cfg) {
      // 配置坏：拦「宣布完成」放行「继续开发」（configGate 不对称，03-config 文件头同一条；fail-open = 自检缺陷 #2）
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
    // chainFor 非 CHAINS[key]：查不到 = 声明无 gate；键写错不再静默放行（D-49 哑弹）
    const chain = chainFor(role, type);
    if (chain === null) {
      return { block: true, reason: `内部错误：${role}:${type} 不在拦截链表（CHAINS）里。加一道 gate 只改表，不动接线` };
    }
    const r = runChain(chain, { root: ctx.cwd, cfg, milestone: guard.milestone as never, input: event.input });
    if (!r.ok) return { block: true, reason: r.reason };
    // 链含 G_source：投递通过后推进源码基线，否则 G_source 恒放行、防线是空的（D-49 哑弹）
    if (chain.includes(G_source_chained)) takeSourceBaseline(ctx.cwd, cfg.source);
  });
  // 收尾提醒：判定全在 remind.ts；无里程碑 / print/rpc 无会话窗口 → 不提醒
  pi.on("agent_end", (event, ctx) => {
    refresh(ctx as WidgetContext); // 回合边界兜外部改动（别的窗口投递、人手改文件）——A12
    if (readState(ctx.cwd).milestone === "" || ctx.mode !== "tui") return;
    if (!shouldRemind(event.messages)) return;
    pi.sendUserMessage(REMIND_TEXT, { deliverAs: "followUp" });
  });

  return () => {
    wake.stopAll();
    drain.stopAll();
  }; // 关掉全部句柄（activate 不消费；测试/热重载用）
}
