/**
 * L7-pending 未决表的解析侧 —— 稳定 id、三段式、段位不错位
 *
 * S5。未决表与断言的编号规则**相反**，这是有理由的：
 *   断言只追加不删 → 位置编号成立（S4），且插入会重编，D-14 自然嵌进数据结构
 *   未决定了就删行 → 位置会漂 → 必须用稳定 id，否则 `/research P2` 指向的
 *     东西会在你删掉某行之后悄悄变成另一条
 *
 * 本文件只测「解析」：行 → Pending。frontier 分组在 L7-frontier。
 * （拆分沿：原 L7 把 id 规则、三段式、状态机、frontier 分组四件事挤在一个文件，
 * 236 行 12 个 it——D-41 审记录把它列为开工前第一笔债。）
 */
import { describe, expect, it } from "vitest";

import { derive, lineOf, verbatim } from "./_fixture.ts";
import { parsePlan } from "../../src/plan/index.ts";

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

describe("L7 未决表解析（pending）", () => {
  it("本项目 plan.md 的未决表解出 id，且 id 从文本读而非按位置分配", () => {
    const p = pendingOf();
    expect(p.length).toBeGreaterThan(0);

    // 真实未决表是 P1 P2 P3 P5 P6 P7——**P4 已删且未回收**。
    // 这逐出了当时 04-plan.md 里 S5 的一处矛盾（该文档已按 D-06 拆进 `src/plan/`）：
    // 它同时说「解析时按出现顺序分配 id」
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

  it("三段式解出 kind；原文写了「归X」就必须解出 owner", () => {
    // 真实 plan.md 当前只有 [auto] answered 条目（P1/P2 已定案，human 条目已删行）
    // ——不依赖当前形态，把 P1 的标记段重置为 [human] 归我，构造「kind + owner」
    // 的确定输入（D-25：仍从真实行出发，只动标记段）
    const f = derive("own", (lines) => {
      const at = lineOf(lines, /^- P1 /);
      lines[at] = lines[at]!.replace(/\[auto\]\s*已回\s*→\s*\S+/, "[human] 归我");
      return lines;
    });
    try {
      const r = parsePlan(f.root, f.rel);
      if (!r.ok) throw new Error(`前提失败：${JSON.stringify(r.errors)}`);
      const pending = r.plan.pending;
      const lines = f.lines;

      const human = pending.filter((x) => x.kind === "human");
      expect(human.length).toBeGreaterThan(0);

      // 判据取自**原文那一行**，不取自解析结果：只断言「有 owner 的都非空」
      // 等于让实现自己定义通过条件——owner 全丢也能绿。
      // 这条第一版就是这么被写松的，而松掉的正好是当时唯一的真 bug：
      // P8 的正文里含一个 `——`，按位置切段时标记段被挤走，owner 静默消失。
      for (const x of pending) {
        const src = lines[x.line - 1] ?? "";
        const wrote = /归(\S+)/.exec(src);
        if (wrote) expect(x.owner).toBe(wrote[1]);
        else expect(x.owner).toBeUndefined();
      }
      expect(human.filter((x) => x.owner !== undefined).length).toBe(human.length);

      // [auto] 条目的 kind 从标记段解出。**status 不在这里断言**——它随文档演进
      // （待查→查中→已回，2026-08 P1/P2 已定案标 answered），「auto 全 open」
      // 是快照断言，会被正常演进击穿。status 的解析属于 L7-frontier 的领域。
      const auto = pending.filter((x) => x.kind === "auto");
      expect(auto.length).toBeGreaterThan(0);
    } finally {
      f.cleanup();
    }
  });

  it("正文里含 `——` → 段位不错位（标记段按内容认，不按位置数）", () => {
    const f = derive("own", (lines) => {
      const at = lineOf(lines, /^- P1 /);
      lines[at] = lines[at]!.replace("MARK 自检", "MARK 自检 —— 也就是那个特征串 ——");
      return lines;
    });
    try {
      const r = parsePlan(f.root, f.rel);
      if (!r.ok) throw new Error(`不该报错：${JSON.stringify(r.errors)}`);
      const p1 = r.plan.pending.find((x) => x.id === "P1")!;
      // 三段式的段数不固定：正文自己可以带破折号。标记与前置靠内容定位。
      // text 拼接验证段位不错位；status 随文档演进（P1 已 answered），不断言
      expect(p1.kind).toBe("auto");
      expect(p1.text).toContain("也就是那个特征串");
      expect(p1.text).toContain("MARK 自检");
    } finally {
      f.cleanup();
    }
  });

  it("整行没有 [auto]/[human] 标记 → 报错，不静默当成 human", () => {
    const f = derive("own", (lines) => {
      // P3 已定案删行——改从 P1 出发，剥掉它的标记段
      const at = lineOf(lines, /^- P1 /);
      lines[at] = lines[at]!.replace(/\[auto\]\s*已回\s*→\s*\S+/, "已回 → wf/notes/p1-mark.md");
      return lines;
    });
    try {
      const r = parsePlan(f.root, f.rel);
      // 与 L3 同一条判据：分类承载判据（谁去动它），默认值会让漏标看不见
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.errors.some((e) => e.line === lineOf(f.lines, /^- P1 /) + 1)).toBe(true);
      expect(r.errors.some((e) => /\[auto\]|\[human\]/.test(e.message))).toBe(true);
    } finally {
      f.cleanup();
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
});
