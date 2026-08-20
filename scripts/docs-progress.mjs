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
 * 用法：npm run docs:progress
 * 一致性：与 docs:protocol 同形状——重跑后 git diff --exit-code 应无输出。
 *
 * 「用例数」为什么必须实测：README 曾写 M1 23 / M2 78，提交信息写 19 / 78 / 57，
 * 而 vitest 口径是 23 / 55 / 57。三处手写数字，三个都对不上。
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

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

// ── 权威一：plan.md 的里程碑标题 ──────────────────────────
const plan = readFileSync(PLAN, "utf-8");
const milestones = [];
for (const line of plan.split("\n")) {
  const m = /^## 里程碑 (\S+) (.+)$/.exec(line);
  if (!m) continue;
  const [, id, rest] = m;
  // S2：标题含 ✅ → 已验收。解析器容忍括注与日期，这里同样只看标记
  const passed = rest.includes("✅");
  milestones.push({ id, title: rest.replace("✅", "").trim(), passed });
}

/** 每个里程碑的 [auto] / [human] 断言条数，从断言节数，不手写 */
for (const ms of milestones) {
  const start = plan.indexOf(`## 里程碑 ${ms.id} `);
  const nextIdx = plan.indexOf("\n## ", start + 1);
  const body = plan.slice(start, nextIdx === -1 ? undefined : nextIdx);
  ms.auto = (body.match(/^- \[auto\]/gm) ?? []).length;
  ms.human = (body.match(/^- \[human\]/gm) ?? []).length;
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
w("| D-41 自检不得超过运行时 | `npm run check:testsize` |");
w("| D-47 只增不改有机制 | `npm run check:disciplines` |");
w();

writeFileSync(OUT, L.join("\n") + "\n", "utf-8");
console.log(`已生成 ${OUT}（${milestones.length} 个里程碑，已拆 ${shrunk}/8 份文档）`);
