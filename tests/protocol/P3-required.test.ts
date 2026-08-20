/**
 * P3 缺必填字段 → build 抛错
 *
 * `build` 抛错而 `validate` 返回结果，这个不对称是有意的：
 * 前者的输入来自我们自己的代码（缺字段 = 编程错误，该早死），
 * 后者的输入来自磁盘（可能被人手改坏，必须优雅处理）。
 *
 * 遍历全表 × 每条必填字段，逐个去掉试一次。这样表里给某个 type 加一条必填时，
 * 这里自动多一个用例——不需要有人记得补测试。
 */
import { describe, expect, it } from "vitest";

import { build } from "../../src/protocol/index.ts";
import { ROUTES } from "../../src/protocol/routes.ts";
import type { MsgType } from "../../src/protocol/message.ts";
import { sampleFields, withoutField } from "./_fixture.ts";

const ALL_TYPES = Object.keys(ROUTES) as MsgType[];

describe("P3 必填校验", () => {
  it("样本本身合法（否则下面的反例证明不了任何事）", () => {
    for (const type of ALL_TYPES) {
      expect(() => build(type, ROUTES[type].from, sampleFields(type))).not.toThrow();
    }
  });

  for (const type of ALL_TYPES) {
    for (const field of ROUTES[type].requires) {
      it(`${type} 缺 ${field} → 抛错，且错误信息含字段名`, () => {
        expect(() => build(type, ROUTES[type].from, withoutField(type, field))).toThrow(
          new RegExp(field),
        );
      });
    }
  }

  it("report 不要求 milestone（omit 生效）", () => {
    expect(ROUTES.report.omit).toContain("milestone");
    const msg = build("report", "arch", { body: "收尾报告", round: 1 });
    expect(msg.milestone).toBeUndefined();
  });

  it("非 report 的 type 缺 milestone → 抛错（omit 只对 report 生效）", () => {
    expect(() => build("task_assignment", "arch", { body: "x", round: 1 })).toThrow(/milestone/);
  });

  it("未知 type → 抛错", () => {
    expect(() => build("no_such_type" as MsgType, "arch", { body: "x" })).toThrow();
  });

  it("build 自动填 at（ISO 时间戳）", () => {
    const msg = build("report", "arch", { body: "x", round: 1 });
    expect(msg.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Number.isNaN(Date.parse(msg.at))).toBe(false);
  });
});
