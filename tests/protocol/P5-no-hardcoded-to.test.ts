/**
 * P5 grep：src/ 下除 routes.ts 外不出现 to: "<role>" 字面量
 *
 * 那个 bug 的形态是「代码里写了个 to 字面量」（老仓库 dev-agent 的
 * `writeMessage({ from: "dev", to: "tester", ... })` —— 硬编码，params.to 从未被用）。
 * 所以就去 grep 它。这类检查很便宜，而且抓的是真实发生过的形状。
 *
 * **注释也算违反**（与 C4 同判据）：扫源码文本不解析 AST，因为改表时 grep 不到
 * 注释里那个，下一个人就会漏。要在注释里指代它们，用「投递目标」这类说法。
 *
 * 顺带清 M1 的过渡物：`buildMessage` / `routeValidate` 是 tests/channel/_fixture.ts
 * 里 build/validate 落地前的薄壳。它们不是未决（已定怎么做）、不靠谁记得——
 * 本用例是那两个函数的唯一机制落点（plan.md M2 有对应断言）。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((e) => {
    const full = join(dir, e);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

const norm = (p: string) => p.replace(/\\/g, "/");

describe("P5 结构性检查", () => {
  it("src/ 下只有 routes.ts 出现 to: \"<role>\" 字面量（注释也算）", () => {
    // 拼出来而不是写字面量：本测试文件自己也不该含那些模式
    const pattern = new RegExp(`\\bto\\s*:\\s*["'](${["arch", "dev", "tester", "human"].join("|")})["']`);

    const offenders = walk("src")
      .filter((f) => f.endsWith(".ts"))
      .filter((f) => !norm(f).endsWith("protocol/routes.ts"))
      .filter((f) => pattern.test(readFileSync(f, "utf-8")));

    expect(offenders.map(norm)).toEqual([]);
  });

  it("tests/ 下不再有 buildMessage / routeValidate（M1 过渡物已换成 import）", () => {
    const offenders = walk("tests")
      .filter((f) => f.endsWith(".ts"))
      .filter((f) => !norm(f).endsWith("protocol/P5-no-hardcoded-to.test.ts"))
      .filter((f) => /\b(buildMessage|routeValidate)\b/.test(readFileSync(f, "utf-8")));

    expect(offenders.map(norm)).toEqual([]);
  });

  it("src/ 下不出现 pi 的值导入（D-07，A9 前半提前锁）", () => {
    // M6 的 A9 会正式验它。这里提前锁住，避免 M2–M5 期间悄悄长出来
    const pkg = "@earendil-works/pi-coding-agent";
    const offenders = walk("src")
      .filter((f) => f.endsWith(".ts"))
      .filter((f) => {
        const src = readFileSync(f, "utf-8");
        if (!src.includes(pkg)) return false;
        // 允许 import type，禁止值导入
        return src.split("\n").some((line) => line.includes(pkg) && !/import\s+type/.test(line));
      });

    expect(offenders.map(norm)).toEqual([]);
  });
});
