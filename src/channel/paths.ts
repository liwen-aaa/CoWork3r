/**
 * 路径常量与派生。**唯一知道文件叫什么名字的地方。**
 *
 * 任何其它文件里出现收件箱文件名即为违反（**注释也算**：改名时 grep 不到它）。
 * plan.md M1 有一条 grep 断言查这件事，而它真的在 routes.ts 的一句注释里抳到过一次。
 *
 * 磁盘布局：
 * ```
 * <root>/.pi/messages/     机器状态：人不需要读，进 .gitignore
 *   to-<role>.json         单槽位收件箱（含伪角色 human：有收件箱、无窗口）
 *   state.json             协作状态
 *   .processed-<role>      水位标记（mtime 数字）
 *   counters-<role>.json   跳轮计数
 *   source-baseline.json   快照基线（由 05-gates 写，本层只提供原子写）
 * <root>/wf/               人要读、要进 git 的记录
 *   human-pending.md       待人工台账（arch 代排 human 槽位后追加，见 humanLedger）
 * ```
 *
 * `to-human.json` 与 `wf/human-pending.md` 的分工是这里唯一需要解释的一处：
 * **槽位是锁**（单槽位 O_EXCL，占着就投不进第二条），**台账是待办**（不丢、进 git）。
 * human 是伪角色，没有窗口去消费自己的槽位，于是锁永远不释放——2026-08-24 实测：
 * 人说「不行」后 tester 再报 PASS 投不出去，`stuck` 急救通道同时被堵。所以 arch
 * 作为人的代理代排槽位（07-adapter 的 wireHumanDrain），排出来的东西落这份台账。
 * 只清不记 = 待办静默消失；只记不清 = 锁还在。两半都是必需的。
 *
 * 两处分离的判据：**人会读的进 `wf/`，机器水位进 `.pi/messages/`**。
 * 老仓库把计数文件混在 logs/ 里，于是「日志目录」既是产物又是资产，.gitignore 说不清。
 */
import { join } from "node:path";

import type { Role } from "../protocol/message.ts";

export type ChannelPaths = {
  msgDir: string;
  wfDir: string;
  inbox: (role: Role) => string;
  state: string;
  processed: (role: Role) => string;
  counters: (role: Role) => string;
  sourceBaseline: string;
  /** 待人工台账（人读、进 git）。槽位被 arch 代排后追加到这里 */
  humanLedger: string;
};

export function channelPaths(root: string): ChannelPaths {
  const msgDir = join(root, ".pi", "messages");
  return {
    msgDir,
    wfDir: join(root, "wf"),
    inbox: (role) => join(msgDir, `to-${role}.json`),
    state: join(msgDir, "state.json"),
    processed: (role) => join(msgDir, `.processed-${role}`),
    counters: (role) => join(msgDir, `counters-${role}.json`),
    sourceBaseline: join(msgDir, "source-baseline.json"),
    humanLedger: join(root, "wf", "human-pending.md"),
  };
}
