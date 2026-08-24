/**
 * 从 plan.md + 实测计数生成进度表 —— 进度这个概念的唯一权威在 plan.md。
 *
 * 为什么要生成：进度曾同时手写在三处（README.md、modules/README.md 的散文、
 * 同文件的模块表），全部过时且互不一致——README 说「M3 未开始」，modules 散文说
 * 「当前位置 M1，下一个 M2」，实际 M3 实现已绿。人的入口给的第一印象是错的。
 *
 * 那是 D-04（一概念一权威）+ D-02（没有机制就不会同步）的合并症状。所以：
 *
 *   权威 = docs/plan.md 的里程碑标题（`✅` 标记，语义由 04-plan 的 S2 定义）
 *          + docs/modules/ 里还剩几份 .md（D-06 的收缩进度，数文件不手写）
 *          + vitest 实测用例数（不手写数字，D-03：可推导的值不让人填）
 *
 * 里程碑为什么调 `parsePlan` 而不自己写正则：第一版写了一份
 * `/^## 里程碑 (\S+) (.+)$/`，而它没归一 CRLF——docs/plan.md 被 Windows 的
 * autocrlf 改成 CRLF 那一天，`(.+)$` 卡在 `
` 上，本脚本静默产出
 * 「0 个里程碑 / 已验收 0/0」并把整张表写空。无异常、无非零退码。
 *
 * 那正是本项目存在的理由：语法写两份，两份不一致时没有任何信号（老仓库四份
 * 规划书全部通不过 gate 却没人发现，同一回事）。所以语法只有一份：
 * `src/plan/grammar.ts`。本脚本是它的消费者，不是第二份定义。
 * （Node 24 原生认 .ts，不需要打包器——与人工验证脚本同一条前提）
 *
 * 用法：npm run docs:progress
 * 一致性：与 docs:protocol 同形状——重跑后 git diff --exit-code 应无输出。
 *
 * 「用例数」为什么必须实测：README 曾写 M1 23 / M2 78，提交信息写 19 / 78 / 57，
 * 而 vitest 口径是 23 / 55 / 57。三处手写数字，三个都对不上。
 */
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

import { parsePlan } from "../src/plan/index.ts";

const PLAN = "docs/plan.md";
const OUT = "docs/progress.md";

/** 里程碑 → 它的测试目录（plan.md 的「涉及」节写的是路径，这里只取需要计数的） */
const TEST_DIRS = {
  M1: ["tests/channel"],
  M2: ["tests/protocol"],
  M3: ["tests/config", "tests/roles"],
  M4: ["tests/plan"],
  M5: ["tests/gates"],
  M6: ["tests/adapter", "tests/e2e"],
};

// ── 权威一：plan.md——经真实解析器，不自己写正则 ────────────────
const parsed = parsePlan(process.cwd(), PLAN);
if (!parsed.ok) {
  // 解析不了就不写盘：宁可报错也不产出一张空表（上一版就是静默写空的）
  console.error(`解析 ${PLAN} 失败，不生成进度：`);
  for (const e of parsed.errors) console.error(`  ${PLAN}:${e.line} ${e.message}`);
  process.exit(1);
}

/** 断言条数与 passed 均从解析结果数，不手写（D-03） */
const milestones = parsed.plan.milestones.map((m) => ({
  id: m.id,
  title: m.title,
  passed: m.passed,
  auto: m.assertions.filter((a) => a.kind === "auto").length,
  human: m.assertions.filter((a) => a.kind === "human").length,
}));

if (milestones.length === 0) {
  console.error(`${PLAN} 里一个里程碑都没解出来——不生成进度`);
  process.exit(1);
}

// ── 权威二：实测用例数 ────────────────────────────────────
function countTests(dirs) {
  const present = dirs.filter((d) => existsSync(d));
  if (present.length === 0) return null;
  try {
    const out = execSync(`npx vitest --run ${present.join(" ")} --reporter=json`, {
      encoding: "utf-8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
      env: { ...process.env, npm_lifecycle_event: "docs:progress" },
    });
    const json = JSON.parse(out.slice(out.indexOf("{")));
    // numTotalTestSuites 数的是 describe 块，不是文件（M1 是 11 个文件、但 22 个 suite）。
    // 文件数才是「约束数」的代理量，因为文件名 = 约束编号
    return {
      total: json.numTotalTests,
      passed: json.numPassedTests,
      files: json.testResults?.length ?? json.numTotalTestSuites,
    };
  } catch {
    return null;
  }
}

