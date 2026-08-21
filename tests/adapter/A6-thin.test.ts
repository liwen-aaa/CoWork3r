/**
 * A6 抗腐化：extensions/*.ts 各 ≤ 30 行、wire.ts ≤ 120 行
 *
 * 老仓库三个扩展各 295/283/398 行，涨的全是本该在下层的判断（拦截判据、消息构造、
 * 状态计算、git 调用、里程碑 id 推断混在一起）。行数上限比评审有效——超了就说明
 * 有东西放错了层。
 *
 * 判据在 plan.md M6：extensions/*.ts 各 ≤ 30 行、src/adapter/wire.ts ≤ 120 行。
 * 本文件直接数行数（含注释，因为注释也是「被塞进来的文档」的一种）。
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function linesOf(rel: string): number {
  return readFileSync(join(ROOT, rel), "utf-8").split("\n").length;
}

describe("A6 薄扩展", () => {
  it("extensions/*.ts 各 ≤ 30 行", () => {
    const files = readdirSync(join(ROOT, "extensions")).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThanOrEqual(3);
    for (const f of files) {
      const n = linesOf(`extensions/${f}`);
      expect(n, `extensions/${f} 有 ${n} 行，超 30 行上限`).toBeLessThanOrEqual(30);
    }
  });

  it("src/adapter/wire.ts ≤ 120 行", () => {
    const n = linesOf("src/adapter/wire.ts");
    expect(n, `wire.ts 有 ${n} 行，超 120 行上限`).toBeLessThanOrEqual(120);
  });
});
