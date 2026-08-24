/**
 * 人的收件箱代排（A9g 的机制落点）：arch 作为人的代理排空 human 的槽位。
 *
 * ── 来源事故（2026-08-24 实测，通道级）──────────────────────
 * 共识 #4 把单槽位从「覆盖 + 告警」升级为「O_EXCL 禁止覆盖」之后，人的收件箱变成
 * **永久锁**：三个真角色的槽位由各自窗口的 watchInbox 消费清空，而 human 是伪角色
 * （有收件箱、无窗口、无 watcher），全套只有 `milestone_passed` 会 clearInbox。
 * 于是人说「不行」→ 修一轮 → tester 再报 PASS 时第二条 verdict_pass 投不出去；
 * arch 的 report 与 tester 的 stuck 同时被拒。最糟的是 stuck——它是「请人介入」的
 * 急救通道，恰好在等判定时被堵死。happy path 走 milestone_passed 自清，所以 E1 全绿。
 *
 * ── 为什么槽位与台账必须分开 ───────────────────────────────
 *   **槽位是锁**（human 的单槽位收件箱，路径在 01-channel 的 paths）：可释放，释放后通道恢复。
 *   **台账是待办**（`wf/human-pending.md`）：只增不改，进 git，人一眼能看见（D-30）。
 * 只清不记 = 待办静默消失（`/status` 的「待你判定」行本来就读那个槽位）；
 * 只记不清 = 锁还在，通道仍然不通。两半都是必需的，这也是本文件不叫「清空」的原因。
 *
 * ── 为什么消费方是 arch ────────────────────────────────────
 * 共识 ②：人只做看 / 说 / 确认，arch 是人的代理。代排是「代理」的直接推论——
 * 人不该为了让通道通而去删文件（那是窗口的事，human.md 明写）。dev / tester 不碰：
 * 它们排空等于替人消化判定请求，而判定权不在它们手上（D-01）。
 *
 * pi 只以类型存在（D-07）；句柄 keyed by root、per-wire 闭包持有，不存模块作用域。
 *
 * 不负责：判定、消息格式、路径——都在下层。这里只有「排空 + 记账」一件事。
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { appendHumanLedger, watchInbox } from "../channel/index.ts";
import type { Stop, WatchOptions } from "../channel/watch.ts";
import type { Message, Role } from "../protocol/index.ts";

export type DrainOptions = {
  /** 唤醒监听实现。缺省 = channel 的真实 watchInbox（与 wake.ts 同一注入口） */
  watch?: (
    root: string,
    role: Role,
    onMessage: (msg: Message) => void,
    options: WatchOptions,
  ) => Stop;
  /** 代排一条、且槽位已释放（C2 清空）之后调一次（A12）：状态条的「待你判定」要跟上 */
  onHandled?: () => void;
};

export type DrainHandle = {
  start: (cwd: string) => void;
  stopAll: () => void;
};

/**
 * 挂 human 槽位的代排。`role !== "arch"` 时返回空句柄——判定「谁代排」的唯一处。
 *
 * 排空后**不**给 arch 窗口发 sendUserMessage：人的判定请求不是 arch 的任务
 * （替人回答就是 D-01 的形状）。arch 需要知道时从 `/status` 与启动简报读台账。
 */
export function wireHumanDrain(
  role: Role,
  _pi: ExtensionAPI,
  opts: DrainOptions = {},
): DrainHandle {
  const stops = new Map<string, Stop>();
  if (role !== "arch") return { start: () => undefined, stopAll: () => undefined };

  const start = (cwd: string): void => {
    stops.get(cwd)?.(); // 同 root 重复 session_start（窗口重开）→ 先关旧的，防句柄泄漏
    const stop = (opts.watch ?? watchInbox)(
      cwd,
      "human",
      (msg) => {
        appendHumanLedger(cwd, msg);
        // 刷新推到下一个 tick（A12）：此刻槽位还占着（C2 的清空在 onMessage 之后），
        // 当场刷会把同一条待办数两遍（台账 + 槽位）——实测显示「待你判定：2 条」。
        // 曾把 onHandled 当成 WatchOptions 往下传，watchInbox 不认它 → 静默丢弃（本轮实测抳到）。
        if (opts.onHandled !== undefined) setTimeout(opts.onHandled, 0);
      },
      {},
    );
    stops.set(cwd, stop);
  };

  return {
    start,
    stopAll: () => {
      for (const s of stops.values()) s();
      stops.clear();
    },
  };
}
