/**
 * A10 FLOW 返回值消费（自检缺陷 #3 的回归防线）
 *
 * `wire.deliverMsg` 曾把 `FLOW[msg.type](...)` 的返回值直接丢弃——于是两个信号
 * 从未被消费（A5 断言 FLOW 返回 escalate、A4 断言返回 stuck，两条都只验「信号被
 * 生产」，没有一条验「信号被消费」）：
 *   ① escalate：同一 issue 反复 ≥3 轮 → arch 收件箱应有 escalation（阈值升级）
 *   ② stuck    ：连续失败达 maxRounds → human 收件箱应有 stuck（请人介入）
 *
 * 修复：wire 消费 FLOW 返回值，escalate/stuck 时以 tester 身份代发对应消息。
 * 本文件从公共入口（send_task execute）验证「信号被消费」——旧实现里两个收件箱
 * 永远为空，用例红。
 */
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { peek, writeState } from "../../src/channel/index.ts";
import { wire } from "../../src/adapter/index.ts";
import { fakePi, installPlan, makeProject, realConfig } from "./_fixture.ts";

/** 找到 send_task 的 execute 并直调（真实 pi 在 execute 前按 schema 校验，E1 同款） */
function sendTask(pi: ReturnType<typeof fakePi>) {
  const def = pi.tools.find((t) => t.name === "send_task")?.def as
    | { execute: (...args: unknown[]) => Promise<unknown> | unknown }
    | undefined;
  if (!def?.execute) throw new Error("send_task 工具未注册");
  return (input: Record<string, unknown>, root: string) =>
    def.execute("a10", input, undefined, undefined, { cwd: root });
}

/** 每次发 fix_request 前写合法报告（G_artifact_report 挂在 tester:fix_request 链上） */
const REPORT = "# test report M1\n\n判定：FAIL\n\n- M1.1 未过\n- M1.2 未过\n";

function setup(label: string, maxRounds: number) {
  const p = makeProject(label);
  const root = p.root;
  realConfig(root, { plan: installPlan(root), maxRounds });
  writeState(root, { milestone: "M1", round: 1, maxRounds, consecutiveFails: 0 });
  const pi = fakePi();
  wire("tester", pi as never);
  return { p, root, send: sendTask(pi) };
}

/** 发一次 fix_request（同一 issue），然后清 dev 收件箱释放单槽位锁 */
function fireFix(root: string, send: (i: Record<string, unknown>, r: string) => unknown, round: number) {
  mkdirSync(join(root, "wf"), { recursive: true });
  writeFileSync(join(root, "wf/test-report-M1.md"), REPORT, "utf-8");
  const r = send(
    {
      type: "fix_request",
      milestone: "M1",
      artifact: "wf/test-report-M1.md",
      issues: [{ id: "M1-001", severity: "serious", assertion: "M1.1", description: `第 ${round} 次失败` }],
    },
    root,
  );
  // fix_request 投给 dev（单槽位），下次再发前必须释放
  const inbox = join(root, ".pi/messages/to-dev.json");
  if (existsSync(inbox)) unlinkSync(inbox);
  return r;
}

describe("A10 FLOW 返回值消费", () => {
  it("同一 issue 反复 3 轮 → arch 收件箱有 escalation（阈值升级）", () => {
    const { p, root, send } = setup("a10-escalate", 5);
    try {
      fireFix(root, send, 1);
      fireFix(root, send, 2);
      expect(peek(root, "arch")).toBeNull(); // 前两轮没到阈值
      fireFix(root, send, 3);
      const es = peek(root, "arch");
      expect(es?.type).toBe("escalation");
      expect((es as { body?: string } | null)?.body).toContain("M1-001");
    } finally {
      p.cleanup();
    }
  });

  it("连续失败达 maxRounds → human 收件箱有 stuck（请人介入）", () => {
    const { p, root, send } = setup("a10-stuck", 2);
    try {
      fireFix(root, send, 1);
      expect(peek(root, "human")).toBeNull();
      fireFix(root, send, 2);
      const st = peek(root, "human");
      expect(st?.type).toBe("stuck");
    } finally {
      p.cleanup();
    }
  });
});
