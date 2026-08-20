/**
 * M1 人工验证：拔掉 fs.watch 后，轮询兜底在真实 node 进程里仍然唤醒
 *
 * ── 为什么需要人跑一次（plan.md M1 那条 [human]）──────────────────
 * C1 与 C1-wake-source 验的是**函数行为**：mock 掉事件通道，断言 onMessage 被调用。
 * 它们证明不了一件事——真实进程的事件循环里，setInterval 会不会被别的东西饿死。
 * vitest 环境和真实 pi 窗口不是一回事：前者有自己的调度、可能有 fake timer 的残留、
 * 进程生命周期由测试框架掌管。
 *
 * 这条断言要的就是那个差别：**你自己的眼睛在一个普通 node 进程里看到轮询触发。**
 *
 * ── 怎么跑 ────────────────────────────────────────────────────
 *   node tests/manual/M1-poll-fallback.mjs
 *
 * 然后**不要碰键盘**，等着。约 12 秒内应看到：
 *
 *   [0.0s] 监听已启动（fs.watch = 已禁用，轮询周期 = 10s）
 *   [0.1s] 已投递 task_assignment → to-dev.json（此刻起不要碰键盘）
 *   [x.xs] ✅ 唤醒来源 = poll   ← 关键：必须是 poll，不是 event 也不是 catchup
 *   [x.xs] 收到 M1 task_assignment
 *   判定：PASS（轮询兜底在真实进程里生效，耗时 x.x 秒）
 *
 * ── 怎么判 ────────────────────────────────────────────────────
 * PASS 的条件三条全中：
 *   1. 唤醒来源打印的是 `poll`
 *   2. 耗时 ≥ 10 秒（说明是轮询周期到了，不是别的机制抢先）
 *   3. 全程没有 fs.watch 参与（脚本已 watch: null，不需要你确认）
 *
 * 任何一条不中就是 FAIL，把输出贴回来。
 * 卡死超过 30 秒也是 FAIL —— 说明 setInterval 在真实进程里没跑起来。
 *
 * 这个脚本不进 npm test：它要真等 10 秒，而套件有「30 秒内跑完」的约束。
 * 它是一次性的人工凭证，跑完把输出贴进 wf/ 或提交信息即可。
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { deliver, watchInbox } from "../../src/channel/index.ts";
import { ROUTES } from "../../src/protocol/routes.ts";

const t0 = Date.now();
const at = () => `[${((Date.now() - t0) / 1000).toFixed(1)}s]`;

const root = mkdtempSync(join(tmpdir(), "wf-M1-manual-"));
let stop;

const finish = (verdict, detail) => {
  stop?.();
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    /* Windows 上 watcher 未释放时会 EBUSY，不影响判定 */
  }
  console.log(`\n判定：${verdict}（${detail}）`);
  process.exit(verdict === "PASS" ? 0 : 1);
};

// 30 秒没动静 = setInterval 在真实进程里没跑
const deadline = setTimeout(() => {
  finish("FAIL", "30 秒内未被唤醒——轮询兜底在真实进程里没有生效");
}, 30_000);

stop = watchInbox(
  root,
  "dev",
  (msg) => {
    clearTimeout(deadline);
    console.log(`${at()} 收到 ${msg.milestone} ${msg.type}`);
    const elapsed = (Date.now() - t0) / 1000;
    if (elapsed < 9.5) {
      finish("FAIL", `耗时仅 ${elapsed.toFixed(1)}s，短于轮询周期——不是轮询唤醒的`);
    } else {
      finish("PASS", `轮询兜底在真实进程里生效，耗时 ${elapsed.toFixed(1)} 秒`);
    }
  },
  {
    watch: null, // 拔掉事件通道：Windows 漏事件时就是这个状态
    pollMs: 10_000, // 真实周期，不缩短——这条断言要的就是「真的等了 10 秒」
    catchupMs: 60_000, // 推远，确保不是启动补收抢到的
    onWake: (source) => {
      const mark = source === "poll" ? "✅" : "❌";
      console.log(`${at()} ${mark} 唤醒来源 = ${source}${source === "poll" ? "" : "（期望 poll）"}`);
      if (source !== "poll") finish("FAIL", `唤醒来源是 ${source}，不是 poll`);
    },
    onWarn: (m) => console.log(`${at()} ⚠️ ${m}`),
  },
);

console.log(`${at()} 监听已启动（fs.watch = 已禁用，轮询周期 = 10s）`);

deliver(
  root,
  {
    type: "task_assignment",
    from: "arch",
    to: ROUTES.task_assignment.to,
    milestone: "M1",
    round: 1,
    body: "人工验证用消息",
    at: new Date().toISOString(),
  },
  (msg) => (msg.to === ROUTES[msg.type].to ? { ok: true } : { ok: false, reason: "地址不符" }),
);

console.log(`${at()} 已投递 task_assignment → 收件箱（此刻起不要碰键盘，等约 10 秒）`);
