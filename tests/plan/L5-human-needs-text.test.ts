/**
 * L5 `[human]` 必须有非空说明，否则 `checkAssertion` 失败
 *
 * D-20 的另一半。`[human]` 条目会成为人工关卡上被问的那个问题（05-gates 的
 * G-human 校验 `verdict_pass` 的 questions 覆盖了全部 human 断言），所以空的
 * human 断言等于「到时候问一个空问题」。
 *
 * 老仓库的观察：**没有一个里程碑的缺陷是被人工关卡抓到的。** 人抓到的两件事
 * 都是 harness 缺陷，不是内容缺陷。而当时给人的是三条通用方向
 * （「结构 / 内容实质 / 引用真实性」），等于没给。所以这条判据要的是具体。
 */
import { describe, expect, it } from "vitest";

import { verbatim } from "./_fixture.ts";
import { checkAssertion, parsePlan } from "../../src/plan/index.ts";

function aHuman() {
  const f = verbatim("own");
  try {
    const r = parsePlan(f.root, f.rel);
    if (!r.ok) throw new Error("前提失败");
    const a = r.plan.milestones.flatMap((m) => m.assertions).find((x) => x.kind === "human");
    if (!a) throw new Error("前提失败：找不到 human 断言");
    return a;
  } finally {
    f.cleanup();
  }
}

describe("L5 human 的说明", () => {
  it("真实的 human 断言全部通过", () => {
    const f = verbatim("own");
    try {
      const r = parsePlan(f.root, f.rel);
      if (!r.ok) throw new Error("应解析成功");
      const bad = r.plan.milestones
        .flatMap((m) => m.assertions)
        .filter((a) => a.kind === "human")
        .map((a) => ({ id: a.id, ...checkAssertion(a) }))
        .filter((x) => !x.ok);
      expect(bad).toEqual([]);
    } finally {
      f.cleanup();
    }
  });

  it("空说明 → 失败", () => {
    expect(checkAssertion({ ...aHuman(), text: "" }).ok).toBe(false);
    expect(checkAssertion({ ...aHuman(), text: "   " }).ok).toBe(false);
  });

  it("human 不要求命令（这是与 auto 的唯一差别）", () => {
    // 「读起来像人话」永远写不出命令，这正是它标 human 的理由
    const r = checkAssertion({ ...aHuman(), text: "文件内容读起来是句人话，不是占位符" });
    expect(r.ok).toBe(true);
  });

  it("极短说明也通过（长度不是判据）", () => {
    // 判据是「说清了没有」，而那个判断只有人能做（D-21）。
    // 机器设长度门槛会诱导人凑字数——那比短说明更坏
    expect(checkAssertion({ ...aHuman(), text: "三份规约读起来像人写的" }).ok).toBe(true);
  });

  it("auto 与 human 的判据确实不同（同一段文本，两种结论）", () => {
    const text = "三份规约读起来是「你是谁」而不是「系统怎么工作」";
    expect(checkAssertion({ ...aHuman(), text }).ok).toBe(true);
    // 同样的文本标成 auto 就该失败——没有命令没有路径
    expect(checkAssertion({ ...aHuman(), kind: "auto", text }).ok).toBe(false);
  });
});
