/**
 * check-landing 的双向准入闸（D-54）
 *
 * 红例必须红：伪装落点（写代码路径但无机制）与断线机制要被抓到。
 * 绿例必须绿：诚实的规约落点与真实可达的机制不得误报。
 *
 * 为什么两边都要：恒绿的检查器是哑弹（D-49 那一档套在包上），
 * 恒红的检查器会被 skip，接着整条检查链都没人看。
 *
 * 为什么用真实脚本而非重实现判据（D-25：测试输入走真实解析路径）：
 * 这里把 fixture 写进临时目录，用 node 跑真的 check-landing.mjs。
 * 若在测试里重写一遍匹配规则，判据变了测试仍绿，而真实链路已断。
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = resolve("scripts/check-landing.mjs");

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** 造一个最小仓库：docs/disciplines.md + package.json，然后在里面跑真脚本。
 *  extraFiles：额外造出的空文件（用于验证 tests/ 路径存在档）。
 *  为什么不直接引用真仓库的测试文件：脚本用相对路径判存在，cwd 是临时目录，
 *  引真路径会永远不存在。造同名空文件才能验到「存在则绿」这个判据。 */
function runIn(
  ledgerRows: string,
  scripts: Record<string, string>,
  extraFiles: string[] = [],
) {
  const dir = mkdtempSync(join(tmpdir(), "landing-"));
  dirs.push(dir);
  mkdirSync(join(dir, "docs"), { recursive: true });
  writeFileSync(
    join(dir, "docs/disciplines.md"),
    // 表头必须含「只增不改」，否则 [0] 段先红，测不到我们要测的那一段
    `# 纪律\n\n> 只增不改：条目只增不减。\n\n## 一、形状\n\n| id | 纪律 | 判据 | 落点 |\n|---|---|---|---|\n${ledgerRows}\n`,
  );
  writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts }));
  for (const rel of extraFiles) {
    mkdirSync(join(dir, dirname(rel)), { recursive: true });
    writeFileSync(join(dir, rel), "");
  }

  try {
    const stdout = execFileSync(process.execPath, [SCRIPT], {
      cwd: dir,
      encoding: "utf-8",
    });
    return { code: 0, stdout };
  } catch (error) {
    const e = error as { status: number; stdout: string };
    return { code: e.status, stdout: e.stdout };
  }
}

describe("红例必须红（可修复的当下状态）", () => {
  it("声称的 script 不存在", () => {
    const r = runIn("| D-01 | 甲 | 判据甲 | `npm run check:ghost` |", {
      test: "vitest --run",
    });
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("没有这个 script");
  });

  it("script 存在但从 pretest/test 不可达", () => {
    const r = runIn("| D-01 | 甲 | 判据甲 | `npm run check:orphan` |", {
      test: "vitest --run",
      "check:orphan": "node scripts/x.mjs",
    });
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("不可达");
  });

  it("声称的 tests/ 路径不存在（D-49 的镜像：纪律必须有测试调用点）", () => {
    // 为什么这一档是闸门而非报告：测试路径是可修复的当下状态（改路径或恢复文件），
    // 符合 D-55 的分界线。文件改名后落点立即失真，必须当场拦住。
    const r = runIn(
      "| D-01 | 甲 | 判据甲 | `tests/plan/L99-does-not-exist.test.ts` |",
      { test: "vitest --run" },
    );
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("不存在");
    expect(r.stdout).toContain("测试调用点");
  });

  it("台账未声明 append-only", () => {
    const dir = mkdtempSync(join(tmpdir(), "landing-"));
    dirs.push(dir);
    mkdirSync(join(dir, "docs"), { recursive: true });
    writeFileSync(
      join(dir, "docs/disciplines.md"),
      "# 纪律\n\n| id | 纪律 | 判据 | 落点 |\n|---|---|---|---|\n| D-01 | 甲 | 判据甲 | 评审时人查 |\n",
    );
    writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: {} }));
    let code = 0;
    let stdout = "";
    try {
      stdout = execFileSync(process.execPath, [SCRIPT], {
        cwd: dir,
        encoding: "utf-8",
      });
    } catch (error) {
      const e = error as { status: number; stdout: string };
      code = e.status;
      stdout = e.stdout;
    }
    expect(code).toBe(1);
    expect(stdout).toContain("只增不改");
  });
});

describe("报告档必须被看见但不拦（D-55）", () => {
  it("伪装落点：报告但退出 0（需人批才能转绿，不得占闸门）", () => {
    // 为什么不判红：落点列是判据本体（D-51 需人批）。在人批之前不存在任何
    // 仓库改动能让它转绿，而 D-55 的判据正是这种项不得拦住整条检查链。
    const r = runIn("| D-01 | 甲 | 判据甲 | 04-plan 解析器 |", {
      test: "vitest --run",
    });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("D-01");
    expect(r.stdout).toContain("待人批");
  });

  it("报告项不得被静默：必须打印落点原文与改法", () => {
    // 降级最大的风险是变成静默忽略（那就真的等于删除）。
    const r = runIn("| D-01 | 甲 | 判据甲 | 05-gates |", {
      test: "vitest --run",
    });
    expect(r.stdout).toContain("05-gates");
    expect(r.stdout).toMatch(/接线成真机制|写明它会被跳过/);
  });
});

describe("绿例必须绿", () => {
  it("诚实的规约落点不误报", () => {
    const r = runIn(
      "| D-01 | 甲 | 判据甲 | 评审时人查 |\n| D-02 | 乙 | 判据乙 | 规约（接受会被跳过） |\n| D-03 | 丙 | 判据丙 | 拟机制化，见未决 |",
      { test: "vitest --run" },
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("PASS");
  });

  it("真实可达的机制不误报（直接挂在 pretest）", () => {
    const r = runIn("| D-01 | 甲 | 判据甲 | `npm run check:real` |", {
      pretest: "npm run check:real",
      test: "vitest --run",
      "check:real": "node scripts/real.mjs",
    });
    expect(r.code).toBe(0);
  });

  it("递归可达：pretest → 中间层 → 叶子，也算已接线", () => {
    // 这条是本脚本相对 check-disciplines.mjs 的增量能力：
    // 一层匹配会把叶子判成未接线（假红）。
    const r = runIn("| D-01 | 甲 | 判据甲 | `npm run check:leaf` |", {
      pretest: "npm run check:group",
      test: "vitest --run",
      "check:group": "npm run check:leaf",
      "check:leaf": "node scripts/leaf.mjs",
    });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("可达");
  });

  it("登记真存在的测试路径不误报（且算作 mech 档）", () => {
    const r = runIn(
      "| D-01 | 甲 | 判据甲 | `tests/plan/L1-minimal.test.ts` |",
      { test: "vitest --run" },
      ["tests/plan/L1-minimal.test.ts"],
    );
    expect(r.code).toBe(0);
    // 不得被归入「无机制且未承认」的报告档
    expect(r.stdout).not.toContain("待人批");
    expect(r.stdout).toContain("存在");
  });

  it("循环引用不算可达（防止互相调用伪装成已接线）", () => {
    const r = runIn("| D-01 | 甲 | 判据甲 | `npm run check:a` |", {
      test: "vitest --run",
      "check:a": "npm run check:b",
      "check:b": "npm run check:a",
    });
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("不可达");
  });
});
