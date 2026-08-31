/**
 * check-landing.mjs — 落点必须指向**真实存在且真在跑**的东西（D-56）
 *
 * D-02 说：任何「必须写 X」的要求，要么进拦截链，要么**显式承认会被跳过**。
 * check-disciplines.mjs 已堆了「声称 npm run x 就必须存在且已接线」。
 * 这个脚本堆的是剩下两半：
 *   1. 声称 `tests/...` 的，那个测试文件必须真实存在（否则是伪装落点）
 *   2. 没有任何机制的，必须自己承认没有机制
 *
 * ── 为什么需要它：一次严重的低估 ──────────────────────────
 *
 * 迁移 OpenPI #213 的 ledger 时，首次运行照出 12 条「伪装落点」：
 * 落点写着 `04-plan 解析器`、`05-gates`、`01-channel + 07-adapter` 这类**模块名**。
 * 而 docs/modules/*.md 按 D-06 早已拆完（只剩 README.md 的依赖图），
 * 于是这些落点指向了空气——读起来像有机制，实际没有任何命令跑到它。
 *
 * 但逐条核实后发现，真相比「12 条没机制」更糟也更好：
 *   **机制一直在，只是台账不知道。**
 * tests/ 里 79 个文件、386 个用例，文件名精确对应纪律编号：
 *   D-16 塌缩        ← tests/plan/L1-minimal.test.ts
 *   D-20 auto/human  ← tests/plan/L3-kind-required + L4-auto-needs-cmd + L5-human-needs-text
 *   D-22 仪式量推导  ← tests/gates/T2-artifact-scale.test.ts
 *   D-23 显式降级    ← tests/gates/T8-config-fatal.test.ts
 *   D-07 pi 只类型   ← tests/adapter/A9-injection-seam.test.ts（前半就是全库 grep）
 * 这些每轮 npm test 都跑，却在台账里显示为「无机制」。
 * 14% 的机制覆盖率是**严重低估**——落点列与 tests/ 之间缺一条索引。
 *
 * 所以本脚本的判据是 D-49 的**镜像形态**：
 *   D-49 问「导出有没有生产调用点」；这里问「纪律有没有测试调用点」。
 *   两者的失败模式同源：看起来有人在守，实际没人调用。
 *
 * ── 迁移自 OpenPI #213 的三处，以及为什么不照抄 ────────────
 *
 * 迁入：
 *   1. 递归可达性（scriptIsWired）——本仓库无 CI，以 pretest/test 为根
 *   2. 执行力状态必须能机器判定（Status=enforced/manual 的本地形态）
 *   3. 台账必须自述 append-only 政策（否则该约定只活在检查器里）
 * 未迁入：
 *   HISTORICAL_LEDGER 静态基线（硬编码行内容防改写）——该职责已由
 *   check-disciplines.mjs 的 git 历史 diff 承担，且更强：查真实历史而非
 *   硬编码快照，还覆盖工作区未提交的删除。重复实现会制造两份真相（D-04）。
 *
 * ── 退出码分档（D-55）────────────────────────────────────
 *
 *   [声称的 npm 命令不存在/不可达]  可修复的当下状态 → ✗ 闸门
 *   [声称的 tests/ 路径不存在]      可修复的当下状态 → ✗ 闸门
 *   [无机制且未承认]                需人批改判据本体 → ⚠ 报告（D-51 归人）
 */
import { readFileSync, existsSync } from "node:fs";

const FILE = "docs/disciplines.md";

/** 被拦时打印的判据原文（D-48：移出读序的条目，第一次被知道就是被拦那刻） */
const CRITERION = `D-56 执行力档位必须显式，落点必须指向真实存在且真在跑的东西：
   落点写着代码路径或模块名却没有任何命令跑到它 = 伪装成有机制，比明说「规约」更坏
   —— 这是 D-49 那一档（有实现无调用点）套在台账上的形状，镜像形态是
   「纪律必须有测试调用点」。来源：12 条落点指向已按 D-06 拆完的模块文档，
   而真实守它们的 386 个用例从未被台账登记。`;

