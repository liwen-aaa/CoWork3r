/**
 * A9 注入缝：pi 在 src/ 里只以类型存在；状态与注册双隔离
 *
 * 两半，分工不同（07-adapter.md）：
 *   前半（grep）：水位线很低，只拦值导入，`import type { ExtensionAPI }` 合法。
 *     拦的是「pi 作为值进来」——常量、工厂函数、任何有运行时的东西。
 *   后半（同进程 wire 三次）：这是 e2e 的前提，不是洁癖。模块级可变状态一出现，
 *     三个角色同进程加载就共享同一份——root 互不相同验状态隔离，工具注册不串验
 *     注册隔离。两半全绿才能说 M6 的 e2e 能写。
 *
 * 后半的 root 从 ctx.cwd 来：wire 不得把 root 存进模块作用域（D-07 的实义）。
 * 事件在**临时项目**里触发（仓库根没有 wf 配置，readState 会静默返回空态）。
 */
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { wire } from "../../src/adapter/index.ts";
import { peek, writeState } from "../../src/channel/index.ts";
import { sendTaskSchema } from "../../src/protocol/index.ts";
import { fakePi, makeProject, realConfig, installPlan, assertParamsMatchSchema } from "./_fixture.ts";

const ROOT = process.cwd();

describe("A9 注入缝", () => {
  it("grep：src/ 里 @earendil-works/pi-coding-agent 只以 import type 出现", () => {
    const out = execSync(
      `grep -rn "@earendil-works/pi-coding-agent" src/ | grep -v "import type" || true`,
      { cwd: ROOT, encoding: "utf-8" },
    );
    expect(out).toBe("");
  });

  it("同进程 wire() 三次 → A 的 fake pi 上没收到过 B 的事件（注册隔离）", () => {
    const p = makeProject("a9-events");
    try {
      realConfig(p.root, { plan: installPlan(p.root) });
      writeState(p.root, { milestone: "M1", round: 1, maxRounds: 5, consecutiveFails: 0 });

      const piA = fakePi();
      const piB = fakePi();
      wire("arch", piA as never);
      wire("dev", piB as never);

      // 触发 A 的 agent_end：只有 A 的 sent 被追加，B 不受影响
      const beforeB = piB.sent.length;
      piA.emit("agent_end", {}, { cwd: p.root, mode: "tui" });
      expect(piA.sent.length).toBeGreaterThan(beforeB);
      expect(piB.sent.length).toBe(beforeB);
    } finally {
      p.cleanup();
    }
  });

  it("A 的 fake pi 上没收到过 B 注册的工具（注册隔离，反向）", () => {
    const p = makeProject("a9-reverse");
    try {
      realConfig(p.root, { plan: installPlan(p.root) });
      writeState(p.root, { milestone: "M1", round: 1, maxRounds: 5, consecutiveFails: 0 });

      const piA = fakePi();
      const piB = fakePi();
      wire("dev", piA as never);
      wire("dev", piB as never);

      // 同一角色两次 wire：工具数相同，但各自数组独立（不共享模块级注册表）
      expect(piA.tools.length).toBe(piB.tools.length);
      expect(piA.handlers).not.toBe(piB.handlers);

      // 触发 B 的事件，A 的 sent 不动
      const beforeA = piA.sent.length;
      piB.emit("agent_end", {}, { cwd: p.root, mode: "tui" });
      expect(piB.sent.length).toBeGreaterThan(0);
      expect(piA.sent.length).toBe(beforeA);
    } finally {
      p.cleanup();
    }
  });

  it("send_task 工具面 = sendTaskSchema(role)：dev 的 schema 里没有 arch 的 type", () => {
    // M6.5 的自动化部分：wire 注册的工具必须用 sendTaskSchema(role) 生成，
    // 不能退回手写空 schema——否则「越权在类型层不可能」就只剩文档了。
    // 真窗口验 pi 序列化那层仍留人工（M6.5 [human]）。
    const pi = fakePi();
    wire("dev", pi as never);
    const def = pi.tools.find((t) => t.name === "send_task")?.def as Record<string, unknown>;
    expect(def).toBeDefined();
    expect(def.parameters).toEqual(sendTaskSchema("dev"));
    // dev 的 type 枚举只有 review_request，绝无 arch 的 type
    const params = def.parameters as { properties?: { type?: { enum?: string[] } } };
    const typeEnum = params.properties?.type?.enum;
    if (typeEnum) {
      expect(typeEnum).toContain("review_request");
      expect(typeEnum).not.toContain("task_assignment");
      expect(typeEnum).not.toContain("verification");
      expect(typeEnum).not.toContain("report");
    }
  });

  it("dev 单 type 时 execute 不传 type 也能投递（LLM 按 schema 调用）", async () => {
    // dev 的 schema 只有一个 type（review_request）→ 省略 type 字段，LLM 不会传。
    // execute 必须从 role 推导唯一 type——否则真窗口里 dev 永远投不出去
    // （build 抛「未知 type \"undefined\"」）。E1 手写 type 绕过了 schema 校验
    // 所以没逮到；这条模拟真实调用路径。
    const p = makeProject("a9-dev-single-type");
    try {
      realConfig(p.root, { plan: installPlan(p.root) });
      writeState(p.root, { milestone: "M1", round: 1, maxRounds: 5, consecutiveFails: 0 });
      const pi = fakePi();
      wire("dev", pi as never);
      const def = pi.tools.find((t) => t.name === "send_task")?.def as
        | { parameters?: unknown; execute: (...args: unknown[]) => Promise<unknown> | unknown }
        | undefined;
      if (!def?.execute) throw new Error("send_task 工具未注册");
      // 按 schema 调用：不传 type（schema 里也没有 type 字段）
      const input = { milestone: "M1", body: "做完了", artifact: "wf/dev-output-M1.md" };
      // 真实 pi 会先校验参数（additionalProperties/required），直调 execute 会绕过——
      // 这里把校验搬回调用路径（M6-004 / D-25），schema 与参数脱钩立刻红。
      assertParamsMatchSchema(def.parameters, input);
      const r = def.execute("a9", input, undefined, undefined, {
        cwd: p.root,
      });
      if (r && typeof r === "object" && "then" in r) await r;
      const got = peek(p.root, "tester");
      expect(got?.type).toBe("review_request");
    } finally {
      p.cleanup();
    }
  });

  it("同一角色 wire 两次 → 两份独立注册（重复加载也隔离）", () => {
    const pi1 = fakePi();
    const pi2 = fakePi();
    wire("dev", pi1 as never);
    wire("dev", pi2 as never);
    expect(pi1.tools.length).toBe(pi2.tools.length);
    expect(pi1.sent.length).toBe(0); // 没触发事件就不该有副作用
  });
});
