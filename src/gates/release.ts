/**
 * G-release：放行的**前置 + 凭证**两道判据（共识 ② 方案 A 的 D-01 守门员）
 *
 * arch 代理化后，milestone_passed 由 arch 代发（ROUTES from 改 arch）。
 * D-01 的最后一米从「tester 规约的一句话」（落点=规约=会被跳过）升级为 gate 判据。
 *
 * ── 为什么凭证三段不够（2026-08-24 实测）────────────────────
 * 第一版只查 `evidence` 含三段（人原话 / arch 整理 / 确认）。而 evidence 是
 * **arch 自己构造的字符串**：实测在人从未参与、人的收件箱从来是空的情况下，
 * arch 捏 `人原话：行，过了 / arch 整理：都过了 / 确认：Y` 就放行成功。
 * `includes` 检查的是产出者自备的凭证里有没有三个中文标签，而 D-01 说的是
 * 「判定完成的一方，其产出不被自己评判」——形状没变，只是从规约里的一句话
 * 变成了三个可以照抄的词。（顺带：block reason 原文列出三段名，按 artifact.ts
 * 记下的那条实测教训「写进拦截提示的东西会被填」，那等于在教该写哪三个词。）
 *
 * ── 锚必须在 arch 写不到的地方 ─────────────────────────────
 * 所以第一道判据是 `state.awaitingHuman`：它由 tester 发 verdict_pass 时经 FLOW
 * **机械写入**，arch 的 LLM 只有 `send_task` 一个工具、每个 type 都过拦截链，
 * 没有写 state 的路。于是「人真的被问到了」这件事不再由 arch 自证。
 *
 * 两道都要过，顺序是先前置后凭证：**没被问过**是比**凭证写得不全**更根本的错误，
 * 先报它才不会让人以为「补齐三段就行了」。
 *
 * 凭证那道仍是弱匹配（字符串包含），不检查内容真假——和 G_artifact 同一哲学：
 * 价值在于让「缺一段」变得可见，不是让 gate 理解人话。
 */
import { readState } from "../channel/index.ts";
import { block, ok, type Result } from "./types.ts";

const NAME = "G_release";
const PARTS = ["人原话", "arch 整理", "确认"] as const;

/**
 * 放行前置：这个里程碑有没有真的在等人判定。
 *
 * 三种 block 都指向同一件事（人没被问过 / 问的不是这个里程碑 / 那一轮已被推翻），
 * 但 reason 分开写——「许可被 FAIL 作废了」和「从来没发过 verdict_pass」下一步不同。
 */
export function checkAwaiting(root: string, milestoneId: string): Result {
  const awaiting = readState(root).awaitingHuman ?? "";
  if (awaiting === "") {
    return block(
      NAME,
      `${milestoneId} 没有在等人判定：tester 还没发过 verdict_pass（或上一轮已被 fix_request 推翻）。` +
        `放行的前提是人真的被问到了——凭证三段是人答完之后的记录，不是放行的依据。` +
        `下一步：等 tester 报验收通过，人答完 [human] 断言，你再代发放行`,
    );
  }
  if (awaiting !== milestoneId) {
    return block(
      NAME,
      `在等人判定的是 ${awaiting}，你要放行的是 ${milestoneId}。许可绑定里程碑，不能挪用`,
    );
  }
  return ok();
}

/** 凭证三段：人原话 + arch 整理 + 确认。缺一段 block */
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
