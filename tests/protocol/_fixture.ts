/**
 * tests/protocol/_fixture.ts — 协议层测试的共用输入
 *
 * 与 tests/channel/_fixture.ts 的分工：那份是 M1 的过渡（`buildMessage` 是 `build()`
 * 的薄壳，M2 落地后删掉）。本文件不重复它——只提供「每个 type 的必填字段样本」，
 * 因为 `requires` 逐条不同，而测试要遍历全表。
 *
 * D-25：样本字段从 `ROUTES[type].requires` **推导**，不为九个 type 各手写一份字面量。
 * 手写会漂：表里给某个 type 加一条必填，这里不会红，而 build 会——于是测试变成
 * 「测我记得写什么」而不是「测表说了什么」。
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { channelPaths } from "../../src/channel/index.ts";
import type { Message, MsgType } from "../../src/protocol/message.ts";
import { ROUTES } from "../../src/protocol/routes.ts";

/** 每个用例一个临时根目录（同 tests/channel/_fixture.ts，不用 process.chdir） */
export function makeRoot(label: string): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), `wf-${label}-`));
  mkdirSync(channelPaths(root).msgDir, { recursive: true });
  return {
    root,
    cleanup: () => {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        /* Windows 上 EBUSY 不该让用例红 */
      }
    },
  };
}

/** 一个字段名 → 一个合法样本值。新增必填字段时**只改这里**。 */
const SAMPLES: Record<string, unknown> = {
  milestone: "M1",
  body: "fixture body",
  round: 1,
  issues: [{ id: "M1-001", severity: "serious", assertion: "M1.1", description: "fixture issue" }],
  questions: ["这条只有人能答：文件内容读起来是句人话吗"],
  evidence: "已对照断言逐条核对",
  refs: ["wf/dev-output-M1.md"],
};

/**
 * 按 `ROUTES[type].requires` 拼出恰好满足必填的字段集。
 *
 * 恰好满足，不多给——多给会让 P3（缺必填则抛错）的反例失去意义。
 */
export function sampleFields(type: MsgType): Partial<Message> {
  const out: Record<string, unknown> = { round: 1 };
  for (const key of ROUTES[type].requires) {
    if (!(key in SAMPLES)) {
      throw new Error(
        `_fixture.ts 缺字段样本：${key}（ROUTES.${type}.requires 里有它）。往 SAMPLES 补一个。`,
      );
    }
    out[key] = SAMPLES[key];
  }
  return out as Partial<Message>;
}

/** 去掉一个必填字段，用于 P3 的反例 */
export function withoutField(type: MsgType, drop: string): Partial<Message> {
  const f = { ...sampleFields(type) } as Record<string, unknown>;
  delete f[drop];
  return f as Partial<Message>;
}