/** 明说自己是空落点的措辞 = 诚实承认会被跳过，合法 */
const ADMITS_PROSE = /规约|人查|人批|接受(会被)?(跳过|稀释)|无法检查|架构|由人|人手动/;
/** 明说自己是待办 = 诚实的未决，合法 */
const ADMITS_PENDING = /拟机制化|见未决|尚未落地|待迁移/;

let failures = 0;
/** 需人批才能转绿的项：计数但不影响退出码（D-55） */
let pendingHuman = 0;
const fail = (msg) => {
  failures++;
  console.log(`  ✗ ${msg}`);
};
/** 报告档：数字摆眼前，行动由人决定（D-53 的形态） */
const report = (msg) => {
  pendingHuman++;
  console.log(`  ⚠ ${msg}`);
};
const ok = (msg) => console.log(`  ✓ ${msg}`);

const text = readFileSync(FILE, "utf-8");

// ── 0. 台账必须自己声明 append-only ──────────────────────
console.log("[0] 台账自述 append-only 政策");
{
  // 迁移自 OpenPI：政策写在文件里，而不是只活在 check 脚本的注释里。
  // 否则「只增不改」这条约定本身就只是口头的（它管着所有条目，却没人管它）。
  if (/只增不改/.test(text)) ok("台账声明了「只增不改」");
  else
    fail(
      "台账未声明「只增不改」政策 —— 表头必须写明，否则该约定只活在检查器里，读台账的人看不到",
    );
}

// ── 1. 解析条目与落点 ────────────────────────────────────
const rows = [];
for (const line of text.split("\n")) {
  const m = /^\|\s*(D-\d+)\s*\|(.*)\|\s*$/.exec(line);
  if (!m) continue;
  const cells = m[2].split("|").map((s) => s.trim());
  rows.push({ id: m[1], landing: cells[cells.length - 1] ?? "" });
}

// ── 2. 声称的 npm 机制：存在 + 从 pretest/test 递归可达 ─────
console.log("\n[1] 声称 npm 机制的条目：命令存在且从 pretest/test 可达");
{
  const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
  const scripts = pkg.scripts ?? {};

  /**
   * 递归判定可达性（迁移自 OpenPI 的 scriptIsWired）。
   * 为什么要递归：check-disciplines.mjs 现有实现只收集 test 与 pre / post 钩子
   * **一层**里的 `npm run x`。若将来出现 pretest → check:group → check:leaf 两层结构，
   * 叶子实际会跑却被判成未接线（假红）；反过来若有人把机制挂进一个没人调用的
   * 中间 script，一层检查会漏（假绿）。可达性是传递性质，必须递归。
   */
  const reaches = (name, seen = new Set()) => {
    if (name === "test" || name.startsWith("pre") || name.startsWith("post"))
      return true;
    if (seen.has(name)) return false; // 循环引用不算可达
    seen.add(name);
    return Object.entries(scripts).some(([caller, body]) => {
      if (!new RegExp(`npm run ${name}(?=\\s|$|&|;)`).test(String(body)))
        return false;
      return reaches(caller, seen);
    });
  };

  const claims = rows
    .map((r) => {
      const m = /npm run ([\w:-]+)/.exec(r.landing);
      return m ? { id: r.id, script: m[1] } : null;
    })
    .filter(Boolean);

  if (claims.length === 0) ok("无条目声称 npm 机制");
  for (const { id, script } of claims) {
    if (!scripts[script]) {
      fail(`${id} 声称 npm run ${script}，但 package.json 里没有这个 script`);
    } else if (!reaches(script)) {
      fail(
        `${id} 的 npm run ${script} 存在但从 pretest/test 不可达 —— ` +
          `没人调用的检查器比不存在更坏（D-02）`,
      );
    } else {
      ok(`${id} → npm run ${script}（可达）`);
    }
  }
}

