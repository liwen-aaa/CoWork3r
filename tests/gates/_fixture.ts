/**
 * tests/gates/_fixture.ts — 拦截层测试的共用输入
 *
 * 三条硬约束，都来自 D-25：
 *
 * ① **不手写 Milestone 字面量。** G-artifact / G-human 消费 `Milestone`，它必须由
 *    真实 `parsePlan` 从真实文件产出。手写对象会跟着语法漂——改了解析器，字面量
 *    那边仍然绿着，而真实链路已经断了。来源固定是 `templates/plan.minimal.md`
 *    （语法下限，同时是 e2e fixture 项目的规划书）。
 *
 * ② **不手写 Config 字面量。** 同理，走 `inspectConfig` 从真实 `wf.config.json` 读。
 *    03-config 的 `_fixture` 已经证明这条路可行，这里复用同一形状。
 *
 * ③ **产出文件不在测试里编造「合格样本」。** 四份 paper 报告 + 一份 dev 产出是
 *    真实出过事的输入（`tests/fixtures/paper/`）。要造「合格」的就从断言表推导，
 *    因为判据本身就是「每条断言一行结论」——推导出来的样本永远与判据同源。
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { inspectConfig } from "../../src/config/index.ts";
import { milestone, parsePlan } from "../../src/plan/index.ts";
import type { Config } from "../../src/config/index.ts";
import type { Milestone } from "../../src/plan/index.ts";

export const REPO_ROOT = process.cwd();

/** 语法下限那份。M1 有两条断言（一 auto 一 human），正好够验缩放与 [human] 覆盖 */
export const MINIMAL_PLAN = "templates/plan.minimal.md";

/**
 * 从真实模板解析出 Milestone。**这是本目录唯一的 Milestone 来源。**
 *
 * 模板语法漂了 → 这里抛错 → tests/gates 全红。失败位置就是真相位置。
 */
export function realMilestone(id = "M1"): Milestone {
  const r = parsePlan(REPO_ROOT, MINIMAL_PLAN);
  if (!r.ok) {
    throw new Error(`前提失败：${MINIMAL_PLAN} 解析不了 —— ${JSON.stringify(r.errors)}`);
  }
  const m = milestone(r.plan, id);
  if (!m) throw new Error(`前提失败：${MINIMAL_PLAN} 里没有 ${id}`);
  return m;
}

/** 临时项目根。gate 要读文件、写快照基线，都需要一个真目录 */
export function makeProject(label: string): {
  root: string;
  /** 往项目里写一个文件（自动建父目录），返回相对路径 */
  file: (rel: string, content: string) => string;
  cleanup: () => void;
} {
  const root = mkdtempSync(join(tmpdir(), `wf-gate-${label}-`));
  return {
    root,
    file: (rel, content) => {
      const full = join(root, rel);
      writeFileSync(full, content, "utf-8");
      return rel;
    },
    cleanup: () => {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        /* Windows EBUSY 不该让用例红 */
      }
    },
  };
}

/**
 * 真实 Config：往临时根写一份 wf.config.json，再经 `inspectConfig` 读回。
 *
 * `patch` 覆盖字段（如 `{ test: null }` 造 G6 的输入，或写个坏正则造 fatal）。
 * 基线取 `templates/wf.config.json`——模板即可运行示例，与 G7 同源。
 */
export function realConfig(
  root: string,
  patch: Record<string, unknown> = {},
): { cfg: Config | null; diagnostics: ReturnType<typeof inspectConfig>["diagnostics"] } {
  const tpl = parseTemplateConfig();
  writeFileSync(join(root, "wf.config.json"), JSON.stringify({ ...tpl, ...patch }, null, 2), "utf-8");
  return inspectConfig(root);
}

function parseTemplateConfig(): Record<string, unknown> {
  // 直接读模板文本再 JSON.parse：模板本身是 G7 的输入（零 fatal 零 warn），
  // 所以它是「一份合法配置」的唯一权威样本
  return JSON.parse(readFileSync(join(REPO_ROOT, "templates/wf.config.json"), "utf-8"));
}

/** 四份 paper 报告 + 一份 dev 产出的仓库相对路径 */
export const PAPER = {
  reports: [
    "tests/fixtures/paper/paper-test-report-M1.md",
    "tests/fixtures/paper/paper-test-report-M2.md",
    "tests/fixtures/paper/paper-test-report-M3.md",
    "tests/fixtures/paper/paper-test-report-M4.md",
  ],
  devOutput: "tests/fixtures/paper/paper-dev-output-M4.md",
} as const;

/**
 * 从断言表**推导**一份合格产出：每条断言一行结论。
 *
 * 不是「编造样本」——判据就是「每条断言一行」，所以推导物与判据同源：
 * 判据改了（比如要求带判定行），这个函数产出的东西就该跟着不合格，测试会红。
 */
export function deriveDevOutput(m: Milestone): string {
  const lines = [`# dev 产出 ${m.id}`, ""];
  for (const a of m.assertions) lines.push(`- ${a.id} 已完成：做了对应的事`);
  return lines.join("\n") + "\n";
}

/** 同上，tester 报告版：多一个判定行 + [human] 条目原样列出 */
export function deriveTestReport(m: Milestone, verdict: "PASS" | "FAIL" = "PASS"): string {
  const lines = [`# test report ${m.id}`, "", `判定：${verdict}`, ""];
  for (const a of m.assertions) lines.push(`- ${a.id} ${verdict === "PASS" ? "通过" : "未过"}：实测结论`);
  const humans = m.assertions.filter((a) => a.kind === "human");
  if (humans.length > 0) {
    lines.push("", "## 给人的问题", "");
    for (const a of humans) lines.push(`- ${a.id} ${a.text}`);
  }
  return lines.join("\n") + "\n";
}
