/**
 * 注入自检：规约特征串在不在最终 system prompt 里（P1 的机制落点）。
 *
 * 风险（P1 定案）：别的扩展在 before_agent_start 链里返回一个不含
 * `event.systemPrompt` 的全新字符串——那是替换而非追加，规约被吃掉，
 * 而且**没有任何症状**：窗口正常、工具在、只是模型不知道自己是谁。
 *
 * R5 测纯函数 specPresent()，文件头承诺 M6 把它挂到 agent_start 并接 notify。
 * agent_start 在 systemPrompt 定稿后触发（before_agent_start 链已走完），
 * 此时检查特征串还在不在，不在就吵（D-02 用在自己身上）。
 *
 * 注意：getSystemPrompt 不反映 before_provider_request 的 payload 级重写，
 * 自检覆盖的是 before_agent_start 链——那是规约注入发生的地方，够用。
 */
import { specMark, specPresent } from "../roles/index.ts";
import type { SpecRole } from "../roles/index.ts";

/** 挂到 agent_start 的检查：prompt 缺特征串 → 告警（含角色，人能定位） */
export function checkInjectedSpec(role: SpecRole, prompt: string | undefined): void {
  if (prompt && !specPresent(role, prompt)) {
    console.warn(
      `⛔ wf 角色规约特征串（${specMark(role)}）不在 system prompt 里——` +
        `有扩展整体替换了 systemPrompt，本窗口的角色规约被吃掉了。`,
    );
  }
}
