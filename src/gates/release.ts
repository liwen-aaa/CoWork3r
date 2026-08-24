/**
 * G-release：放行凭证三段校验（共识 ② 方案 A 的 D-01 守门员）
 *
 * arch 代理化后，milestone_passed 由 arch 代发（ROUTES from 改 arch）。
 * D-01 的最后一米从「tester 规约的一句话」（落点=规约=会被跳过）升级为 gate 判据：
 *
 *   evidence 必须含三段，缺一段 block：
 *     人原话   人的原话原文（唯一不可篡改的锚——翻译失真由它兜底）
 *     arch 整理 arch 的翻译（人话 → 确定格式）
 *     确认      人的确认标记（放行是单向门，人必须点过头）
 *
 * 判据是弱匹配（字符串包含），不检查内容真假——和 G_artifact 的弱匹配同一哲学：
 * 价值在于让「缺一段」变得可见，不是让 gate 理解人话。
 *
 * 这堵两个洞：
 *   ① arch 自己宣布完成——它拿不出「人原话」那段
 *   ② tester 不经人直接放行——from 改 arch 后 tester 发不出 milestone_passed
 */
import { block, ok, type Result } from "./types.ts";

const NAME = "G_release";
const PARTS = ["人原话", "arch 整理", "确认"] as const;

export function checkRelease(evidence: string): Result {
  const miss = PARTS.filter((p) => !evidence.includes(p));
  if (miss.length > 0) {
    return block(
      NAME,
      `放行凭证缺 ${miss.join(" / ")} 段。evidence 必须三段：` +
        `人原话（人的原话原文）+ arch 整理（arch 的翻译）+ 确认（人的确认标记，如 Y）。` +
        `放行是单向门，人没点过头就不存在放行`,
    );
  }
  return ok();
}
