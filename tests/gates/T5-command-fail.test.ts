/**
 * T5 G-command：真跑命令
 *
 * tester 报 PASS 前真跑 `test`（配了 `gate` 也跑）。这道 gate 是「AI 谎报完成」
 * 最直接的堵法：不是问它测过了没有，是自己跑一遍看退出码。
 *
 * 三个实现细节在本文件钉住，全部来自老仓库的教训：
 *   ① 超时 —— 缺省 120s，且**必须可注入**，否则测「超时会不会挂住」得真等两分钟，
 *      而那种测试最后一定会被人调短或跳过（然后超时路径就没人测了）
 *   ② 输出只留尾部 —— reason 里塞一万行日志等于没有 reason
 *   ③ 异常不吞 —— 老仓库自己的防偷懒 gate 因为 `catch {}` 静默失效过，
 *      而且是人审查时发现的，不是 gate 自己报的
 *
 * D-32（环境即边界）在这里的形态：命令跑不起来是**报告**，不是重试。
 */
import { describe, expect, it } from "vitest";

import { G_command } from "../../src/gates/index.ts";
import { makeProject } from "./_fixture.ts";

/** 跨平台的成功/失败命令：node 一定在（本仓库 engines 要求 >=22） */
const OK_CMD = `node -e "console.log('all passed')"`;
const FAIL_CMD = `node -e "console.log('boom'); process.exit(1)"`;

describe("T5 G-command 真跑命令", () => {
  it("退出码 0 → 放行", () => {
    const p = makeProject("t5-ok");
    try {
      const r = G_command({ root: p.root, command: OK_CMD, timeoutMs: 30_000 });
      expect(r.ok).toBe(true);
    } finally {
      p.cleanup();
    }
  });

  it("退出码非 0 → block，reason 含输出尾部", () => {
    const p = makeProject("t5-fail");
    try {
      const r = G_command({ root: p.root, command: FAIL_CMD, timeoutMs: 30_000 });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.failedGate).toBe("G_command");
      expect(r.reason).toContain("boom");
    } finally {
      p.cleanup();
    }
  });

  it("退出码 0 但 pass 正则不匹配 → block", () => {
    const p = makeProject("t5-pass-re");
    try {
      const r = G_command({
        root: p.root,
        command: OK_CMD,
        timeoutMs: 30_000,
        passPattern: "ZZZ-不会出现",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toContain("ZZZ-不会出现");
    } finally {
      p.cleanup();
    }
  });

  it("pass 正则匹配 → 放行", () => {
    const p = makeProject("t5-pass-ok");
    try {
      const r = G_command({
        root: p.root,
        command: OK_CMD,
        timeoutMs: 30_000,
        passPattern: "(passed|PASS)",
      });
      expect(r.ok).toBe(true);
    } finally {
      p.cleanup();
    }
  });

  it("超时 → block 且明说是超时（timeoutMs 可注入，所以这条跑得快）", () => {
    const p = makeProject("t5-timeout");
    try {
      const r = G_command({
        root: p.root,
        command: `node -e "setTimeout(()=>{}, 10000)"`,
        timeoutMs: 300,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/超时|timeout/i);
    } finally {
      p.cleanup();
    }
  });

  it("命令根本不存在 → block 且报出来，不静默当成通过", () => {
    const p = makeProject("t5-nocmd");
    try {
      const r = G_command({
        root: p.root,
        command: "this-command-does-not-exist-wf",
        timeoutMs: 30_000,
      });
      expect(r.ok).toBe(false);
      // D-32：环境错误是报告，不是重试，也不是吞掉
      if (!r.ok) expect(r.reason.length).toBeGreaterThan(0);
    } finally {
      p.cleanup();
    }
  });

  it("shell 报错不是乱码（Windows 的 stderr 走系统代码页，不是 UTF-8）", () => {
    // 真实发生过：整理拦截文案时发现这条 reason 是
    // `'wf-no-such-command' \uFFFD\uFFFD\uFFFD\uFFFD\uFFFD在…`。cmd.exe 在中文系统上用 GBK
    // 写 stderr，而 spawnSync 的 `encoding: "utf-8"` 把它解成了替换字符。
    //
    // 这不是美观问题：本层存在的理由就是「拦住之后那句话要告诉人下一步干什么」，
    // 一堆乱码的 reason 等于没有 reason。
    const p = makeProject("t5-encoding");
    try {
      const r = G_command({
        root: p.root,
        command: "wf-definitely-not-a-command-xyz",
        timeoutMs: 30_000,
      });
      if (r.ok) throw new Error("应 block");
      // U+FFFD = 解码失败的替换字符。一个都不应该有
      expect(r.reason).not.toContain("\uFFFD");
      // 命令名（ASCII）任何编码下都该在，用作「确实拿到了 shell 报错」的前提
      expect(r.reason).toContain("wf-definitely-not-a-command-xyz");
    } finally {
      p.cleanup();
    }
  });

  it("普通 UTF-8 输出不被回退路径弄坏（中文测试名能原样输出）", () => {
    const p = makeProject("t5-utf8");
    try {
      const r = G_command({
        root: p.root,
        command: `node -e "console.log('断言未覆盖：M1.2'); process.exit(1)"`,
        timeoutMs: 30_000,
      });
      if (r.ok) throw new Error("应 block");
      expect(r.reason).toContain("断言未覆盖：M1.2");
    } finally {
      p.cleanup();
    }
  });

  it("输出很长时 reason 被截断（留尾部，因为报错在末尾）", () => {
    const p = makeProject("t5-long");
    try {
      const r = G_command({
        root: p.root,
        command: `node -e "for(let i=0;i<3000;i++)console.log('line'+i); process.exit(1)"`,
        timeoutMs: 30_000,
      });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.reason.length).toBeLessThan(2000);
      // 尾部而不是头部：失败信息几乎总在最后
      expect(r.reason).toContain("line2999");
      expect(r.reason).not.toContain("line0\n");
    } finally {
      p.cleanup();
    }
  });

  it("在项目根跑，不在仓库根跑（cwd 正确）", () => {
    const p = makeProject("t5-cwd");
    try {
      p.file("marker.txt", "here\n");
      const r = G_command({
        root: p.root,
        command: `node -e "require('node:fs').accessSync('marker.txt')"`,
        timeoutMs: 30_000,
      });
      expect(r.ok).toBe(true);
    } finally {
      p.cleanup();
    }
  });
});
