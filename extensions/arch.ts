/**
 * arch 窗口入口。读 WF_ROLE，匹配才接线。
 * 三份入口几乎一样（不合并：pi 按文件发现扩展，一个窗口只加载自己那份，
 * 差异全部在 activate 的 role 参数）。激活判定在 src/adapter/activate.ts。
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { activate } from "../src/adapter/index.ts";

export default function (pi: ExtensionAPI): void {
  activate("arch", pi);
}
