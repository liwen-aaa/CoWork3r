/**
 * markdown → Plan。
 *
 * 报错一律带行号。规划书是人写的，「格式不对」这种提示会让人放弃修——老仓库四份
 * 规划书全部通不过 gate 而没人发现，一半原因是那个 false 不可操作。
 * 且**一次报全部**：人改规划书时想一次看到所有问题，不是修一条跑一次。
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ASSERTION_ITEM,
  COMMENT_LINE,
  HAS_BACKTICK,
  HAS_PATH,
  LIST_ITEM,
  MILESTONE_HEADING,
  PASSED_MARK,
  PENDING_ANSWERED,
  PENDING_BLOCKED_BY,
  PENDING_ID,
  PENDING_MARK,
  PENDING_OWNER,
  PENDING_QUERYING,
  PENDING_SEP,
  SECTIONS,
  SUBSECTIONS,
  TRAILING_SEP,
} from "./grammar.ts";
import type {
  Assertion,
  Milestone,
  ParseResult,
  Pending,
  PendingStatus,
  Plan,
  PlanError,
} from "./types.ts";

/** CRLF 归一。Windows text-mode 写入会改行尾，`(.*)$` 不匹配 `\r` 结尾——老仓库为此坏过一次票解析 */
function normalize(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

const isComment = (l: string) => COMMENT_LINE.test(l);
const isHeading2 = (l: string) => /^##\s/.test(l) && !/^###\s/.test(l);
const isHeading3 = (l: string) => /^###\s/.test(l);
/** 引用块（模板与本项目 plan.md 的说明段都是 `>`），不是内容 */
const isQuote = (l: string) => /^\s*>/.test(l);

function skip(l: string): boolean {
  return l.trim() === "" || isComment(l) || isQuote(l);
}

/** 把里程碑节内的三级子节切出来：子节名 → 行号区间（1-indexed，含首行） */
function splitSubsections(lines: string[], from: number, to: number): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  let current: string | null = null;
  let start = 0;
  for (let i = from; i <= to; i++) {
    const line = lines[i] ?? "";
    if (isHeading3(line)) {
      if (current !== null) out.set(current, [start, i - 1]);
      current = line.trim();
      start = i + 1;
    }
  }
  if (current !== null) out.set(current, [start, to]);
  return out;
}

/** 取某子节里的 `- ` 列表项文本（跳过注释、空行、引用） */
function listItems(lines: string[], range: [number, number] | undefined): string[] {
  if (!range) return [];
  const out: string[] = [];
  for (let i = range[0]; i <= range[1]; i++) {
    const line = lines[i] ?? "";
    if (skip(line)) continue;
    const m = LIST_ITEM.exec(line);
    if (m) out.push(m[1]!.trim());
  }
  return out;
}

function parseAssertions(
  lines: string[],
  range: [number, number] | undefined,
  milestoneId: string,
  errors: PlanError[],
): Assertion[] {
  const out: Assertion[] = [];
  if (!range) {
    return out;
  }
  for (let i = range[0]; i <= range[1]; i++) {
    const line = lines[i] ?? "";
    if (skip(line)) continue;
    // 续行（缩进的说明文字）跟在上一条断言上，不是新项
    if (!LIST_ITEM.test(line)) continue;

    const m = ASSERTION_ITEM.exec(line);
    if (!m) {
      // S3：本该是断言的行没标 kind。不静默当成 auto——分类承载判据（L4/L5）
      errors.push({
        line: i + 1,
        message: `断言必须以 [auto] 或 [human] 开头（里程碑 ${milestoneId}）：${line.trim().slice(0, 60)}`,
      });
      continue;
    }
    out.push({
      id: `${milestoneId}.${out.length + 1}`,
      kind: m[1] as "auto" | "human",
      text: m[2]!.trim(),
      line: i + 1,
    });
  }
  return out;
}

