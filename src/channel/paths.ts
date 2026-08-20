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
 * ```
 *
 * 两处分离的判据：**人会读的进 `wf/`，机器水位进 `.pi/messages/`**。
 * 老仓库把计数文件混在 logs/ 里，于是「日志目录」既是产物又是资产，.gitignore 说不清。
 */
import { join } from "node:path";

import type { Role } from "../protocol/message";

export type ChannelPaths = {
  msgDir: string;
  wfDir: string;
  inbox: (role: Role) => string;
  state: string;
  processed: (role: Role) => string;
  counters: (role: Role) => string;
  sourceBaseline: string;
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
  };
}
