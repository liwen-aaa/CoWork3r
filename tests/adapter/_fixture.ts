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
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
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

/**
 * 源码文本搜索（node 原生，替代 execSync grep——M6-009：cmd 环境无 Git 的 grep，
 * 验收 gate 的 npm test 会崩）。语义与 `grep -rn <pattern> <dirs>` 一致：递归
 * 遍历目录、逐行匹配，返回 `文件:行号: 行内容`（断言失败时能定位）。
 * 模式必须是**非全局** RegExp（/g 会让 test 变成有状态）。
 */
export function grepLines(pattern: RegExp, dirs: string[]): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((e) => {
      const full = join(dir, e);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });
  const hits: string[] = [];
  for (const dir of dirs) {
    for (const f of walk(dir)) {
      readFileSync(f, "utf-8")
        .split(/\r?\n/)
        .forEach((line, i) => {
          if (pattern.test(line)) hits.push(`${f}:${i + 1}: ${line}`);
        });
    }
  }
  return hits;
}

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
      mkdirSync(join(full, ".."), { recursive: true });
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
 * 往临时项目里放一份真实规划书（D-25：adapter 的拦截链要 parsePlan，
 * 临时目录里没有 plan 文件的话 wire 会解析失败 → 拦截静默放行）。
 * 用 minimal 那份：一里程碑两断言，chain 跑得起来。
 */
export function installPlan(root: string, rel = "docs/plan.md"): string {
  const full = join(root, rel);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, readFileSync(join(REPO_ROOT, MINIMAL_PLAN), "utf-8"), "utf-8");
  return rel;
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
  const widgets: Array<{ name: string; lines: string[] }> = [];

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
    emit(
      event: string,
      payload: unknown,
      ctx: {
        cwd: string;
        mode?: "tui" | "print" | "rpc" | "json";
        /** agent_start 自检读它（wire 的注入自检，P1 的机制落点）——默认返回空串：
         *  检查方对「拿不到 prompt」的处置是静默，测试不必每个事件都传 */
        getSystemPrompt?: () => string;
      },
    ): unknown {
      const hs = handlers.get(event);
      if (!hs) return undefined;
      // agent_start 的注入自检会调 ctx.getSystemPrompt()——不传就补一个
      // 返回空串的默认（空串里没有特征串，检查方对「拿不到 prompt」是静默）
      // ui.setWidget：session_start 的常驻状态条（共识 ② widget）——wire 只调 setWidget，
      // 其它 ui 方法不猜（fakePi 原则②：新增 pi.xxx 调用就补同名记录器）
      const safeCtx = {
        getSystemPrompt: () => "",
        ui: {
          setWidget: (name: string, lines: string[]) => widgets.push({ name, lines }),
          notify: () => undefined, // 命令 handler 的输出口（/status 等）；断言看 research 的副作用而非弹窗
        },
        ...ctx,
      };
      let result: unknown;
      for (const h of hs) result = h(payload, safeCtx);
      return result;
    },
    /** 触发某条消息的唤醒路径：等价于 watchInbox 把消息交给 onMessage 后再清空 */
    wake(type: string, payload: unknown, ctx: { cwd: string }): unknown {
      return this.emit(type, payload, ctx);
    },
    /**
     * 工具 `execute` 拿到的 ctx。
     *
     * 真实 pi 给的是**完整的** `ExtensionContext`（`types.d.ts:371`：
     * `execute(id, params, signal, onUpdate, ctx: ExtensionContext)`），带 `ui.setWidget`
     * 与 `mode`。测试里直调 execute 时手拼 `{ cwd }` 就与真实脉冲脱钩（D-25）：
     * A12 第一版就因此误判「投递后不刷新」，而实际上是 ctx 里根本没 ui。
     * 所以统一从这里取，与 emit 的 safeCtx 同形状。
     */
    toolCtx(cwd: string, mode: "tui" | "print" | "rpc" | "json" = "tui") {
      return {
        cwd,
        mode,
        getSystemPrompt: () => "",
        ui: {
          setWidget: (name: string, lines: string[]) => widgets.push({ name, lines }),
          notify: () => undefined,
        },
      };
    },
    handlers,
    tools,
    commands,
    sent,
    widgets,
  };
}

export type FakePi = ReturnType<typeof fakePi>;

/**
 * 模拟 pi 的 JSON Schema 校验（execute 前）。
 *
 * 真实 pi 会对 send_task 的参数做 additionalProperties:false + required 校验
 * （M6-003 实测：多传 artifact 被拒 "must not have additional properties"）。
 * E1/A9 直调 execute 会绕过这层——测试只验证 wire 接线，schema 删字段照样绿
 * （D-25 反例，M6-004）。本 helper 把校验搬回测试调用路径：参数里有 schema
 * 不认识的键 / 缺必填 → 抛错（等同 pi 拒收），schema 与参数脱钩立刻红。
 */
export function assertParamsMatchSchema(schema: unknown, params: Record<string, unknown>): void {
  const s = schema as { properties?: Record<string, unknown>; required?: string[] };
  const props = s.properties ?? {};
  for (const key of Object.keys(params)) {
    if (!(key in props)) {
      throw new Error(`参数 ${key} 不在 send_task schema 里（additionalProperties: false 会拒）`);
    }
  }
  for (const key of s.required ?? []) {
    if (params[key] === undefined) {
      throw new Error(`参数缺必填 ${key}（send_task schema required）`);
    }
  }
}

/** 轮询等待（唤醒/落盘路径的时序断言用，A9d/E1）。20ms 步进，默认 3s 超时 */
export function waitFor(fn: () => boolean, timeoutMs = 3000): Promise<void> {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const tick = (): void => {
      if (fn()) return resolve();
      if (Date.now() - t0 > timeoutMs) return reject(new Error(`waitFor 超时（${timeoutMs}ms）`));
      setTimeout(tick, 20);
    };
    tick();
  });
}
