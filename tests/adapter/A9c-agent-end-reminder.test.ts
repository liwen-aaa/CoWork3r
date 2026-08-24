/**
 * A9c agent_end 未投递提醒：防 followUp 自循环（真进程实测的死循环回归）
 *
 * 根因（2026-08-22 真进程实测）：agent_end 每轮都发 followUp 提醒，而 pi 的
 * sendUserMessage **总是触发新回合** → 「提醒 → 新回合 → 再提醒」无限循环。
 * state 有里程碑后三窗口全卡死（本仓库 arch 投 task_assignment 后实测）。
 * 修复：本轮已调过 send_task（含被 block 的尝试）不提醒；本轮若就是上一条
 * 提醒触发的回合也不重复提醒——LLM 看过一次提醒就够，第二轮回合带提醒
 * 文案进来 → 不再发 → 循环必停。
 *
 * 真实形态修正（2026-08-22 真进程复测）：followUp 投递的 user 消息 content 是
 * **数组** [{type:"text",text}]（pi _queueFollowUp 构造），不是 string。第一版
 * 检查只认 string → 数组漏判 → 死循环继续烧（用例③的 string mock 是错误假设，
 * 已改为真实数组形态，D-25）。
 *
 * 为什么是真实行为不是仪式（D-41 构成 diff）：用例 ② 钉「投完不追着问」、
 * ③ 钉「提醒不重复」（循环的停止条件，删掉它循环必复现）、④ 钉「无工作
 * 对象不提醒」、⑤ 钉「无会话窗口不提醒」。删任一 guard 对应用例红。
 */
import { describe, expect, it } from "vitest";

import { wire } from "../../src/adapter/index.ts";
import { writeState } from "../../src/channel/index.ts";
import { fakePi, installPlan, makeProject, realConfig } from "./_fixture.ts";

/** 让 readState 读到非空里程碑。走 channel 层真实 writeState（D-25，不手拼路径） */
function stateWithMilestone(root: string, milestone = "M1"): void {
  writeState(root, { milestone, round: 1, maxRounds: 5, consecutiveFails: 0 });
}

describe("A9c agent_end 未投递提醒", () => {
  function setup(role: "arch" | "dev" | "tester" = "dev") {
    const p = makeProject("a9c");
    installPlan(p.root);
    realConfig(p.root);
    const pi = fakePi();
    wire(role, pi as never);
    return { ...p, pi };
  }

  it("未投递 + state 有里程碑 + tui + 本轮被唤醒干活 → 提醒一次", () => {
    const { root, pi, cleanup } = setup();
    stateWithMilestone(root);
    pi.emit(
      "agent_end",
      {
        messages: [
          { role: "user", content: "wf: 收到 task_assignment（arch → dev，M1）：造 src/hello.txt", timestamp: 1 },
        ],
      },
      { cwd: root, mode: "tui" },
    );
    expect(pi.sent).toHaveLength(1);
    expect(pi.sent[0]!.text).toContain("本轮结束");
    expect(pi.sent[0]!.opts).toEqual({ deliverAs: "followUp" });
    cleanup();
  });

  it("本轮无 wf 唤醒消息（空转/闲聊轮次，无任务上下文）→ 不提醒（M6-013）", () => {
    const { root, pi, cleanup } = setup();
    stateWithMilestone(root);
    pi.emit(
      "agent_end",
      { messages: [{ role: "user", content: "今天天气不错", timestamp: 1 }] },
      { cwd: root, mode: "tui" },
    );
    expect(pi.sent).toHaveLength(0);
    cleanup();
  });

  it("本轮已调过 send_task（消息流里有 toolCall）→ 不提醒", () => {
    const { root, pi, cleanup } = setup();
    stateWithMilestone(root);
    pi.emit(
      "agent_end",
      {
        messages: [
          {
            role: "assistant",
            content: [
              { type: "toolCall", name: "send_task", id: "t1", arguments: { type: "review_request" } },
            ],
          },
        ],
      },
      { cwd: root, mode: "tui" },
    );
    expect(pi.sent).toHaveLength(0);
    cleanup();
  });

  it("本轮就是上一条提醒触发的回合（user 消息带提醒文案）→ 不重复提醒，循环停", () => {
    const { root, pi, cleanup } = setup();
    stateWithMilestone(root);
    pi.emit(
      "agent_end",
      {
        messages: [
          // 真实死循环现场是**两条都在**：先被唤醒（有活），提醒发出去，
          // followUp 又触发新回合——于是下一轮的 messages 里唤醒与提醒共存。
          // 只放提醒消息会被 hasWork 前置拦住（M6-013），停止条件根本走不到：
          // 那样用例仍然绿，但绿的理由不是它测的那件事（2026-08-24 拆除停止条件实测仍绿）。
          { role: "user", content: "wf: 收到 task_assignment（arch → dev，M1）：造 src/hello.txt", timestamp: 1 },
          // 真实 followUp 的 content 是数组形态 [{type:"text",text}]（pi agent-session.js
          // _queueFollowUp 构造，真进程实测确认）——mock 必须同形状，否则测试绿、真实
          // 链路断（D-25：与 M6-003/E1 绕 schema 同形状的坑）
          {
            role: "user",
            content: [{ type: "text", text: "wf: 本轮结束。若已完成请调 send_task 投出去。" }],
            timestamp: 2,
          },
        ],
      },
      { cwd: root, mode: "tui" },
    );
    expect(pi.sent, "有活 + 本轮已提醒过 → 不能再提醒，否则三窗口全卡死").toHaveLength(0);
    cleanup();
  });

  it("state 无里程碑 → 不提醒", () => {
    const { root, pi, cleanup } = setup();
    pi.emit("agent_end", { messages: [] }, { cwd: root, mode: "tui" }); // 未写 state.json
    expect(pi.sent).toHaveLength(0);
    cleanup();
  });

  it("print 模式 → 不提醒（无会话窗口，投递会冲突）", () => {
    const { root, pi, cleanup } = setup();
    stateWithMilestone(root);
    pi.emit("agent_end", { messages: [] }, { cwd: root, mode: "print" });
    expect(pi.sent).toHaveLength(0);
    cleanup();
  });
});