for (const ms of milestones) {
  ms.tests = countTests(TEST_DIRS[ms.id] ?? []);
}

// ── 权威三：D-06 收缩进度 = docs/modules 还剩几份 ──────────
const moduleFiles = readdirSync("docs/modules").filter((f) => /^\d\d-.*\.md$/.test(f));
const TOTAL_MODULES = 8;
const shrunk = TOTAL_MODULES - moduleFiles.length;

// ── 输出 ──────────────────────────────────────────────────
const L = [];
const w = (s = "") => L.push(s);

w("# 进度（生成物，勿手改）");
w();
w("> 由 `npm run docs:progress` 生成。**权威是 [`plan.md`](plan.md) 的里程碑标题**（`✅` 标记）");
w("> + `docs/modules/` 剩余份数 + vitest 实测计数。");
w(">");
w("> 进度曾同时手写在 README、modules 散文、modules 表三处，全部过时且互不一致——");
w("> 那是 D-04 + D-02 的合并症状。手写数字同理：三处写过 19 / 23 / 78，没一处对得上实测。");
w();

w("| 里程碑 | 内容 | 断言 | 用例 | 状态 |");
w("|---|---|---|---|---|");
for (const ms of milestones) {
  const a = `${ms.auto} auto`;
  const h = ms.human ? ` + ${ms.human} human` : "";
  const t = ms.tests ? `${ms.tests.passed}/${ms.tests.total} 绿（${ms.tests.files} 文件）` : "—";
  const state = ms.passed ? "✅ 已验收" : ms.tests ? "🚧 在建" : "⬜ 未开始";
  w(`| ${ms.id} | ${ms.title} | ${a}${h} | ${t} | ${state} |`);
}
w();

const done = milestones.filter((m) => m.passed).length;
w(`已验收 ${done}/${milestones.length} 个里程碑。`);
w();

w("## 文档收缩（D-06）");
w();
w(`八份模块文档已拆 **${shrunk}** 份，剩 **${moduleFiles.length}** 份：`);
w();
for (const f of moduleFiles) w(`- \`docs/modules/${f}\``);
w();
w("代码已落地而文档未收缩 = 两份权威。一个里程碑的第三个 commit 就是拆它对应的那份。");
w();

w("## 常驻机制");
w();
w("离开每轮读序的纪律条目（D-48），它们由 `npm test` 的 pretest 自动跑：");
w();
w("| 条目 | 机制 |");
w("|---|---|");
// 从 pretest 与 disciplines 落点列推导，不手写——手写过一次，D-49/D-52 加进
// pretest 之后这张表漏了两行而没有任何信号（生成物却手写 = D-03 + D-04）
for (const m of residentMechanisms()) {
  w("| " + m.id + " " + m.title + " | `npm run " + m.cmd + "` |");
}
w();

/**
 * 常驼机制表：pretest 里跑的 check:* ∩ disciplines 落点列声称的那些。
 * 两处交叉才算：脚本真的在 pretest 里（每轮跑）且台账认它是某条的落点。
 */
function residentMechanisms() {
  const pretest = JSON.parse(readFileSync("package.json", "utf-8")).scripts.pretest;
  const cmds = [...pretest.matchAll(/npm run (check:[\w-]+)/g)].map((m) => m[1]);
  const disc = readFileSync("docs/disciplines.md", "utf-8");
  const out = [];
  for (const cmd of cmds) {
    for (const line of disc.split("\n")) {
      if (!line.startsWith("| D-") || !line.includes("npm run " + cmd)) continue;
      const id = /^\| (D-\d+) \|/.exec(line);
      const title = /\*\*([^*]+)\*\*/.exec(line);
      if (id && title) out.push({ id: id[1], cmd, title: title[1].trim() });
      break;
    }
  }
  return out;
}

writeFileSync(OUT, L.join("\n") + "\n", "utf-8");
console.log(`已生成 ${OUT}（${milestones.length} 个里程碑，已拆 ${shrunk}/8 份文档）`);
