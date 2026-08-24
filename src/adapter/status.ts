/**
 * /status 与启动简报 —— 全套唯一「给人看」的输出，D-30 全落在这里。
 *
 * 需要人主动去打开才能看见的待办 = 无效载体。所以四行都是「不看就会漏」的东西：
 *   状态    —— 里程碑 / 轮次 / 失败计数（01-channel readState）
 *   待人工  —— 台账里未回答的条目（D-30：人工关卡不能靠人记得）。
 *              **读台账不读槽位**：槽位是锁、会被 arch 代排（A9g），
 *              读它等于「锁一释放待办就从视线里消失」
 *   未决    —— frontier 分组条数（04-plan）。**数字必须来自 frontier 的真实输出**，
 *              不能手写——否则「有件事没回来」这个信号会静默消失
 *   降级提示 —— 自动验证已关闭（D-23：空 gate 合法，静默的空 gate 不合法）
 *
 * 纯函数，不碰 pi（输入全部由调用方拼好，wire 的 session_start / watchInbox
 * 共用同一份）。`plan` 可能为 null（解析失败时简报只报诊断，不崩）。
 */
import { readFileSync } from "node:fs";

import type { Config } from "../config/index.ts";
import type { State } from "../channel/index.ts";
import { channelPaths, readState } from "../channel/index.ts";
import { frontier, milestone, parsePlan } from "../plan/index.ts";
import type { Plan, Milestone } from "../plan/index.ts";
import { commandGateStatus } from "../gates/index.ts";
import { inspectConfig } from "../config/index.ts";
import type { Diagnostic } from "../config/index.ts";

export type BootContext = {
  root: string;
  role: "arch" | "dev" | "tester";
  cfg: Config;
  state: State;
  plan: Plan | null;
  milestone: Milestone | null;
  diagnostics: Diagnostic[];
};

/**
 * 待人工行的数据源是**台账**，不是槽位。
 *
 * 槽位（human 的单槽位收件箱）是锁，会被 arch 代排（A9g）——读它等于「锁一释放，
 * 待办就从视线里消失」，而那正是 D-30 要防的。台账只增不改，未勾选的
 * `- [ ]` 就是还没回答的那几条（人划掉或删行 = 已处理，D-34）。
 *
 * 槽位里那条也要算：代排服务有窗口关着的空档（人只开 dev/tester 时），
 * 此时消息在槽位里还没进台账，不算就是漏报。
 */
function humanPending(root: string): string | null {
  const unchecked = countUnchecked(root);
  const inSlot = slotPending(root);
  const total = unchecked + (inSlot === null ? 0 : 1);
  if (total === 0) return null;
  const where = unchecked > 0 ? `（见 ${relLedger()}）` : "";
  return `${total} 条${inSlot === null ? "" : `，最新：${inSlot}`}${where}`;
}

/** 台账里未勾选的条目数（`- [ ]`）。文件不存在 = 0 */
function countUnchecked(root: string): number {
  try {
    const text = readFileSync(channelPaths(root).humanLedger, "utf-8");
    return (text.match(/^- \[ \]/gm) ?? []).length;
  } catch {
    return 0;
  }
}

function relLedger(): string {
  return "wf/human-pending.md";
}

function slotPending(root: string): string | null {
  try {
    const raw = readFileSync(channelPaths(root).inbox("human"), "utf-8").trim();
    if (raw === "") return null;
    const msg = JSON.parse(raw) as { type?: string; milestone?: string };
    return msg.type ? `${msg.milestone ?? ""} ${msg.type}`.trim() : null;
  } catch {
    return null; // 没有待人工 = 不显示这行
  }
}

export function bootBriefing(ctx: BootContext): string {
  const lines: string[] = [];

  // 状态行
  const m = ctx.state.milestone === "" ? "（未开始）" : ctx.state.milestone;
  lines.push(`${m} R${ctx.state.round} 失败 ${ctx.state.consecutiveFails}/${ctx.state.maxRounds}`);

  // 未决行：frontier 四组之和。plan 为 null 时未知——但必须**出声**，不能假装没有
  if (ctx.plan) {
    const fr = frontier(ctx.plan.pending);
    const total =
      fr.actionable.length + fr.toQuery.length + fr.answered.length + fr.blocked.length;
    const actionable = fr.actionable.length;
    const answered = fr.answered.length;
    lines.push(
      `未决 ${total} 条：${actionable} 条你能定${answered > 0 ? ` / ${answered} 条查回来了` : ""}`,
    );
  } else {
    lines.push("未决：规划书解析失败，未决表不可用");
  }

  // 待人工行
  const pendingHuman = humanPending(ctx.root);
  if (pendingHuman) lines.push(`待你判定：${pendingHuman}`);

  // 降级提示：文案唯一权威在 config 的 TEST_NULL_NOTICE，由 commandGateStatus 产出——
  // 曾三处手写（D-03/D-04 违反，commandGateStatus 曾是 D-49 哑弹）
  const gs = commandGateStatus(ctx.cfg);
  if (gs.notice !== undefined) lines.push(gs.notice);

  return lines.join("\n");
}

/**
 * 从项目根直接读出简报（配置 / 规划书 / 状态全由本函数拉）。
 *
 * 两个调用方本来各拼一遍同样的七行（wire 的 session_start 与 `/status`）——
 * 那是 D-03 的形状：两处必须一致的拼装反向依赖人去同步。拼装属于本层
 * （它知道 BootContext 要什么），wire 只负责转交（A6：适配层不担业务拼装）。
 *
 * 配置不可用时返回 null：怎么报是调用方的事（窗口启动静默 vs `/status` 弹错）。
 */
export function briefingFor(root: string, role: BootContext["role"]): string | null {
  const { cfg, diagnostics } = inspectConfig(root);
  if (!cfg) return null;
  const parsed = parsePlan(root, cfg.plan);
  const state = readState(root);
  return bootBriefing({
    root,
    role,
    cfg,
    state,
    plan: parsed.ok ? parsed.plan : null,
    milestone: parsed.ok ? milestone(parsed.plan, state.milestone) : null,
    diagnostics,
  });
}
