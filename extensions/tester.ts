/**
 * tester 窗口入口。读 WF_ROLE，是 tester 才接线（否则告警/静默）。
 * 角色检查在这份文件的重复是**已知取舍**（07-adapter.md）：三个入口几乎一样，
 * 不合并成一个，因为 pi 按文件发现扩展，一个窗口只加载自己那份。
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { wire } from "../src/adapter/index.ts";

export default function (pi: ExtensionAPI): void {
  const env = process.env.WF_ROLE ?? "";
  if (env !== "tester") {
    if (env !== "") {
      console.warn(`⛔ WF_ROLE=${JSON.stringify(env)} 不是本窗口角色（tester）。本窗口未激活。`);
    }
    return;
  }
  wire("tester", pi);
}
