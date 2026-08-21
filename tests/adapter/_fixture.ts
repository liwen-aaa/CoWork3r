/**
 * tests/adapter/_fixture.ts — 适配器层测试的共用输入
 *
 * 三条硬约束，都来自 D-25：
 *
 * ① **不手写 Milestone / Config 字面量。** 走真实解析（tests/gates/_fixture 同形状）。
 * ② **fakePi 不猜 pi 的 API。** mock-pi 的清单 = `wire.ts` 碰了 pi 对象上的哪几个方法
 *    （plan.md M6 风险节明写：「M1–M5 之前写出来是猜」）。所以本文件的 fakePi 只提供
 *    wire 真正用到的方法，新增一个 `pi.xxx()` 调用就必须在这里补一个同名记录器——
 *    补不出来的那个方法说明 wire 在猜一个不存在的 API。
 * ③ **fakePi 的 emit 是同步的。** wire 的 handler 全同步（读文件、查表、判 result），
 *    只有 `ctx` 里的东西可能是异步。同步 emit 让「触发事件 → 断言副作用」没有竞态。
 *
 * root 从哪里来：**从 ctx.cwd**。wire 不得把 root 存进模块作用域（D-07 的实义——
 * 同进程三个角色各持一份 root，A9 验的就是这个）。
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { inspectConfig } from "../../src/config/index.ts";
import { channelPaths } from "../../src/channel/index.ts";
import { milestone, parsePlan } from "../../src/plan/index.ts";
import type { Config } from "../../src/config/index.ts";
import type { Milestone } from "../../src/plan/index.ts";

export const REPO_ROOT = process.cwd();

/** 语法下限那份。M1 两条断言（一 auto 一 human）—— 与 gates 层同一个来源 */
export const MINIMAL_PLAN = "templates/plan.minimal.md";

export function realMilestone(id = "M1"): Milestone {
  const r = parsePlan(REPO_ROOT, MINIMAL_PLAN);
  if (!r.ok) throw new Error(`前提失败：${MINIMAL_PLAN} 解析不了 —— ${JSON.stringify(r.errors)}`);
  const m = milestone(r.plan, id);
  if (!m) throw new Error(`前提失败：${MINIMAL_PLAN} 里没有 ${id}`);
  return m;
}

/** 临时项目根。adapter 要读配置、写收件箱/状态、写产出文件 */
export function makeProject(label: string): {
  root: string;
  file: (rel: string, content: string) => string;
  cleanup: () => void;
} {
  const root = mkdtempSync(join(tmpdir(), `wf-adapter-${label}-`));
  mkdirSync(channelPaths(root).msgDir, { recursive: true });
  return {
    root,
    file: (rel, content) => {
      const full = join(root, rel);
      writeFileSync(full, content, "utf-8");
      return rel;
    },
    cleanup: () => {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        /* Windows EBUSY 不该让用例红 */
      }
    },
  };
}

/** 真实 Config：模板 + 补丁，经 inspectConfig 读回（同 tests/gates/_fixture） */
export function realConfig(
  root: string,
  patch: Record<string, unknown> = {},
): { cfg: Config | null; diagnostics: ReturnType<typeof inspectConfig>["diagnostics"] } {
  const tpl = JSON.parse(readFileSync(join(REPO_ROOT, "templates/wf.config.json"), "utf-8"));
  writeFileSync(join(root, "wf.config.json"), JSON.stringify({ ...tpl, ...patch }, null, 2), "utf-8");
  return inspectConfig(root);
}

/**
 * fakePi：wire() 要碰的 pi 方法的记录器。
 *
 * 每个方法名都对应 pi 文档里 ExtensionAPI 的真实成员（on / registerTool /
 * registerCommand / sendUserMessage）。wire 注册什么，测试就能查什么。
 *
 * `emit` 触发已注册的 handler。事件 → handler(event, ctx)，ctx 里必须带 cwd
 * （root 的唯一合法来源）。
 */
export function fakePi() {
  const handlers = new Map<string, Set<(...args: unknown[]) => unknown>>();
  const tools: Array<{ name: string; def: unknown }> = [];
  const commands: Array<{ name: string; def: unknown }> = [];
  const sent: Array<{ text: string; opts?: unknown }> = [];

  return {
    on(event: string, handler: (...args: unknown[]) => unknown) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
      return this;
    },
    registerTool(def: { name: string } & Record<string, unknown>) {
      tools.push({ name: def.name, def });
    },
    registerCommand(name: string, def: unknown) {
      commands.push({ name, def });
    },
    sendUserMessage(text: string, opts?: unknown) {
      sent.push({ text, opts });
    },
    /** 同步触发。handler 返回值原样返回（拦截链的 {block, reason} 就走这里） */
    emit(event: string, payload: unknown, ctx: { cwd: string }): unknown {
      const hs = handlers.get(event);
      if (!hs) return undefined;
      let result: unknown;
      for (const h of hs) result = h(payload, ctx);
      return result;
    },
    /** 触发某条消息的唤醒路径：等价于 watchInbox 把消息交给 onMessage 后再清空 */
    wake(type: string, payload: unknown, ctx: { cwd: string }): unknown {
      return this.emit(type, payload, ctx);
    },
    handlers,
    tools,
    commands,
    sent,
  };
}

export type FakePi = ReturnType<typeof fakePi>;
