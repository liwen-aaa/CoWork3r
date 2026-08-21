/**
 * /status 与启动简报 —— 全套唯一「给人看」的输出，D-30 全落在这里。
 *
 * 需要人主动去打开才能看见的待办 = 无效载体。所以四行都是「不看就会漏」的东西：
 *   状态    —— 里程碑 / 轮次 / 失败计数（01-channel readState）
 *   待人工  —— 人的收件箱里有消息（D-30：人工关卡不能靠人记得）
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
import { channelPaths } from "../channel/index.ts";
import { frontier } from "../plan/index.ts";
import type { Plan, Milestone } from "../plan/index.ts";
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

function humanPending(root: string): string | null {
  try {
    const raw = readFileSync(channelPaths(root).inbox("human"), "utf-8").trim();
    if (raw === "") return null;
    const msg = JSON.parse(raw) as { type?: string; milestone?: string };
    return msg.type ? `${msg.milestone ?? ""} ${msg.type} 等判定`.trim() : null;
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

  // 降级提示
  if (ctx.cfg.test === null) {
    lines.push("自动验证已关闭（test: null）：PASS 只靠结构检查 + 人工关卡");
  }

  return lines.join("\n");
}
