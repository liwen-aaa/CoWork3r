/**
 * gate-wording.mjs — 把每道 gate 的拦截文案实跑一遍，写成一份可读清单。
 *
 * 为什么要有这个脚本：M5 那条 `[human]` 断言是「拦截提示读起来知道下一步该干什么」，
 * 而它的载体不能是聊天记录里的一段输出——**需要人翻历史才能看见的东西不是有效载体**
 * （D-30）。文案会随实现改动，所以清单必须能重新生成，不能手抄一份放在文档里
 * （手抄 = 第二份权威，D-04；也是 D-03：可推导的值不让人填）。
 *
 * 判据是 D-44：措辞类人工检查挂在产出它的那个里程碑。改一句 reason 现在只是改一行
 * 字符串，等它嵌进工具链之后改一句牵十处。
 *
 * 用法：
 *   npm run wording:gates          → 写 docs/verification/M5-wording.md 并打印路径
 *   node scripts/gate-wording.mjs --stdout   → 只打印，不写盘
 *
 * 每条都是**实跑输出**，不是从设计文档抄的预期值：脚本用真实输入触发每道 gate，
 * 打印它实际吐出的 reason。所以这份清单红了就是文案真的变了。
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { inspectConfig } from "../src/config/index.ts";
import {
  G_command,
  G_plan,
  G_source,
  checkDevOutput,
  checkAwaiting,
  checkHumanQuestions,
  checkRelease,
  checkTestReport,
  commandGateStatus,
  configGate,
  takeSourceBaseline,
} from "../src/gates/index.ts";
import { milestone, parsePlan } from "../src/plan/index.ts";

const OUT = "docs/verification/M5-wording.md";

/** 输入来自真实模板（D-25），不手写 Milestone */
const parsed = parsePlan(process.cwd(), "templates/plan.minimal.md");
if (!parsed.ok) {
  console.error("templates/plan.minimal.md 解析失败，无法生成文案清单：", parsed.errors);
  process.exit(1);
}
const m = milestone(parsed.plan, "M1");
if (!m) {
  console.error("templates/plan.minimal.md 里没有 M1");
  process.exit(1);
}

const root = mkdtempSync(join(tmpdir(), "wf-wording-"));
const w = (rel, text) => writeFileSync(join(root, rel), text, "utf-8");

/** 一条记录：谁拦的 / 什么情况 / 实际说了什么 */
const rows = [];
const rec = (gate, when, res) => {
  rows.push({ gate, when, text: res.ok ? "（放行）" : res.reason });
};

// ── G_plan：arch 分发前 ───────────────────────────────────
rec("G_plan", "[auto] 断言没有命令也没有路径", G_plan({
  root,
  milestone: {
    ...m,
    assertions: m.assertions.map((a) => (a.kind === "auto" ? { ...a, text: "把事情做完做好" } : a)),
  },
}));
rec("G_plan", "里程碑已验收（打过 ✅）", G_plan({ root, milestone: { ...m, passed: true } }));
rec("G_plan", "一条断言都没有", G_plan({ root, milestone: { ...m, assertions: [] } }));

// ── G_artifact：产出结构 ──────────────────────────────────
w("a.md", "# 产出\n\n做完了。\n");
rec("G_artifact_dev", "两条断言一条都没提", checkDevOutput(root, "a.md", m));

w("b.md", "# 产出\n\n- M1.1 完成\n");
rec("G_artifact_dev", "漏了其中一条", checkDevOutput(root, "b.md", m));

rec("G_artifact_dev", "产出文件根本不存在", checkDevOutput(root, "nope.md", m));

w("c.md", "");
rec("G_artifact_dev", "产出文件是空的", checkDevOutput(root, "c.md", m));

w("d.md", "# 报告\n\n- M1.1 通过\n- M1.2 通过\n");
rec("G_artifact_report", "断言都覆盖了，但缺判定行", checkTestReport(root, "d.md", m));

// ── G_human：人工问题 ────────────────────────────────────
rec("G_human", "questions 是空的", checkHumanQuestions([], m));
rec("G_human", "只给了通用方向（老仓库那三条）", checkHumanQuestions(
  ["结构层是否完整", "内容实质是否达标", "引用是否真实可查"],
  m,
));

