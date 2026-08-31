/**
 * check-disciplines.mjs — D-47 的机制落点
 *
 * 两件事，都不需要网络、不需要构建：
 *   1. 历史里有没有**删掉过条目**（某个 D-xx 在 `-` 侧出现而 `+` 侧没有 = 违反「只增不改」）
 *      —— 包含**工作区未提交的删除**（`git diff HEAD`），否则它只能事后问责，拦不住正在发生的那一次
 *   2. 当前表里编号是否严格递增、有无重号（乱序会掩盖删除）
 *
 * 为什么需要它：D-47 自己的来源就是一次未被发现的原地替换——`42bd0e7` 把 D-44
 * 整行换成 D-45（一行 `-` 一行 `+`），违反的是 disciplines.md 自己表头第三条，
 * 两个提交都没人发现。纯靠人记得的纪律会被跳过（D-02），所以它必须有 grep。
 *
 * 判据为什么是「id 集合差」而不是「出现 `-| D-` 行」：
 * 后者会把**同一条的正文修订**也算成删除。而正文修订确实发生过两次，都是
 * 机械性的路径改名（`00-index.md` ↔ `README.md`，见 3ed2c87 / a42e464）——
 * 那不是「换掉一条纪律」，是被引用的文件名变了。真正要抓的是「这条没了」。
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const FILE = "docs/disciplines.md";

/**
 * 被拦时要打印的判据原文。
 *
 * 为什么要带：D-47 获得常驻机制后就离开了每轮读序（AGENTS.md 那条常驻规则）。
 * 于是 agent 第一次知道 D-47 存在，就是 pretest 拦它的那一刻。
 * 只说「D-47 violated」的报错等于把人送回去翻台账——那就白移了。
 */
const D47 = `D-47 只增不改有机制：本文件的条目只增不减。修订走新编号 + 标注取代关系，
   不是原地替换。条目按编号严格递增排列——乱序会掩盖删除，递增则少一个号一眼看得出。
   来源：42bd0e7 把 D-44 整行替换成 D-45，违反的是本文件自己表头第三条，两个提交无人发现。`;

/** 历史上允许过的删除（commit 短 hash）。空数组是目标状态 */
const ALLOWED_DELETIONS = new Set([
  // 60b9646 是 D-47 的来源事故本身：它删掉 D-44 换成 D-45。
  // 记在这里而不是假装没发生——D-44 已由后续提交恢复，但历史不可改写。
  //
  // 原先登记的是 42bd0e7，那是公开前历史改写（855e6aa）之前的旧 hash，
  // rebase 后已失效（`git cat-file -e 42bd0e7` 报 Not a valid object name）。
  // 于是那条例外形同虚设，真实删除提交 60b9646 从未被豁免——本脚本
  // 持续报红 134 次的真正原因是这个，不是「历史本质不可修复」（见 D-57）。
  // 该失效已先被 mech.json 发现并登记为正确值；这里只是跟上。
  // 根因（按 hash 登记例外扛不住 rebase）见 README「已知缺口①」。
  "60b9646",
]);

let failures = 0;
const fail = (msg) => {
  failures++;
  console.log(`  ✗ ${msg}`);
};
const ok = (msg) => console.log(`  ✓ ${msg}`);

// ── 1. 历史里的删除 ──────────────────────────────────────
console.log("[1] 只增不改（没有条目在某次提交里消失）");
{
  // %h 打印每个提交的短 hash，随后是该提交对本文件的 diff
  const log = execSync(`git log -p --format="COMMIT %h" -- ${FILE}`, {
    encoding: "utf-8",
    maxBuffer: 32 * 1024 * 1024,
  });

  /** 每个提交各自收集 `-` 侧与 `+` 侧的 id 集合，差集才是真删除 */
  const perCommit = new Map();
  let commit = "";
  for (const line of log.split("\n")) {
    const m = /^COMMIT ([0-9a-f]+)$/.exec(line);
    if (m) {
      commit = m[1].slice(0, 7);
      perCommit.set(commit, { removed: new Set(), added: new Set() });
      continue;
    }
    const del = /^-\| (D-\d+) \|/.exec(line);
    const add = /^\+\| (D-\d+) \|/.exec(line);
    const bucket = perCommit.get(commit);
    if (!bucket) continue;
    if (del) bucket.removed.add(del[1]);
    if (add) bucket.added.add(add[1]);
  }

  const offenders = [];
  for (const [c, { removed, added }] of perCommit) {
    // 同一 id 两侧都在 = 正文修订（合法，见文件头说明）；只在 `-` 侧 = 这条没了
    const gone = [...removed].filter((id) => !added.has(id));
    if (gone.length > 0 && !ALLOWED_DELETIONS.has(c)) offenders.push([c, gone]);
  }

  // 工作区（含已暂存）的未提交改动。这一段是负向验证逗出来的：
  // 只读已提交历史时，手动删掉 D-44 然后跑检查器——它报 PASS。
  // 因为那时删除还不在任何 diff 里。一个只能事后问责的检查器拦不住正在发生的那一次，
  // 而 D-47 的全部目的是在提交前就吹哨。
  const pending = execSync(`git diff HEAD -- ${FILE}`, { encoding: "utf-8" });
  const wRemoved = new Set();
  const wAdded = new Set();
  for (const line of pending.split("\n")) {
    const del = /^-\| (D-\d+) \|/.exec(line);
    const add = /^\+\| (D-\d+) \|/.exec(line);
    if (del) wRemoved.add(del[1]);
    if (add) wAdded.add(add[1]);
  }
  const wGone = [...wRemoved].filter((id) => !wAdded.has(id));
  if (wGone.length > 0) offenders.push(["工作区（未提交）", wGone]);

  if (offenders.length === 0) {
    const known = [...ALLOWED_DELETIONS].join(" ");
    ok(`无未登记的删除${known ? `；已登记例外：${known}` : ""}`);
  } else {
    for (const [c, ids] of offenders) {
      fail(`提交 ${c} 删除了 ${ids.join(", ")} —— 修订应走新编号 + 标注取代关系`);
    }
  }
}

