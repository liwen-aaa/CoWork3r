/**
 * 协作状态（里程碑 / 轮次 / 失败计数）。
 *
 * `milestone` 是**字符串**，不是数字 + 前缀。老仓库存数字 `current_milestone: 1`
 * 再靠环境变量 WF_MILESTONE_PREFIX 拼回 "M1"，于是代码需要「猜」当前里程碑叫什么，
 * 猜错就产生 dev-output-M0.md 指向 P0 这类错位。
 *
 * **里程碑 id 只从消息或规划书里来，代码不合成。**
 */
import { readFileSync } from "node:fs";

import { writeJsonAtomic } from "./atomic.ts";
import { channelPaths } from "./paths.ts";

export type State = {
  /** 里程碑 id，如 "M1"。字符串，不是数字 */
  milestone: string;
  round: number;
  maxRounds: number;
  consecutiveFails: number;
  /**
   * 等人判定的里程碑 id（空串 = 没有在等）。**放行的必要前置。**
   *
   * 为何存在这个字段：放行凭证（`evidence` 三段）是 arch 自己写的字符串，
   * 而 D-01 要的是「判定完成的一方，其产出不被自己评判」——实测（2026-08-24）
   * arch 在人从未参与的情况下捏满三段就放行成功。所以镀必须在 arch 写不到的地方：
   * 本字段由 tester 发 `verdict_pass` 时由 FLOW **机械写入**（arch 的 LLM 只有
   * `send_task` 一个工具，每个 type 都过拦截链，它没有写 state 的路）。
   *
   * 三个转换全在 07-adapter 的 FLOW（唯一状态机）：
   *   verdict_pass     → 写下许可（= 人真的被问到了）
   *   fix_request      → 作废（那一轮验收已被推翻，旧许可不能续用）
   *   milestone_passed → 消费（一次许可一次放行，单向门不能重放）
   *
   * 存里程碑 id 而不是布尔：许可必须绑定到哪个里程碑，否则 M1 的许可能放行 M2。
   */
  awaitingHuman?: string;
  /** D-15 机制化的留位（当前只存不比对） */
  assertionHash?: string;
};

const DEFAULTS: State = {
  milestone: "",
  round: 1,
  maxRounds: 5,
  consecutiveFails: 0,
  awaitingHuman: "",
};

/**
 * 读状态。文件不存在或坏掉 → 缺省值。
 *
 * 坏掉时给缺省值而不是抛错，理由是这个函数在 session_start 里被调用：
 * 抛错等于窗口起不来，而缺省值至少让人能看到 /status 并自己修。
 * 半截 JSON 的来源不只有非原子写（外部工具、磁盘满、进程被杀）。
 */
export function readState(root: string): State {
  try {
    const raw = JSON.parse(readFileSync(channelPaths(root).state, "utf-8")) as unknown;
    if (typeof raw !== "object" || raw === null) return { ...DEFAULTS };
    return { ...DEFAULTS, ...(raw as Partial<State>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeState(root: string, patch: Partial<State>): State {
  const next = { ...readState(root), ...patch };
  writeJsonAtomic(channelPaths(root).state, next);
  return next;
}
