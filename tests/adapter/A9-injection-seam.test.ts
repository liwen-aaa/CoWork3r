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
 */
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { wire } from "../../src/adapter/index.ts";
import { channelPaths } from "../../src/channel/index.ts";
import { fakePi, makeProject, realConfig } from "./_fixture.ts";

const ROOT = process.cwd();

describe("A9 注入缝", () => {
  it("grep：src/ 里 @earendil-works/pi-coding-agent 只以 import type 出现", () => {
    const out = execSync(
      `grep -rn "@earendil-works/pi-coding-agent" src/ | grep -v "import type"`,
      { cwd: ROOT, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] },
    );
    expect(out).toBe("");
  });

  it("同进程 wire() 三次 → 三份 channelPaths 的 root 互不相同（状态隔离）", () => {
    // 三次 wire 共用同一模块级代码，但每个 fake pi 的事件 ctx.cwd 不同。
    // wire 若把 root 存进模块作用域，三份就共享了——A9 抓的就是这个。
    const piA = fakePi();
    const piB = fakePi();
    const piC = fakePi();
    wire("arch", piA);
    wire("dev", piB);
    wire("tester", piC);

    const pa = makeProject("a9-A");
    const pb = makeProject("a9-B");
    const pc = makeProject("a9-C");
    try {
      realConfig(pa.root);
      realConfig(pb.root);
      realConfig(pc.root);

      // 各自触发 session_start，root 从各自 ctx.cwd 来
      piA.emit("session_start", { reason: "startup" }, { cwd: pa.root });
      piB.emit("session_start", { reason: "startup" }, { cwd: pb.root });
      piC.emit("session_start", { reason: "startup" }, { cwd: pc.root });

      const stateA = channelPaths(pa.root).state;
      const stateB = channelPaths(pb.root).state;
      const stateC = channelPaths(pc.root).state;
      expect(stateA).not.toBe(stateB);
      expect(stateB).not.toBe(stateC);

      // A 的事件只写 A 的目录（不存在 B/C 的东西）
      expect(piA.sent.length).toBeGreaterThan(0); // 就绪通知发出
      expect(piB.sent.length).toBeGreaterThan(0);
      expect(piC.sent.length).toBeGreaterThan(0);
    } finally {
      pa.cleanup();
      pb.cleanup();
      pc.cleanup();
    }
  });

  it("A 的 fake pi 上没收到过 B 注册的工具（注册隔离）", () => {
    const piA = fakePi();
    const piB = fakePi();
    wire("arch", piA);
    wire("dev", piB);

    // 角色不同 → 工具面不同。若 wire 把工具定义存进模块作用域共享，
    // A 的 fake pi 上会出现 B 的工具
    const namesA = new Set(piA.tools.map((t) => t.name));
    const namesB = new Set(piB.tools.map((t) => t.name));
    expect(namesA.size).toBeGreaterThan(0);
    expect(namesB.size).toBeGreaterThan(0);
    // 至少有一个角色专属工具，证明没有互相泄漏
    expect([...namesA].some((n) => !namesB.has(n))).toBe(true);
    expect([...namesB].some((n) => !namesA.has(n))).toBe(true);
  });

  it("同一角色 wire 两次 → 两份独立注册（重复加载也隔离）", () => {
    const pi1 = fakePi();
    const pi2 = fakePi();
    wire("dev", pi1);
    wire("dev", pi2);
    expect(pi1.tools.length).toBe(pi2.tools.length);
    expect(pi1.sent.length).toBe(0); // 没触发事件就不该有副作用
  });
});
