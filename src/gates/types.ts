/**
 * 拦截层的数据结构。类型独立成文件，供 07-adapter `import type`。
 */
import type { Config } from "../config/index.ts";
import type { Milestone } from "../plan/index.ts";

export type Result =
  | { ok: true }
  /** `failedGate` = gate 的导出名，如 `"G_command"`。07-adapter 原样报给人 */
  | { ok: false; reason: string; failedGate: string };

/**
 * 一道 gate 拿到的东西。
 *
 * `input` 是那条消息的 payload（`questions` / 产出文件路径这些）。类型放宽到
 * `Record<string, unknown>`：02-protocol 已经在发送侧校验过必填字段，本层再
 * 定一份精确类型等于第二份 schema（D-04）。
 */
export type GateContext = {
  root: string;
  cfg: Config;
  milestone: Milestone;
  input: Record<string, unknown>;
};

/** 全部 gate 同一签名。链是 `Gate[]`，07-adapter 查表按序跑 */
export type Gate = (ctx: GateContext) => Result;

export const ok = (): Result => ({ ok: true });

export const block = (failedGate: string, reason: string): Result => ({
  ok: false,
  reason,
  failedGate,
});
