/**
 * C8 写盘前二次校验地址
 *
 * `deliver` 写盘前跑一次注入的 `validate`，不过就**不写**。
 *
 * 理由不是「防自己写错」，是防腐化：老仓库那个 bug 的形态正是上层代码绕过声明
 * 直写错地址，而七处声明全部正确（`ticket_result` 被投进 `to-tester.json`，
 * arch 永远收不到）。让唯一的落盘口自己把一道，上层就没有绕路。
 *
 * `validate` 由调用方注入（D-07 同形状）：本层定义它的形状，不知道它的内容。
 * 所以本用例用两个 fake——一个真判据的等价物、一个无条件拒绝——
 * 证的是「deliver 尊重注入结果」，而不是「那条判据对不对」（那是 M2 的 P1）。
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { channelPaths, deliver } from "../../src/channel";
import { buildMessage, makeRoot, rejectingValidate, routeValidate } from "./_fixture";

describe("C8 落盘前校验", () => {
  it("validate 返回 ok:false → deliver 也 ok:false，且文件未被写", () => {
    const { root, cleanup } = makeRoot("C8-reject");
    const p = channelPaths(root);
    try {
      const r = deliver(
        root,
        buildMessage("task_assignment", "arch", { milestone: "M1" }),
        rejectingValidate,
      );

      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toContain("fixture 注入的拒绝");

      // 未写盘：文件不存在，或存在但为空（目录可能已被建出来）
      const written = existsSync(p.inbox("dev")) && readFileSync(p.inbox("dev"), "utf-8").trim() !== "";
      expect(written).toBe(false);
    } finally {
      cleanup();
    }
  });

  it("被拒绝的投递不覆盖收件箱里已有的消息", () => {
    const { root, cleanup } = makeRoot("C8-nooverwrite");
    const p = channelPaths(root);
    try {
      deliver(root, buildMessage("task_assignment", "arch", { milestone: "M1", round: 1 }), routeValidate);
      deliver(root, buildMessage("task_assignment", "arch", { milestone: "M1", round: 9 }), rejectingValidate);

      // 拒绝必须发生在写之前——否则「不写」等于「已经覆盖了再说不写」
      expect(JSON.parse(readFileSync(p.inbox("dev"), "utf-8")).round).toBe(1);
    } finally {
      cleanup();
    }
  });

  it("validate 通过 → 正常写盘", () => {
    const { root, cleanup } = makeRoot("C8-accept");
    const p = channelPaths(root);
    try {
      const r = deliver(root, buildMessage("task_assignment", "arch", { milestone: "M1" }), routeValidate);
      expect(r.ok).toBe(true);
      expect(JSON.parse(readFileSync(p.inbox("dev"), "utf-8")).type).toBe("task_assignment");
    } finally {
      cleanup();
    }
  });
});
