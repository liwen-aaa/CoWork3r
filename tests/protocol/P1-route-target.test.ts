/**
 * P1 每个 type 的投递落点 == ROUTES[type].to（遍历全表）
 *
 * ── 本模块存在的全部理由 ──────────────────────────────────
 * 老仓库那个 bug：`ticket_result` 这条通道有七处声明（schema、tool_call 拦截、
 * ADR、契约文档、约定台账、两项行为验证），零处让它工作——消息被投进 tester 的
 * 收件箱，arch 永远收不到。
 *
 * 漏掉的原因很具体：所有测试断言的都是「拦截返回了什么」，没有一项断言
 * 「消息落到了哪个文件」。而声明分散在七处，没有任何一处是唯一真相源。
 *
 * 所以本用例遍历全表，逐条把消息真的投出去，然后去磁盘上找它。
 * 表里加一条 type 而忘了让它工作 → 这里立刻红。
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { channelPaths, deliver } from "../../src/channel/index.ts";
import { build, checkRoute } from "../../src/protocol/index.ts";
import { ROUTES } from "../../src/protocol/routes.ts";
import type { MsgType } from "../../src/protocol/message.ts";
import { makeRoot, sampleFields } from "./_fixture.ts";

const ALL_TYPES = Object.keys(ROUTES) as MsgType[];

describe("P1 投递落点", () => {
  it("表非空，且用例真的遍历了全表", () => {
    // 防「遍历了零条也算通过」——这是遍历型断言的经典漏法
    expect(ALL_TYPES.length).toBeGreaterThanOrEqual(9);
  });

  for (const type of ALL_TYPES) {
    const route = ROUTES[type];

    it(`${type}：${route.from} → ${route.to}，落在 to-${route.to}.json`, () => {
      const { root, cleanup } = makeRoot(`P1-${type}`);
      try {
        const msg = build(type, route.from, sampleFields(type));

        // to 由表决定，不由调用方传
        expect(msg.to).toBe(route.to);

        const r = deliver(root, msg, checkRoute);
        expect(r.ok).toBe(true);

        // 真的去磁盘上找它
        const landed = JSON.parse(readFileSync(channelPaths(root).inbox(route.to), "utf-8"));
        expect(landed.type).toBe(type);
        expect(landed.to).toBe(route.to);
        expect(landed.from).toBe(route.from);

        // 其它三个收件箱必须仍是空的（防「广播式投递」也算通过）
        const others = (["arch", "dev", "tester", "human"] as const).filter((r) => r !== route.to);
        for (const other of others) {
          let content = "";
          try {
            content = readFileSync(channelPaths(root).inbox(other), "utf-8");
          } catch {
            content = ""; // 文件不存在 = 空，符合预期
          }
          expect(content.trim()).toBe("");
        }
      } finally {
        cleanup();
      }
    });
  }

  it("build 拒绝伪造 to：调用方传的 to 被表覆盖", () => {
    // 老仓库那个 bug 的直接形态：上层想往别处投
    const msg = build("review_request", "dev", {
      ...sampleFields("review_request"),
      to: "arch" as never,
    });
    expect(msg.to).toBe(ROUTES.review_request.to);
  });

  it("build 拒绝伪造 from：与表不符则抛错", () => {
    expect(() =>
      build("review_request", "arch", sampleFields("review_request")),
    ).toThrow(/from/);
  });
});
