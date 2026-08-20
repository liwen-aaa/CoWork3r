/**
 * 通道层出口。
 *
 * 职责：把「一个角色写下的消息」变成「另一个角色被唤醒并读到它」，
 * 且重启不丢、并发不乱。
 *
 * 依赖只有 node:fs / node:path。**不 import pi**，不运行时 import 本项目其它模块
 * （类型走 import type；C8 需要的 validate 由调用方注入）。
 *
 * 不负责：消息合法性定义（02-protocol）、业务判断（05-gates）、
 * 进程管理与防重（08-dist）、队列语义（单槽位就是单槽位）、历史审计（不追加）。
 *
 * 只导出下面这些，其它一律私有。
 */
export { writeJsonAtomic, writeTextAtomic } from "./atomic";
export { bumpCounters } from "./counters";
export { clearIfSame, deliver, peek } from "./inbox";
export { channelPaths } from "./paths";
export { readState, writeState } from "./state";
export { watchInbox } from "./watch";

export type { ChannelPaths } from "./paths";
export type { DeliverResult, Validate } from "./inbox";
export type { State } from "./state";
export type { Stop, WatchOptions, Watcher } from "./watch";
