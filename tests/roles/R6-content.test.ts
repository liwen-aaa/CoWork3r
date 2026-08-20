/**
 * R6 规约内容判据：是「你是谁」而不是「系统怎么工作」
 *
 * 老仓库三份 SKILL 共 242 行，混了三类东西：
 *   角色行为（「没有测试文件 = 自动 FAIL」）        ← 该留
 *   项目事实（「规划书在 docs/plan.md」）           ← 该走 config
 *   流程说明（「消息怎么投递、extension 会自动唤醒」）← 该删，工具 description 已经说了
 *
 * 第三类是最大的浪费：三份各花二三十行讲消息系统怎么工作，而模型只需要知道
 * 「调这个工具」。工具 description 全量进上下文，讲两遍是纯付费重复。
 *
 * 行数上限（G6 那条）防总量，本文件防结构。但真正的判断只有人能做
 * ——那是 M3 的 [human] 断言。这里只拦几个能机械识别的形状。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROLES = ["arch", "dev", "tester"] as const;
const read = (r: string) => readFileSync(join("src/roles", `${r}.md`), "utf-8");

describe("R6 规约内容", () => {
  it("每份含「你判什么 / 你不判什么」这类判定权边界", () => {
    for (const r of ROLES) {
      expect(read(r), r).toMatch(/判|权限|边界/);
    }
  });

  it("每份有「禁止」或「不做」节（边界要写出来，不能只说该干什么）", () => {
    for (const r of ROLES) {
      expect(read(r), r).toMatch(/禁止|不得|不要|不做/);
    }
  });

  it("不讲消息系统怎么工作（工具 description 已经说了）", () => {
    // 老仓库那三份各花二三十行讲这个
    const smells = [/fs\.watch/, /轮询/, /水位/, /单槽位/, /\.pi\/messages/, /收件箱文件/];
    const offenders: string[] = [];
    for (const r of ROLES) {
      const src = read(r);
      const hit = smells.filter((re) => re.test(src)).map((re) => re.source);
      if (hit.length) offenders.push(`${r}: ${hit.join(" ")}`);
    }
    expect(offenders).toEqual([]);
  });

  it("不含项目专属事实（技术栈、构建命令这些由 roleNotes 注入）", () => {
    const smells = [/Rust/, /Tauri/, /cargo/, /quartz/, /tectonic/];
    const offenders: string[] = [];
    for (const r of ROLES) {
      const src = read(r);
      const hit = smells.filter((re) => re.test(src)).map((re) => re.source);
      if (hit.length) offenders.push(`${r}: ${hit.join(" ")}`);
    }
    expect(offenders).toEqual([]);
  });

  it("dev 的规约里不写 tester 的判定标准（D-01：不让生产者知道自己会被怎么验）", () => {
    const dev = read("dev");
    expect(dev).not.toMatch(/没有测试文件\s*=\s*(自动\s*)?FAIL/);
    expect(dev).not.toMatch(/PASS 的条件/);
  });

  it("tester 的规约明写「没写测试 = FAIL」（最高规则，不能只暗示）", () => {
    expect(read("tester")).toMatch(/测试.*FAIL|FAIL.*测试/);
  });

  it("arch 的规约明写不得改断言（D-15）", () => {
    expect(read("arch")).toMatch(/断言/);
    expect(read("arch")).toMatch(/不得|不能|禁止/);
  });
});
