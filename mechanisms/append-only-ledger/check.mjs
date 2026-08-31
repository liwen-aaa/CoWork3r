/**
 * append-only-ledger：台账只增不改 + 编号严格递增。
 *
 * 判据原文在 criterion.md（被拦时随 reason 打印）。本文件只做判定，不引入新判据。
 *
 * 两件事，都不需要网络、不需要构建：
 *   1. 历史里有没有删掉过条目 —— 含**工作区未提交的删除**（`git diff HEAD`），
 *      否则它只能事后问责，拦不住正在发生的那一次
 *   2. 当前表里编号是否严格递增、有无重号
 *
 * 判据为什么是「每个提交内的 id 集合差」而不是「出现 `-| D-` 行」：后者会把**同一条的
 * 正文修订**也算成删除（真发生过两次，都是被引用的文件名变了）。要抓的是「这条没了」。
 *
 * 本文件从 scripts/check-disciplines.mjs 提炼：判据与报错文本照抄（它们是事故换来的），
 * 改掉的是三处硬编码 —— 文件路径、id 正则、允许的历史删除，全部变成 options。
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * stderr 也 pipe：execFileSync 缺省把子进程 stderr 转发给父进程，于是「这个项目没有 git」
 * 会在无 git 的项目上打一行 fatal 到控制台 —— 判定是对的，噪声是错的。
 */
function git(root, args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf-8",
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** 一段 diff 文本里，`-` 侧与 `+` 侧各出现了哪些 id */
function idsIn(lines, side, re) {
  const out = new Set();
  for (const line of lines) {
    if (!line.startsWith(side)) continue;
    const m = re.exec(line.slice(1));
    if (m) out.add(m[1]);
  }
  return out;
}

function diffOf(sides, re) {
  const minus = idsIn(sides, "-", re);
  const plus = idsIn(sides, "+", re);
  return [...minus].filter((id) => !plus.has(id));
}

export async function check({ root, options }) {
  const rel = options.file;
  const re = new RegExp(options.idPattern);
  const allowed = new Set(options.allowedDeletions ?? []);
  const problems = [];

  if (!existsSync(join(root, rel))) {
    return { ok: false, reason: `台账文件不存在：${rel}（options.file 指错了，或这个项目还没有台账）` };
  }

  let hasGit = true;
  try {
    git(root, ["rev-parse", "--git-dir"]);
    // 零提交的新仓（day 0 的真实状态）：HEAD 不存在，`git diff HEAD` 会 fatal。
    // 没有历史就没有删除可查 —— 跳过第一段，第二段（编号递增）照旧跑。
    // 抳到它的是空目录 init 后立即 mech run（每个新项目必经的那一步）。
    git(root, ["rev-parse", "--verify", "HEAD"]);
  } catch {
    hasGit = false;
  }

  // ── 1. 历史 + 工作区里的删除 ────────────────────────────
  if (hasGit) {
    const log = git(root, ["log", "-p", "--format=COMMIT %h", "--", rel]);
    /** 每个提交各自收集两侧 id 集合，差集才是真删除 */
    const perCommit = new Map();
    let commit = "";
    for (const line of log.split("\n")) {
      if (line.startsWith("COMMIT ")) {
        commit = line.slice(7).trim();
        if (!perCommit.has(commit)) perCommit.set(commit, []);
        continue;
      }
      if (commit !== "") perCommit.get(commit).push(line);
    }
    for (const [c, lines] of perCommit) {
      if (allowed.has(c)) continue;
      const gone = diffOf(lines, re);
      if (gone.length > 0) {
        problems.push(`提交 ${c} 删除了 ${gone.join(", ")} —— 修订应走新编号 + 标注取代关系`);
      }
    }

    // 工作区未提交的删除：不查这一段，它就只能事后问责
    const wip = git(root, ["diff", "HEAD", "--", rel]).split("\n");
    const wipGone = diffOf(wip, re);
    if (wipGone.length > 0) {
      problems.push(`工作区（未提交）删除了 ${wipGone.join(", ")} —— 现在就拦，不等它进历史`);
    }
  }

  // ── 2. 当前表的编号 ────────────────────────────────────
  const text = readFileSync(join(root, rel), "utf-8");
  const sections = [];
  let current = null;
  for (const line of text.split("\n")) {
    if (line.startsWith(options.sectionPrefix)) {
      current = { title: line.slice(options.sectionPrefix.length).trim(), ids: [] };
      sections.push(current);
      continue;
    }
    const m = re.exec(line);
    if (m && current) current.ids.push({ id: m[1], n: Number(m[2] ?? NaN) });
  }

  const all = sections.flatMap((s) => s.ids);
  if (all.length === 0) {
    return { ok: false, reason: `${rel} 里一条条目都没匹配上 —— options.idPattern（${options.idPattern}）与台账格式不符，机制在空跑` };
  }

  const seen = new Map();
  for (const { id } of all) seen.set(id, (seen.get(id) ?? 0) + 1);
  for (const [id, c] of seen) if (c > 1) problems.push(`${id} 出现 ${c} 次（重号）`);

  for (const s of sections) {
    if (s.ids.length < 2) continue;
    const nums = s.ids.map((x) => x.n);
    if (nums.some((n) => Number.isNaN(n))) continue; // 无数字编号的台账只查删除与重号
    const sorted = [...nums].sort((a, b) => a - b);
    if (nums.join() !== sorted.join()) {
      problems.push(`「${s.title}」顺序非递增：${nums.join(" ")}（应为 ${sorted.join(" ")}）`);
    }
  }

  if (problems.length === 0) {
    return { ok: true, note: `${rel}：${all.length} 条，无未登记的删除、无重号、编号递增` };
  }
  return { ok: false, reason: `${rel}\n${problems.map((p) => `- ${p}`).join("\n")}` };
}
