/**
 * G-plan：arch 分发前，这个里程碑可测吗。
 *
 * 判据不在本文件——它在 04-plan 的 `checkMilestone`。本层只做两件事：
 * 挂载点（接到 `send_task` 上）+ 把 reason 变成人能操作的文本。
 *
 * 「可操作」的具体含义是**带行号**。老仓库的 `planQualityGate` 返回一个裸 false，
 * 四个里程碑全部通不过而两个月没人发现，一半原因就是那个 false 无处下手：
 * 它既不说哪一条不行，也不说在哪一行。
 */
import { checkMilestone } from "../plan/index.ts";
import { block, ok, type Result } from "./types.ts";
import type { Milestone } from "../plan/index.ts";

const NAME = "G_plan";

/**
 * 只要 `milestone`，不要整个 GateContext——它在 07-adapter 里的调用时机是
 * arch 分发，那时 cfg 可能还没读（配置坏了不该阻止你看断言可不可测）。
 */
export function G_plan(ctx: { root: string; milestone: Milestone }): Result {
  const m = ctx.milestone;
  const r = checkMilestone(m);
  if (r.ok) return ok();

  // 行号从断言表补：checkMilestone 给的是「哪几条不行」，人要的是「在第几行」
  const bad = m.assertions.filter((a) => {
    const one = checkMilestone({ ...m, assertions: [a], passed: false });
    return !one.ok;
  });

  const where = bad.map((a) => `${a.id}（第 ${a.line} 行）`).join("、");
  const suffix = where === "" ? "" : `。位置：${where}`;

  return block(NAME, `里程碑 ${m.id} 还不能分发：${r.reason}${suffix}`);
}
