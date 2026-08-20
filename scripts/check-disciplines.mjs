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

/** 历史上允许过的删除（commit 短 hash）。空数组是目标状态 */
const ALLOWED_DELETIONS = new Set([
  // 42bd0e7 是 D-47 的来源事故本身：它删掉 D-44 换成 D-45。
  // 记在这里而不是假装没发生——D-44 已由后续提交恢复，但历史不可改写。
  "42bd0e7",
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

console.log(
  `\n判定：${failures === 0 ? "PASS" : `FAIL（${failures} 项）`}`,
);
process.exit(failures === 0 ? 0 : 1);
