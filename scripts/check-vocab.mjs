/**
 * check-vocab.mjs — 词汇表语料化（共识讨论 ② 的物化）
 *
 * 背景（2026-08-24 实测）：vocab.md 之前自称「表内词在 src/ 里词义一致——纯 grep
 * 零误报」，而那个 grep 不存在——D-02 的精确形态（声称是机制，实际是规约）。
 * 且表内 20 词里 17 个在模型语料（规约 + 工具面 + 简报 + gate 文案）零出现：
 * 词汇表描述的是开发者语言，不是模型语言。
 *
 * 判据（vocab.md 文件头）：
 *   存在性  标「模型」的词必须在模型语料中实际出现（零出现 = 声称模型用而模型不用）
 *   唯一性  语料中高频出现的表外概念词 → 报告为候选（人工决定：登记 or 改语料）
 *
 * 语料 = 模型真读到的文本，**不含注释**：
 *   1. src/roles/{arch,dev,tester}.md（注入 system prompt）
 *   2. sendTaskDescription(arch/dev/tester) 实跑输出（工具 description）
 *   3. sendTaskSchema(role) 的 properties[].description（工具参数说明）
 *   （简报 bootBriefing 与 gate reason 文案随真实输入生成，第二步再接；
 *     第一步先钉「规约 + 工具面」这两样纯代码可生成的。）
 *
 * 为什么语料必须实跑而不是手写：D-25 精神——手写语料与真实注入脱钩，
 * 规约改了检查还在测旧文本。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { sendTaskDescription, sendTaskSchema } from "../src/protocol/index.ts";
import { loadRoleSpec } from "../src/roles/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const VOCAB = join(HERE, "..", "docs", "vocab.md");
const ROLES = ["arch", "dev", "tester"];

/** 从 vocab.md 表格提取：词（去掉「（别名）」后缀）→ 类别 */
function parseVocab() {
  const lines = readFileSync(VOCAB, "utf-8").split("\n");
  const out = [];
  for (const line of lines) {
    const m = line.match(/^\|\s*\*\*(.+?)\*\*\s*\|.*\|\s*(模型|文档)\s*\|$/);
    if (!m) continue;
    // 词可能带英文别名：「里程碑（milestone）」→ 取中文主干（别名不参与出现检查，避免误报）
    const term = (m[1] ?? "").split("（")[0].split("(")[0].trim();
    out.push({ term, kind: m[2] === "模型" ? "模型" : "文档" });
  }
  return out;
}

/** 模型语料：roles 规约 + 工具 description + schema descriptions（全部来自真实代码） */
function corpus() {
  const roles = ROLES.map((r) => loadRoleSpec(r)).join("\n");
  const desc = ROLES.map((r) => sendTaskDescription(r)).join("\n");
  const schemaDescs = ROLES.map((r) => {
    const schema = sendTaskSchema(r);
    const props = schema.properties ?? {};
    return Object.values(props)
      .map((p) => p.description ?? "")
      .join("\n");
  }).join("\n");
  return `${roles}\n${desc}\n${schemaDescs}`;
}

const terms = parseVocab();
const c = corpus();

// ── 存在性：模型词必须在语料中出现 ──
const missingModel = terms.filter((t) => t.kind === "模型" && !c.includes(t.term));
// ── 报告语料中表外的高频概念词（唯一性候选）──
const known = new Set(terms.map((t) => t.term));
const candidates = [];
for (const w of ["收尾", "验收", "铁律", "放行", "驳回", "拦截", "轮次", "修复", "规约", "验证"]) {
  const n = (c.match(new RegExp(w, "g")) ?? []).length;
  if (n >= 2 && !known.has(w)) candidates.push({ word: w, n });
}

let failed = false;
console.log("D-词汇表语料化（语料 = 规约 + 工具面，不含注释）\n");
for (const t of terms) {
  const n = (c.match(new RegExp(t.term, "g")) ?? []).length;
  console.log(`  ${t.kind}  ${String(n).padStart(3)}  ${t.term}`);
}

if (missingModel.length > 0) {
  failed = true;
  console.log(`\n⚠ 标「模型」却零出现的词：${missingModel.map((t) => t.term).join(" / ")}`);
  console.log("  判据（vocab.md）：模型词必须在模型语料中实际出现。零出现 = 声称模型用而模型不用。");
  console.log("  修法：① 语料里补上这个词（该词真该进规约/工具面）；② 或降级为「文档」类别。");
}
if (candidates.length > 0) {
  console.log(
    `\nℹ 语料高频表外词（唯一性候选，人工决定登记 or 改语料）：${candidates
      .map((x) => `${x.word}×${x.n}`)
      .join(" / ")}`,
  );
}
if (!failed) {
  console.log(`\n✓ 模型词 ${terms.filter((t) => t.kind === "模型").length} 个全部在语料中出现`);
}
process.exit(failed ? 1 : 0);
