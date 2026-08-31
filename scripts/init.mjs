#!/usr/bin/env node
/**
 * day 0 骨架铺设 —— 「人只有一个想法，项目里只有这套流程」的那个状态。
 *
 * 为什么需要它：三窗口的前提是**已经有断言**。配置三项必填（plan / source / test）在
 * day 0 全填不出来（没代码 → 没 source，没测试基建 → 不知道 test 写什么，plan.md 还不存在），
 * 而缺字段是 fatal。所以空项目直接开三窗口，只能得到三个报配置错的窗口。
 *
 * 正确顺序：init 铺骨架 → **单窗口澄清**（写目标三句 + M0 断言，逐条签字）→ 才开三窗口。
 * 本脚本只做第一步，而且**故意不开窗口**（不在会话里开窗口 / 浏览器 / IDE）。
 *
 * 铺什么：templates/init/ 的骨架 + 语言无关的机制包（不装绑生态的那些，且显式说出没装什么，
 * 不静默缺失）。三份空表（disciplines 两条 / consensus 空 / decisions 空）不是占位符，
 * 是**生长位置已经定好** —— 空表里出现的第一条一定有来源事故，拷四十条过来的一条都没有。
 *
 * 不覆盖已存在的文件：报「已存在，跳过」。重跑安全。
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(HERE, "..");
const SKELETON = join(PKG_ROOT, "templates", "init");
const ROOT = resolve(process.argv[2] ?? process.cwd());
const DRY = process.argv.includes("--dry-run");

/** day 0 缺省装机集：语言无关的那些（纯 text + git + fs） */
const DEFAULT_PACKS = ["append-only-ledger", "claimed-landing"];
/** 判据通用但机制绑生态的，按项目情况定 */
const CONDITIONAL_PACKS = { "wired-check": "package.json" };

function walk(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, base));
    else out.push(relative(base, full).replaceAll("\\", "/"));
  }
  return out;
}

if (!existsSync(SKELETON)) {
  console.error(`骨架目录不存在：${SKELETON}`);
  process.exit(2);
}

console.log(`铺 day 0 骨架 → ${ROOT}${DRY ? "（--dry-run，不写盘）" : ""}\n`);

const files = walk(SKELETON);
const written = [];
const skipped = [];
for (const rel of files) {
  const target = join(ROOT, rel);
  if (existsSync(target)) {
    skipped.push(rel);
    continue;
  }
  if (!DRY) {
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(SKELETON, rel), target);
  }
  written.push(rel);
}

for (const rel of written) console.log(`  + ${rel}`);
for (const rel of skipped) console.log(`  = ${rel}（已存在，跳过）`);

// ── 机制包：装语言无关的，显式说出没装什么 ────────────────
const packs = [...DEFAULT_PACKS];
const declined = [];
for (const [id, needs] of Object.entries(CONDITIONAL_PACKS)) {
  if (existsSync(join(ROOT, needs))) packs.push(id);
  else declined.push(`${id}（需要 ${needs}，本项目没有 —— 判据通用而机制绑生态，换生态请重写它的 check.mjs）`);
}

const mechFile = join(ROOT, "mech.json");
if (existsSync(mechFile)) {
  console.log(`  = mech.json（已存在，跳过；装包用 node scripts/mech.mjs install <id>）`);
} else {
  const options = {};
  for (const id of packs) {
    const p = JSON.parse(readFileSync(join(PKG_ROOT, "mechanisms", id, "pack.json"), "utf-8"));
    options[id] = { ...(p.defaults ?? {}) };
  }
  const mech = {
    _: "机制包的项目侧配置。判据本体不在这里改——要改就改包，走上游。",
    install: packs,
    options,
  };
  if (!DRY) writeFileSync(mechFile, `${JSON.stringify(mech, null, 2)}\n`);
  console.log(`  + mech.json（装：${packs.join(" / ")}）`);
}
for (const d of declined) console.log(`  - 未装 ${d}`);

// ── 下一步：这是整个脚本最重要的输出 ─────────────────────
console.log(
  [
    "",
    "─── 下一步（顺序不能换）───────────────────────────",
    "",
    "1. 单窗口澄清，**先不要开三窗口**：",
    "   pi        然后说「用 plan skill 帮我澄清这个项目」",
    "",
    "   澄清产出 docs/plan.md 的三样东西，缺一样就还没到开工：",
    "     · 目标三句：要什么 / 成功 = 什么 / 不做什么",
    "     · M0 断言：[auto] 带得出命令或路径，[human] 是你自己的原话",
    "     · 逐条签字：一条条念给你「这条做到了你认不认」，不是「你看一下这份文件」",
    "",
    "2. 技术栈与测试基建定下来。陌生领域让 agent 执刀，你持有目的 + 用断言评审；",
    "   熟悉领域你执刀，agent 当陪练。无论谁执刀，**验收标准永远在你手里**。",
    "",
    "3. M0 收尾时把 wf.config.json 的 test 从 null 改成真命令。",
    "   在那之前 PASS 只靠结构检查 + 人工关卡（已显式降级，不是静默缺失）。",
    "",
    "4. 这时才开三窗口：",
    "   launch\\trio.ps1 -Root <项目根>      (Windows)",
    "   ./launch/trio.sh <项目根>            (Linux / macOS，需 tmux)",
    "",
    "机制在跑吗：node scripts/mech.mjs run（装了几个跑几个）",
    "有哪些候选：node scripts/mech.mjs list",
  ].join("\n"),
);
