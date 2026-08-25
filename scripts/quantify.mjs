#!/usr/bin/env node
/**
 * quantify.mjs — 事故/缺陷量化统计(论文第 6 章 + 博客数字底稿)
 *
 * 来源:paper-materials.md「待补①」:事故总数/缺陷类别分布,用脚本数 git log。
 * 用法:  node scripts/quantify.mjs          # 控制台 markdown 摘要
 *        node scripts/quantify.mjs --json   # 完整数据(论文/博客取数)
 *
 * 统计维度:
 *   1. commit 时间线(总数 + 按日分布)
 *   2. 纪律增长曲线(disciplines.md 各版本的 D-xx 条数,时间序列)
 *   3. 事故 commit 分类(按 commit message 关键词归类)
 *   4. 行数快照(当前 src/tests/scripts/extensions/launch/docs 分布)
 *   5. 关键时点行数抽查(可选 --history:src 与 tests 的演化)
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
process.chdir(ROOT);
const run = (cmd) => execSync(cmd, { encoding: "utf8" }).trim();
const JSON_MODE = process.argv.includes("--json");
const HISTORY_MODE = process.argv.includes("--history");

// ── 1. commit 时间线 ─────────────────────────────────────────────
const commits = run('git log --pretty="%ad|%s" --date=short').split("\n").map((l) => {
  const i = l.indexOf("|");
  return { date: l.slice(0, i), msg: l.slice(i + 1) };
});

const byDay = {};
for (const c of commits) byDay[c.date] = (byDay[c.date] || 0) + 1;

// ── 2. 纪律增长曲线 ──────────────────────────────────────────────
const discHashes = run('git log --format="%H" -- docs/disciplines.md').split("\n").filter(Boolean);
const discGrowth = discHashes.map((h) => {
  const date = run(`git log -1 --format=%ad --date=short ${h}`);
  const body = run(`git show ${h}:docs/disciplines.md`);
  const ids = [...new Set([...(body.match(/D-\d{2}/g) || [])])];
  return { date, count: ids.length, ids: ids.sort() };
});
// 去重:同一天多个版本取最大值,得到 (日期 → D 条数) 序列
const discSeries = [];
for (const g of discGrowth) {
  const last = discSeries[discSeries.length - 1];
  if (last && last.date === g.date) last.count = Math.max(last.count, g.count);
  else discSeries.push({ date: g.date, count: g.count });
}

// ── 3. 事故 commit 分类 ──────────────────────────────────────────
const CATEGORIES = [
  ["接线/唤醒(哑弹)", /watchInbox|接线|唤醒|wake|漏接|零调用/],
  ["假绿/测试失守", /假绿|测试.*绿|用例全绿|mock.*真实|D-25|停止条件/],
  ["判据/自证", /判据|自证|凭证|Goodhart|evidence|捏造|持有权/],
  ["回退/降级/修复", /revert|回退|降级|作废|修复|FAIL/],
  ["验收/里程碑", /验收|收尾|凭证落盘|M[0-9]/],
  ["纪律/机制新增", /D-\d{2}|纪律|机制|check:/],
  ["公开/文档/平台", /README|LICENSE|公开|清理|文档|trio|tmux/],
];
const classified = {};
for (const c of commits) {
  for (const [name, re] of CATEGORIES) {
    if (re.test(c.msg)) {
      classified[name] = classified[name] || [];
      classified[name].push(c);
    }
  }
}

// ── 4. 行数快照 ──────────────────────────────────────────────────
function countLines(pathspec, filter) {
  const files = run(`git ls-files ${pathspec}`).split("\n").filter(Boolean);
  let total = 0;
  for (const f of files) {
    if (filter && !filter(f)) continue;
    try {
      total += fs.readFileSync(f, "utf8").split("\n").length;
    } catch { /* 跳过二进制/不可读 */ }
  }
  return total;
}

