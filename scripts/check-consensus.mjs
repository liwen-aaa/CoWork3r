/**
 * check-consensus.mjs — 共识 ⑨ 的物化检查（轻量版）
 *
 * 判据（consensus.md ⑨ 原文）：**✅ 条目必须有可 grep 的物化落点**。
 * ⏳ 不查——那是软信号，靠人看（⏳ 超过一个里程碑不钉 = 在漂移）。
 *
 * 规则：consensus.md 里每行「物化: ✅ ...」中，✅ 后面反引号包裹的路径
 * 必须是真实存在的文件/目录。不存在 = 声称已物化而落点不在 = 红。
 * 格式约定：✅ 落点写相对路径（如 `src/adapter/wire.ts`），与 disciplines.md
 * 落点列同风格。
 *
 * 为什么只查 ✅：⏳ 是「已定未钉」的诚实标注，检查它等于催进度（软信号）。
 * 为什么进 pretest：M2 那条「生成物 diff」的教训——判据落点写「人手跑一次」
 * 等于没人跑（D-02 原文）。✅ 的落点声称存在，就必须有人每轮确认它存在。
 */
import { existsSync, readFileSync } from "node:fs";

const FILE = "docs/consensus.md";

const src = readFileSync(FILE, "utf-8");
// 每条「物化: ✅ ...」行的**整行**内所有反引号路径都是物化落点
//（一行可能列多个：atomic.ts + C7 测试；roles 三份 + inject）
const refs = [...src.matchAll(/✅[^\n]*/g)]
  .map((m) => [...m[0].matchAll(/`([^`]+)`/g)].map((x) => x[1]))
  .flat();

if (refs.length === 0) {
  console.log("⚠ consensus.md 没有标 ✅ 的物化落点——要么全部 ⏳，要么格式不对（✅ 后应跟反引号路径）");
  process.exit(1);
}

const missing = refs.filter((ref) => !existsSync(ref));
if (missing.length > 0) {
  console.log(`⚠ consensus.md 标 ✅ 的物化落点不存在：${missing.join(" / ")}`);
  console.log(
    "  判据（共识 ⑨）：✅ 条目必须有可 grep 的物化落点。落点不存在 = 声称已物化而实为虚构。\n" +
      "  修法：把落点写成真实相对路径；或把该条目降回 ⏳（并写明为什么没钉）。",
  );
  process.exit(1);
}

console.log(`✓ 共识物化落点 ${refs.length} 处全部存在：${refs.join(" / ")}`);
