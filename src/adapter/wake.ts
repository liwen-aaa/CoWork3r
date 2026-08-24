/**
 * 唤醒接线（M6-010 的机制落点）：消息落盘 → 窗口收到通知。
 *
 * watchInbox（01-channel）存在且有测试（C1/C2/C3/C6），这里只做 adapter 侧接线：
 * session_start 启动、onMessage = 把消息内容带进 LLM 上下文（收件箱随后被 C2 清空，
 * 唤醒消息是窗口拿到内容的唯一通道）、onWake 打印触发源（M6.6 判据 1 的观测点：
 * 人要在真窗口看到「是轮询干的」，C1 人工断言的同一判据）。
 *
 * 句柄 keyed by root、per-wire 闭包持有——不存模块作用域（D-07 的实义：三个角色
 * 同进程加载时各持一份，root 互不干扰）。pi 只以类型存在（D-07）。
 *
 * 不负责：判定、消息格式、路径——都在下层。这里只有「唤醒」一件事。
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { watchInbox } from "../channel/index.ts";
import type { Stop, WatchOptions } from "../channel/watch.ts";
import type { Message, Role } from "../protocol/index.ts";

export type WakeOptions = {
  /** 唤醒监听实现。缺省 = channel 的真实 watchInbox（fs.watch + 10s 轮询兜底）。
   *  测试注入窄参数版（C1 同款：watch: null + 小 pollMs），消息仍走真实落盘（D-25） */
  watch?: (
    root: string,
    role: Role,
    onMessage: (msg: Message) => void,
    options: WatchOptions,
  ) => Stop;
  /** 唤醒日志口。缺省 console.log——触发源（catchup/event/poll）是人工观测点 */
  log?: (line: string) => void;
  /**
   * 一条消息处理完之后调一次（A12）。用于刷新常驼状态条：被唤醒 = 状态变了，
   * 而本层拿不到 `ctx.ui`（它只有 root 与 role），所以由 wire 传闭包进来。
   */
  onHandled?: () => void;
};

export type WakeHandle = {
  start: (cwd: string) => void;
  stopAll: () => void;
};

export function wireWake(role: Role, pi: ExtensionAPI, opts: WakeOptions = {}): WakeHandle {
  const stops = new Map<string, Stop>();

  const start = (cwd: string): void => {
    stops.get(cwd)?.(); // 同 root 重复 session_start（窗口重开）→ 先关旧的，防句柄泄漏
    const stop = (opts.watch ?? watchInbox)(
      cwd,
      role,
      (msg) => {
        pi.sendUserMessage(
          `wf: 收到 ${msg.type}（${msg.from} → ${role}${msg.milestone ? `，${msg.milestone}` : ""}）：\n${msg.body}`,
          { deliverAs: "followUp" },
        );
        opts.onHandled?.(); // 状态条跟上（A12）：消息到了就是状态变了
      },
      {
        onWake: (source, msg) =>
          (opts.log ?? console.log)(`[wf] ${role} 由 ${source} 唤醒（${msg.type}）`),
      },
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
