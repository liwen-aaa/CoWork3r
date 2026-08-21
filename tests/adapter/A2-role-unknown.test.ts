/**
 * A2 角色激活：未知角色 → 告警；未配 / 已知角色不匹配 → 静默
 *
 * 三种情况必须区分（与 G5 同一条判据在适配器层的形态）：
 *   WF_ROLE=foo           → 设了但不认识 → **告警**（设错了不能无声）
 *   WF_ROLE=arch（已知，但本文件是 dev）→ **静默**——pi 会加载整个
 *     extensions/ 目录，arch 窗口里 dev.ts 也被执行。这不是配错，是
 *     pi 的加载方式。trio.bat 只给本窗口设了正确的 env。
 *   WF_ROLE="" / 未设      → **静默**（单窗口降级是合法的，不该吵）
 *
 * 老仓库是 `if (ROLE !== "arch") return;`——静默，于是那次事故
 * 「窗口开着但没有就绪通知」无任何信号。
 *
 * 判据在 src/adapter/activate.ts（三份 extensions 共用），这里测 dev 入口。
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import devExt from "../../extensions/dev.ts";
import { fakePi } from "./_fixture.ts";

describe("A2 角色激活：未知与未配", () => {
  afterEach(() => {
    delete process.env.WF_ROLE;
    vi.restoreAllMocks();
  });

  it('WF_ROLE=foo → 告警，且列出已知角色（人得知道去哪改）', () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.WF_ROLE = "foo";
    devExt(fakePi() as never);
    const called = warn.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(called).toContain("foo");
    expect(called).toMatch(/arch|dev|tester/);
    // 设错了不能静默注册
    const pi = fakePi();
    devExt(pi as never);
    expect(pi.tools.length).toBe(0);
  });

  it('WF_ROLE="" → 不告警（未配是合法的：单窗口降级不该吵）', () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    delete process.env.WF_ROLE;
    devExt(fakePi() as never);
    expect(warn).not.toHaveBeenCalled();
  });

  it('WF_ROLE=arch（已知角色但不是本文件角色）→ 静默（pi 全量加载的正常情况）', () => {
    // trio.bat 给 arch 窗口设 WF_ROLE=arch，但 pi 会加载整个 extensions/ 目录，
    // 于是 arch 窗口里 dev.ts / tester.ts 也被执行。它们看到 env=arch ≠ 自己，
    // 不该告警——这不是配错，是 pi 的加载方式。
    // 区分：未知值（foo）→ 告警；已知角色不匹配 → 静默。
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.WF_ROLE = "arch";
    devExt(fakePi() as never);
    expect(warn).not.toHaveBeenCalled();
    // 也不该接线（这个窗口是 arch，dev 文件不能抢着 wire）
    const pi = fakePi();
    devExt(pi as never);
    expect(pi.tools.length).toBe(0);
  });
});
