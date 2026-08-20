/**
 * C7 覆盖前必须出声
 *
 * 单槽位设计接受「新消息覆盖旧消息」，但**不接受静默覆盖**。
 * `deliver` 写入前若目标收件箱非空（上一条尚未被处理并清空），仍写入（不阻塞），
 * 但返回 `overwritten: true`。07-adapter 据此告警。
 *
 * 关键点：仍然写入。阻塞会让「上一条卡住」变成「后面全卡住」，
 * 而告警把「可能丢消息」从无声变成可见信号——这是 D-30 的形状。
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { channelPaths, deliver } from "../../src/channel/index.ts";
import { build, checkRoute } from "../../src/protocol/index.ts";
import { makeRoot } from "./_fixture.ts";

describe("C7 覆盖告警", () => {
  it("空 inbox → overwritten:false", () => {
    const { root, cleanup } = makeRoot("C7-empty");
    try {
      const r = deliver(root, build("task_assignment", "arch", { body: "通道层测试消息", milestone: "M1" }), checkRoute);
      expect(r).toEqual({ ok: true, overwritten: false });
    } finally {
      cleanup();
    }
  });

  it("inbox 非空 → overwritten:true，且新消息确实写进去了", () => {
    const { root, cleanup } = makeRoot("C7-over");
    const p = channelPaths(root);
    try {
      deliver(root, build("task_assignment", "arch", { body: "通道层测试消息", milestone: "M1", round: 1 }), checkRoute);
      const r = deliver(root, build("task_assignment", "arch", { body: "通道层测试消息", milestone: "M1", round: 2 }), checkRoute);

      expect(r).toEqual({ ok: true, overwritten: true });

      // 不阻塞：第二条真的落盘了
      const onDisk = JSON.parse(readFileSync(p.inbox("dev"), "utf-8"));
      expect(onDisk.round).toBe(2);
    } finally {
      cleanup();
    }
  });
});
