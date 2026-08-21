/**
 * /research 命令的纯逻辑：未决表 [auto] 条目派查的状态机。
 *
 * 这是砍掉 wayfinder 后唯一的外查通道（08-dist.md 有完整规格）。
 *
 * 状态机：
 *   open ──/research──> querying ──成功──> answered
 *                           │
 *                           └─失败─→ open（回退）+ 末尾追加「上次失败：<原因>」
 *
 * 三条核心判据（08-dist.md）：
 *   ① 失败回退到 open 而不是新增 failed 态——四态会让失败条目沉到底，
 *      而它正是最需要你看一眼的。回 open 则它下次仍出现在 toQuery 里
 *   ② 无「依据」节或为空 → 视为失败（D-02 用在外查上：没依据的结论和
 *      没查一样危险，而且更危险——它看起来已经完成了）
 *   ③ querying 态重复 /research → 拒（幂等）
 *
 * 操作对象是 **plan.md 的未决表文本**（改 [auto] 待查 → 查中 → 已回），
 * 状态写在文件里重启不丢。slug 从条目文本取前 24 字符转小写短横线。
 *
 * 本文件纯函数，不碰 pi——wire 的 /research 命令只负责读参数、调这里、
 * 把结果发回窗口。
 */
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { writeTextAtomic } from "../channel/index.ts";

export type ResearchAction =
  | { action: "start" }
  | { action: "finish"; note: { conclusion: string; evidence: string }; failReason?: string }
  | { action: "list" };

export type ResearchResult =
  | { ok: true; text?: string }
  | { ok: false; reason: string };

/** slug：条目文本前 24 字符 → 小写 + 非字母数字变短横线。冲突由调用方追加 -2 */
export function slugOf(text: string): string {
  const head = text.slice(0, 24);
  const slug = head
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "pending" : slug;
}

/** 未决表里某条 P<n> 的整行（不解析，只按前缀找） */
function findLine(lines: string[], id: string): number {
  return lines.findIndex((l) => l.trim().startsWith(`- ${id} `) || l.trim() === `- ${id}`);
}

function load(root: string, rel: string): { lines: string[]; raw: string } {
  const raw = readFileSync(join(root, rel), "utf-8");
  return { lines: raw.split("\n"), raw };
}

function save(root: string, rel: string, lines: string[]): void {
  writeTextAtomic(join(root, rel), lines.join("\n"));
}

/** 写 note 到 wf/notes/<slug>.md，返回 slug（冲突追加 -2） */
function writeNote(root: string, text: string, conclusion: string, evidence: string): string {
  const base = slugOf(text);
  let slug = `${base}.md`;
  let n = 2;
  while (exists(join(root, "wf", "notes", slug))) {
    slug = `${base}-${n}.md`;
    n += 1;
  }
  const note = `# ${text}\n## 结论\n${conclusion}\n## 依据\n${evidence}\n`;
  mkdirSync(join(root, "wf", "notes"), { recursive: true });
  writeTextAtomic(join(root, "wf", "notes", slug), note);
  return slug;
}

function exists(path: string): boolean {
  try {
    readFileSync(path);
    return true;
  } catch {
    return false;
  }
}

export function research(ctx: {
  root: string;
  rel: string;
  id: string;
  action: ResearchAction["action"];
  note?: { conclusion: string; evidence: string };
  failReason?: string;
}): ResearchResult {
  const { lines } = load(ctx.root, ctx.rel);
  const at = findLine(lines, ctx.id);
  if (at === -1) return { ok: false, reason: `未决表里没有 ${ctx.id}` };

  const line = lines[at]!;

  // ── list：不修改，只报告当前状态 ─────────────────────────────
  if (ctx.action === "list") {
    return { ok: true, text: line };
  }

  // ── start：open → querying ────────────────────────────────────
  if (ctx.action === "start") {
    if (line.includes("查中")) return { ok: false, reason: `${ctx.id} 已在查（幂等，拒绝重派）` };
    if (line.includes("已回")) {
      return { ok: false, reason: `${ctx.id} 已回。要重查用 /research ${ctx.id} --redo` };
    }
    lines[at] = line.replace("[auto] 待查", "[auto] 查中");
    save(ctx.root, ctx.rel, lines);
    return { ok: true };
  }

  // ── finish：querying → answered 或回退 open ──────────────────
  const note = ctx.note;
  if (!note) return { ok: false, reason: "finish 需要 note（结论 + 依据）" };

  // 无依据（空串 / 纯空白）= 没查完 = 失败
  if (note.evidence.trim() === "") {
    const fail = ctx.failReason ?? "无依据的结论不得标 answered";
    lines[at] = line
      .replace("[auto] 查中", "[auto] 待查")
      .trimEnd()
      .replace(/((?:——\s*前置：[^\n]*)?)$/, ` —— 上次失败：${fail}$1`);
    save(ctx.root, ctx.rel, lines);
    return { ok: false, reason: `无「依据」节，回退 open（${fail}）` };
  }

  const slug = writeNote(ctx.root, line.trim().replace(/^-\s*/, "").split(" —— ")[0]!, note.conclusion, note.evidence);
  lines[at] = line.replace("[auto] 查中", `[auto] 已回 → wf/notes/${slug}`);
  save(ctx.root, ctx.rel, lines);
  return { ok: true };
}
