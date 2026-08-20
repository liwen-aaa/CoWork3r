/**
 * L7 未决表与 frontier —— 稳定 id、前置阻塞、删行不回收
 *
 * S5/S5b。未决表与断言的编号规则**相反**，这是有理由的：
 *   断言只追加不删 → 位置编号成立（S4），且插入会重编，D-14 自然嵌进数据结构
 *   未决定了就删行 → 位置会漂 → 必须用稳定 id，否则 `/research P2` 指向的
 *     东西会在你删掉某行之后悄悄变成另一条
 *
 * `frontier` 是 wayfinder 的平替（原版五件事里它吃掉四件）。它的输出直接喂给
 * `/status` 与启动简报——D-30：需要人主动去打开才能看见的待办 = 无效载体。
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

describe("L7 未决表与 frontier", () => {
  it("本项目 plan.md 的未决表解出 id，且 id 从文本读而非按位置分配", () => {
    const p = pendingOf();
    expect(p.length).toBeGreaterThan(0);

    // 真实未决表是 P1 P2 P3 P5 P6 P7——**P4 已删且未回收**。
    // 这逐出了 04-plan.md 里 S5 的一处矛盾：它同时说「解析时按出现顺序分配 id」
    // 与「删行不回收 id」，而两句互斥：按位置分配则删行必然回收。
    // 只有**从文本读 id** 才能做到不回收，而真实文件正是这么写的。
    // 这也是唯一能支撑 `/research P2` 语义的形态：你在 /status 里看到的 P2，
    // 和一小时后打的 /research P2 必须是同一条，即使中间删了别的行。
    for (const x of p) expect(x.id).toMatch(/^P\d+$/);
    const nums = p.map((x) => Number(x.id.slice(1)));
    // 严格递增（顺序与文件一致）但**允许缺号**
    expect([...nums].sort((a, b) => a - b)).toEqual(nums);
    expect(new Set(nums).size).toBe(nums.length);
  });

  it("缺号被保留（P4 已删，P5 仍叫 P5）", () => {
    const p = pendingOf();
    const ids = p.map((x) => x.id);
    // 这不是构造的样本，是仓库当前的真实状态：P4（decisions.md 从哪个
    // 里程碑开始写）已经定了并删行，后面的 P5/P6 没有往前移
    if (ids.includes("P5")) expect(ids).not.toContain("P4");
  });

  it("三段式解出 kind 与归属", () => {
    const p = pendingOf();
    // 「—— [human] 归我 ——」这段
    const human = p.filter((x) => x.kind === "human");
    expect(human.length).toBeGreaterThan(0);
    for (const h of human) expect(h.owner).toBeTruthy();
    // 「—— [auto] 待查 ——」这段
    const auto = p.filter((x) => x.kind === "auto");
    expect(auto.length).toBeGreaterThan(0);
    for (const a of auto) expect(a.status).toBe("open");
  });

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

  it("删掉一行 → 后面的 id 不变（这是与断言相反的规则）", () => {
    const before = pendingOf();
    const f = derive("own", (lines) => {
      const at = lineOf(lines, /^- P1 /);
      lines.splice(at, 1);
      return lines;
    });
    try {
      const r = parsePlan(f.root, f.rel);
      if (!r.ok) throw new Error("应解析成功");
      const after = r.plan.pending;
      expect(after.length).toBe(before.length - 1);
      // 删掉 P1 之后，原 P2 仍然叫 P2——否则 /status 里看到的 P2
      // 和一小时后打的 /research P2 会是两条不同的东西
      expect(after[0]!.id).toBe("P2");
      expect(after[0]!.text).toBe(before[1]!.text);
      // 全部 id 与删前一致（只少了被删那一个）
      expect(after.map((x) => x.id)).toEqual(before.slice(1).map((x) => x.id));
    } finally {
      f.cleanup();
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
