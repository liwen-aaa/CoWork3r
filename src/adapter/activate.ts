/**
 * 角色激活判定：extensions/*.ts 三份入口共用。
 *
 * 三态（A1/A2 判据）：
 *   env 是三个已知角色之一且 == 本文件角色 → 激活，wire(role, pi)
 *   env 是三个已知角色之一但 ≠ 本文件角色 → **静默**。这是 pi 全量加载
 *     三个入口文件的正常情况（trio.bat 只给本窗口设了正确的 env）——
 *     不是配错，不该吵
 *   env 是未知值（foo）→ **告警**（人设错了：窗口开着但没有就绪通知，
 *     那次事故的形状，必须出声）
 *   env 为空 → **静默**（单窗口降级是合法的）
 *
 * 老仓库是 `if (ROLE !== "arch") return;`——静默，于是那次事故无任何信号。
 * 本文件把「什么算配错」收敛到一处，三份入口只调 `activate(role, pi)`。
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { wire } from "./wire.ts";

export const KNOWN_ROLES = ["arch", "dev", "tester"] as const;
export type WindowRole = (typeof KNOWN_ROLES)[number];

export function activate(role: WindowRole, pi: ExtensionAPI): void {
  const env = process.env.WF_ROLE ?? "";
  if (env === role) {
    wire(role, pi);
    return;
  }
  // 已知角色但不是本文件角色 → 静默（pi 全量加载的正常情况）
  if ((KNOWN_ROLES as readonly string[]).includes(env)) return;
  // 未知值 → 告警；空 → 静默
  if (env !== "") {
    console.warn(
      `⛔ WF_ROLE=${JSON.stringify(env)} 不是已知角色（${KNOWN_ROLES.join("/")}）。本窗口未激活任何角色。`,
    );
  }
}
