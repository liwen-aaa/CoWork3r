/**
 * A9e 源码基线消费（takeSourceBaseline 接线，D-49 哑弹之一）
 *
 * G_source 读基线文件做「源码真的动了吗」判定，而基线由 takeSourceBaseline 写入——
 * 该函数在 src/ 零调用（T4 直调它），所以基线永不存在、G_source 恒放行：
 * 「只写漂亮的产出说明、不改代码」这道唯一防线是空的。
 *
 * 本文件从 wire 的公共入口验证「投递 → 基线推进 → 下次投递比对」全链路：
 *  ① 第一次投 review_request（基线不存在）→ 放行 + 基线写入
 *  ② 第二次投（源码未变）→ G_source block
 * 这是「信号被消费」形状的测试：旧实现里基线从不写入，②必然放行 → 用例红。
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { channelPaths, writeState } from "../../src/channel/index.ts";
import { wire } from "../../src/adapter/index.ts";
import { fakePi, installPlan, makeProject, realConfig } from "./_fixture.ts";

/** 合法 dev 产出：覆盖 minimal plan 的两条断言（M1.1 auto + M1.2 human） */
const ARTIFACT = `# dev 产出 M1\n\n- M1.1 已完成：src/hello.txt 已创建\n- M1.2 已完成：内容读起来是句人话\n`;

describe("A9e 源码基线消费", () => {
  it("投递 review_request → 基线写入；源码未变再投 → G_source block", () => {
    const p = makeProject("a9e-baseline");
    try {
      const root = p.root;
      realConfig(root, { plan: installPlan(root), source: "src" });
      p.file("wf/dev-output-M1.md", ARTIFACT);
      p.file("src/hello.txt", "ok\n");
      writeState(root, { milestone: "M1", round: 1, maxRounds: 5, consecutiveFails: 0 });

      const pi = fakePi();
      wire("dev", pi as never);

      // ① 第一次投递：基线不存在 → 放行，且基线被写入
      const r1 = pi.emit(
        "tool_call",
        { toolName: "send_task", input: { type: "review_request", milestone: "M1", artifact: "wf/dev-output-M1.md" } },
        { cwd: root },
      );
      expect(r1).toBeUndefined();
      const baseline = readFileSync(channelPaths(root).sourceBaseline, "utf-8");
      expect(baseline).toContain("hello.txt");

      // ② 第二次投递：源码一个字节没改 → G_source block
      const r2 = pi.emit(
        "tool_call",
        { toolName: "send_task", input: { type: "review_request", milestone: "M1", artifact: "wf/dev-output-M1.md" } },
        { cwd: root },
      );
      expect(r2).toMatchObject({ block: true });
      expect((r2 as { reason: string }).reason).toContain("没有变化");
    } finally {
      p.cleanup();
    }
  });
});
