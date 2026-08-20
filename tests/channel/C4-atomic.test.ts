/**
 * C4 所有状态写入必须原子（写 .tmp → rename）
 *
 * 并发窗口同时读写同一文件是常态。非原子写会产生半截 JSON，
 * 然后被 `catch` 静默吞掉——症状是「状态莫名回退」。
 *
 * 后两个用例是 grep：只有 atomic.ts 能直接调 writeFileSync，只有 paths.ts 能出现收件箱文件名。
 * 这类检查比行为测试更能防腐化——新增一个落盘点时，忘了走原子写会被抓。
 *
 * **注释也算违反。** 这条判据咬到过自己两次：
 *   - `routes.ts` 的文件头为了解释老仓库那个「消息被投进 tester 收件箱」的 bug，
 *     写了收件箱的实际文件名
 *   - `index.ts` 的文件头为了说明「唯一允许直接调……的文件」而写了那个标识符
 *
 * 两次都是注释、不是代码，而两次断言都对。不该放宽：扮的是源码文本而不是 AST，
 * 因为改名时 grep 不到注释里那个，下一个人就会漏（老仓库 34 处被静默打断的引用即此形状）。
 * 要在注释里指代它们，用「原子写」「收件箱」这类说法，别写标识符本身。
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { channelPaths, readState, writeJsonAtomic, writeState } from "../../src/channel/index.ts";
import { makeRoot } from "./_fixture.ts";

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

  it("只有 channel/atomic.ts 直接调 writeFileSync（注释也算）", async () => {
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
      // 扮源码文本而不解析 AST：注释里出现同样算违反（见文件头）
      .filter((f) => /\bwriteFileSync\b/.test(rf(f, "utf-8")));

    expect(offenders).toEqual([]);
  });

  /**
   * plan.md M1.4 的落点。此前它只是一条文档断言、没有测试——
   * 按 D-02，只写在文档里的会被跳过。
   *
   * 同样**注释也算**：这条咬到过 routes.ts——它的文件头为了解释老仓库
   * 那个「消息被投进 tester 收件箱」的 bug，写了收件箱的实际文件名。
   */
  it("只有 channel/paths.ts 出现收件箱文件名（注释也算）", async () => {
    const { readdirSync: rd, readFileSync: rf, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const walk = (dir: string): string[] =>
      rd(dir).flatMap((e) => {
        const full = join(dir, e);
        return statSync(full).isDirectory() ? walk(full) : [full];
      });

    // 拼出来而不写字面量：本测试文件自己也不该含那些名字
    const inboxNames = ["arch", "dev", "tester", "human"].map((r) => `to-${r}.json`);

    const offenders = walk("src")
      .filter((f) => f.endsWith(".ts"))
      .filter((f) => !f.replace(/\\/g, "/").endsWith("channel/paths.ts"))
      .filter((f) => {
        const src = rf(f, "utf-8");
        return inboxNames.some((n) => src.includes(n));
      });

    expect(offenders).toEqual([]);
  });
});
