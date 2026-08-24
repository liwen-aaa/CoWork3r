/**
 * A11 /research finish 入口（自检缺陷：finish 曾有状态机实现、无命令层调用点）
 *
 * research.ts 的 finish（querying → answered / 回退 open）逻辑完整，但 `action:
 * "finish"` 在 src/ 零调用——查完怎么回来没有入口，/research 是半个状态机。
 *
 * 本文件从命令层（registerCommand 的 handler）验证 finish 真的能驱动状态：
 *   /research P2 done 结论 || 依据  → 未决表 P2 行变「已回」
 *   /research P2 fail 原因          → 未决表 P2 行回「待查」+ 追加失败原因
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { wire } from "../../src/adapter/index.ts";
import { fakePi, realConfig } from "./_fixture.ts";

/** 真实 plan.md 副本（D-25）：把 P2 重置为「待查」起点（D7 同款，状态演进不依赖具体形态） */
function projectWithQuerying(label: string) {
  const root = mkdtempSync(join(tmpdir(), `wf-a11-${label}-`));
  const src = readFileSync(join(process.cwd(), "docs/plan.md"), "utf-8")
    .split("\n")
    .map((l) =>
      l.startsWith("- P2 ")
        ? l.replace(/\[auto\]\s*已回\s*→\s*\S+/, "[auto] 待查").replace(/——\s*前置：[^\n]*$/, "")
        : l,
    )
    .join("\n");
  const rel = "docs/plan.md";
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(join(root, rel), src, "utf-8");
  // handler 里 `if (!cfg) return`——没配置直接静默返回（probe 验证过），必须写真实 wf.config.json
  realConfig(root, { plan: rel });
  return {
    root,
    rel,
    cleanup: () => {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        /* Windows EBUSY */
      }
    },
  };
}

/** 找到 research 命令的 handler（wire 注册了全部命令） */
function researchHandler(pi: ReturnType<typeof fakePi>) {
  const c = pi.commands.find((x) => x.name === "research");
  if (!c) throw new Error("research 命令未注册");
  return (c.def as { handler: (args: string, ctx: unknown) => Promise<void> }).handler;
}

function p2Line(root: string): string {
  return readFileSync(join(root, "docs/plan.md"), "utf-8")
    .split("\n")
    .find((l) => l.trim().startsWith("- P2 "))!;
}

describe("A11 /research finish 入口", () => {
  it("done：结论+依据 → P2 行变「已回」", async () => {
    const p = projectWithQuerying("a11-done");
    try {
      const pi = fakePi();
      wire("arch", pi as never);
      const handler = researchHandler(pi);
      await handler("P2", { cwd: p.root, ui: { notify: () => undefined } }); // start → 查中
      await handler("P2 done 查完了 || pi 文档 extensions.md", { cwd: p.root, ui: { notify: () => undefined } });
      expect(p2Line(p.root)).toContain("[auto] 已回 →");
    } finally {
      p.cleanup();
    }
  });

  it("fail：给原因 → P2 行回「待查」并追加失败原因", async () => {
    const p = projectWithQuerying("a11-fail");
    try {
      const pi = fakePi();
      wire("arch", pi as never);
      const handler = researchHandler(pi);
      await handler("P2", { cwd: p.root, ui: { notify: () => undefined } }); // start → 查中
      await handler("P2 fail 查不到可信来源", { cwd: p.root, ui: { notify: () => undefined } });
      const line = p2Line(p.root);
      expect(line).toContain("[auto] 待查");
      expect(line).toContain("查不到可信来源");
    } finally {
      p.cleanup();
    }
  });
});
