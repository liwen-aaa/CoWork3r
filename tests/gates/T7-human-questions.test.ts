/**
 * T7 G-human：给人的问题必须是这个里程碑具体的那几个
 *
 * **这道 gate 老仓库没有，是新增的。** 理由是老仓库自己的观察：
 * **没有一个里程碑的缺陷是被人工关卡抓到的。** 人抓到的两件事都是 harness 缺陷
 * （gate 缺 import、环境变量带空格），不是内容缺陷。
 *
 * 原因不是人不认真，是当时给人的是三条通用方向（「结构 / 内容实质 / 引用真实性」）——
 * 等于没给。人打开消息看到的应该是**这个里程碑的那几个 [human] 断言**，
 * 而且是自己在澄清阶段说出来的话（D-21）。
 *
 * `questions` 在 02-protocol 里是 `verdict_pass` 的必填字段，空列表根本发不出去；
 * 本层再管一层：非空不等于覆盖。
 */
import { describe, expect, it } from "vitest";

import { checkHumanQuestions } from "../../src/gates/index.ts";
import { realMilestone } from "./_fixture.ts";

describe("T7 G-human 人工问题的覆盖", () => {
  it("覆盖全部 [human] 断言 → 放行", () => {
    const m = realMilestone("M1");
    const humans = m.assertions.filter((a) => a.kind === "human");
    expect(humans.length).toBeGreaterThan(0); // 前提：模板 M1 有 [human]
    const r = checkHumanQuestions(humans.map((a) => `${a.id} ${a.text}`), m);
    expect(r.ok).toBe(true);
  });

  it("空列表 → block", () => {
    const m = realMilestone("M1");
    const r = checkHumanQuestions([], m);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failedGate).toBe("G_human");
  });

  it("漏掉一条 [human] → block，reason 列出缺的编号", () => {
    const m = realMilestone("M1");
    const humans = m.assertions.filter((a) => a.kind === "human");
    const r = checkHumanQuestions(humans.slice(1).map((a) => `${a.id} ${a.text}`), m);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain(humans[0]!.id);
  });

  it("通用方向不算覆盖（老仓库那三条「结构 / 内容实质 / 引用真实性」）", () => {
    const m = realMilestone("M1");
    const r = checkHumanQuestions(
      ["结构层是否完整", "内容实质是否达标", "引用是否真实可查"],
      m,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      // 这三条非空、看起来像问题，但一条也没对应本里程碑的 [human] 断言
      const humans = m.assertions.filter((a) => a.kind === "human");
      for (const a of humans) expect(r.reason).toContain(a.id);
    }
  });

  it("只有 [auto] 断言的里程碑 → 无 [human] 要问，放行空列表", () => {
    const m = realMilestone("M1");
    const autoOnly = { ...m, assertions: m.assertions.filter((a) => a.kind === "auto") };
    // 没有 [human] 条目时不该硬要求人回答什么——那会逼出「凑一个问题」
    expect(checkHumanQuestions([], autoOnly).ok).toBe(true);
  });

  it("问题里带编号即算覆盖（与 G-artifact 同一条弱匹配判据）", () => {
    const m = realMilestone("M1");
    const humans = m.assertions.filter((a) => a.kind === "human");
    const r = checkHumanQuestions(humans.map((a) => `请看一下 ${a.id}`), m);
    expect(r.ok).toBe(true);
  });
});
