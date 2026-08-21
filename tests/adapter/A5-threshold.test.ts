/**
 * A5 阈值升级：同一 issue 累计 3 轮 → 自动发 escalation（跨「重启」）
 *
 * 判据是「实现问题反复出现 = 疑似架构假设错了」。这条完全机械，不需要谁来判断。
 *
 * 「跨重启」由 bumpCounters 的形态保证：每次调用都读盘 → 改 → 写盘，没有进程内
 * 缓存，所以三次独立调用等价于三个窗口生命周期（counters.ts 文件头写着这条）。
 * 本文件不 mock 计数器——**它就是重启语义本身**。
 *
 * flow 是纯函数层（不碰 pi），所以它返回「该升级了」的信号，由 wire 发真正的
 * escalation 消息。本文件断言信号，发消息是 A3/E1 的事。
 */
import { describe, expect, it } from "vitest";

import { build } from "../../src/protocol/index.ts";
import { FLOW } from "../../src/adapter/index.ts";
import { makeProject, realMilestone } from "./_fixture.ts";

const ISSUE = { id: "M1-001", severity: "serious" as const, description: "反复出现的实现问题" };

describe("A5 阈值升级", () => {
  it("同一 issue 第 1、2 轮不升级，第 3 轮触发 escalation 信号", () => {
    const p = makeProject("a5-threshold");
    try {
      const m = realMilestone("M1");

      const r1 = FLOW.fix_request({
        root: p.root,
        msg: build("fix_request", "tester", { milestone: "M1", artifact: "wf/test-report-M1.md", issues: [ISSUE] }),
        milestone: m,
      });
      expect(r1.escalate).toBeUndefined();

      const r2 = FLOW.fix_request({
        root: p.root,
        msg: build("fix_request", "tester", { milestone: "M1", artifact: "wf/test-report-M1.md", issues: [ISSUE] }),
        milestone: m,
      });
      expect(r2.escalate).toBeUndefined();

      const r3 = FLOW.fix_request({
        root: p.root,
        msg: build("fix_request", "tester", { milestone: "M1", artifact: "wf/test-report-M1.md", issues: [ISSUE] }),
        milestone: m,
      });
      expect(r3.escalate).toBeDefined();
      expect(r3.escalate).toContain("M1-001");
    } finally {
      p.cleanup();
    }
  });

  it("不同 issue 各计数，不互相污染", () => {
    const p = makeProject("a5-sep");
    try {
      const m = realMilestone("M1");
      const other = { id: "M1-002", severity: "medium" as const, description: "另一个问题" };

      FLOW.fix_request({ root: p.root, msg: build("fix_request", "tester", { milestone: "M1", artifact: "wf/test-report-M1.md", issues: [ISSUE] }), milestone: m });
      FLOW.fix_request({ root: p.root, msg: build("fix_request", "tester", { milestone: "M1", artifact: "wf/test-report-M1.md", issues: [ISSUE] }), milestone: m });
      // 不同 issue 第 2 次出现，不该触发
      const r = FLOW.fix_request({ root: p.root, msg: build("fix_request", "tester", { milestone: "M1", artifact: "wf/test-report-M1.md", issues: [other] }), milestone: m });
      expect(r.escalate).toBeUndefined();
    } finally {
      p.cleanup();
    }
  });

  it("达到阈值后再出现同一 issue → 每次都继续报（不是只报一次）", () => {
    const p = makeProject("a5-repeat");
    try {
      const m = realMilestone("M1");
      FLOW.fix_request({ root: p.root, msg: build("fix_request", "tester", { milestone: "M1", artifact: "wf/test-report-M1.md", issues: [ISSUE] }), milestone: m });
      FLOW.fix_request({ root: p.root, msg: build("fix_request", "tester", { milestone: "M1", artifact: "wf/test-report-M1.md", issues: [ISSUE] }), milestone: m });
      FLOW.fix_request({ root: p.root, msg: build("fix_request", "tester", { milestone: "M1", artifact: "wf/test-report-M1.md", issues: [ISSUE] }), milestone: m });
      const r4 = FLOW.fix_request({ root: p.root, msg: build("fix_request", "tester", { milestone: "M1", artifact: "wf/test-report-M1.md", issues: [ISSUE] }), milestone: m });
      // bumpCounters 只报本次涉及的 id——已超阈值的旧 id 不该反复触发（counters.ts 的注释）
      // 但同一 issue 再次出现，仍然算本次涉及
      expect(r4.escalate).toContain("M1-001");
    } finally {
      p.cleanup();
    }
  });
});
