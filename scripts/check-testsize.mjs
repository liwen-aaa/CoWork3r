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
 * ── 2026-08-21 第二次审的结论（M4 收尾，红线 1.95）─────────
 * 构成 diff（对上次审 1.71 = src 735 / tests 1256）：
 *   src   735 → 1115（+380，全是 src/plan：grammar / parse / frontier / types / index）
 *   tests 1256 → 2171（+915，其中 tests/plan 849，其余来自 L10 与 L7 的补测）
 *
 * 判据是「测真实行为还是测仪式」，逐份过 tests/plan 十份：
 *   L1  最小塌缩          真实行为（D-16 的可运行下限，模板超重时它红）
 *   L2  位置编号          真实行为（M1.3 的编号规则）
 *   L3  kind 必填         真实行为（`[AUTO]` 不静默当成 auto）
 *   L4/L5 可测性判据      真实行为（gate 的核心判据，05-gates 直接消费）
 *   L6  ✅ 容忍           真实行为（arch 往标题写状态，解析器必须容忍）
 *   L7  未决表与 frontier 真实行为，且**逮到两个真 bug**：段位错位丢 owner、
 *                        以及我自己第一版写松的那条断言
 *   L8  模板进测试        真实行为（老仓库格式分裂两个月无人发现的唯一防线）
 *   L9  老仓库回归        真实行为（真实出过事的输入）
 *   L10 CRLF 归一         真实行为，且**逮到一个真 bug**（docs:progress 静默写空表）
 *   _fixture 55 行        无 it，只提供真实文件路径 + derive/verbatim 两个动作
 *
 * 仪式成分：没找到。三个真 bug 全部由这批用例逮出，其中两个（丢 owner、
 * 进度表写空）是**静默**失效，人眼过不了。
 *
 * 但有一条是这轮真正的负债，记在这里：**L7 182 行 / 12 it 明显偏大**——未决表把
 * id 规则、三段式、状态机、frontier 分组四件事挤在一个文件里，按「一个约束一个
 * 文件」本该拆成三四份。不在本轮拆（M4 已收尾，拆文件是独立改动，D-45）。
 * 下次红了先看它。
 *
 * 结构性原因未变：src 的注释按 D-06 承载文档职责，剥离后只剩纯函数；测试即规格。
 * **阈值仍留 1.0，不上调。**
 *
 * ── 2026-08-21 第三次审的结论（M5 收尾，红线 2.09）─────────
 * 构成 diff（对上次审 1.95 = src 1115 / tests 2171）：
 *   src   1115 → 1501（+386，全是 src/gates 七个文件）
 *   tests 2171 → 3144（+973，其中 tests/gates 951、tests/plan +22）
 *
 * 逐份过 tests/gates 十份，判据是「测真实行为还是测仪式」：
 *   T1  分发前可测        真实行为（reason 带行号，者仓库那个裸 false 的反面）
 *   T2  产出随断言数缩放  真实行为（D-22；含「小节多寡不影响判定」这条反向证据）
 *   T3  漏一条列编号    真实行为（这是本层唯一被实测验证过的杠杆：dev 4/4 vs tester 0/4）
 *   T4  快照比对        真实行为（size+mtime 已被实测否掉，改 sha256）
 *   T5  真跑命令        真实行为，且**逮到两个真文案 bug**：GBK 乱码、
 *                       以及命令找不到被报成「测试失败」（D-32 归类错）
 *   T6  test: null      真实行为（D-23：空 gate 合法、静默的不合法）
 *   T7  人工问题覆盖    真实行为（者仓库无此 gate，四个里程碑零缺陷被人工关卡抓到）
 *   T8  配置 fatal 不对称  真实行为（拦「宣布完成」、放行「继续开发」）
 *   T9  链是数据        真实行为（spy 计数验贵的真没跑；双向查 ROUTES↔CHAINS，
 *                       者仓库 ticket_result 七处声明零处工作就是这个形状）
 *   T10 者仓库四份报告  真实行为（真实出过事的输入；含防误伤那半）
 *   _fixture 126 行     无 it，只做三件事：真 Milestone / 真 Config / 从断言表推导产出
 *
 * 仪式成分：没找到。两个文案 bug 全由这批用例逐出，且它们正好是本层存在
 * 的理由本身（dev 4/4 与 tester 0/4 的差别全部来自措辞）。
 *
 * 上次记的那条负债（L7 偏大，「下次红了先看它」）：**变差了**。182 行 → 236 行，
 * 仍是 12 个 it（`6747c8e` 补的两条回归）。不在本轮拆：拆文件是独立改动（D-45），
 * 而本轮是 M5。**结论：它升级为下一个里程碑开工前的第一件事**，不再等「下次红」——
 * 这个拖字术已经证明会把负债往后推一轮（上次就是这么写的，然后它又长了 54 行）。
 * tests/gates 这轮没重蹈：十份最大的 T5 也是 250 行 / 13 it，且它真的就是一个约束
 * （真跑命令）的多个面。
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
