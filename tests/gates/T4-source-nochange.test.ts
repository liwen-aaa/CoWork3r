/**
 * T4 G-source：生产文件真的动了吗
 *
 * 堵的是「只写产出说明不写生产内容」——投递一份漂亮的 dev-output，而 `source`
 * 里一个字节没改。
 *
 * 为什么用快照而不是 `git diff`：基准不同。git 的基准是 commit，而**修复轮之间
 * 没有 commit**（dev 改一版投一次，tester 打回再改一版）。快照的基准是「上次投递点」，
 * 那正是这道 gate 要比的东西。
 *
 * `source` 是必填字段（03-config），所以没有「未配则跳过」这个降级路径。
 */
import { describe, expect, it } from "vitest";

import { G_source, takeSourceBaseline } from "../../src/gates/index.ts";
import { makeProject } from "./_fixture.ts";

describe("T4 G-source 快照对比", () => {
  it("首次投递（无基线）→ 放行", () => {
    const p = makeProject("t4-first");
    try {
      p.file("a.ts", "export const a = 1;\n");
      const r = G_source({ root: p.root, source: "." });
      expect(r.ok).toBe(true);
    } finally {
      p.cleanup();
    }
  });

  it("取基线后一个字节没改 → block", () => {
    const p = makeProject("t4-nochange");
    try {
      p.file("a.ts", "export const a = 1;\n");
      takeSourceBaseline(p.root, ".");
      const r = G_source({ root: p.root, source: "." });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.failedGate).toBe("G_source");
        expect(r.reason).toMatch(/没有|无变化|未改动/);
      }
    } finally {
      p.cleanup();
    }
  });

  it("改了内容 → 放行", () => {
    const p = makeProject("t4-changed");
    try {
      p.file("a.ts", "export const a = 1;\n");
      takeSourceBaseline(p.root, ".");
      p.file("a.ts", "export const a = 2;\n");
      expect(G_source({ root: p.root, source: "." }).ok).toBe(true);
    } finally {
      p.cleanup();
    }
  });

  it("新增文件 → 放行（不只看已有文件的 size/mtime）", () => {
    const p = makeProject("t4-added");
    try {
      p.file("a.ts", "x\n");
      takeSourceBaseline(p.root, ".");
      p.file("b.ts", "y\n");
      expect(G_source({ root: p.root, source: "." }).ok).toBe(true);
    } finally {
      p.cleanup();
    }
  });

  it("同长度改动也要认出来（size 相同，内容不同）", () => {
    const p = makeProject("t4-samesize");
    try {
      p.file("a.ts", "aaa\n");
      takeSourceBaseline(p.root, ".");
      p.file("a.ts", "bbb\n");
      // 只比 size 会漏掉这种——mtime 或内容 hash 至少有一个要变
      expect(G_source({ root: p.root, source: "." }).ok).toBe(true);
    } finally {
      p.cleanup();
    }
  });

  it("两次投递之间重新取基线 → 第二次无改动仍 block（基线随投递点推进）", () => {
    const p = makeProject("t4-advance");
    try {
      p.file("a.ts", "1\n");
      takeSourceBaseline(p.root, ".");
      p.file("a.ts", "2\n");
      expect(G_source({ root: p.root, source: "." }).ok).toBe(true);
      takeSourceBaseline(p.root, "."); // 投递成功 → 基线推进
      expect(G_source({ root: p.root, source: "." }).ok).toBe(false);
    } finally {
      p.cleanup();
    }
  });

  it("source 指向单文件也成立（配置允许单文件）", () => {
    const p = makeProject("t4-single");
    try {
      p.file("only.ts", "1\n");
      takeSourceBaseline(p.root, "only.ts");
      expect(G_source({ root: p.root, source: "only.ts" }).ok).toBe(false);
      p.file("only.ts", "2\n");
      expect(G_source({ root: p.root, source: "only.ts" }).ok).toBe(true);
    } finally {
      p.cleanup();
    }
  });

  it("source 指向不存在的路径 → block 且说清是配置问题", () => {
    const p = makeProject("t4-nopath");
    try {
      const r = G_source({ root: p.root, source: "no-such-dir" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toContain("no-such-dir");
    } finally {
      p.cleanup();
    }
  });
});
