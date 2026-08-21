/**
 * R5 注入自检：特征串不在 → 能被检出
 *
 * 风险是别的扩展返回一个不含 `event.systemPrompt` 的全新字符串——那是替换而非追加，
 * 我们的规约就被吃掉了，而且**没有任何症状**：窗口正常、工具在、只是模型不知道自己是谁。
 *
 * 所以不去查「今天装的扩展会不会这么干」（查了也只对今天有效），
 * 直接按会发生设计：埋一行特征串，事后检查它还在不在。
 * 这是 D-02 用在自己身上——把「应该在」变成「不在就吵」。
 *
 * 本用例测纯函数 specPresent()。接线（agent_start → checkInjectedSpec → 告警）已由
 * A9b-selfcheck.test.ts 钉住，三面覆盖：正常不告警 / 整份替换告警含角色 / 角色区分。
 */
import { describe, expect, it } from "vitest";

import { buildSystemPrompt, specMark, specPresent } from "../../src/roles/index.ts";

const BASE = "pi 的原始系统提示。";

describe("R5 注入自检", () => {
  it("正常注入后 specPresent 为真", () => {
    const prompt = buildSystemPrompt("dev", BASE);
    expect(specPresent("dev", prompt)).toBe(true);
  });

  it("被别的扩展整份替换 → specPresent 为假", () => {
    const replaced = "某个扩展返回了一个全新的系统提示，没有拼接上游内容。";
    expect(specPresent("dev", replaced)).toBe(false);
  });

  it("被截断（只剩前半）→ specPresent 为假", () => {
    const prompt = buildSystemPrompt("dev", BASE);
    const truncated = prompt.slice(0, Math.floor(prompt.length / 2));
    expect(specPresent("dev", truncated)).toBe(false);
  });

  it("特征串按角色区分：装了 dev 的规约，查 tester 应为假", () => {
    // 否则「三个窗口都装了同一份规约」这个故障查不出来
    const prompt = buildSystemPrompt("dev", BASE);
    expect(specPresent("tester", prompt)).toBe(false);
  });

  it("特征串是 markdown 注释形式（不干扰模型阅读）", () => {
    for (const role of ["arch", "dev", "tester"] as const) {
      expect(specMark(role)).toMatch(/^<!--.*-->$/);
      expect(specMark(role)).toContain(role);
    }
  });

  it("规约文件本身不含特征串（它由拼接时加上，不是写死在 md 里）", () => {
    // 写死在 md 里的话，「规约被替换」与「md 被读到但没拼上」两种故障就分不开
    const prompt = buildSystemPrompt("arch", "");
    const occurrences = prompt.split(specMark("arch")).length - 1;
    expect(occurrences).toBe(1);
  });
});
