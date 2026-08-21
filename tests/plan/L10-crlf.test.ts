/**
 * L10 行尾归一 —— CRLF 的规划书与 LF 的解析结果必须一致
 *
 * 来源是一次真实的静默失效，值得写清楚：`scripts/docs-progress.mjs` 曾自己写
 * 一份 `/^## 里程碑 (\S+) (.+)$/`，没归一 CRLF。docs/plan.md 被 Windows 的
 * autocrlf 改成 CRLF 那一天，`(.+)$` 卡在 `\r` 上 → 一个里程碑都没匹配上 →
 * 那份进度表被静默写成「0 个里程碑 / 已验收 0/0」。无异常、无非零退码。
 *
 * 这正是本层存在的理由的第二次现身：**语法写两份，两份不一致时没有任何信号。**
 * 第一次是老仓库（模板产出行内「验收：」，gate 认 `### 验收断言方向`，
 * 四份规划书全部通不过 gate 却没人发现）。
 *
 * 所以这条测试有两半：
 *   ① 解析器自己对 CRLF 免疫（normalize 在 parse.ts 里，这条钉住它不被删）
 *   ② 生成物脚本走的是真实解析器，不是第二份正则（改回自写正则时这条会红）
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { derive } from "./_fixture.ts";
import { parsePlan } from "../../src/plan/index.ts";

/** 把样本的行尾换成 CRLF 写出去，其余一个字节不动 */
function asCRLF(which: "own" | "minimal" | "template") {
  return derive(which, (lines) => lines.map((l) => l.replace(/\r$/, "") + "\r"));
}

describe("L10 行尾归一", () => {
  it("CRLF 的 plan.md 解出的里程碑与 LF 版完全一致", () => {
    const lf = parsePlan(process.cwd(), "docs/plan.md");
    if (!lf.ok) throw new Error(`前提失败：${JSON.stringify(lf.errors)}`);

    const f = asCRLF("own");
    try {
      const crlf = parsePlan(f.root, f.rel);
      if (!crlf.ok) throw new Error(`CRLF 版应解析成功：${JSON.stringify(crlf.errors)}`);

      expect(crlf.plan.milestones.map((m) => m.id)).toEqual(lf.plan.milestones.map((m) => m.id));
      // 标题里不能残留 `\r`——它会跟着流进生成物表格与报错文本
      for (const m of crlf.plan.milestones) expect(m.title).not.toMatch(/\r/);
      expect(crlf.plan.milestones.map((m) => m.title)).toEqual(
        lf.plan.milestones.map((m) => m.title),
      );
      // passed 标记（S2）在 CRLF 下同样解出
      expect(crlf.plan.milestones.map((m) => m.passed)).toEqual(
        lf.plan.milestones.map((m) => m.passed),
      );
    } finally {
      f.cleanup();
    }
  });

  it("CRLF 下断言的 kind / 文本 / 行号都不变", () => {
    const lf = parsePlan(process.cwd(), "docs/plan.md");
    if (!lf.ok) throw new Error("前提失败");

    const f = asCRLF("own");
    try {
      const crlf = parsePlan(f.root, f.rel);
      if (!crlf.ok) throw new Error("CRLF 版应解析成功");
      const a = crlf.plan.milestones.flatMap((m) => m.assertions);
      const b = lf.plan.milestones.flatMap((m) => m.assertions);
      expect(a.map((x) => `${x.id} ${x.kind} ${x.line}`)).toEqual(
        b.map((x) => `${x.id} ${x.kind} ${x.line}`),
      );
      for (const x of a) expect(x.text).not.toMatch(/\r/);
    } finally {
      f.cleanup();
    }
  });

  it("CRLF 下未决表三段式仍解出 kind / owner / 前置", () => {
    const lf = parsePlan(process.cwd(), "docs/plan.md");
    if (!lf.ok) throw new Error("前提失败");

    const f = asCRLF("own");
    try {
      const crlf = parsePlan(f.root, f.rel);
      if (!crlf.ok) throw new Error("CRLF 版应解析成功");
      const key = (p: { id: string; kind: string; owner?: string; blockedBy: string[] }) =>
        `${p.id} ${p.kind} ${p.owner ?? "-"} ${p.blockedBy.join(",")}`;
      expect(crlf.plan.pending.map(key)).toEqual(lf.plan.pending.map(key));
      // `前置：无` 落在行尾，CRLF 会让它变成 `无\r`——blockedBy 解析必须不受影响
      for (const p of crlf.plan.pending) for (const b of p.blockedBy) expect(b).toMatch(/^P\d+$/);
    } finally {
      f.cleanup();
    }
  });

  it("生成物脚本消费真实解析器，不自己写里程碑正则", () => {
    // 这条锁的不是行为而是**依赖方向**：docs-progress.mjs 自写正则那一版，
    // 在 CRLF 下静默产出空表。有人改回自写正则时，这条红。
    const raw = readFileSync("scripts/docs-progress.mjs", "utf-8");
    expect(raw).toMatch(/import \{[^}]*parsePlan[^}]*\} from "\.\.\/src\/plan\/index\.ts"/);

    // 剔掉注释再查：文件头正在**描述**那个旧正则（那是该写的，不能因此报错）
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/\/\^##\s*里程碑/);
  });
});
