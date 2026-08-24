/**
 * check-wiring.mjs — D-49 的机制落点（导出必须有生产调用点）
 *
 * 来源事故：`watchInbox` 有实现、有 C1–C8 八条测试、`status.ts` 注释写着
 * 「wire 的 session_start / watchInbox 共用同一份」——而 `git log -S "watchInbox(ctx.cwd" -- src/`
 * 为空，**从未接线过**。289 个用例与 11 次审计都没抓到，抓到它的是一条人写的 `[human]` 断言
 * （M6.6 判 FAIL，人手动踢了 47 分钟）。M6-010 修的是那一个实例，不是这个类。
 *
 * ── 为什么这一档比 skill 更坏 ────────────────────────────
 * 执行力排序：类型层不可能 > block 拦截 > 断言走真实路径 > 断言走 mock >
 * **有代码无调用点** > skill/规约 > 注释。
 * 「有代码无调用点」排在 skill 之后不是笔误：skill 至少进上下文、有概率被读；
 * 未接线的机制执行率是严格的 0，同时消耗信任额度——你以为有防线，实际没有。
 * 而它的伪装度最高：有实现、有测试、有文档，测试从下层入口进，永远绿。
 *
 * ── 判据 ────────────────────────────────────────────────
 *   分子对象 = `src/` 与 `extensions/` 里每个 `export function` / `export const`
 *   调用点   = 在**剥掉注释与 import/export-from 行**之后仍出现该标识符
 *   零调用点 = 违反：要么接线，要么删（D-34：AI 可提议删除，执行归人）
 *
 * ── 两个假阴性陷阱，都是实测踩出来的 ─────────────────────
 * ① **re-export 不算调用。** `gates/index.ts` 的 `import { takeSourceBaseline }`
 *    + `export { takeSourceBaseline } from` 两行，天真 grep 会数成 2 次使用而判它活着。
 *    实际它在整个 `src/` 零调用，后果是 G_source 的基线永不写入、那道 gate 恒放行。
 * ② **同名遮蔽不算调用。** `inbox.ts` 有 `deliver(root, msg, validate)` 的**形参**叫
 *    `validate`，而 02-protocol 的 `validate` 是另一个东西。按标识符裸数会判 protocol 的
 *    validate 活着；实际 wire 传进去的是 `checkRoute`，`validate` 无生产调用点。
 *    所以只在**真的 import 了该名字的文件**（或定义文件自身）里数——不做 AST，靠 import 图。
 *
 * ── 不查什么（避免误报，D-40 ②问：别为自证加检查）──────────
 *   - `export type` / `export interface`：类型无运行时，死类型的代价是 tsc 会说
 *   - `export {` … `} from`：那是转发，不是定义
 *   - `tests/`：测试里的 helper 由测试消费，本检查只问「生产路径上有没有人调它」
 *   - **函数内部的分支**：`research()` 的 `action: "finish"` 分支无调用点，
 *     但 `research` 本身是活的——分支级死代码本脚本抓不到，是已知盲区
 */
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** 被拦时打印的判据原文。D-49 拿到常驻机制后离开每轮读序（D-48），
 *  于是 agent 第一次知道它存在就是被拦的这一刻——报错必须自带判据。 */
const D49 = `D-49 导出必须有生产调用点：src/ 与 extensions/ 的每个导出值（函数 / 常量）
   必须在生产路径上被真的调用。只被 re-export、只被测试调用 = 零调用点 = 违反。
   来源：watchInbox 有实现有测试有文档而从未接线，M6.6 真开窗口才发现（人手动踢 47 分钟）。
   执行力排序里「有代码无调用点」比 skill/规约更坏：规约你知道它会被跳过，机制你以为它在跑。`;

const DIRS = ["src", "extensions"];

/** 登记过的例外：留着有原因、且原因写在这里。空集是目标状态 */
const ALLOWED = new Map([
  // 形如 ["symbolName", "为什么允许它暂时没有调用点"]
]);

// ── 收文件 ────────────────────────────────────────────────
function walk(dir) {
  return readdirSync(dir).flatMap((e) => {
    const full = join(dir, e);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith(".ts") ? [full] : [];
  });
}
const files = DIRS.flatMap(walk).map((f) => f.replaceAll("\\", "/"));

// ── 文本清洗 ──────────────────────────────────────────────
/** 剥注释。块注释先剥（JSDoc 是主要噪声源），再剥行注释 */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * 剥 import 与 `export ... from` 语句（含多行形态）。
 * 这是陷阱①的解药：转发不是使用。
 */