// ── 3. 声称的测试调用点必须真实存在（D-49 的镜像）────────────
console.log("\n[2] 声称 tests/ 路径的条目：那个测试文件必须真实存在");
{
  // 为什么这一档是闸门而非报告：测试文件路径是**可修复的当下状态**——
  // 文件改名或删除后，落点立刻失真，而修法明确（改路径或恢复文件）。
  // 这正是 D-55 的分界线：可修复的进闸门。
  let checked = 0;
  for (const r of rows) {
    // 允许一条纪律列多个测试（D-20 由 L3/L4/L5 三条共同守）
    const paths = [...r.landing.matchAll(/`(tests\/[\w./-]+\.ts)`/g)].map(
      (m) => m[1],
    );
    for (const p of paths) {
      checked++;
      if (existsSync(p)) ok(`${r.id} → ${p}（存在）`);
      else
        fail(
          `${r.id} 声称 ${p}，但该文件不存在 —— ` +
            `纪律必须有测试调用点（D-49 的镜像形态）`,
        );
    }
  }
  if (checked === 0) ok("无条目声称 tests/ 路径");
}

// ── 4. 无机制的条目必须自己承认 ────────────────────────────
console.log("\n[3] 无机制的条目必须显式承认（不得伪装成有落点）");
{
  const noMech = rows.filter(
    (r) => !/npm run/.test(r.landing) && !/`tests\//.test(r.landing),
  );
  const disguised = [];
  const admitted = { prose: 0, pending: 0 };

  for (const r of noMech) {
    if (ADMITS_PENDING.test(r.landing)) admitted.pending++;
    else if (ADMITS_PROSE.test(r.landing)) admitted.prose++;
    else disguised.push(r);
  }

  ok(
    `${admitted.prose} 条明说规约/人查，${admitted.pending} 条明说待机制化 —— ` +
      `这些是诚实的空落点，合法`,
  );

  if (disguised.length === 0) {
    ok("无伪装落点");
  } else {
    // 降级为报告（D-55）：落点列是**判据本体**，其修改按 D-51 必须人批。
    // 在人批之前，不存在任何本仓库改动能让这些项转绿——而 D-55 的判据正是
    // 「失败条件无法通过修改当前代码消除则不得占用闸门退出码」。
    // 若这里判红，它就会像 60b9646 那条历史一样拦住 386 个能跑的测试。
    for (const r of disguised) {
      report(
        `${r.id} 落点写「${r.landing}」——` +
          `既无 npm 机制，也无 tests/ 路径，也未承认是规约/人查/待办。` +
          `三选一：接线成真机制、登记守它的测试路径、或写明它会被跳过`,
      );
    }
  }
}

// ── 5. 执行力概览（数字摆眼前，行动由人决定 —— D-53 的形态）──
console.log("\n[4] 执行力概览");
{
  const mech = rows.filter(
    (r) => /npm run/.test(r.landing) || /`tests\//.test(r.landing),
  ).length;
  const pending = rows.filter(
    (r) =>
      !/npm run/.test(r.landing) &&
      !/`tests\//.test(r.landing) &&
      ADMITS_PENDING.test(r.landing),
  ).length;
  const prose = rows.length - mech - pending;
  const pct = ((mech / rows.length) * 100).toFixed(0);
  console.log(
    `  共 ${rows.length} 条：机制 ${mech}（${pct}%）· 规约 ${prose} · 待机制化 ${pending}`,
  );
  console.log(
    `  （这是仪表不是闸门：比例低不判红。D-40 第①问——没有观察到的失败模式就不加机制）`,
  );
}

console.log(
  `\n判定：${failures === 0 ? "PASS" : `FAIL（${failures} 项）`}` +
    `${pendingHuman > 0 ? ` · 待人批 ${pendingHuman} 项（不拦，D-55）` : ""}`,
);
if (pendingHuman > 0) {
  console.log(
    `\n上述 ${pendingHuman} 条伪装落点需逐条人批（D-51：落点列是判据本体）。` +
      `\n每条只需一个决定：接线成真机制、登记守它的测试路径、或改成明说「规约」「评审时人查」「拟机制化，见未决」。`,
  );
}
if (failures > 0) {
  console.log(`\n判据原文：\n   ${CRITERION}`);
  console.log(
    `\n怎么改：把落点接线成真命令并串进 pretest、把测试路径写成 \`tests/...\` 的真实文件、` +
      `或把落点文本改成明说「规约」「评审时人查」「拟机制化，见未决」之一。` +
      `不要为了过检查删掉落点列——空着比写清楚更坏。`,
  );
}
process.exit(failures === 0 ? 0 : 1);
