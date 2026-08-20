/**
 * 规约加载与 system prompt 拼接。
 *
 * 三个纯函数，都不碰 pi：`loadRoleSpec` / `buildSystemPrompt` / `specPresent`。
 * 挂到 `before_agent_start` 与 `agent_start` 上是 07-adapter 的事（M6）——
 * 本层不知道钩子长什么样（D-07 同形状）。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 三个真角色。`human` 是伪角色——有收件箱、无窗口、无规约，
 * 所以它不在这里，传进来会抛错。
 */
export const SPEC_ROLES = ["arch", "dev", "tester"] as const;

export type SpecRole = (typeof SPEC_ROLES)[number];

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * 特征串：埋进 system prompt 末尾，事后用它检查规约还在不在。
 *
 * markdown 注释形式，不干扰模型阅读。**按角色区分**——否则「三个窗口都装了同一份
 * 规约」这个故障查不出来。
 */
export function specMark(role: SpecRole): string {
  return `<!-- wf-role-spec:${role} -->`;
}

/**
 * 读一份规约（不是三份）。
 *
 * 「按角色读一份」不是效率优化，是隔离：D-01（生产者不能宣布自己完成）依赖
 * dev 与 tester 两个上下文互不知情。老仓库三份 SKILL 在三个窗口都可发现，
 * dev 看得见 tester 的规约——那个形状下 dev 知道自己会被怎么验。
 *
 * 未知角色抛错，不返回空串。静默返回空串等于「这个窗口没有规约但看起来正常」,
 * 正是要防的那类故障。
 */
export function loadRoleSpec(role: SpecRole): string {
  if (!(SPEC_ROLES as readonly string[]).includes(role)) {
    throw new Error(
      `未知角色 ${JSON.stringify(role)}：规约只有 ${SPEC_ROLES.join(" / ")}（human 是伪角色，无规约）`,
    );
  }
  return readFileSync(join(HERE, `${role}.md`), "utf-8");
}

/**
 * 拼接 system prompt：**追加，不替换。**
 *
 * pi 的 `before_agent_start` 是链式的——`event.systemPrompt` 反映截至当前 handler
 * 的结果，后续 handler 还能再改。返回 `base + spec` 而不是全新字符串，
 * 否则就把上游（以及别的扩展）的系统提示吃掉了。
 *
 * `notes` 追加在规约之后、特征串之前。它只能追加、不能覆盖规约本体（D-18）：
 * 项目侧若能整份换掉 tester 规约，它就能把 tester 换成一个橡皮图章。
 */
export function buildSystemPrompt(role: SpecRole, base: string, notes?: string): string {
  const parts: string[] = [];
  if (base.trim() !== "") parts.push(base);
  parts.push(loadRoleSpec(role).trimEnd());
  if (notes !== undefined && notes.trim() !== "") {
    parts.push(`## 关于这个项目\n\n${notes.trim()}`);
  }
  parts.push(specMark(role));
  return parts.join("\n\n");
}

/**
 * 注入自检：特征串还在不在。
 *
 * 风险是别的扩展返回一个不含 `event.systemPrompt` 的全新字符串——那是替换而非追加，
 * 规约被吃掉，而且**没有任何症状**：窗口正常、工具在、只是模型不知道自己是谁。
 *
 * 不去查「今天装的扩展会不会这么干」（查了也只对今天有效），直接按会发生设计。
 * 这是 D-02 用在自己身上：把「应该在」变成「不在就吵」。
 */
export function specPresent(role: SpecRole, prompt: string): boolean {
  return prompt.includes(specMark(role));
}
