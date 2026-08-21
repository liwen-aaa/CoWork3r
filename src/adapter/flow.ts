/**
 * 状态流转：收到什么 → 状态怎么变 → 下一步是谁。
 *
 * **这是整套东西里唯一的状态机，而且是确定性的**——不交给 LLM 判断
 * （老仓库 L14：arch 闲是设计不是浪费）。缺一个 type 就是「某条消息到了
 * 没人推进状态」的静默故障，所以 FLOW 必须覆盖 ROUTES 全部 9 个 type。
 *
 * 表（07-adapter.md）：
 *   task_assignment   round=1, fails=0, 存 assertionHash | dev 被唤醒
 *   verification      不变                             | dev 被唤醒
 *   review_request    不变                             | tester 被唤醒
 *   fix_request       round+=1, fails+=1               | dev 被唤醒；fails>=maxRounds → stuck
 *   verdict_pass      不变                             | 写人的收件箱（等判定）
 *   milestone_passed  round=1, fails=0                 | 清人的收件箱
 *   escalation        不变                             | arch 被唤醒
 *   report            不变                             | 写人的收件箱
 *   stuck             不变                             | 写人的收件箱
 *
 * 阈值升级：同一 issue 累计 ≥3 轮 → 自动发 escalation。计数走 01-channel 的
 * `bumpCounters`（落盘，重启不丢）——「实现问题反复出现 = 疑似架构假设错了」，
 * 这条完全机械，不需要谁来判断。
 *
 * 纯函数层：不碰 pi，不 import 其它业务层。输入消息由调用方 build 好
 * （02-protocol），本层只推进状态与返回「下一步该干什么」的信号。
 */
import type { Message, MsgType } from "../protocol/message.ts";
import { bumpCounters, readState, writeState } from "../channel/index.ts";
import { assertionHash } from "../plan/index.ts";
import type { Milestone } from "../plan/index.ts";

/** 同一 issue 出现几次 → 升级为架构疑点（07-adapter.md：≥3 轮） */
const ESCALATE_AFTER = 3;

export type FlowContext = {
  root: string;
  msg: Message;
  milestone: Milestone | null;
};

export type FlowResult = {
  /** 状态变化后应唤醒谁（含伪角色 human：写人的收件箱后提示人） */
  wake: "arch" | "dev" | "tester" | "human";
  /** 该发 escalation 的 issue id（达到阈值的那几个） */
  escalate?: string[];
  /** fails 达到 maxRounds → 转发 stuck 给人 */
  stuck?: boolean;
};

const noChange = (wake: FlowResult["wake"]): FlowResult => ({ wake });

/** 所有「收到 X 只是推进状态」的 type。真正读写状态的在下面几个函数里。 */
export const FLOW: Record<MsgType, (ctx: FlowContext) => FlowResult> = {
  task_assignment(ctx) {
    const hash = ctx.milestone ? assertionHash(ctx.milestone) : undefined;
    writeState(ctx.root, {
      milestone: ctx.msg.milestone ?? "",
      round: 1,
      consecutiveFails: 0,
      ...(hash !== undefined ? { assertionHash: hash } : {}),
    });
    return { wake: "dev" };
  },
  verification: () => noChange("dev"),
  review_request: () => noChange("tester"),
  fix_request(ctx) {
    const s = readState(ctx.root);
    const round = s.round + 1;
    const consecutiveFails = s.consecutiveFails + 1;
    writeState(ctx.root, { round, consecutiveFails });

    // 阈值升级：本次 fix_request 涉及的 issue id 计数，达到阈值 → escalation
    const ids = (ctx.msg.issues ?? []).map((i) => i.id);
    const crossed = bumpCounters(ctx.root, "tester", ids, ESCALATE_AFTER);
    const escalate = crossed.length > 0 ? { escalate: crossed } : {};

    // fails >= maxRounds → 连续失败达上限，转发 stuck 给人
    if (consecutiveFails >= s.maxRounds) {
      return { wake: "human", stuck: true, ...escalate };
    }
    return { wake: "dev", ...escalate };
  },
  verdict_pass: () => noChange("human"),
  milestone_passed(ctx) {
    writeState(ctx.root, { round: 1, consecutiveFails: 0 });
    return { wake: "arch" };
  },
  escalation: () => noChange("arch"),
  report: () => noChange("human"),
  stuck: () => noChange("human"),
};
