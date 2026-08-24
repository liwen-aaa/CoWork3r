/**
 * check-config-consumed.mjs — D-51 的机制落点（配置字段必须有消费点）
 *
 * 来源事故（2026-08-24 实测，两个）：
 *   ① `roleNotes` —— `wire.ts` 写 `buildSystemPrompt(role, event.systemPrompt)`，
 *      第三参 `notes` 永远 undefined。人在 `wf.config.json` 里填的项目事实从未
 *      进过任何窗口的 system prompt。而它有四处声明存在：D-18 一整条纪律、
 *      `decisions.md` 一条决策、`templates/wf.config.json` 示例、本仓库自己的配置。
 *   ② `maxRounds` —— `State` 自带 `DEFAULTS.maxRounds = 5`，`flow.ts` 读的是
 *      `state.maxRounds`，而没有任何地方把 `cfg.maxRounds` 写进 state。
 *      配 2 也照样 5 轮才 stuck。A4 用 `cfg.maxRounds` 当循环上限，恰好模板里
 *      也是 5，与默认值撞上——测试因此永远绿（D-25 想防的巧合的另一种形态）。
 *
 * ── 为什么 D-49 抓不到这一类 ──────────────────────────────
 * D-49 问「导出有没有生产调用点」。而这两处的函数都活着：`buildSystemPrompt`
 * 有调用点、`inspectConfig` 有调用点。死的是**参数**与**字段**——
 * 哑弹的伪装又深一层：不是「没接线」，是「接了但没接全」。
 *
 * 症状与 D-49 同形，而且更坏一点：配置字段是**人填的**。人填了、工具不报错、
 * 行为不变——他会以为自己配了。老仓库的 `testCmd` 不配就静默降级是同一个病
 * （03-config 文件头记着它），只不过那次是「不配」，这次是「配了没人读」。
 *
 * ── 判据 ────────────────────────────────────────────────
 *   分子对象 = `src/config/fields.ts` 的 `FIELDS` 表里每个键
 *   消费点   = `src/` 里出现 `cfg.<key>` / `cfg?.<key>` / `.cfg.<key>` / `config.<key>`
 *              （剥注释之后）
 *   零消费点 = 违反：要么接线，要么从 FIELDS 删掉（删 = 承认这个字段不存在，
 *              而不是留着骗人）
 *
 * 已知盲区（写在这里，别假装没有）：
 *   - 解构消费 `const { maxRounds } = cfg` 抓不到。当前无此写法；出现时本脚本
 *     会误报，届时把口径扩到解构，而不是加例外。
 *   - 「读了但没用对」抓不到（如读进来又被默认值覆盖）。那要靠行为测试。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** 被拦时打印的判据原文（D-48：机制的报错要自带判据，移出读序后它是唯一入口） */
const D51 = `D-51 配置字段必须有消费点：wf.config.json 的每个字段（FIELDS 表的键）
   必须在 src/ 里被真的读取。有解析、有诊断、有模板示例，而没有人读它 = 人填了不生效。
   来源：roleNotes 四处声明存在而从未注入；maxRounds 被 State 默认值遮蔽，配 2 也走 5 轮。
   比 D-49 更坏一点：配置是**人填的**，静默忽略会让他以为自己配了（老仓库 testCmd 同病）。`;

const FIELDS_FILE = "src/config/fields.ts";

/** 登记过的例外：留着有原因，且原因写在这里。空集是目标状态 */
const ALLOWED = new Map([
  // 形如 ["fieldName", "为什么它可以没有消费点"]
]);

function walk(dir) {
  return readdirSync(dir).flatMap((e) => {
    const full = join(dir, e);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith(".ts") ? [full] : [];
  });
}

const stripComments = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// ── 取 FIELDS 表的键 ──────────────────────────────────────
const fieldsSrc = stripComments(readFileSync(FIELDS_FILE, "utf-8"));
const block = /export\s+const\s+FIELDS[^=]*=\s*\{([\s\S]*?)\n\};/.exec(fieldsSrc);
if (!block) {
  console.log(`⚠ 在 ${FIELDS_FILE} 里找不到 FIELDS 表——本脚本的口径失效了，先修它`);
  process.exit(1);
}
const keys = [...block[1].matchAll(/^\s{2}(\w+)\s*:/gm)].map((m) => m[1]);

// ── 数消费点 ──────────────────────────────────────────────
const files = walk("src").map((f) => f.replaceAll("\\", "/"));
const clean = new Map(files.map((f) => [f, stripComments(readFileSync(f, "utf-8"))]));

function consumers(key) {
  // cfg.x / cfg?.x / ctx.cfg.x / config.x —— 覆盖当前全部读法
  const re = new RegExp(`(?:cfg|config)\\s*\\??\\.\\s*${key}\\b`, "g");
  const hits = [];
  for (const f of files) {
    if (f.endsWith("config/fields.ts")) continue; // 定义处不算消费
    clean.get(f).split("\n").forEach((line, i) => {
      re.lastIndex = 0;
      if (re.test(line)) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 88)}`);
    });
  }
  return hits;
}

console.log("D-51 配置字段必须有消费点（口径见本脚本文件头）\n");

const dead = [];
for (const key of keys) {
  const hits = consumers(key);
  console.log(`  ${String(hits.length).padStart(2)}  ${key}`);
  if (hits.length === 0) dead.push(key);
}

console.log(`\n  字段 ${keys.length} 个，零消费点 ${dead.length} 个${dead.length ? "  ← 人填了不生效" : ""}`);

const unlisted = dead.filter((k) => !ALLOWED.has(k));
for (const k of dead) {
  const note = ALLOWED.get(k);
  console.log(`  ${note ? "○" : "✗"} ${k}${note ? `  已登记例外：${note}` : ""}`);
}

console.log(`\n判定：${unlisted.length === 0 ? "PASS" : `FAIL（${unlisted.length} 个字段没人读）`}`);
if (unlisted.length > 0) {
  console.log(`\n判据原文：\n   ${D51}`);
  console.log(
    `\n怎么改：每个字段二选一——\n` +
      `   ① **接线**：在 src/ 里真的读它，并补一条从公共入口验证「配了就生效」的测试\n` +
      `   ② **删掉**：从 FIELDS 表移除（连同模板示例与文档提及）——承认它不存在，\n` +
      `      而不是留一个人填了不生效的字段\n` +
      `   确有理由暂留 → 写进本脚本的 ALLOWED，附原因。`,
  );
}
process.exit(unlisted.length === 0 ? 0 : 1);
