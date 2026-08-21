/**
 * tool_call 拦截的「无里程碑上下文」守卫 + 里程碑解析。
 *
 * wire 的 tool_call 里，milestone(plan, state.milestone) 可能为 null——
 * 首次分发前 state 里没有里程碑（readState 返回 milestone:""）。
 * 此时把 null 传进 runChain 会让 G_plan 的 checkMilestone(null) 炸
 * （m.passed 读 null）——真进程实测抓到（M6.6 机器部分执行时）。
 *
 * 语义：task_assignment 是唯一「从无里程碑 → 有里程碑」的动作。首次分发时
 * 里程碑不在 state 里，在 event.input.milestone 里——从 input 解析出来再进链
 * （否则 G_plan 收到 null 崩）。其余 type 在无里程碑时没有工作对象，block。
 */
import { milestone } from "../plan/index.ts";
import type { Milestone, Plan } from "../plan/index.ts";

export function guardNoMilestone(
  type: string,
  stateMilestone: Milestone | null,
  inputMilestone: unknown,
  plan: Plan,
): { allow: true; milestone: Milestone } | { allow: false; reason: string } {
  if (stateMilestone !== null) return { allow: true, milestone: stateMilestone };
  // state 里没有里程碑：只有 task_assignment 能从这里起步（分发即创建上下文）
  if (type === "task_assignment") {
    const m = milestone(plan, String(inputMilestone ?? ""));
    if (m !== null) return { allow: true, milestone: m };
    return { allow: false, reason: `task_assignment 的里程碑 ${String(inputMilestone)} 不在规划书里` };
  }
  return {
    allow: false,
    reason: "还没有当前里程碑（state 里 milestone 为空）。先用 task_assignment 分发一个",
  };
}
