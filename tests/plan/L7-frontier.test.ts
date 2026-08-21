/**
 * L7-frontier 未决表 → 现在能动什么（纯函数分组）
 *
 * S5b + frontier。输出直接喂给 `/status` 与启动简报——D-30：需要人主动去打开
 * 才能看见的待办 = 无效载体。人不需要记「有件事没回来」——开窗口就在眼前。
 *
 * `frontier` 是 wayfinder 的平替（原版五件事里它吃掉四件）。它只回答
 * 「哪几条能动了、哪几条在等前置、哪几条有新事实回来了」。
 *
 * 本文件只测「分组」：前置 → blocked；[human] → actionable；[auto] open → toQuery；
 * querying → 哪组都不进（避免重复派）；answered → answered 组。
 * 未决表的解析（id、三段式、段位）在 L7-pending。
 */
import { describe, expect, it } from "vitest";

import { derive, lineOf, verbatim } from "./_fixture.ts";
import { frontier, parsePlan } from "../../src/plan/index.ts";

/** 从真实 plan.md 取未决表（不手写 Pending 字面量，D-25） */
function pendingOf(which: "own" = "own") {
  const f = verbatim(which);
  try {
    const r = parsePlan(f.root, f.rel);
    if (!r.ok) throw new Error(`前提失败：${JSON.stringify(r.errors)}`);
    return r.plan.pending;
  } finally {
    f.cleanup();
  }
}

describe("L7 frontier 分组", () => {
  it("前置未清 → 该条进 blocked，不进 actionable", () => {
    const p = pendingOf();
    const fr = frontier(p);
    // P3 的前置是 P2（真实数据），P2 未 answered，所以 P3 被卡着
    const p3 = p.find((x) => x.id === "P3");
    if (p3) {
      expect(p3.blockedBy).toContain("P2");
      expect(fr.blocked.map((x) => x.id)).toContain("P3");
      expect(fr.actionable.map((x) => x.id)).not.toContain("P3");
    }
  });

  it("前置为「无」→ human 条目进 actionable，auto 条目进 toQuery", () => {
    const p = pendingOf();
    const fr = frontier(p);
    const free = p.filter((x) => x.blockedBy.length === 0);
    for (const x of free) {
      const where = x.kind === "human" ? fr.actionable : fr.toQuery;
      expect(where.map((y) => y.id)).toContain(x.id);
    }
  });

  it("querying 态不进任何组（避免重复派）", () => {
    const f = derive("own", (lines) => {
      const at = lineOf(lines, /^- P2 /);
      lines[at] = lines[at]!.replace("[auto] 待查", "[auto] 查中");
      return lines;
    });
    try {
      const r = parsePlan(f.root, f.rel);
      if (!r.ok) throw new Error("应解析成功");
      const p2 = r.plan.pending.find((x) => x.id === "P2")!;
      expect(p2.status).toBe("querying");
      const fr = frontier(r.plan.pending);
      for (const group of [fr.actionable, fr.toQuery, fr.answered, fr.blocked]) {
        expect(group.map((x) => x.id)).not.toContain("P2");
      }
    } finally {
      f.cleanup();
    }
  });

  it("answered 态进 answered 组，并解出 answerRef", () => {
    const f = derive("own", (lines) => {
      const at = lineOf(lines, /^- P1 /);
      lines[at] = "- P1 规约注入被后续扩展替换掉时能不能发现 —— [auto] 已回 → wf/notes/mark-check.md —— 前置：无";
      return lines;
    });
    try {
      const r = parsePlan(f.root, f.rel);
      if (!r.ok) throw new Error("应解析成功");
      const p1 = r.plan.pending.find((x) => x.id === "P1")!;
      expect(p1.status).toBe("answered");
      expect(p1.answerRef).toBe("wf/notes/mark-check.md");
      expect(frontier(r.plan.pending).answered.map((x) => x.id)).toContain("P1");
    } finally {
      f.cleanup();
    }
  });

  it("前置写口语 → blockedBy 为空，不报错（只影响排序）", () => {
    const f = derive("own", (lines) => {
      const at = lineOf(lines, /^- P3 /);
      lines[at] = lines[at]!.replace("前置：P2", "前置：上面某条");
      return lines;
    });
    try {
      const r = parsePlan(f.root, f.rel);
      // 口语前置不是错误——人写规划书时说不清依赖是常态（D-10）
      if (!r.ok) throw new Error(`不该报错：${JSON.stringify(r.errors)}`);
      const p3 = r.plan.pending.find((x) => x.id === "P3")!;
      expect(p3.blockedBy).toEqual([]);
    } finally {
      f.cleanup();
    }
  });

  it("空未决表 → frontier 四组全空，不抛错", () => {
    const fr = frontier([]);
    expect(fr.actionable).toEqual([]);
    expect(fr.toQuery).toEqual([]);
    expect(fr.answered).toEqual([]);
    expect(fr.blocked).toEqual([]);
  });
});
