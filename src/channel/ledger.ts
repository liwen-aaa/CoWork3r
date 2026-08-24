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
import { appendTextAtomic } from "./atomic.ts";
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
