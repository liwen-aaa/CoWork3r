/**
 * A1 角色激活：WF_ROLE 带尾随空格 → 告警文本含 JSON 表示的**实际值**
 *
 * 老仓库那次事故：`set WF_ROLE=arch `（行尾一个空格）导致窗口静默不激活，
 * 症状是「窗口开着但没有就绪通知」，排查半天还归因错了一半（同时还有 --skill
 * 路径错，两个静默故障叠在一起）。
 *
 * 守法是 `JSON.stringify`——`WF_ROLE=arch ` 打出来是 `"arch "`，空格可见。
 * 告警必须把**实际收到的值**按 JSON 表示打出来，不能是「角色不匹配」这种
 * 让人去猜的话。
 *
 * 激活检查在 `wire` 内部（三份 extensions 只做 `wire("arch", pi)` 一行，
 * 逻辑只写一份）。`wire(role, pi)` 与 env 不符 → 告警 + 不注册任何东西。
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { wire } from "../../src/adapter/index.ts";
import { fakePi } from "./_fixture.ts";

describe("A1 角色激活：尾随空格", () => {
  afterEach(() => {
    delete process.env.WF_ROLE;
    vi.restoreAllMocks();
  });

  it('WF_ROLE="arch "（尾随空格）→ 告警含带引号的 "arch "', () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.WF_ROLE = "arch ";
    wire("arch", fakePi());
    const called = warn.mock.calls.map((c) => c.join(" ")).join("\n");
    // 告警文本必须含 `"arch "`（JSON 表示，引号可见）——不是「角色不匹配」这种含糊话
    expect(called).toContain('"arch "');
  });

  it("尾随空格时窗口不注册任何东西（静默故障的可见化）", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.WF_ROLE = "arch ";
    const pi = fakePi();
    wire("arch", pi);
    expect(pi.tools.length).toBe(0);
    expect(pi.handlers.size).toBe(0);
    expect(pi.commands.length).toBe(0);
  });
});
