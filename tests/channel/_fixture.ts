/**
 * tests/channel/_fixture.ts — 通道层测试的共用工具
 *
 * 只剩环境构造与等待原语。消息构造与地址校验走 02-protocol 的 `build` / `checkRoute`
 * ——M1 期间它们还不存在，这里曾有两个薄壳过渡，M2 落地后删掉了（D-25：
 * 测试输入必须走真实构造路径，薄壳留着就等于第二份权威）。
 *
 * 那两个薄壳的清除有机制兜：`tests/protocol/P5` 会 grep 它们的名字，
 * 而 plan.md M2 有对应断言。不靠谁记得。
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { channelPaths } from "../../src/channel/index.ts";
import type { Validate } from "../../src/channel/index.ts";

/**
 * 每个用例一个临时根目录。
 *
 * **不得在仓库根写文件**——老仓库早期测试的 `ensureDirs()` 副作用曾污染模板库。
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
