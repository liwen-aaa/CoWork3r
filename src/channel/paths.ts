/**
 * 路径常量与派生。**唯一知道文件叫什么名字的地方。**
 *
 * 任何其它文件里出现字符串 "to-dev.json" 即为违反——plan.md M1 有一条 grep 断言查它。
 *
 * 两处分离的判据：人会读的进 `wf/`，机器水位进 `.pi/messages/`。
 * 老仓库把计数文件混在 logs/ 里，「日志目录」既是产物又是资产，.gitignore 说不清。
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
