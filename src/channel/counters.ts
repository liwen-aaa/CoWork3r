/**
 * 跨轮计数持久化。
 *
 * C5：「同一问题连续出现 3 轮 → 升级」依赖跨轮累计。窗口重启是常态不是异常，
 * 计数在内存里就等于阈值永远达不到。
 *
 * 逻辑本身平凡，但「必须落盘」这件事是窗口重启丢计数换来的（reuse.md）。
 * 每次调用都读盘 → 改 → 写盘，没有进程内缓存——所以三次独立调用等价于三个窗口生命周期。
 */
import { readFileSync } from "node:fs";

import type { Role } from "../protocol/message";
import { writeJsonAtomic } from "./atomic";
import { channelPaths } from "./paths";

type Counts = Record<string, number>;

function load(root: string, role: Role): Counts {
  try {
    const raw = JSON.parse(readFileSync(channelPaths(root).counters(role), "utf-8")) as unknown;
    return typeof raw === "object" && raw !== null ? (raw as Counts) : {};
  } catch {
    return {};
  }
}

/** 累加出现次数并落盘；返回**本次累加后**达到阈值的 id 列表 */
export function bumpCounters(
  root: string,
  role: Role,
  ids: string[],
  threshold: number,
): string[] {
  const counts = load(root, role);
  for (const id of ids) counts[id] = (counts[id] ?? 0) + 1;
  writeJsonAtomic(channelPaths(root).counters(role), counts);

  // 只报本次涉及的 id：否则一个早已超阈值的旧 id 会在每次调用里重复上报，
  // 而 07-adapter 据此发 escalation，等于同一个问题反复升级。
  return ids.filter((id) => (counts[id] ?? 0) >= threshold);
}
