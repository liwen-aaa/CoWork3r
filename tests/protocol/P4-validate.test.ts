/**
 * P4 手写坏 JSON → validate 给出可读 reason
 *
 * validate 的输入来自磁盘。三种真实来源：投递方写错、人手动改过、
 * 老版本留下的旧格式。所以它返回结果而不抛错（对比 P3 的 build）。
 *
 * 「可读」不是修辞：reason 会进拦截提示，而拦截提示的措辞决定纪律是否被遵守
 * （老仓库 dev 4/4 vs tester 0/4 的唯一差别）。所以每条 reason 都断言含关键词。
 */
import { describe, expect, it } from "vitest";

import { build, validate } from "../../src/protocol/index.ts";
import { ROUTES } from "../../src/protocol/routes.ts";
import type { Message, MsgType } from "../../src/protocol/message.ts";
import { sampleFields } from "./_fixture.ts";

const ALL_TYPES = Object.keys(ROUTES) as MsgType[];

describe("P4 validate", () => {
  it("build 出来的消息全部通过（遍历全表）", () => {
    for (const type of ALL_TYPES) {
      const msg = build(type, ROUTES[type].from, sampleFields(type));
      const r = validate(msg);
      expect(r.ok, `${type}: ${r.ok ? "" : r.reason}`).toBe(true);
    }
  });

  it("to 与表不符 → 不通过，reason 指出期望值", () => {
    const msg = build("review_request", "dev", sampleFields("review_request"));
    const tampered = { ...msg, to: "arch" };
    const r = validate(tampered);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain("to");
      expect(r.reason).toContain("tester"); // 期望值要写出来，否则人不知道该改成什么
    }
  });

  it("from 与表不符 → 不通过", () => {
    const msg = build("review_request", "dev", sampleFields("review_request"));
    const r = validate({ ...msg, from: "arch" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("from");
  });

  it("未知 type → 不通过，reason 列出合法取值", () => {
    const r = validate({ type: "ticket_result", from: "dev", to: "arch", round: 1, body: "x", at: "" });
    expect(r.ok).toBe(false);
    // ticket_result 正是老仓库那条坏通道的名字。它现在不在表里 → 根本发不出去
    if (!r.ok) expect(r.reason).toContain("type");
  });

  it("缺必填字段 → 不通过，reason 含字段名", () => {
    const msg = build("fix_request", "tester", sampleFields("fix_request")) as Partial<Message>;
    delete msg.issues;
    const r = validate(msg);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("issues");
  });

  it.each([
    ["null", null],
    ["字符串", "not an object"],
    ["数组", [1, 2, 3]],
    ["空对象", {}],
    ["undefined", undefined],
  ])("非消息输入（%s）→ 不通过而不是抛错", (_label, raw) => {
    expect(() => validate(raw)).not.toThrow();
    expect(validate(raw).ok).toBe(false);
  });

  it("reason 永远非空（拦截提示不能是空字符串）", () => {
    const bad = [null, {}, { type: "nope" }, "x"];
    for (const raw of bad) {
      const r = validate(raw);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason.trim().length).toBeGreaterThan(0);
    }
  });
});
