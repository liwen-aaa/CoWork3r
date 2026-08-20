/**
 * tests/channel/_fixture.ts — 通道层测试的共用输入构造
 *
 * ⚠️ M2 替换标记（D-25）
 * ─────────────────────────────────────────────────────────────────
 * D-25 要求测试输入走真实构造路径，不得在测试里手写结构字面量。
 * 但 02-protocol 的 `build()` / `validate()` 在 M2 才落地，M1 需要一个过渡。
 *
 * 本文件是那个过渡，且**刻意不复制任何权威**：
 *   - `Message` / `Role` / `MsgType` 类型 → import type 自 src/protocol/message
 *   - `to` 的取值                        → 从 src/protocol/routes 的 ROUTES 查
 * 所以这里没有第二份路由表、也没有第二份类型定义（D-04）。
 * `buildMessage` 只是 `build()` 的薄壳。
 *
 * M2 落地时的动作：删掉 `buildMessage`，各测试改 `import { build }`，
 * 删掉 `routeValidate`，改 `import { validate }`。本文件应只剩 `makeRoot`。
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ROUTES } from "../../src/protocol/routes";
import type { Message, MsgType, Role } from "../../src/protocol/message";
import { channelPaths } from "../../src/channel";
import type { Validate } from "../../src/channel";

/**
 * 每个用例一个临时根目录。
 *
 * 不用 `process.chdir`（老仓库 verify-extensions [6] 组的做法）——它是进程全局态，
 * 与 vitest 并行执行相冲。root 一律作为参数传进被测函数。
 */
export function makeRoot(label: string): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), `wf-${label}-`));
  // 通道目录预建：真实项目里它由第一次 deliver 或 watchInbox 建出来，
  // 而有几个用例要在 watchInbox 之前就直接落盘（绕过 deliver 验唤醒侧）。
  mkdirSync(channelPaths(root).msgDir, { recursive: true });
  return {
    root,
    cleanup: () => {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        // 临时目录清理失败不该让用例红——Windows 上 watcher 未完全释放时会 EBUSY
      }
    },
  };
}

/** `build()` 的薄壳（见文件头替换标记）。`to` 从 ROUTES 查，不由调用方传。 */
export function buildMessage(
  type: MsgType,
  from: Role,
  fields: Partial<Message> = {},
): Message {
  return {
    round: 1,
    body: "fixture",
    ...fields,
    type,
    from,
    to: ROUTES[type].to,
    at: new Date().toISOString(),
  } as Message;
}

/**
 * C8 注入用：真实判据的等价物（`msg.to` 必须等于 `ROUTES[type].to`）。
 * M2 落地后换成 `import { validate }`。
 */
export const routeValidate: Validate = (msg) =>
  msg.to === ROUTES[msg.type].to
    ? { ok: true }
    : { ok: false, reason: `to=${msg.to} 与 ROUTES[${msg.type}].to=${ROUTES[msg.type].to} 不一致` };

/** C8 注入用：无条件拒绝。验的是 deliver 尊重注入结果，与判据内容无关。 */
export const rejectingValidate: Validate = () => ({
  ok: false,
  reason: "fixture 注入的拒绝",
});

/** 等待 `pred()` 为真，或超时。返回等到为止耗掉的毫秒数。 */
export async function waitFor(
  pred: () => boolean,
  timeoutMs: number,
  stepMs = 50,
): Promise<number> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (pred()) return Date.now() - t0;
    await new Promise((r) => setTimeout(r, stepMs));
  }
  throw new Error(`waitFor 超时（${timeoutMs}ms）`);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
