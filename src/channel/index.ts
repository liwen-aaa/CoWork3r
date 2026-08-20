/**
 * 通道层出口。
 *
 * 职责：把「一个角色写下的消息」变成「另一个角色被唤醒并读到它」，
 * 且重启不丢、并发不乱。
 *
 * 本层每一条约束都来自事故，而且**症状全是「什么都没发生」**：窗口开着但不处理、
 * 消息被看不见的窗口吃掉、重启后计数归零、半截 JSON 被静默解析失败。
 * 这类失败没有报错、没有日志、不影响任何 gate——所以它必须与业务判断完全隔离，
 * 零 pi 依赖（可在普通 node 进程里直接测），且**每条约束一个测试用例，用例名 = 约束 id**。
 * 八条约束的内容在 tests/channel/C*.test.ts 里，一例一事故。
 *
 * 依赖只有 node:fs / node:path。**不 import pi**，不运行时 import 本项目其它模块
 * （类型走 import type；C8 需要的 validate 由调用方注入）。
 *
 * 不负责：
 * - **消息合法性定义** —— type 枚举与方向表属 02-protocol，本层只调注入的 validate（C8）
 * - **业务判断** —— 任何 {ok, reason} 形式的判定在 05-gates
 * - **进程管理** —— 开窗口、防重、单实例检测在 08-dist（C6 只把事实钉成测试）
 * - **队列语义** —— 单槽位就是单槽位（取舍见 inbox.ts）
 * - **历史审计** —— 消息不追加历史。想要审计另开一层，不要往本层塞
 *
 * 与其它模块的边界：02-protocol 与本层两边都不运行时 import 对方；
 * 05-gates 用 writeJsonAtomic 存基线但不直接读写 inbox；
 * 07-adapter 用 watchInbox / deliver / readState，不自己拼路径、不绕过 atomic.ts 落盘。
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