// ── G_release：放行的前置与凭证（D-01 最后一米）─────────
// 前置那道读 state：临时目录里没有 awaitingHuman，正是「人从未被问过」的现场
rec("G_release", "人从未被问过就放行（state 无许可）", checkAwaiting(root, m.id));
rec("G_release", "凭证缺「人原话」段", checkRelease("arch 整理:已核对断言 确认:Y"));
rec("G_release", "凭证缺「确认」段", checkRelease("人原话:「可以过」 arch 整理:已核对"));

// ── G_source：生产内容 ───────────────────────────────────
w("x.ts", "x\n");
takeSourceBaseline(root, "x.ts");
rec("G_source", "自上次投递一个字节没改", G_source({ root, source: "x.ts" }));
rec("G_source", "配置里的 source 指向不存在的路径", G_source({ root, source: "no-such" }));

// ── G_command：真跑命令 ──────────────────────────────────
const cmd = (command, extra = {}) =>
  G_command({ root, command, timeoutMs: 30_000, label: "测试", ...extra });

rec("G_command", "测试失败（退出码非 0）", cmd(
  `node -e "console.log('2 failed | 8 passed'); process.exit(1)"`,
));
rec("G_command", "测试超时", G_command({
  root,
  command: `node -e "setTimeout(()=>{},9000)"`,
  timeoutMs: 300,
  label: "测试",
}));
rec("G_command", "退出码 0 但输出里没有通过标记", cmd(
  `node -e "console.log('done')"`,
  { passPattern: "(passed|PASS)" },
));
rec("G_command", "命令根本不存在（环境问题，D-32）", cmd("wf-no-such-command"));
rec("G_command", "冷启动自检失败", G_command({
  root,
  command: `node -e "console.error('build error'); process.exit(2)"`,
  timeoutMs: 30_000,
  label: "冷启动自检",
}));

// ── G_config：配置坏了 ───────────────────────────────────
writeFileSync(
  join(root, "wf.config.json"),
  JSON.stringify({ plan: "docs/plan.md", source: "src", test: "npm test", testPass: "([unclosed" }),
  "utf-8",
);
const broken = inspectConfig(root).diagnostics;
rec("G_config", "配置有 fatal，tester 要报 PASS", configGate(broken, "verdict_pass"));
rec("G_config", "同一个坏配置下，dev 要投递", configGate(broken, "review_request"));

// ── 常驻提示（不是拦截，但也是人要读的文案）──────────────
writeFileSync(
  join(root, "wf.config.json"),
  JSON.stringify({ plan: "docs/plan.md", source: "src", test: null }),
  "utf-8",
);
const nullCfg = inspectConfig(root).cfg;
rows.push({
  gate: "（启动简报）",
  when: "test: null —— 人主动声明无法自动测",
  text: commandGateStatus(nullCfg).notice ?? "（没有提示 —— 这就是 D-23 说的静默降级）",
});

try {
  rmSync(root, { recursive: true, force: true });
} catch {
  /* Windows EPERM：临时目录留着不影响结果 */
}

// ── 输出 ─────────────────────────────────────────────────
const L = [];
const p = (s = "") => L.push(s);

p("# M5 拦截文案清单（生成物，勿手改）");
p();
p("> 由 `npm run wording:gates` 生成。**每条都是实跑输出**，不是从设计文档抄的预期值。");
p(">");
p("> 用途：M5 那条 `[human]` 断言的载体 ——");
p("> 「拦截提示读起来知道下一步该干什么」。判据是 dev 4/4 与 tester 0/4 那组实测：");
p("> 老仓库两边的规约都写了要求、都非空，唯一差别是 dev 的拦截文案里明文列了小节名。");
p(">");
p("> 机器能查的只有形状（reason 非空、含断言编号，T3 在查）。");
p("> 「读完知不知道该干什么」没有机械判据，所以这条留人工（D-44：挂在产出它的里程碑）。");
p();
p(`共 ${rows.length} 条。`);
p();

let i = 0;
let lastGate = "";
for (const row of rows) {
  if (row.gate !== lastGate) {
    p(`## ${row.gate}`);
    p();
    lastGate = row.gate;
  }
  i += 1;
  p(`**${i}. ${row.when}**`);
  p();
  p("```");
  for (const line of row.text.split("\n")) p(line);
  p("```");
  p();
}

const text = L.join("\n") + "\n";

if (process.argv.includes("--stdout")) {
  process.stdout.write(text);
} else {
  writeFileSync(OUT, text, "utf-8");
  console.log(`已生成 ${OUT}（${rows.length} 条文案）`);
}
