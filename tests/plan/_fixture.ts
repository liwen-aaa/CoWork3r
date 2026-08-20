/**
 * tests/plan/_fixture.ts — 规划书解析层的共用输入
 *
 * **本文件不构造 markdown。** D-25 在这一层格外硬：解析器的输入就是语法本身，
 * 在测试里内联一段 markdown 字面量等于给语法建了第二份定义（D-04）——
 * 改了解析器而忘了改模板，字面量那边仍然绿着，而真实使用路径已经断了。
 * 老仓库那两份格式分裂两个月没人发现，正是因为模板从来没被解析过一次。
 *
 * 所以这里只提供**真实文件的路径常量**，和「把真实文件改一处」这一个动作
 * （用于造错误样本：从合法样本出发只动一行，改的那行就是被测的那条语法）。
 */
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** 四份真实输入。相对仓库根，`parsePlan(root, relPath)` 直接吃 */
export const INPUTS = {
  /** 语法下限：一里程碑两断言、可省节全省（L1） */
  minimal: "templates/plan.minimal.md",
  /** 模板本体 = 语法的可运行示例（L8） */
  template: "templates/plan.md",
  /** 本项目自己的规划书，含 ✅ 标记（L6、M4 第五条断言） */
  own: "docs/plan.md",
  /** 老仓库真实规划书副本：行内「验收：」而非 `### 断言` 节（L9） */
  paper: "tests/fixtures/paper/paper-plan.md",
} as const;

export const REPO_ROOT = process.cwd();

/**
 * 从一份真实样本出发，改若干行，写进临时目录。
 *
 * `edit` 拿到原文行数组（0-indexed），返回改后的数组。测试里只动被测那一行，
 * 其余保持真实——这样错误样本仍然与语法同源。
 */
export function derive(
  from: keyof typeof INPUTS,
  edit: (lines: string[]) => string[],
): { root: string; rel: string; lines: string[]; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "wf-plan-"));
  const rel = "plan.md";
  const src = readFileSync(INPUTS[from], "utf-8");
  const lines = edit(src.split("\n"));
  writeFileSync(join(root, rel), lines.join("\n"), "utf-8");
  return {
    root,
    rel,
    lines,
    cleanup: () => {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        /* Windows EBUSY 不该让用例红 */
      }
    },
  };
}

/** 把一份真实样本原样拷进临时目录（不改一个字节） */
export function verbatim(from: keyof typeof INPUTS): {
  root: string;
  rel: string;
  cleanup: () => void;
} {
  const root = mkdtempSync(join(tmpdir(), "wf-plan-v-"));
  const rel = "plan.md";
  copyFileSync(INPUTS[from], join(root, rel));
  return {
    root,
    rel,
    cleanup: () => {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        /* 同上 */
      }
    },
  };
}

/** 找到第一个匹配的行号（0-indexed），找不到抛错——测试的前提断言 */
export function lineOf(lines: string[], pattern: RegExp): number {
  const i = lines.findIndex((l) => pattern.test(l));
  if (i === -1) throw new Error(`样本里找不到 ${pattern}——真实文件变了，测试的前提不再成立`);
  return i;
}
