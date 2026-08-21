/**
 * D5 plan skill：skills/plan/SKILL.md 不复述模板，且引用的 templates/plan.md 真存在
 *
 * 澄清入口用 pi skill（一次性、显式触发、用完就走——渐进披露对角色规约是缺陷，
 * 对这个恰好是优点）。SKILL.md 内容只有四十行左右的对话纪律，**模板不复述**——
 * 指向 templates/plan.md（D-04：一概念一权威，复述 = 第二份定义）。
 *
 * 判据：
 *   ① SKILL.md 存在
 *   ② 它引用的 templates/plan.md 真实存在（引了不存在的文件 = 断链）
 *   ③ 不复述模板：SKILL.md 里不该出现模板的结构性内容
 *      （`## 里程碑` 这种语法头，或 `### 断言` 小节名）——那些是 grammar 的领地
 *   ④ 四十行左右（对话纪律，不是文档）
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SKILL = join(ROOT, "skills", "plan", "SKILL.md");

describe("D5 plan skill", () => {
  it("skills/plan/SKILL.md 存在", () => {
    expect(existsSync(SKILL)).toBe(true);
  });

  it("引用的 templates/plan.md 真实存在（不引断链）", () => {
    const text = readFileSync(SKILL, "utf-8");
    // 提取 `...` 里的相对路径引用
    const refs = [...text.matchAll(/`([^`]+\.md)`/g)].map((m) => m[1]!);
    expect(refs.length).toBeGreaterThan(0);
    for (const r of refs) {
      expect(existsSync(join(ROOT, r)), `SKILL.md 引用了不存在的 ${r}`).toBe(true);
    }
  });

  it("不复述模板（不出现语法结构本身）", () => {
    const text = readFileSync(SKILL, "utf-8");
    // 语法头与小节名是模板/grammar 的领地；skill 里出现就是复述
    expect(text).not.toContain("## 里程碑");
    expect(text).not.toContain("### 断言");
  });

  it("四十行左右（对话纪律，不是文档）", () => {
    const n = readFileSync(SKILL, "utf-8").split("\n").length;
    expect(n).toBeLessThanOrEqual(60);
  });
});
