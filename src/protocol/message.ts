/**
 * 消息类型定义。
 *
 * M1 只写类型；`build` / `validate` / schema 生成属 M2（plan.md M1「涉及」节的限定）。
 * 本文件零运行时依赖，也不 import 本项目其它模块。
 */
import type { ROUTES } from "./routes.ts";

export type Role = "arch" | "dev" | "tester" | "human";

export type MsgType = keyof typeof ROUTES;

export type Issue = {
  id: string;
  severity: "serious" | "medium" | "minor";
  /** 关联断言编号，如 "M1.2"。让「问题 ↔ 断言」成为结构化数据 */
  assertion?: string;
  /** 含定位：文件 / 行 / 现象 / 复现 */
  description: string;
};

export type Message = {
  type: MsgType;
  /** 必须等于 ROUTES[type].from */
  from: Role;
  /** 必须等于 ROUTES[type].to —— 由表决定，不由调用方传 */
  to: Role;
  /** 里程碑 id；report 省略（ROUTES[type].omit 含 "milestone"） */
  milestone?: string;
  round: number;
  body: string;
  /** 相关文件路径 */
  refs?: string[];
  /** fix_request */
  issues?: Issue[];
  /** review_request / fix_request / verdict_pass：产出/报告文件路径（G_artifact 读它） */
  artifact?: string;
  /** verdict_pass：只有人能答的那几个问题 */
  questions?: string[];
  /** milestone_passed：人写的验证凭证 */
  evidence?: string;
  /** ISO 时间戳 */
  at: string;
};