// ── 2. 当前表的编号 ──────────────────────────────────────
console.log("\n[2] 编号严格递增、无重号（乱序会掩盖删除）");
{
  const text = readFileSync(FILE, "utf-8");
  const lines = text.split("\n");

  /** 按 `## ` 分节，每节内独立检查递增 */
  const sections = [];
  let current = null;
  for (const line of lines) {
    if (line.startsWith("## ")) {
      current = { title: line.slice(3).trim(), ids: [] };
      sections.push(current);
      continue;
    }
    const m = /^\| (D-(\d+)) \|/.exec(line);
    if (m && current) current.ids.push({ id: m[1], n: Number(m[2]) });
  }

  const all = sections.flatMap((s) => s.ids);
  const seen = new Map();
  for (const { id } of all) seen.set(id, (seen.get(id) ?? 0) + 1);
  const dupes = [...seen].filter(([, c]) => c > 1);
  if (dupes.length === 0) ok(`无重号（共 ${all.length} 条）`);
  else for (const [id, c] of dupes) fail(`${id} 出现 ${c} 次`);

  for (const s of sections) {
    if (s.ids.length < 2) continue;
    const nums = s.ids.map((x) => x.n);
    const sorted = [...nums].sort((a, b) => a - b);
    if (nums.join() === sorted.join()) ok(`${s.title}：${nums.join(" < ")}`);
    else fail(`${s.title} 顺序非递增：${nums.join(" ")}（应为 ${sorted.join(" ")}）`);
  }
}

// ── 3. 声称的机制真的存在并已接线 ───────────────────────────
console.log("\n[3] 落点列里声称的机制真的存在且已接线");
{
  // 这一段堆的是 D-02 本身：落点写 `npm run x` 而 package.json 里没有 x，
  // 或者 script 存在但没挂进任何会自动跑的钩子，那条纪律就只是「文档声称有机制」。
  // D-47 自己就在这个状态里活过一阵：表里写着 npm run check:disciplines，
  // 而那个 script 当时根本不存在。
  const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
  const scripts = pkg.scripts ?? {};
  /** 会自动跑的钩子：pretest 串起来的那几条 + test 本身 */
  const wired = new Set();
  for (const [name, body] of Object.entries(scripts)) {
    if (name === "test" || name.startsWith("pre") || name.startsWith("post")) {
      for (const m of String(body).matchAll(/npm run ([\w:-]+)/g)) wired.add(m[1]);
      wired.add(name);
    }
  }

  const claims = new Map();
  for (const line of readFileSync(FILE, "utf-8").split("\n")) {
    const m = /^\| (D-\d+) \|.*\|([^|]*)\|\s*$/.exec(line);
    if (!m) continue;
    for (const c of m[2].matchAll(/npm run ([\w:-]+)/g)) claims.set(m[1], c[1]);
  }

  if (claims.size === 0) ok("落点列未声称任何 npm script");
  for (const [id, script] of claims) {
    if (!scripts[script]) {
      fail(`${id} 声称 npm run ${script}，但 package.json 里没有这个 script`);
    } else if (!wired.has(script)) {
      fail(
        `${id} 的 npm run ${script} 存在但**未接线**（不在 test / pre* / post* 里）——` +
          `没人调用的检查器比不存在更坏，因为文档声称有机制（D-02）`,
      );
    } else {
      ok(`${id} → npm run ${script}（已接线）`);
    }
  }
}

console.log(
  `\n判定：${failures === 0 ? "PASS" : `FAIL（${failures} 项）`}`,
);
if (failures > 0) {
  console.log(`\n判据原文：\n   ${D47}`);
  console.log(
    `\n怎么改：恢复被删的条目（从它最后存在的提交取回正文），` +
      `或把新条目换成下一个未用编号追加到本节末尾；` +
      `若是机制未接线，把它串进 package.json 的 pretest。`,
  );
}
process.exit(failures === 0 ? 0 : 1);
