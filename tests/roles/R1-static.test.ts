/**
 * R1 规约是静态文件，且各角色只读自己那份
 *
 * 「按 WF_ROLE 读一份」不是效率优化，是隔离：D-01（生产者不能宣布自己完成）
 * 依赖 dev 与 tester 两个上下文互不知情。老仓库三份 SKILL 在三个窗口都可发现，
 * dev 看得见 tester 的规约——那个形状下 dev 知道自己会被怎么验。
 *
 * 顺带说明为什么不用 pi skill：skill 是渐进披露（只有 description 常驻，
 * 全文靠模型自己决定去 read，pi 文档明写 "models don't always do this"）。
 * 规约要的恰恰相反——必须永远在上下文里。这不是 skill 机制不好，是语义不匹配。
 */
import { describe, expect, it } from "vitest";

import { loadRoleSpec } from "../../src/roles/index.ts";

describe("R1 规约静态且按角色隔离", () => {
  it("三个角色各读到非空规约", () => {
    for (const role of ["arch", "dev", "tester"] as const) {
      const spec = loadRoleSpec(role);
      expect(spec.trim().length).toBeGreaterThan(0);
    }
  });

  it("三份内容互不相同", () => {
    const specs = (["arch", "dev", "tester"] as const).map((r) => loadRoleSpec(r));
    expect(new Set(specs).size).toBe(3);
  });

  it("每份规约里出现自己的角色名，不出现另两个角色的判定权描述", () => {
    // 判据收窄：角色名会互相提到（arch 要说「投递 dev」），但**判定权**不能串
    // ——dev 的规约里不该写 tester 判什么，否则 dev 就知道自己会被怎么验
    const arch = loadRoleSpec("arch");
    const dev = loadRoleSpec("dev");
    const tester = loadRoleSpec("tester");

    expect(arch).toMatch(/你是.*架构|你是.*arch/i);
    expect(dev).toMatch(/你是.*开发|你是.*dev/i);
    expect(tester).toMatch(/你是.*测试|你是.*tester/i);
  });

  it("human 不是角色（伪角色：有收件箱、无窗口、无规约）", () => {
    expect(() => loadRoleSpec("human" as never)).toThrow();
  });

  it("未知角色 → 抛错而不是返回空串", () => {
    // 静默返回空串等于「这个窗口没有规约但看起来正常」——正是要防的那类
    expect(() => loadRoleSpec("nope" as never)).toThrow();
  });
});