function parsePending(
  lines: string[],
  range: [number, number] | undefined,
  errors: PlanError[],
): Pending[] {
  const out: Pending[] = [];
  if (!range) return out;

  for (let i = range[0]; i <= range[1]; i++) {
    const line = lines[i] ?? "";
    if (skip(line)) continue;
    const m = LIST_ITEM.exec(line);
    if (!m) continue;

    const body = m[1]!.trim();
    const parts = body.split(PENDING_SEP);

    // 段数不固定：正文自己可以带 `——`（P8 就带）。所以标记段按**内容**定位
    // 而不取 parts[1]：按位置数会静默错位（kind 跌回默认值、owner 消失，两者都不报错）
    const markIdx = parts.findIndex((p, k) => k > 0 && PENDING_MARK.test(p));
    if (markIdx === -1) {
      // 与 S3 同一条判据：分类承载判据（谁去动它）。静默默认为 human 会让漏标看不见
      errors.push({
        line: i + 1,
        message: `未决项缺 [auto] / [human] 标记（三段式的第二段）：${body.slice(0, 60)}`,
      });
      continue;
    }

    const head = (parts[0] ?? "").trim().replace(TRAILING_SEP, "").trim();
    const mark = parts[markIdx] ?? "";
    // 标记段之前的额外段属于正文（被正文里的破折号切出来的）
    const headExtra = parts.slice(1, markIdx).map((s) => s.trim()).filter((s) => s !== "");
    const tail = parts.slice(markIdx + 1).join(" ");

    // id：有 `P<n>` 前缀就用它（删行不回收的唯一成立形态，见 P8），没有则按位置补
    const firstToken = head.split(/\s+/)[0] ?? "";
    const idMatch = PENDING_ID.exec(firstToken);
    const id = idMatch ? firstToken : `P${out.length + 1}`;
    const headText = idMatch ? head.slice(firstToken.length).trim() : head;
    const text = [headText, ...headExtra].filter((s) => s !== "").join(" —— ");

    const kind = (PENDING_MARK.exec(mark)![1] ?? "human") as "auto" | "human";

    let status: PendingStatus = "open";
    let answerRef: string | undefined;
    const answered = PENDING_ANSWERED.exec(mark);
    if (answered) {
      status = "answered";
      answerRef = answered[1];
    } else if (mark.includes(PENDING_QUERYING)) {
      status = "querying";
    }

    const owner = PENDING_OWNER.exec(mark)?.[1];

    // 前置：只认 P<n>；口语（「上面某条」）解出空数组，不报错（D-10）
    const blockedRaw = PENDING_BLOCKED_BY.exec(tail)?.[1] ?? "";
    const blockedBy = [...blockedRaw.matchAll(/P\d+/g)].map((x) => x[0]);

    const item: Pending = { id, text, kind, status, blockedBy, line: i + 1 };
    if (owner !== undefined) item.owner = owner;
    if (answerRef !== undefined) item.answerRef = answerRef;
    out.push(item);
  }
  return out;
}

