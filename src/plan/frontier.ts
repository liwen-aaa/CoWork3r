/**
 * 未决表 → 现在能动的是哪几条。纯函数。
 *
 * 输出直接喂给 `/status` 与启动简报（D-30：需要人主动去打开才能看见的待办 =
 * 无效载体）。人不需要记「有件事没回来」——开窗口就在眼前。
 *
 * 它同时是 wayfinder 的平替，原版五件事里这个形态吃掉四件：
 *   fog of war  → 「说不清的」节 + D-10
 *   一次一票     → 前置排序自然产生顺序
 *   HITL / AFK  → `[human]` / `[auto]`
 *   plan-don't-do → D-11
 * 第五件（frontier 在 tracker UI 可视化）是真的降级：单人项目的视线路径就是
 * 那三个窗口。升级路径见 D-42——放不下时用 GitHub issues，不自造票格式。
 */
import type { Frontier, Pending } from "./types.ts";

export function frontier(pending: Pending[]): Frontier {
  const answeredIds = new Set(pending.filter((p) => p.status === "answered").map((p) => p.id));

  /** 前置全部已回 = 这条解锁了。引用不存在的 id 视为未清（保守） */
  const unblocked = (p: Pending) => p.blockedBy.every((id) => answeredIds.has(id));

  const actionable: Pending[] = [];
  const toQuery: Pending[] = [];
  const answered: Pending[] = [];
  const blocked: Pending[] = [];

  for (const p of pending) {
    if (p.status === "answered") {
      answered.push(p);
      continue;
    }
    // querying 不进任何组：避免重复派（`/research P2` 在 querying 态直接拒）
    if (p.status === "querying") continue;

    if (!unblocked(p)) {
      blocked.push(p);
      continue;
    }
    if (p.kind === "human") actionable.push(p);
    else toQuery.push(p);
  }

  return { actionable, toQuery, answered, blocked };
}
