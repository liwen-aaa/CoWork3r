/**
 * 单槽位收件箱：读 / 写 / 条件清空。
 *
 * C7 单槽位是锁：inbox 非空时拒绝写入（不覆盖）。
 * 2026-08-24 之前是「覆盖 + overwritten 告警」，实测告警被上层丢弃（八处接线缺陷之一）；
 * 升级后「禁止覆盖」由 writeTextExclusive 的 O_EXCL 语义原子保证——三个窗口是三个进程，
 * 「检查 + 写」分离有竞态窗口，所以检查与写入合并成一个动作（文件名即锁，共识 #4）。
 * 拒绝的 reason 透传给 send_task 的 execute 抛错 → LLM 知道要等。
 *
 * C8 写盘前二次校验地址：`validate` **由调用方注入**，不 import 02-protocol 的实现。
 * 理由不是「防自己写错」，是防腐化——老仓库那个 bug 的形态正是上层绕过声明直写错地址，
 * 而七处声明全部正确。让唯一的落盘口自己把一道，上层就没有绕路。
 *
 * ── 已知取舍：单槽位会堵 ────────────────────────────
 * 角色 A 发消息给 B，B 还没处理，A 再发 → 被拒（reason「已存在」）。
 * 接受它，因为实际流转里每个方向同一时刻只有一条在飞（dev↔tester 严格交替）；
 * 换来的是：零基础设施、状态一眼可见（读一个 JSON 就是全部）、无需队列/锁/清理。
 * 阻塞把「上一条卡住」变成可见信号——窗口死了 A 会被拒并收到 reason，人能看见（D-30）。
 *
 * 升级触发（D-42）：出现并行里程碑，或同一方向真的需要排队。
 * 届时的正确做法是把单槽位文件换成**目录 + 序号文件**，不是引入消息队列中间件。
 */
import { existsSync, readFileSync, unlinkSync } from "node:fs";

import type { Message, Role } from "../protocol/message.ts";
import { writeTextExclusive } from "./atomic.ts";
import { channelPaths } from "./paths.ts";

/** C8：校验函数的**形状**在本层定义，**内容**由调用方给（M2 传 protocol 的 validate） */
export type Validate = (msg: Message) => { ok: true } | { ok: false; reason: string };

export type DeliverResult = { ok: true } | { ok: false; reason: string };

/** 读不消费。文件不存在 / 为空 / 坏掉 → null */
export function peek(root: string, role: Role): Message | null {
  try {
    const text = readFileSync(channelPaths(root).inbox(role), "utf-8");
    if (text.trim() === "") return null;
    const raw = JSON.parse(text) as unknown;
    return typeof raw === "object" && raw !== null ? (raw as Message) : null;
  } catch {
    return null;
  }
}

export function deliver(root: string, msg: Message, validate: Validate): DeliverResult {
  // C8：校验在**写之前**。顺序反了就等于「已经覆盖了再说不写」
  const v = validate(msg);
  if (!v.ok) return { ok: false, reason: v.reason };

  const file = channelPaths(root).inbox(msg.to);
  // C7：单槽位是锁。目标非空即拒绝——不覆盖（writeTextExclusive 原子保证，见 atomic.ts）
  return writeTextExclusive(file, JSON.stringify(msg, null, 2));
}

/**
 * C2 下半：条件清空。**只有当前内容仍是刚处理的那条时才清。**
 *
 * 四字段比对（from / type / milestone / round）。`to` 不进比对——读入口已经校过
 * （`msg.to !== role` 就不认）。
 *
 * 只清不比对 → 误删处理期间刚到的新消息；只比对不清 → 旧消息重放。两半都是必需的，
 * 而且这个结论是踩了才知道的。
 */
export function clearIfSame(root: string, role: Role, msg: Message): boolean {
  const now = peek(root, role);
  if (
    !now ||
    now.from !== msg.from ||
    now.type !== msg.type ||
    now.milestone !== msg.milestone ||
    now.round !== msg.round
  ) {
    return false;
  }

  const file = channelPaths(root).inbox(role);
  if (!existsSync(file)) return false;
  // 清空 = 删除文件（不是写空串）。锁的语义是「文件存在」——
  // writeTextExclusive 的 COPYFILE_EXCL 检查的也是存在；写空串会让文件仍在、锁不释放（C7）。
  try {
    unlinkSync(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * 无条件清空某角色的收件箱（删除文件 = 释放单槽位锁）。
 *
 * 与 clearIfSame 的分工：clearIfSame 比对四字段（防误删处理期间新消息），
 * 用于窗口消费路径；clearInbox 无条件删，用于「流程语义上该清了」的路径——
 * milestone_passed 放行后清 human 收件箱（flow 的表里写了、实现曾只 writeState）。
 */
export function clearInbox(root: string, role: Role): boolean {
  const file = channelPaths(root).inbox(role);
  try {
    if (existsSync(file)) unlinkSync(file);
    return true;
  } catch {
    return false;
  }
}
