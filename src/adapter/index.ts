/**
 * 07-adapter 出口。
 *
 * 职责：把前六层接到 pi 上——挂事件、注册工具、跑拦截链、推进状态。
 * **这是唯一 import pi 的一层**（D-07：只 `import type`，值一律不碰）。
 *
 * 本层约束是硬性的：看不到任何业务判断。判据在 05-gates，消息在 02-protocol，
 * 状态在 01-channel。适配器只做四件事——查表、挂钩子、转交、推进。
 *
 * 不负责：
 * - **判定** —— 全在 05-gates。本层看不到 {ok, reason} 的构造
 * - **消息格式** —— 全在 02-protocol。本层不出现 to: 字面量（A8 会 grep）
 * - **文件路径** —— 全在 01-channel 的 paths.ts
 * - **开窗口** —— 08-dist，而且是人执行（D-33）
 * - **角色激活** —— WF_ROLE 检查在 extensions/*.ts
 */
export { wire } from "./wire.ts";
export { bootBriefing } from "./status.ts";
export type { BootContext } from "./status.ts";
export { FLOW } from "./flow.ts";
export type { FlowContext, FlowResult } from "./flow.ts";
