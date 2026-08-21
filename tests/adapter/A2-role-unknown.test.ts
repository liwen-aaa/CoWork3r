/**
 * A2 角色激活：未知角色 → 告警；未配 → 静默
 *
 * 两种「没有」必须区分（与 G5 同一条判据在适配器层的形态）：
 *   WF_ROLE=foo → 设了但不认识 → **告警**（设错了不能无声）
 *   WF_ROLE="" / 未设 → 没配 → **静默**（单窗口降级是合法的，不该吵）
 *
 * 老仓库这里是 `if (ROLE !== "arch") return;`——静默，于是那次事故
 * 「窗口开着但没有就绪通知」无任何信号。
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { wire } from "../../src/adapter/index.ts";
import { fakePi } from "./_fixture.ts";

describe("A2 角色激活：未知与未配", () => {
  afterEach(() => {
    delete process.env.WF_ROLE;
    vi.restoreAllMocks();
  });

  it('WF_ROLE=foo → 告警，且列出已知角色（人得知道去哪改）', () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.WF_ROLE = "foo";
    wire("arch", fakePi());
    const called = warn.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(called).toContain("foo");
    expect(called).toMatch(/arch|dev|tester/);
  });

  it('WF_ROLE="" → 不告警（未配是合法的：单窗口降级不该吵）', () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    delete process.env.WF_ROLE;
    wire("arch", fakePi());
    expect(warn).not.toHaveBeenCalled();
  });
});
