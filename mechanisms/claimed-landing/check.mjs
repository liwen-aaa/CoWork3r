/**
 * claimed-landing：标了「已物化」的落点必须真存在。
 *
 * 判据原文在 criterion.md。从 scripts/check-consensus.mjs 提炼：判据与报错照抄，
 * 文件路径与标记字符变成 options（别的项目可能用 DONE / [x] 而不是 ✅）。
 *
 * 规则：含 mark 的每一行里，反引号包裹的路径必须存在。一行可能列多个落点
 *（本仓库真实形态：atomic.ts + C7 测试；roles 三份 + inject）。
 *
 * 三态而不是两态（day 0 逼出来的）：
 *   零条目（无 ✅ 也无 ⏳） → 绿。空共识是合法的 day 0 状态，第一条共识来自第一次真实争论。
 *                          在空项目上报红 = 装上即红，而恒红的机制会被 skip，接着整条链都没人看
 *   有 ⏳ 无 ✅       → 红。条目存在而一条都没钉 —— 它在漂移，而且本机制在空跑
 *   有 ✅            → 逐个查落点存不存在
 *
 * **HTML 注释与引用块里的不算声明。** 骨架文件的文件头图例就写着「✅ 已钉 ｜ ⏳ 已定未钉」，
 * 示例注释里又带一个占位路径。两者都不排，day 0 铺完骨架的第一次 run 就红，
 * 而人第一眼看到的是一条自己没写过的失败 —— 装上即红的机制会被 skip。
 * 判据：声明写在**条目行**，文件头说明写在引用块里。
 * 抓到这两条的都是本包的绿例 fixture（day-zero-empty，它直接用真实骨架文件）。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export async function check({ root, options }) {
  const rel = options.file;
  const mark = options.mark ?? "✅";
  const abs = join(root, rel);

  if (!existsSync(abs)) {
    return { ok: false, reason: `共识文件不存在：${rel}（options.file 指错了，或这个项目还没写共识）` };
  }

  const raw = readFileSync(abs, "utf-8");
  const pendingMark = options.pendingMark ?? "⏳";
  // 只看声明：排掉 HTML 注释（含多行）与引用块（文件头图例），只留条目行
  const text = raw
    .replace(/<!--[\s\S]*?-->/g, "")
    .split("\n")
    .filter((line) => !/^\s*>/.test(line))
    .join("\n");
  const marked = [...text.matchAll(new RegExp(`${mark}[^\\n]*`, "g"))].map((m) => m[0]);
  const refs = marked.flatMap((line) => [...line.matchAll(/`([^`]+)`/g)].map((x) => x[1]));
  const pendingCount = (text.match(new RegExp(pendingMark, "g")) ?? []).length;

  if (refs.length === 0) {
    if (pendingCount === 0) {
      return { ok: true, note: `${rel}：还没有条目（无 ${mark} 也无 ${pendingMark}）—— 空共识是合法的 day 0 状态` };
    }
    return {
      ok: false,
      reason:
        `${rel} 有 ${pendingCount} 处 ${pendingMark}（已定未钉）而一个 ${mark} 都没有。\n` +
        `条目存在而一条都没钉 —— 它们在漂移，而本机制在空跑（没有任何声明可供核对）。\n` +
        `先把第一条钉上（写测试 / 写 gate / 写脚本），或确认 ${mark} 后面真的跟着反引号路径。`,
    };
  }

  const missing = refs.filter((ref) => !existsSync(join(root, ref)));
  if (missing.length === 0) {
    return { ok: true, note: `${rel}：${refs.length} 个 ${mark} 落点全部存在` };
  }
  return {
    ok: false,
    reason:
      `${rel} 标 ${mark} 的物化落点不存在：${missing.join(" / ")}\n` +
      `声称已物化而落点不在 = 一份读起来很有说服力的虚构。`,
  };
}
