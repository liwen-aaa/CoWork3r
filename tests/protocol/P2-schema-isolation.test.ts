/**
 * P2 各角色的 schema 只含 typesFrom(role) 的 type
 *
 * 这是「越权在类型层不可能」的机制落点。老仓库靠 tool_call 里手写
 * `if (input.to === "arch") { ...block... }` 拦 dev 越权——那段代码在这个形状下
 * 整个不需要存在，因为 dev 的 schema 里没有那个选项。
 *
 * 顺带省 token：工具 description 与 schema 全量进 LLM 上下文，
 * 每个角色只装自己那几条。
 *
 * 本用例只验 typesFrom 与 schema 的**内容**。「LLM 实际看到的字符串」经过 pi 的
 * 序列化，那一层是 M2 的 [human] 断言（开真窗口看工具描述），测试测不到。
 */
import { describe, expect, it } from "vitest";

import { sendTaskSchema, typesFrom } from "../../src/protocol/index.ts";
import { ROUTES } from "../../src/protocol/routes.ts";
import type { MsgType, Role } from "../../src/protocol/message.ts";

const ALL_TYPES = Object.keys(ROUTES) as MsgType[];

describe("P2 schema 按角色隔离", () => {
  it("typesFrom 的并集 == 全表（没有 type 无人可发）", () => {
    const union = new Set<MsgType>();
    for (const role of ["arch", "dev", "tester", "human"] as Role[]) {
      for (const t of typesFrom(role)) union.add(t);
    }
    expect([...union].sort()).toEqual([...ALL_TYPES].sort());
  });

  it("typesFrom 各角色互不重叠（一个 type 只有一个发送方）", () => {
    const seen = new Map<MsgType, Role>();
    for (const role of ["arch", "dev", "tester", "human"] as Role[]) {
      for (const t of typesFrom(role)) {
        expect(seen.has(t)).toBe(false);
        seen.set(t, role);
      }
    }
  });

  it("human 不发消息（伪角色：有收件箱、无窗口）", () => {
    expect(typesFrom("human")).toEqual([]);
  });

  it("dev 的 schema 里没有 arch 这个投递目标", () => {
    const json = JSON.stringify(sendTaskSchema("dev"));
    // dev 只能发 review_request（→ tester）。arch 不该以任何形式出现在它的 schema 里
    expect(json).not.toContain("arch");
  });

  it("dev 只有一个 type 时，schema 省掉 type 参数（唯一取值不必让模型选）", () => {
    const devTypes = typesFrom("dev");
    expect(devTypes).toEqual(["review_request"]);

    const schema = sendTaskSchema("dev") as { properties?: Record<string, unknown> };
    expect(schema.properties && "type" in schema.properties).toBe(false);
  });

  it("arch / tester 的 schema 恰好含自己那几条 type，不含别人的", () => {
    for (const role of ["arch", "tester"] as Role[]) {
      const mine = typesFrom(role);
      const others = ALL_TYPES.filter((t) => !mine.includes(t));
      const json = JSON.stringify(sendTaskSchema(role));

      for (const t of mine) expect(json).toContain(t);
      for (const t of others) expect(json).not.toContain(t);
    }
  });

  it("schema 不含 to 参数（to 由 type 决定，不给调用方选）", () => {
    for (const role of ["arch", "dev", "tester"] as Role[]) {
      const schema = sendTaskSchema(role) as { properties?: Record<string, unknown> };
      expect(schema.properties && "to" in schema.properties).toBe(false);
    }
  });
});
