/**
 * T1 G-plan：arch 分发前，里程碑可测吗
 *
 * 堵的是「断言不可测导致 tester 中途不知道拿什么判」。这道 gate 是 04-plan 的
 * `checkMilestone` 的挂载点——本层不重写判据，只负责把它接到 `send_task` 上，
 * 并把 reason 变成人能操作的文本（带行号）。
 *
 * 为什么 reason 必须带行号：老仓库的 `planQualityGate` 返回一个裸 false，
 * 四个里程碑全部通不过而没人发现，一半原因就是那个 false 不可操作。
 */
import { describe, expect, it } from "vitest";

import { G_plan } from "../../src/gates/index.ts";
import { REPO_ROOT, realMilestone } from "./_fixture.ts";
import { parsePlan } from "../../src/plan/index.ts";

describe("T1 G-plan 分发前自检", () => {
  it("真实模板的 M1 → 放行", () => {
    const m = realMilestone("M1");
    const r = G_plan({ root: REPO_ROOT, milestone: m });
    expect(r.ok).toBe(true);
  });

  it("已 passed 的里程碑 → block（D-14：验收后冻结，不许重新分发）", () => {
    // 本项目自己的 plan.md 里 M1 带 ✅，是真实的「已验收」输入
    const own = parsePlan(REPO_ROOT, "docs/plan.md");
    if (!own.ok) throw new Error("前提失败：本项目 plan.md 应解析成功");
    const passed = own.plan.milestones.find((m) => m.passed)!;
    const r = G_plan({ root: REPO_ROOT, milestone: passed });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain(passed.id);
    expect(r.failedGate).toBe("G_plan");
  });

  it("[auto] 断言无命令无路径 → block，reason 含该断言编号与行号", () => {
    const m = realMilestone("M1");
    // 只改被测那一条：把可测的 [auto] 换成空话（其余保持真实解析产物）
    const broken = {
      ...m,
      assertions: m.assertions.map((a) =>
        a.kind === "auto" ? { ...a, text: "把事情做完做好" } : a,
      ),
    };
    const r = G_plan({ root: REPO_ROOT, milestone: broken });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const autoId = m.assertions.find((a) => a.kind === "auto")!.id;
    expect(r.reason).toContain(autoId);
    // 行号：人要能跳到那一行去改
    const line = m.assertions.find((a) => a.kind === "auto")!.line;
    expect(r.reason).toContain(String(line));
  });

  it("一条断言都没有 → block", () => {
    const m = realMilestone("M1");
    const r = G_plan({ root: REPO_ROOT, milestone: { ...m, assertions: [] } });
    expect(r.ok).toBe(false);
  });

  it("reason 是可操作文本，不是裸 false（老仓库那个 false 的教训）", () => {
    const m = realMilestone("M1");
    const r = G_plan({ root: REPO_ROOT, milestone: { ...m, assertions: [] } });
    if (r.ok) throw new Error("应 block");
    expect(r.reason.length).toBeGreaterThan(10);
    expect(r.reason).toContain(m.id);
  });
});
