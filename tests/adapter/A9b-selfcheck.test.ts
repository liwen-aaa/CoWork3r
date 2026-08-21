/**
 * A9b 注入自检接线：agent_start 时特征串不在 → console.warn 告警（P1 的机制落点）
 *
 * R5 只测纯函数 specPresent()，文件头承诺「M6 负责把它挂到 agent_start 上并接
 * notify」。wire.ts 现在挂了 agent_start → checkInjectedSpec(ctx.getSystemPrompt())。
 * 本用例测的就是这条接线：正常注入后特征串在（不告警）；被后续扩展整体替换后
 * 特征串不在（告警，且告警文本含角色可定位）。
 *
 * fakePi 的 ctx.getSystemPrompt 默认返回空串（拿不到 prompt = 静默，不误报）。
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { wire } from "../../src/adapter/index.ts";
import { buildSystemPrompt } from "../../src/roles/index.ts";
import { fakePi } from "./_fixture.ts";

describe("A9b 注入自检接线", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("正常注入后触发 agent_start → 特征串在，不告警", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const pi = fakePi();
    wire("dev", pi as never);
    const prompt = buildSystemPrompt("dev", "base");
    pi.emit("agent_start", {}, { cwd: "/tmp/wf", mode: "tui", getSystemPrompt: () => prompt });
    expect(warn).not.toHaveBeenCalled();
  });

  it("被后续扩展整份替换 → 触发 agent_start 时特征串不在，告警且含角色", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const pi = fakePi();
    wire("dev", pi as never);
    const replaced = "某个扩展返回了一个全新的系统提示，没有拼接上游内容。";
    pi.emit("agent_start", {}, { cwd: "/tmp/wf", mode: "tui", getSystemPrompt: () => replaced });
    expect(warn).toHaveBeenCalled();
    const called = warn.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(called).toContain("wf-role-spec:dev"); // 告警必须能定位到角色
  });

  it("特征串在但角色不同 → 仍告警（按角色区分，装了 dev 的规约查 tester 应检出）", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const pi = fakePi();
    wire("tester", pi as never);
    const prompt = buildSystemPrompt("dev", "base"); // 只有 dev 的特征串
    pi.emit("agent_start", {}, { cwd: "/tmp/wf", mode: "tui", getSystemPrompt: () => prompt });
    expect(warn).toHaveBeenCalled();
  });
});
