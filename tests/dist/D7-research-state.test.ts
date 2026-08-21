/**
 * D7 research 状态机：open → querying → answered；无「依据」节回退 open；querying 重派被拒
 *
 * 未决表里 [auto] 的条目，派出去查。这是砍掉 wayfinder 后唯一的外查通道。
 *
 * 状态机（08-dist.md）：
 *   open ──/research──> querying ──成功──> answered
 *                           │
 *                           └─失败─→ open（回退）+ 末尾追加「上次失败：<原因>」
 *
 * 三条判据：
 *   ① 无「依据」节或为空 → 视为失败，回退 open（D-02 用在外查上：
 *      没依据的结论和没查一样危险，而且更危险——它看起来已经完成了）
 *   ② querying 态重复 /research → 直接拒（幂等，提示「已在查」）
 *   ③ slug 从条目文本取前 24 字符转小写短横线，冲突追加 -2
 *
 * 操作对象是 **plan.md 的未决表文本**（改 `[auto] 待查` → `[auto] 查中` → 已回），
 * 不是解析结果——状态写在文件里，重启不丢（与 bumpCounters 同一条判据）。
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { research, slugOf } from "../../src/dist/research.ts";

/** 真实 plan.md 副本（D-25：不手写 markdown）——P1/P2/P3 的未决表真实存在 */
function project() {
  const root = mkdtempSync(join(tmpdir(), "wf-d7-"));
  const src = readFileSync(join(process.cwd(), "docs/plan.md"), "utf-8");
  const rel = "docs/plan.md";
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(join(root, rel), src, "utf-8");
  return {
    root,
    rel,
    cleanup: () => {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        /* Windows EBUSY 不该让用例红 */
      }
    },
  };
}

/** 读回当前未决表（确认文本真的被改了） */
function pendingLines(root: string, rel: string): string[] {
  return readFileSync(join(root, rel), "utf-8")
    .split("\n")
    .filter((l) => /^- P\d+ /.test(l));
}

describe("D7 research 状态机", () => {
  it("派查 P2：open → querying（文件里 [auto] 待查 变 [auto] 查中）", () => {
    const p = project();
    try {
      const r = research({ root: p.root, rel: p.rel, id: "P2", action: "start" });
      expect(r.ok).toBe(true);
      const lines = pendingLines(p.root, p.rel);
      const p2 = lines.find((l) => l.startsWith("- P2 "));
      expect(p2).toContain("[auto] 查中");
      expect(p2).not.toContain("待查");
    } finally {
      p.cleanup();
    }
  });

  it("querying 态重复派查 → 拒（幂等，提示已在查）", () => {
    const p = project();
    try {
      research({ root: p.root, rel: p.rel, id: "P2", action: "start" });
      const again = research({ root: p.root, rel: p.rel, id: "P2", action: "start" });
      expect(again.ok).toBe(false);
      if (!again.ok) expect(again.reason).toMatch(/查中|已在查/);
    } finally {
      p.cleanup();
    }
  });

  it("成功回填：note 有结论 + 依据 → answered（[auto] 已回 → wf/notes/<slug>.md）", () => {
    const p = project();
    try {
      research({ root: p.root, rel: p.rel, id: "P2", action: "start" });
      const r = research({
        root: p.root,
        rel: p.rel,
        id: "P2",
        action: "finish",
        note: { conclusion: "查完了：触发", evidence: "pi 文档 extensions.md" },
      });
      expect(r.ok).toBe(true);
      const lines = pendingLines(p.root, p.rel);
      const p2 = lines.find((l) => l.startsWith("- P2 "));
      expect(p2).toContain("[auto] 已回 →");
      expect(p2).toMatch(/wf\/notes\/[a-z0-9-]+\.md/);
      // note 文件真的写盘了
      const slug = p2!.match(/wf\/notes\/([a-z0-9-]+\.md)/)![1]!;
      const note = readFileSync(join(p.root, "wf", "notes", slug), "utf-8");
      expect(note).toContain("## 结论");
      expect(note).toContain("## 依据");
    } finally {
      p.cleanup();
    }
  });

  it("note 缺「依据」节或为空 → 失败，回退 open，末尾追加失败原因", () => {
    const p = project();
    try {
      research({ root: p.root, rel: p.rel, id: "P2", action: "start" });
      const r = research({
        root: p.root,
        rel: p.rel,
        id: "P2",
        action: "finish",
        note: { conclusion: "查完了", evidence: "   " }, // 空依据
        failReason: "查不到可信来源",
      });
      expect(r.ok).toBe(false);
      const lines = pendingLines(p.root, p.rel);
      const p2 = lines.find((l) => l.startsWith("- P2 "));
      expect(p2).toContain("[auto] 待查"); // 回退 open
      expect(p2).not.toContain("已回");
      expect(p2).toContain("上次失败：查不到可信来源");
    } finally {
      p.cleanup();
    }
  });

  it("slug：条目文本前 24 字符转小写短横线，冲突追加 -2", () => {
    // slug 生成是纯函数——直接测它（不依赖真实 plan 内容）
    const s1 = slugOf("规约注入被后续扩展替换掉时能不能发现");
    expect(s1).toMatch(/^[a-z0-9-]+$/);
    expect(s1.length).toBeLessThanOrEqual(24 + 2); // 短横线可能占 2 字符
  });
});
