/**
 * A9g 人的收件箱有消费者（arch 代排，共识 ② 的延伸）
 *
 * 来源事故（2026-08-24 实测，通道级）：共识 #4 把单槽位从「覆盖 + 告警」升级为
 * 「O_EXCL 禁止覆盖」之后，`to-human.json` 变成**永久锁**——三个真角色的收件箱由
 * 各自窗口的 watchInbox 消费清空，而 human 是伪角色（有收件箱、无窗口、无 watcher），
 * 全套只有 `milestone_passed` 会 clearInbox(human)。后果：
 *   ① 人说「不行」→ 修一轮 → tester 再报 PASS → **第二条 verdict_pass 投不出去**
 *   ② 同一时刻 arch 的 report、tester 的 stuck 全被拒（"目标已存在"）
 *   ③ 最糟的是 stuck：它是「请人介入」的急救通道，恰好在等判定时被堵死
 * happy path 恰好走 milestone_passed 自清，所以 E1 全绿而 FAIL 重试路径不通。
 *
 * 消费方 = arch（人的代理，共识 ②）。但槽位与台账必须分开：
 *   **槽位是锁**（可释放，释放后通道恢复）；**台账是 D-30 载体**（不丢，人一眼能看见）。
 *   只清不记 = 待办静默消失（status.ts 的「待你判定」行本来就读那个槽位）；
 *   只记不清 = 锁还在，通道仍然不通。两半都是必需的。
 *
 * 本文件从 wire 的公共入口验证四件事（旧实现下 ①②③ 必红）：
 *   ① arch session_start 后：投一条给 human 的消息 → 槽位被排空
 *   ② 排空后同方向第二条能投进去（锁真的释放了 = 上面那三个后果都解掉）
 *   ③ 排空的消息进 wf/ 台账（D-30：不看就会漏的东西必须留下来）
 *   ④ 只有 arch 排空：dev / tester 窗口不碰 human 槽位（越权与噪音）
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { wire } from "../../src/adapter/index.ts";
import { channelPaths, deliver, peek, watchInbox } from "../../src/channel/index.ts";
import type { Stop, WatchOptions } from "../../src/channel/watch.ts";
import { build, checkRoute } from "../../src/protocol/index.ts";
import type { Message, Role } from "../../src/protocol/index.ts";
import { fakePi, installPlan, makeProject, realConfig, waitFor } from "./_fixture.ts";

/** 注入窄参数的真实 watchInbox（C1/A9d 同款）：消息仍走真实 deliver 落盘（D-25） */
const fastWatch = (root: string, r: Role, onMessage: (m: Message) => void, o: WatchOptions): Stop =>
  watchInbox(root, r, onMessage, {
    watch: null,
    pollMs: 40,
    catchupMs: 20,
    ...(o.onWake ? { onWake: o.onWake } : {}),
  });

function setup(role: "arch" | "dev" | "tester", label: string) {
  const p = makeProject(label);
  installPlan(p.root);
  realConfig(p.root);
  const pi = fakePi();
  const stopAll = wire(role, pi as never, { watch: fastWatch });
  pi.emit("session_start", {}, { cwd: p.root, mode: "tui" });
  return { ...p, pi, stopAll };
}

/** 真实 verdict_pass（tester → human），走真实 build + deliver 落盘 */
function verdict(root: string, milestone = "M1") {
  const msg = build("verdict_pass", "tester", {
    milestone,
    artifact: "wf/test-report-M1.md",
    questions: ["M1.2 文件内容读起来是句人话吗"],
  });
  return deliver(root, msg, checkRoute);
}

describe("A9g 人的收件箱有消费者", () => {
  it("arch 窗口排空 human 槽位（伪角色无 watcher，只有代理能代排）", async () => {
    const { root, stopAll, cleanup } = setup("arch", "a9g-drain");
    try {
      expect(verdict(root).ok).toBe(true);
      await waitFor(() => peek(root, "human") === null);
      expect(peek(root, "human")).toBeNull();
    } finally {
      stopAll();
      cleanup();
    }
  });

  it("排空后同方向第二条能投进去（锁释放 = FAIL 重试路径恢复）", async () => {
    const { root, stopAll, cleanup } = setup("arch", "a9g-second");
    try {
      expect(verdict(root).ok).toBe(true);
      await waitFor(() => peek(root, "human") === null);

      // 人说「不行」→ 修一轮 → tester 再报 PASS。旧实现这一条必被拒（"目标已存在"）
      const again = verdict(root);
      expect(again.ok, `第二条 verdict_pass 应能投递，实际：${JSON.stringify(again)}`).toBe(true);

      // 急救通道同样不该被堵：stuck 也是 → human
      await waitFor(() => peek(root, "human") === null);
      const stuck = deliver(root, build("stuck", "tester", { milestone: "M1", body: "连续失败达上限" }), checkRoute);
      expect(stuck.ok, `stuck 是急救通道，不该被锁堵死，实际：${JSON.stringify(stuck)}`).toBe(true);
    } finally {
      stopAll();
      cleanup();
    }
  });

  it("排空的消息进 wf/ 台账（D-30：槽位是锁可释放，待办不能丢）", async () => {
    const { root, stopAll, cleanup } = setup("arch", "a9g-ledger");
    try {
      expect(verdict(root).ok).toBe(true);
      await waitFor(() => peek(root, "human") === null);

      const text = readFileSync(channelPaths(root).humanLedger, "utf-8");
      expect(text).toContain("verdict_pass");
      expect(text).toContain("M1");
      // 人要能直接回答，所以 [human] 断言的问题原文必须留在台账里
      expect(text).toContain("M1.2");
    } finally {
      stopAll();
      cleanup();
    }
  });

  it("dev / tester 窗口不碰 human 槽位（只有代理代排）", async () => {
    for (const role of ["dev", "tester"] as const) {
      const { root, stopAll, cleanup } = setup(role, `a9g-not-${role}`);
      try {
        expect(verdict(root).ok).toBe(true);
        // 若错误地也排空，poll 40ms 早该触发
        await waitFor(() => peek(root, "human") === null, 300).catch(() => undefined);
        expect(peek(root, "human")?.type, `${role} 窗口不该消费人的收件箱`).toBe("verdict_pass");
      } finally {
        stopAll();
        cleanup();
      }
    }
  });
});