function stripModuleLines(text) {
  return text
    .replace(/^\s*import\s[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm, "")
    .replace(/^\s*import\s+["'][^"']+["'];?\s*$/gm, "")
    .replace(/^\s*export\s+(?:type\s+)?\{[\s\S]*?\}\s*from\s+["'][^"']+["'];?\s*$/gm, "");
}

/** 该文件 import 进来的标识符集合（陷阱②的解药：只在真 import 了的文件里数） */
function importedNames(text) {
  const names = new Set();
  for (const m of text.matchAll(/import\s+(?:type\s+)?\{([\s\S]*?)\}\s*from/g)) {
    for (const part of m[1].split(",")) {
      const n = part.replace(/^\s*type\s+/, "").split(/\s+as\s+/).pop().trim();
      if (n) names.add(n);
    }
  }
  // index.ts 的 `export { a, b } from "./x.ts"` 也让本文件"持有"这些名字
  for (const m of text.matchAll(/export\s+\{([\s\S]*?)\}\s*from/g)) {
    for (const part of m[1].split(",")) {
      const n = part.replace(/^\s*type\s+/, "").split(/\s+as\s+/).pop().trim();
      if (n) names.add(n);
    }
  }
  return names;
}

const raw = new Map(files.map((f) => [f, readFileSync(f, "utf-8")]));
const clean = new Map(files.map((f) => [f, stripModuleLines(stripComments(raw.get(f)))]));
const imports = new Map(files.map((f) => [f, importedNames(raw.get(f))]));

// ── 收导出（只收值，不收类型）────────────────────────────
/** [{ name, file }] */
const exports_ = [];
for (const f of files) {
  const text = clean.get(f);
  for (const m of text.matchAll(/^export\s+(?:async\s+)?(?:function|const|class)\s+([A-Za-z_$][\w$]*)/gm)) {
    exports_.push({ name: m[1], file: f });
  }
}

// ── 数调用点 ──────────────────────────────────────────────
/**
 * 一处调用点 = 在「定义文件自身」或「import 了该名字的文件」里，
 * 剥掉模块语句与注释后仍出现该标识符（定义处那一次不算）。
 */
function callSites({ name, file }) {
  const hits = [];
  const word = new RegExp(`\\b${name.replace(/\$/g, "\\$")}\\b`, "g");
  for (const f of files) {
    const isDef = f === file;
    if (!isDef && !imports.get(f).has(name)) continue; // 同名遮蔽挡在这里
    const lines = clean.get(f).split("\n");
    lines.forEach((line, i) => {
      // 定义那一行不算使用
      if (isDef && new RegExp(`^export\\s+(?:async\\s+)?(?:function|const|class)\\s+${name}\\b`).test(line)) return;
      word.lastIndex = 0;
      if (word.test(line)) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 90)}`);
    });
  }
  return hits;
}

// ── 报告 ──────────────────────────────────────────────────
console.log("D-49 导出必须有生产调用点（口径见本脚本文件头）\n");

const dead = [];
for (const e of exports_) {
  const hits = callSites(e);
  if (hits.length === 0) dead.push(e);
}

console.log(`  导出（值）  ${exports_.length} 个，来自 ${files.length} 个文件`);
console.log(`  零调用点    ${dead.length} 个${dead.length === 0 ? "" : "  ← 哑弹"}\n`);

const unlisted = dead.filter((d) => !ALLOWED.has(d.name));

if (dead.length > 0) {
  for (const d of dead) {
    const note = ALLOWED.get(d.name);
    console.log(`  ${note ? "○" : "✗"} ${d.name.padEnd(22)} ${d.file}${note ? `\n      已登记例外：${note}` : ""}`);
    if (!note) {
      // 帮定位：它在测试里被调过吗？被调过 = 典型的「测试从下层入口进，生产路径空」
      let inTests = 0;
      try {
        inTests = Number(
          execSync(`git grep -c "\\b${d.name}\\b" -- tests/ | wc -l`, { encoding: "utf-8" }).trim(),
        );
      } catch {
        inTests = 0;
      }
      if (inTests > 0) {
        console.log(`      测试里有 ${inTests} 个文件在调它 —— 测试从下层入口进，生产路径上没有人调`);
      }
    }
  }
  console.log();
}

const failures = unlisted.length;
console.log(`判定：${failures === 0 ? "PASS" : `FAIL（${failures} 个哑弹）`}`);
if (failures > 0) {
  console.log(`\n判据原文：\n   ${D49}`);
  console.log(
    `\n怎么改：每个哑弹二选一——\n` +
      `   ① **接线**：在生产路径上真的调它（gate 进 CHAINS、副作用挂到投递后、信号被消费）\n` +
      `   ② **删掉**：连同它的测试一起删（AI 可提议，执行归人——D-34）\n` +
      `   不接受第三条路「留着以后用」：那正是 watchInbox 待过的状态。\n` +
      `   确有理由暂留 → 写进本脚本的 ALLOWED，附上原因（登记过的例外不算失败）。`,
  );
}
process.exit(failures === 0 ? 0 : 1);
