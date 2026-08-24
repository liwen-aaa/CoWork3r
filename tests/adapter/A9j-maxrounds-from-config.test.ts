/**
 * A9j cfg.maxRounds 真的决定 stuck 阈值（配置字段被 State 默认值遮蔽）
 *
 * 来源事故（2026-08-24 实测）：`State` 自带 `DEFAULTS.maxRounds = 5`，`flow.ts` 读的是
 * `state.maxRounds`，而**没有任何地方**把 `cfg.maxRounds` 写进 state。配 2 也照样
 * 走 5 轮才 stuck——人填了不生效（D-51 的机制首跑就照出它）。
 *
 * 为什么原有测试抓不到：A4 用 `cfg.maxRounds` 当循环上限，而模板里正好是 5、
 * 与 `DEFAULTS` 撞上——两个来源恰好同值，断言就永远成立。这是 D-25 要防的
 * 「测试与真实链路脱钩」的另一种形态：不是手写字面量，是两个值碰巧相等。
 * 所以本文件用 **3**（既不等于默认值 5，也不等于任何魔数）。
 *
 * 三个用例：
 *   ① 分发时把 cfg.maxRounds 写进 state（许可与阈值同源于配置）
 *   ② 连续 FAIL 到 cfg 配的轮次 → stuck；**不到**则不 stuck
 *   ③ 配置未写 maxRounds → 用 FIELDS 的缺省值（不崩、不为 0）
 */
import { describe, expect, it } from "vitest";

import { readState } from "../../src/channel/index.ts";
import { FLOW, wire } from "../../src/adapter/index.ts";
import { build } from "../../src/protocol/index.ts";
import { fakePi, installPlan, makeProject, realConfig, realMilestone } from "./_fixture.ts";

/** cfg 里配 N 轮，走真实分发（arch 的 send_task execute → FLOW.task_assignment） */
async function dispatchWith(root: string, file: (r: string, c: string) => string, maxRounds?: number) {
  const patch: Record<string, unknown> = { plan: installPlan(root), source: "src", test: null };
  if (maxRounds !== undefined) patch.maxRounds = maxRounds;
  const { cfg } = realConfig(root, patch);
  if (!cfg) throw new Error("前提失败：配置应可解析");
  const arch = fakePi();
  const stop = wire("arch", arch as never);
  const def = arch.tools.find((t) => t.name === "send_task")!.def as {
    execute: (...a: unknown[]) => Promise<unknown>;
  };
  await def.execute("d", { type: "task_assignment", milestone: "M1", body: "去干" }, undefined, undefined, {
    cwd: root,
  });
  stop();
  void file;
  return cfg;
}

/** 发一条 fix_request（纯函数层：本文件测的是阈值来源，不是投递） */
function fail(root: string, i: number) {
  return FLOW.fix_request({
    root,
    msg: build("fix_request", "tester", {
      milestone: "M1",
      artifact: "wf/test-report-M1.md",
      issues: [{ id: `M1-00${i}`, severity: "serious", description: `第 ${i} 次` }],
    }),
    milestone: realMilestone("M1"),
  });
}

describe("A9j cfg.maxRounds 决定阈值", () => {
  it("分发时把 cfg.maxRounds 写进 state（3 ≠ 默认值 5）", async () => {
    const p = makeProject("a9j-write");
    try {
      const cfg = await dispatchWith(p.root, p.file, 3);
      expect(cfg.maxRounds, "前提：配置真的读到 3").toBe(3);
      expect(readState(p.root).maxRounds, "State 的默认 5 遮蔽了配置值").toBe(3);
    } finally {
      p.cleanup();
    }
  });

  it("连续 FAIL 到配置的轮次才 stuck（第 2 次不该 stuck，第 3 次该）", async () => {
    const p = makeProject("a9j-stuck");
    try {
      await dispatchWith(p.root, p.file, 3);
      expect(fail(p.root, 1).stuck, "第 1 次不该 stuck").toBeUndefined();
      expect(fail(p.root, 2).stuck, "第 2 次不该 stuck（配的是 3）").toBeUndefined();
      const third = fail(p.root, 3);
      expect(third.stuck, "第 3 次达到配置上限，必须 stuck").toBe(true);
      expect(third.wake).toBe("human");
    } finally {
      p.cleanup();
    }
  });

  it("配置未写 maxRounds → 用 FIELDS 缺省值（不为 0、不崩）", async () => {
    const p = makeProject("a9j-default");
    try {
      const cfg = await dispatchWith(p.root, p.file); // 模板本身带 maxRounds
      expect(cfg.maxRounds).toBeGreaterThan(0);
      expect(readState(p.root).maxRounds).toBe(cfg.maxRounds);
    } finally {
      p.cleanup();
    }
  });
});
