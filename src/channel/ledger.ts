/**
 * 待人工台账：人的收件箱被代排后，消息落到这里。
 *
 * 为什么需要它：human 的单槽位收件箱是**锁**（O_EXCL），占着就投不进第二条；
 * 而人的待办是**事实**，不能因为释放锁而消失（D-30：需要人主动去找才看得见的
 * 待办 = 无效载体）。所以排空与记账是一个动作的两半，分工写在 `paths.ts` 文件头。
 *
 * 格式判据只有一条：**人能直接回答。** 所以 `verdict_pass` 的 `questions` 必须原样
 * 逐条列出——那是该里程碑的 `[human]` 断言，人打开就该看到问题本身，而不是
 * 「有一条 verdict_pass 等你」。这是 05-gates 那条实测教训的同一形状：
 * 写进提示的东西会被回答，没写进去的不会。
 *
 * 只增不改（appendTextAtomic）：覆盖一条就是一件待办静默消失。
 */
import { readFileSync } from "node:fs";

import { appendTextAtomic, writeTextAtomic } from "./atomic.ts";
import { peek } from "./inbox.ts";
import { channelPaths } from "./paths.ts";
import type { Message } from "../protocol/message.ts";

const HEADER = `# 待你判定（台账，只增不改）

> 由 arch 代排人的收件箱时追加（07-adapter 的 wireHumanDrain）。
> 槽位是锁、台账是待办：槽位必须能释放，否则第二条消息投不进来；
> 待办不能丢，否则它就不在你的视线路径上了（D-30）。
>
> 处理完一条，人自己划掉或删行——AI 不动这个文件的历史（D-34：物理删除归人）。

`;

/** 一条消息渲染成台账的一段。`at` 原样保留：它是「什么时候等你的」的唯一依据 */
function render(msg: Message): string {
  const lines: string[] = [];
  const head = [msg.milestone, msg.type].filter((s) => s !== undefined && s !== "").join(" ");
  lines.push(`## ${head}（${msg.from} → human，${msg.at}）`);
  lines.push("");
  if (msg.body.trim() !== "") lines.push(msg.body.trim(), "");
  // questions 是该里程碑的 [human] 断言原文——人打开台账要能直接回答
  for (const q of msg.questions ?? []) lines.push(`- [ ] ${q}`);
  if ((msg.questions ?? []).length > 0) lines.push("");
  if (msg.artifact !== undefined && msg.artifact !== "") lines.push(`产出：\`${msg.artifact}\``, "");
  // 每段以空行收尾：追加语义下少这一行，下一条的 `##` 会贴到上一条尾巴上
  return `${lines.join("\n").trimEnd()}\n\n`;
}

export function appendHumanLedger(root: string, msg: Message): void {
  appendTextAtomic(channelPaths(root).humanLedger, render(msg), HEADER);
}

/**
 * 还没回答的待判定项（给 `/status` 数条数、给 `/pending` 打印内容）。
 *
 * 两个来源都要算：
 *   **台账**里未勾选的 `- [ ]`（arch 已代排的）
 *   **槽位**里那条（窗口关着时到的，还没被代排——只读台账会漏掉它）
 *
 * 返回原文行而不是结构体：这些字符串是 tester 从 `[human]` 断言里原样抄来的
 * 问题，人要读的就是它（D-21：`[human]` 是人的原话，不由 AI 归纳）。
 * 再解析一遍等于给它加一层转述。
 */
export function humanPendingItems(root: string): { lines: string[]; ledgerRel: string } {
  const out: string[] = [];

  // 台账：未勾选的条目，连同它所属的 `## <里程碑> <type>` 标题一起给（人要知道这是哪一轮的）
  try {
    const text = readFileSync(channelPaths(root).humanLedger, "utf-8");
    let head = "";
    for (const line of text.split("\n")) {
      if (line.startsWith("## ")) head = line.slice(3).trim();
      if (line.startsWith("- [ ] ")) out.push(`${head ? `【${head}】 ` : ""}${line.slice(6).trim()}`);
    }
  } catch {
    /* 台账还不存在 = 没有代排过 = 没有台账侧的待办 */
  }

  // 槽位：还没被代排的那条（arch 窗口没开的那段时间到的消息）
  const inSlot = peek(root, "human");
  for (const q of inSlot?.questions ?? []) {
    out.push(`【${[inSlot?.milestone, inSlot?.type].filter(Boolean).join(" ")}｜未代排】 ${q}`);
  }

  return { lines: out, ledgerRel: "wf/human-pending.md" };
}

/**
 * 勾掉某里程碑的待办（`- [ ]` → `- [x]`）。放行时调。
 *
 * **勾选不是删除。** D-34（物理删除归人）曾被读成「台账一律不动」，于是真跑里
 * M1 放行之后那条已答的问题还在 `/pending` 里——跑十个里程碑就积十条假待办，
 * 而台账存在的全部意义是「不看就会漏的东西在视线里」（D-30）。
 * 本函数**不删一个字**，只改勾选框：历史仍在，D-34 守的那一面没破。
 *
 * 归属靠段标题（`## <里程碑> <type>（…）`）判定：放行 M1 不能带走 M2 的待办。
 * 幂等：已勾的不再动，无变化时不写盘（避开无意义的 mtime 变动）。
 */
export function resolveHumanPending(root: string, milestoneId: string): boolean {
  const file = channelPaths(root).humanLedger;
  let text: string;
  try {
    text = readFileSync(file, "utf-8");
  } catch {
    return false; // 没台账 = 没人工关卡走过，不是错
  }

  let head = "";
  let changed = false;
  const out = text.split("\n").map((line) => {
    if (line.startsWith("## ")) head = line.slice(3).trim();
    // 段标题以 `<里程碑> ` 开头（render 的格式）；带边界避开 M1 误匹 M11
    const mine = new RegExp(`^${milestoneId}(?![0-9A-Za-z])`).test(head);
    if (mine && line.startsWith("- [ ] ")) {
      changed = true;
      return `- [x] ${line.slice(6)}`;
    }
    return line;
  });

  if (!changed) return false;
  writeTextAtomic(file, out.join("\n"));
  return true;
}
