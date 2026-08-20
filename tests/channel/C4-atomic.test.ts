/**
 * C4 所有状态写入必须原子（写 .tmp → rename）
 *
 * 并发窗口同时读写同一文件是常态。非原子写会产生半截 JSON，
 * 然后被 `catch` 静默吞掉——症状是「状态莫名回退」。
 *
 * 第二个用例是 grep：只有 atomic.ts 能直接调 writeFileSync。
 * 这条比行为测试更能防腐化——新增一个落盘点时，忘了走 atomic 会被抓。
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { channelPaths, readState, writeJsonAtomic, writeState } from "../../src/channel";
import { makeRoot } from "./_fixture";

describe("C4 原子写", () => {
  it("并发写入不产生半截 JSON", async () => {
    const { root, cleanup } = makeRoot("C4-atomic");
    const p = channelPaths(root);

    try {
      // 初始化目录结构
      writeState(root, { milestone: "M1" });

      // 200 次并发写。非原子写在这个量级上必然产生可观测的半截读。
      const writes = Array.from({ length: 200 }, (_, i) =>
        Promise.resolve().then(() => writeJsonAtomic(p.state, { milestone: `M${i}`, round: i })),
      );

      // 写的同时不停读，每次都必须解析成功
      const readErrors: string[] = [];
      const reads = Array.from({ length: 200 }, () =>
        Promise.resolve().then(() => {
          try {
            JSON.parse(readFileSync(p.state, "utf-8"));
          } catch (e) {
            readErrors.push(String(e));
          }
        }),
      );

      await Promise.all([...writes, ...reads]);
      expect(readErrors).toEqual([]);

      // 不留 .tmp 垃圾
      const leftovers = readdirSync(p.msgDir).filter((f) => f.endsWith(".tmp"));
      expect(leftovers).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("readState 对损坏的 state.json 给出缺省值而不是抛错", () => {
    const { root, cleanup } = makeRoot("C4-broken");
    const p = channelPaths(root);
    try {
      writeState(root, { milestone: "M1" });
      // 半截 JSON——原子写之外的路径（外部工具、磁盘满）仍可能造出它。
      // 测试里直接 writeFileSync 是合法的：下面那条 grep 只管 src/。
      writeFileSync(p.state, readFileSync(p.state, "utf-8").slice(0, 8), "utf-8");

      const s = readState(root);
      expect(s.milestone).toBeTypeOf("string");
      expect(s.maxRounds).toBe(5);
    } finally {
      cleanup();
    }
  });

  it("只有 channel/atomic.ts 直接调 writeFileSync", async () => {
    const { readdirSync: rd, readFileSync: rf, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const walk = (dir: string): string[] =>
      rd(dir).flatMap((e) => {
        const full = join(dir, e);
        return statSync(full).isDirectory() ? walk(full) : [full];
      });

    const offenders = walk("src")
      .filter((f) => f.endsWith(".ts"))
      .filter((f) => !f.replace(/\\/g, "/").endsWith("channel/atomic.ts"))
      .filter((f) => /\bwriteFileSync\b/.test(rf(f, "utf-8")));

    expect(offenders).toEqual([]);
  });
});
