/**
 * A13 `/pending`：待判定项的内容直接打印到窗口里
 *
 * 来源（2026-08-24 wf-demo 真跑）：人在人工关卡上先问「我没看到 to-human 的内容啊？
 * 在哪里」，随后问「现在能不能附上给人看的部分？」。两次问的是同一件事——
 * **待判定的内容不在视线里**，只有一个文件名。
 *
 * RUN1-001 修的是「状态条不刷新」（`待你判定：1 条（见 wf/human-pending.md）`
 * 那行终于出现了），但那行只给**位置**不给**内容**：人还得离开窗口去开文件。
 * 而共识 ② 说人只做看 / 说 / 确认——「去开个编辑器」不在这三件里。
 *
 * 为什么不做成状态条里的可点击链接：那要么依赖终端 OSC 8 超链接（pi 的 widget
 * 渲染层是否透传 ANSI 未验证），要么让扩展去 `spawn` 打开文件——后者撞 D-33
 * （不在 agent 会话内开窗口/浏览器/IDE）。**人要的是内容，不是跳转**，
 * 而内容打印在窗口里最省：零依赖、不碰协议、不碰 gate。
 *
 * 判据（D-30 的形状）：命令输出必须含**要人回答的那句话本身**，
 * 不能只有编号和文件名——否则它只是把「见某文件」换了个地方说。
 */
import { describe, expect, it } from "vitest";

import { wire } from "../../src/adapter/index.ts";
import { appendHumanLedger, deliver, watchInbox, writeState } from "../../src/channel/index.ts";
import type { Stop, WatchOptions } from "../../src/channel/watch.ts";
import { build, checkRoute } from "../../src/protocol/index.ts";
import type { Message, Role } from "../../src/protocol/index.ts";
import { fakePi, installPlan, makeProject, realConfig, waitFor } from "./_fixture.ts";

const fastWatch = (root: string, r: Role, onMessage: (m: Message) => void, o: WatchOptions): Stop =>
  watchInbox(root, r, onMessage, { ...o, watch: null, pollMs: 40, catchupMs: 20 });

/** 一条真实的 verdict_pass：questions 是该里程碑 [human] 断言的原文 */
const QUESTION = "M1.2 文件内容读起来是句人话吗？不是占位符？";

function setup(label: string) {
  const p = makeProject(label);
  installPlan(p.root);
  realConfig(p.root, { test: null });
  writeState(p.root, { milestone: "M1", round: 1, maxRounds: 3, consecutiveFails: 0 });
  const pi = fakePi();
  const stopAll = wire("arch", pi as never, { watch: fastWatch });
  const notes: string[] = [];
  const cmd = (name: string) => {
    const c = pi.commands.find((x) => x.name === name);
    if (!c) throw new Error(`${name} 命令未注册`);
    return (c.def as { handler: (a: string, c: unknown) => Promise<void> }).handler;
  };
  const run = async (name: string, args = "") => {
    await cmd(name)(args, { cwd: p.root, ui: { notify: (t: string) => notes.push(t) } });
    return notes.at(-1) ?? "";
  };
  return { ...p, pi, notes, run, stopAll };
}

describe("A13 /pending", () => {
  it("台账有待办 → 打印出要人回答的那句话本身（不只是文件名）", async () => {
    const t = setup("a13-content");
    try {
      appendHumanLedger(
        t.root,
        build("verdict_pass", "tester", {
          milestone: "M1",
          artifact: "wf/test-report-M1.md",
          questions: [QUESTION],
        }),
      );

      const out = await t.run("pending");
      expect(out, "只给文件名等于把「见某文件」换个地方说").toContain(QUESTION);
      expect(out).toContain("M1");
    } finally {
      t.stopAll();
      t.cleanup();
    }
  });

  it("勾掉的条目不再列（人划掉 = 已处理，D-34：AI 不动历史）", async () => {
    const t = setup("a13-checked");
    try {
      appendHumanLedger(
        t.root,
        build("verdict_pass", "tester", { milestone: "M1", artifact: "wf/r.md", questions: [QUESTION] }),
      );
      // 人把它勾掉（真实操作是编辑那一行）
      const { readFileSync, writeFileSync } = await import("node:fs");
      const { join } = await import("node:path");
      const file = join(t.root, "wf/human-pending.md");
      writeFileSync(file, readFileSync(file, "utf-8").replace("- [ ]", "- [x]"), "utf-8");

      const out = await t.run("pending");
      expect(out, "勾掉的不该再出现在待办里").not.toContain(QUESTION);
      expect(out).toMatch(/没有|无待/);
    } finally {
      t.stopAll();
      t.cleanup();
    }
  });

  it("台账不存在 → 说清没有待办，不报错（空项目的正常状态）", async () => {
    const t = setup("a13-empty");
    try {
      const out = await t.run("pending");
      expect(out).toMatch(/没有|无待/);
    } finally {
      t.stopAll();
      t.cleanup();
    }
  });

  it("槽位里还没被代排的那条也要算（窗口关着时消息到了）", async () => {
    const t = setup("a13-slot");
    try {
      // 直接投进 human 槽位，不启动 drain（等价于 arch 窗口没开的那段时间）
      const v = build("verdict_pass", "tester", {
        milestone: "M1",
        artifact: "wf/r.md",
        questions: ["M1.9 这条还在槽位里"],
      });
      expect(deliver(t.root, v, checkRoute).ok).toBe(true);

      const out = await t.run("pending");
      expect(out, "只读台账会漏掉窗口关闭期间到的那条").toContain("M1.9");
    } finally {
      t.stopAll();
      t.cleanup();
    }
  });

  it("多条待办按顺序列全（不截断）", async () => {
    const t = setup("a13-many");
    try {
      for (const q of ["M1.5 第一问", "M1.6 第二问", "M1.7 第三问"]) {
        appendHumanLedger(
          t.root,
          build("verdict_pass", "tester", { milestone: "M1", artifact: "wf/r.md", questions: [q] }),
        );
        await waitFor(() => true, 5).catch(() => undefined);
      }
      const out = await t.run("pending");
      for (const q of ["第一问", "第二问", "第三问"]) expect(out).toContain(q);
    } finally {
      t.stopAll();
      t.cleanup();
    }
  });
});