/** 非注释非空行(D-41 / check-testsize.mjs 的权威口径) */
function codeLines(file) {
  let n = 0, inBlock = false;
  for (const raw of fs.readFileSync(file, "utf-8").split("\n")) {
    const t = raw.trim();
    if (t === "") continue;
    if (inBlock) { if (t.includes("*/")) inBlock = false; continue; }
    if (t.startsWith("/*")) { if (!t.includes("*/")) inBlock = true; continue; }
    if (t.startsWith("//") || t.startsWith("*")) continue;
    n++;
  }
  return n;
}
function walk(dir) {
  return run(`git ls-files ${dir}`).split("\n").filter((f) => f.endsWith(".ts"));
}
const snap = {
  src: countLines("src"),
  tests: countLines("tests"),
  scripts: countLines("scripts"),
  extensions: countLines("extensions"),
  launch: countLines("launch"),
  docs_md: countLines("docs", (f) => f.endsWith(".md")),
};
snap.元机制 = snap.tests + snap.scripts + snap.extensions + snap.launch;
// D-41 口径(非注释非空行;tests 排除 fixtures/manual——与 check-testsize.mjs 一致)
const d41 = {
  src: walk("src").reduce((a, f) => a + codeLines(f), 0),
  tests: walk("tests").filter((f) => !f.startsWith("tests/fixtures") && !f.startsWith("tests/manual")).reduce((a, f) => a + codeLines(f), 0),
};
d41.ratio = d41.tests / d41.src;

// ── 5. 关键时点行数抽查 ──────────────────────────────────────────
let history = null;
if (HISTORY_MODE) {
  const codeLinesStr = (content) => {
    let n = 0, inBlock = false;
    for (const raw of content.split("\n")) {
      const t = raw.trim();
      if (t === "") continue;
      if (inBlock) { if (t.includes("*/")) inBlock = false; continue; }
      if (t.startsWith("/*")) { if (!t.includes("*/")) inBlock = true; continue; }
      if (t.startsWith("//") || t.startsWith("*")) continue;
      n++;
    }
    return n;
  };
  const POINTS = {
    "M1-M3 后(08-20)": run('git log --until=2026-08-21 -1 --format=%H'),
    "M6 验收(08-23)": "c445ef5",
    "现在": "HEAD",
  };
  history = {};
  for (const [label, ref] of Object.entries(POINTS)) {
    history[label] = { src: 0, tests: 0 };
    for (const dir of ["src", "tests"]) {
      const files = run(`git ls-tree -r --name-only ${ref} ${dir}`).split("\n").filter((f) => f.endsWith(".ts"));
      for (const f of files) {
        try {
          const blob = run(`git show ${ref}:${f}`);
          history[label][dir] += codeLinesStr(blob);
        } catch { /* 该时点文件不存在 */ }
      }
    }
  }
}

// ── 输出 ─────────────────────────────────────────────────────────
if (JSON_MODE) {
  console.log(JSON.stringify({ commits: commits.length, byDay, discSeries, classified: Object.fromEntries(Object.entries(classified).map(([k, v]) => [k, v.length])), snap, history }, null, 2));
  process.exit(0);
}

const PAD = (s, n) => String(s).padEnd(n);
console.log(`# 量化统计(git log 全量,${commits.length} commits)\n`);

console.log("## 1. commit 时间线");
for (const [d, n] of Object.entries(byDay)) console.log(`${PAD(d, 12)} ${n} commits`);

console.log("\n## 2. 纪律增长(disciplines.md 的 D-xx 条数)");
for (const g of discSeries) console.log(`${PAD(g.date, 12)} ${g.count} 条  (最新: ${discGrowth[0].ids.slice(-6).join(", ")})`);

console.log("\n## 3. 事故 commit 分类(按 message 关键词,可多类)");
for (const [name, list] of Object.entries(classified).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${PAD(name, 18)} ${list.length} 条`);
}

console.log("\n## 4. 行数快照(当前)");
for (const [k, v] of Object.entries(snap)) console.log(`${PAD(k, 10)} ${v} 行`);
console.log(`元机制/src 比值(含注释): ${(snap.元机制 / snap.src).toFixed(2)}`);
console.log(`\n## 4b. D-41 口径(非注释非空行,与 check-testsize.mjs 一致)`);
console.log(`src = ${d41.src} 行, tests = ${d41.tests} 行, 比值 = ${d41.ratio.toFixed(2)}`);
console.log(`(E9 记录 src 1997 vs 元机制 7650 = 3.83——口径含 scripts/docs,须按统一口径重算对照)`);

if (history) {
  console.log("\n## 5. 关键时点行数");
  for (const [label, v] of Object.entries(history)) console.log(`${PAD(label, 14)} src=${v.src}  tests=${v.tests}`);
}