export function parsePlan(root: string, relPath: string): ParseResult {
  let raw: string;
  try {
    raw = readFileSync(join(root, relPath), "utf-8");
  } catch {
    return { ok: false, errors: [{ line: 0, message: `读不到规划书：${relPath}` }] };
  }

  const lines = normalize(raw);
  const errors: PlanError[] = [];
  const warnings: string[] = [];

  // 切二级节：里程碑各自一段，其余按节名归位
  type Block = { kind: "milestone"; id: string; title: string; passed: boolean; from: number; to: number }
    | { kind: "section"; name: string; from: number; to: number };
  const blocks: Block[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!isHeading2(line) || isQuote(line)) continue;
    if (blocks.length > 0) blocks[blocks.length - 1]!.to = i - 1;

    const m = MILESTONE_HEADING.exec(line);
    if (m) {
      const rest = (m[2] ?? "").trim();
      blocks.push({
        kind: "milestone",
        id: m[1]!,
        title: rest.replace(PASSED_MARK, "").trim(),
        passed: line.includes(PASSED_MARK),
        from: i + 1,
        to: lines.length - 1,
      });
    } else {
      blocks.push({ kind: "section", name: line.trim(), from: i + 1, to: lines.length - 1 });
    }
  }

  const milestones: Milestone[] = [];
  let goal = "";
  let pending: Pending[] = [];
  let fog: string[] = [];
  let outOfScope: string[] = [];

  for (const b of blocks) {
    if (b.kind === "milestone") {
      const subs = splitSubsections(lines, b.from, b.to);
      const assertRange = subs.get(SUBSECTIONS.assertions);

      if (!assertRange) {
        // L9 的核心：老仓库那份把验收写成行内「验收：...」，没有 `### 断言` 节。
        // 解析器**不为此兼容**——认了就等于承认两种格式，而两种格式互不校验
        // 正是那次失效的形态。
        errors.push({
          line: b.from,
          message: `里程碑 ${b.id} 缺 ${SUBSECTIONS.assertions} 节（行内「验收：」不算——它是老仓库那次格式分裂的形态）`,
        });
      }

      const assertions = parseAssertions(lines, assertRange, b.id, errors);
      if (assertRange && assertions.length === 0) {
        errors.push({ line: b.from, message: `里程碑 ${b.id} 的断言节为空，至少要一条` });
      }

      milestones.push({
        id: b.id,
        title: b.title,
        passed: b.passed,
        assertions,
        involves: listItems(lines, subs.get(SUBSECTIONS.involves)),
        dependsOn: listItems(lines, subs.get(SUBSECTIONS.dependsOn)),
        risks: listItems(lines, subs.get(SUBSECTIONS.risks)),
        sourceRange: [b.from, b.to + 1],
      });
      continue;
    }

    if (b.name === SECTIONS.goal) {
      goal = lines
        .slice(b.from, b.to + 1)
        .filter((l) => !skip(l))
        .join("\n")
        .trim();
    } else if (b.name === SECTIONS.pending) {
      pending = parsePending(lines, [b.from, b.to], errors);
    } else if (b.name === SECTIONS.fog) {
      fog = listItems(lines, [b.from, b.to]);
    } else if (b.name === SECTIONS.outOfScope) {
      outOfScope = listItems(lines, [b.from, b.to]);
    }
  }

  if (milestones.length === 0) {
    errors.push({ line: 0, message: "没有里程碑节（`## 里程碑 <id> <标题>`），最小合法形态也要一个" });
  }

  if (errors.length > 0) return { ok: false, errors };

  const plan: Plan = { goal, milestones, pending, fog, outOfScope };
  return { ok: true, plan, warnings };
}

export function milestone(plan: Plan, id: string): Milestone | null {
  return plan.milestones.find((m) => m.id === id) ?? null;
}

/**
 * `[auto]` 只问命令在哪，`[human]` 只问说清了没有。
 *
 * 「这条该谁验」这个判断交给人，机器不猜。写不出命令怎么办？那它就是 `[human]`——
 * 不是妥协，是让分类承载信息。
 */
export function checkAssertion(a: Assertion): { ok: boolean; reason?: string } {
  const text = a.text.trim();
  if (text === "") {
    return { ok: false, reason: `${a.id} 说明为空` };
  }
  if (a.kind === "human") return { ok: true };

  if (HAS_BACKTICK.test(text) || HAS_PATH.test(text)) return { ok: true };
  return {
    ok: false,
    reason: `${a.id} 标了 [auto] 但没有可运行的命令、也没有可检查存在性的路径。写不出命令说明它其实是 [human]`,
  };
}

/** arch 分发前调它：未 passed + 至少一条断言 + 每条 checkAssertion 通过 */
export function checkMilestone(m: Milestone): { ok: boolean; reason?: string } {
  if (m.passed) {
    return { ok: false, reason: `里程碑 ${m.id} 已验收，节已冻结（D-14）` };
  }
  if (m.assertions.length === 0) {
    return { ok: false, reason: `里程碑 ${m.id} 没有断言` };
  }
  const bad = m.assertions.map((a) => checkAssertion(a)).filter((r) => !r.ok);
  if (bad.length > 0) {
    return { ok: false, reason: bad.map((b) => b.reason).join("；") };
  }
  return { ok: true };
}

/**
 * SHA-256(断言节全部 `- ` 列表行，join("\n"))。
 *
 * D-15 机制化的留位：arch 分发时存它，人改过断言则 hash 不一致——那是合法的，
 * 反过来 arch 自己改则不合法。当前只存不比对。
 */
export function assertionHash(m: Milestone): string {
  const body = m.assertions.map((a) => `- [${a.kind}] ${a.text}`).join("\n");
  return createHash("sha256").update(body, "utf8").digest("hex");
}
