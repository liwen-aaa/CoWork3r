/**
 * FLOW 返回值消费（自检缺陷 #3 的回归防线，wire.ts 瘦身拆出）。
 *
 * `deliverMsg` 投递成功后调它：FLOW 返回值里的 `escalate` / `stuck` 代表
 * 「除了收件人之外还要发消息」——escalation 给 arch（阈值升级）、stuck 给人
 * （连续失败达上限）。曾因返回值被丢弃，两个信号从不发生（A5/A4 只验「信号被
 * 生产」，A10 验「信号被消费」）。
 *
 * 尽力而为：代发失败不阻塞主投递（单槽位锁下目标非空就跳过，下轮 fix_request
 * 会再触发 bumpCounters 重报）。
 */
import { build, checkRoute } from "../protocol/index.ts";
import { deliver } from "../channel/index.ts";
import type { FlowResult } from "./flow.ts";

export function consumeFlowSignals(root: string, flow: FlowResult, milestone: string): void {
  if (flow.escalate !== undefined && flow.escalate.length > 0) {
    deliver(
      root,
      build("escalation", "tester", {
        milestone,
        body: `同一问题反复出现：${flow.escalate.join("、")}。疑似架构假设错了，请 arch 裁决`,
      }),
      checkRoute,
    );
  }
  if (flow.stuck) {
    deliver(
      root,
      build("stuck", "tester", {
        milestone,
        body: "连续失败达上限，dev 反复修不好，请人介入",
      }),
      checkRoute,
    );
  }
}
