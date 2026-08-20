/**
 * 单槽位收件箱：读 / 写 / 条件清空。
 *
 * C7 覆盖前必须出声：inbox 非空时仍写入（不阻塞），但返回 `overwritten: true`。
 * 阻塞会让「上一条卡住」变成「后面全卡住」；告警把「可能丢消息」从无声变成可见信号。
 *
 * C8 写盘前二次校验地址：`validate` **由调用方注入**，不 import 02-protocol 的实现。
 * 理由不是「防自己写错」，是防腐化——老仓库那个 bug 的形态正是上层绕过声明直写错地址，
 * 而七处声明全部正确。让唯一的落盘口自己把一道，上层就没有绕路。
 *
 * ── 已知取舍：单槽位会丢消息 ────────────────────────────
 * 角色 A 连发两条给 B，B 还没处理，第二条覆盖第一条。
 *
 * 接受它，因为实际流转里每个方向同一时刻只有一条在飞（dev↔tester 严格交替）。
 * 换来的是：零基础设施、状态一眼可见（读一个 JSON 就是全部）、无需队列/锁/清理。
 * 覆盖不再静默——C7 把它变成可见信号。
 *
 * 升级触发（D-42）：出现并行里程碑，或同一方向真的需要排队。
 * 届时的正确做法是把单槽位文件换成**目录 + 序号文件**，不是引入消息队列中间件。
 */
import { existsSync, readFileSync } from "node:fs";

import type { Message, Role } from "../protocol/message";
import { writeTextAtomic } from "./atomic";
import { channelPaths } from "./paths";

/** C8：校验函数的**形状**在本层定义，**内容**由调用方给（M2 传 protocol 的 validate） */
export type Validate = (msg: Message) => { ok: true } | { ok: false; reason: string };

export type DeliverResult =
  | { ok: true; overwritten: boolean }
  | { ok: false; reason: string };

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
  // C7：非空即告警。用 peek 而不是 existsSync——被清空过的文件仍然存在
  const overwritten = peek(root, msg.to) !== null;
  writeTextAtomic(file, JSON.stringify(msg, null, 2));
  return { ok: true, overwritten };
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
  writeTextAtomic(file, "");
  return true;
}
