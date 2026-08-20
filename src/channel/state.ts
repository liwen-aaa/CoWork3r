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

import { writeJsonAtomic } from "./atomic";
import { channelPaths } from "./paths";

export type State = {
  /** 里程碑 id，如 "M1"。字符串，不是数字 */
  milestone: string;
  round: number;
  maxRounds: number;
  consecutiveFails: number;
  /** D-15 机制化的留位（当前只存不比对） */
  assertionHash?: string;
};

const DEFAULTS: State = {
  milestone: "",
  round: 1,
  maxRounds: 5,
  consecutiveFails: 0,
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
