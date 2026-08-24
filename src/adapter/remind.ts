/**
 * 收尾提醒的判定（A9c / M6-013）：本轮该不该提醒「记得投递」。
 *
 * 从 wire 抽出来的理由不是行数（A6 只是把它照出来）：这里全是**判断**——
 * 遍历消息流、认两种 content 形态、区分「有活没投」与「空转」。接线层该只有
 * 挂钩子和转交（A6 的判据原文：超了就说明有东西放错了层）。
 *
 * ── 两个都是真进程实测出来的 ─────────────────────────────
 * ① **followUp 会自触发新回合**（2026-08-22）：提醒本身经 `sendUserMessage` 投递，
 *    而 pi 的 followUp 总是触发新回合 → agent_end → 再提醒 → 三窗口全卡死。
 *    停止条件必须认出「本轮就是上一条提醒触发的」。
 * ② **user 消息的 content 有两种形态**：真实 followUp 是 `[{type:"text",text}]`
 *    数组（pi `agent-session.js` 的 `_queueFollowUp` 构造），A9c 第一版 mock 用
 *    string，于是停止条件在测试里成立、在真进程里漏判，循环继续烧。所以
 *    `userText` 两种都认——这是 D-25 的直接教训（mock 与真实结构脱钩）。
 *
 * 「没活也提醒」会逼 LLM 自问该不该投，实测表现为多轮自我审查空转
 * （retro 八）。所以提醒的前提是本轮真的收到过唤醒消息。
 *
 * 本文件对 pi **零依赖**（连 `import type` 都不需要）：它只靠「role + content」
 * 这一个事实，而 pi 的 `AgentMessage` 联合类型形状跳版本会变。结构类型让它
 * 能在普通 node 进程里单测，也不会因上游重命名类型而碎。
 */

/**
 * 本函数需要的全部：一条消息有 role，可能有 content（串或块数组）。
 * `content` 可选不是宽容：pi 的 `AgentMessage` 联合里真的有不带 content 的成员
 * （如 `BashExecutionMessage`）——当成必填会在 wire 那一侧报类型错。
 */
export type TurnMessage = {
  role: string;
  content?: unknown;
};

/** 唤醒消息与提醒消息的前缀。两者都由本套自己发出，是判定的唯一锚 */
const WAKE_PREFIX = "wf: 收到";
const REMIND_PREFIX = "wf: 本轮结束";
/** 待签提醒的独立前缀（A15）：与投递提醒分开，否则两条提醒会互相误判对方的锚 */
export const PENDING_PREFIX = "wf: 待你判定";

export const REMIND_TEXT = "wf: 本轮结束。若已完成请调 send_task 投出去。";

/**
 * 一条 user 消息的纯文本。string 与数组两形态都认——只认一种就会漏判（实测）。
 * 类型放宽到 unknown 后自己收窄：pi 的 Message 联合类型在不同版本里形状会变，
 * 而本函数只依赖「content 要么是串、要么是带 text 的块数组」这一个事实。
 */
function userText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((c): c is { type: string; text?: string } => typeof c === "object" && c !== null)
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("");
}

/**
 * 本轮结束时该不该提醒。
 *
 * 三个条件全满足才提醒：有工作上下文（收到过唤醒消息）、没投递过、
 * 本轮不是上一条提醒触发的。任一不满足 → 静默。
 */
export function shouldRemind(messages: readonly TurnMessage[]): boolean {
  const users = messages.filter((m) => m.role === "user").map((m) => userText(m.content));

  // 本轮没有唤醒消息 = 空转/闲聊轮次。提醒语义是「有活该投」，没活提醒 = 逼 LLM 自问
  if (!users.some((t) => t.startsWith(WAKE_PREFIX))) return false;

  // 本轮由上一条提醒触发 → 不再提醒。这是死循环的唯一停止条件（followUp 自触发新回合）
  if (users.some((t) => t.startsWith(REMIND_PREFIX))) return false;

  // 已投递（含被 block 的尝试：它已经知道要投了，提醒是噪音）
  const sent = messages.some(
    (m) =>
      m.role === "assistant" &&
      Array.isArray(m.content) &&
      m.content.some((c) => c.type === "toolCall" && c.name === "send_task"),
  );
  return !sent;
}

/**
 * 待签提醒该不该发（A15）：本轮没展示过（防 followUp 自循环，锚 = 已提醒过的 user 消息）。
 * 待办在台账里就一直有效，空转轮次也该提醒——人可能正等这个。
 */
export function shouldPromptPending(messages: readonly TurnMessage[]): boolean {
  const users = messages.filter((m) => m.role === "user").map((m) => userText(m.content));
  return !users.some((t) => t.startsWith(PENDING_PREFIX));
}

/** 待签提醒的正文（A15）：第一条待办的问题原文 + 指路。必须带内容，不能只有条数 */
export function pendingPromptText(lines: readonly string[]): string {
  if (lines.length === 0) return "";
  return `${PENDING_PREFIX}：${lines.length} 条等你签。第一条：\n${lines[0]}\n（剩下的跑 /pending——待签内容会随 tester 的 questions 带全）`;
}
