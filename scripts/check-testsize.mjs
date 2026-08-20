/**
 * check-testsize.mjs — D-41 的机制落点（自检不得超过运行时）
 *
 * D-41 的落点原本写「定期人查」= 规约 = 接受它会被跳过（D-02）。而它的来源是
 * 老仓库的死因之一：自检 1995 行 > 运行时 1898 行。一条关于「膨胀」的纪律靠人
 * 定期想起来查，本身就是膨胀的温床。所以口径落成脚本。
 *
 * ── 口径 ──────────────────────────────────────────────────
 *   分子 = tests/ 下**全部** .ts（减排除），非注释非空行
 *   分母 = src/ 下全部 .ts，非注释非空行
 *   排除 = tests/fixtures/（数据不是代码）、tests/manual/（人工验证凭证不是自检）
 *   阈值 = 1.0
 *
 * 分母为什么是全量 .ts 而不是 *.test.ts：后者留了个合法漏洞——把测试逻辑挪出
 * .test.ts 就能躲红线，与 D-25 的字面量漏洞同构。而且 mock-pi、e2e harness、
 * _fixture.ts 都不是 .test.ts（今天这三个 _fixture 就是 104 行）。
 *
 * 按总量算不按模块：与来源一致（1995 vs 1898 是总量），且模块级比值会被小模块放大。
 *
 * ── 2026-08-20 第一次审的结论（红线 1.71，已越过）────────────
 * 构成：src 注释占 41%，tests 占 25%。剥离注释主要砍分子——因为 D-06 要求把模块
 * 职责与边界拆进 src 的文件头，那些「文档」按行数算在运行时侧。所以本仓库任何
 * 合理口径下今天都是红的，而且 M4–M6 会更红（mock-pi + e2e harness 是纯测试代码，
 * plan/gates/adapter 的 src 是小纯函数）。
 *
 * 审的结论：**比值高的部分是结构性产物**——运行时是 735 行纯函数，而测试即规格
 * （TDD，用例名 = 断言编号，一个约束一个文件）。
 *
 * **这不是豁免。** D-41 存在的理由就是堵这种自我辩护。所以：
 *   - 阈值留在 1.0，不上调
 *   - 每次红了做**构成 diff**：这轮新增的测试在测真实行为，还是在测仪式？
 *   - 审的结论必须写下来（就写在本文件头），否则每轮都红 = 狼来了
 *
 * 改阈值必须先改这里的口径定义——那是两件事，不能在「审不过去」的当口顺手做。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const THRESHOLD = 1.0;
/** 数据与凭证不是自检代码。今天这两个目录里没有 .ts，写进口径是为未来 */
const EXCLUDE = ["tests/fixtures/", "tests/manual/"];

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const full = join(dir, e).replace(/\\/g, "/");
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith(".ts")) out.push(full);
  }
  return out;
}

/** 非注释非空行。块注释与行注释都算注释，`*` 开头的续行也算 */
function codeLines(file) {
  let n = 0;
  let inBlock = false;
  for (const raw of readFileSync(file, "utf-8").split("\n")) {
    const t = raw.trim();
    if (t === "") continue;
    if (inBlock) {
      if (t.includes("*/")) inBlock = false;
      continue;
    }
    if (t.startsWith("/*")) {
      if (!t.includes("*/")) inBlock = true;
      continue;
    }
    if (t.startsWith("//") || t.startsWith("*")) continue;
    n++;
  }
  return n;
}

const srcFiles = walk("src");
const testFiles = walk("tests").filter((f) => !EXCLUDE.some((p) => f.startsWith(p)));

const sum = (fs) => fs.reduce((a, f) => a + codeLines(f), 0);
const src = sum(srcFiles);
const tests = sum(testFiles);
const ratio = tests / src;

/** 按目录分组，看构成落在哪一层 */
function byGroup(files) {
  const g = new Map();
  for (const f of files) {
    const key = f.split("/").slice(0, 2).join("/");
    g.set(key, (g.get(key) ?? 0) + codeLines(f));
  }
  return [...g].sort((a, b) => b[1] - a[1]);
}

console.log("D-41 自检不得超过运行时（口径见本脚本文件头）\n");
console.log(`  运行时 src    ${String(src).padStart(5)} 行  (${srcFiles.length} 文件)`);
console.log(`  自检   tests  ${String(tests).padStart(5)} 行  (${testFiles.length} 文件，已排除 ${EXCLUDE.join(" ")})`);
console.log(`  比值          ${ratio.toFixed(2)}  阈值 ${THRESHOLD.toFixed(2)}\n`);

console.log("  构成（非注释非空行）：");
for (const [k, v] of byGroup(srcFiles)) console.log(`    ${k.padEnd(16)} ${String(v).padStart(5)}`);
for (const [k, v] of byGroup(testFiles)) console.log(`    ${k.padEnd(16)} ${String(v).padStart(5)}`);

if (ratio > THRESHOLD) {
  console.log(
    `\n⚠ 越线（${ratio.toFixed(2)} > ${THRESHOLD.toFixed(2)}）。D-41 要求停下来审，判据：` +
      `\n  这轮新增的测试在测**真实行为**，还是在测**仪式**？` +
      `\n  审的结论写进本脚本文件头，不改阈值。最近一次审见文件头。`,
  );
  // 不 exit(1)：D-41 的落点是「停下来审」，把它做成硬失败会逼人改数字——
  // 而改数字正是这条纪律要防的事。它的作用是每轮把数字摆到眼前。
}
