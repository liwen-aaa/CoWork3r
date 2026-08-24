/**
 * C7 单槽位禁止覆盖（共识 #4 的物化：文件名即锁）
 *
 * 2026-08-24 之前：`deliver` 接受覆盖——inbox 非空时仍写入，返回 `overwritten: true`
 * 让上层告警。实测该返回值在 wire.ts 被丢弃，覆盖是静默的（八处接线缺陷之一）。
 *
 * 2026-08-24 起：单槽位升级为**锁**。写入用 O_EXCL 语义（writeTextExclusive：
 * 写 .tmp → copyFileSync(COPYFILE_EXCL) → 原子「存在即失败」），目标非空即拒绝，
 * 不覆盖。三个窗口是三个进程，「检查 + 写」分离有竞态窗口，所以检查与写入合并成
 * 一个原子操作——文件名本身是锁。
 *
 * 拒绝的 reason 会透传给 send_task 的 execute 抛错 → LLM 收到「上一条还没处理」，
 * 知道要等。清空（C2 clearIfSame）仍用覆盖写空串，不受影响。
 */
import { readFileSync, unlinkSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { channelPaths, deliver } from "../../src/channel/index.ts";
import { build, checkRoute } from "../../src/protocol/index.ts";
import { makeRoot } from "./_fixture.ts";

describe("C7 单槽位禁止覆盖", () => {
  it("空 inbox → 投递成功", () => {
    const { root, cleanup } = makeRoot("C7-empty");
    try {
      const r = deliver(root, build("task_assignment", "arch", { body: "通道层测试消息", milestone: "M1" }), checkRoute);
      expect(r).toEqual({ ok: true });
    } finally {
      cleanup();
    }
  });

  it("inbox 非空 → 拒绝，且旧消息原样保留（不覆盖）", () => {
    const { root, cleanup } = makeRoot("C7-locked");
    const p = channelPaths(root);
    try {
      const first = deliver(root, build("task_assignment", "arch", { body: "第一条", milestone: "M1", round: 1 }), checkRoute);
      expect(first).toEqual({ ok: true });

      const second = deliver(root, build("task_assignment", "arch", { body: "第二条", milestone: "M1", round: 2 }), checkRoute);
      expect(second.ok).toBe(false);
      if (!second.ok) expect(second.reason).toContain("已存在");

      // 关键：旧消息没有被覆盖——单槽位是锁不是垃圾桶
      const onDisk = JSON.parse(readFileSync(p.inbox("dev"), "utf-8"));
      expect(onDisk.round).toBe(1);
      expect(onDisk.body).toBe("第一条");
    } finally {
      cleanup();
    }
  });

  it("上一条被清空后可再次投递（锁释放）", () => {
    const { root, cleanup } = makeRoot("C7-reopen");
    const p = channelPaths(root);
    try {
      deliver(root, build("task_assignment", "arch", { body: "第一条", milestone: "M1", round: 1 }), checkRoute);
      // 模拟窗口处理完：清空 = 删除文件（C2），锁释放
      unlinkSync(p.inbox("dev"));

      const again = deliver(root, build("task_assignment", "arch", { body: "第二条", milestone: "M1", round: 2 }), checkRoute);
      expect(again).toEqual({ ok: true });
    } finally {
      cleanup();
    }
  });
});
