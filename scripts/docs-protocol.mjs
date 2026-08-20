/**
 * 从 ROUTES 生成协议文档 —— 一表四处派生里的第三处。
 *
 * 老仓库有一份手写的消息通道契约（IF-003），里面同样有一张 type × 方向表，
 * 靠人记得同步。它跟代码分裂过（`ticket_result` 那条通道在文档里活得好好的，
 * 而实现把消息投去了别处），而分裂本身没有任何信号。
 *
 * 所以这份文档不写，只生成。plan.md M2 有一条断言：重跑后 `git diff --exit-code`
 * 无输出——也就是「生成物与表一致」变成了 CI 能查的东西。
 *
 * 用法：npm run docs:protocol
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ROUTES } from "../src/protocol/routes.ts";
import { sendTaskSchema, typesFrom } from "../src/protocol/index.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs", "protocol.md");

const types = Object.keys(ROUTES);
const roles = ["arch", "dev", "tester", "human"];

const lines = [];
const w = (s = "") => lines.push(s);

w("# 消息协议（生成物，勿手改）");
w();
w("> 由 `npm run docs:protocol` 从 `src/protocol/routes.ts` 生成。**改表，不改本文件。**");
w(">");
w("> 老仓库有一份手写的同类文档，它跟实现分裂过而没有任何信号——");
w("> `ticket_result` 那条通道在文档里活得好好的，实现却把消息投去了别处。");
w("> 所以这里的一致性由 `git diff --exit-code` 保证（plan.md M2 有对应断言）。");
w();

w("## 通道表");
w();
w("| type | 方向 | 必填 | 触发 |");
w("|---|---|---|---|");
for (const t of types) {
  const r = ROUTES[t];
  const omitted = "omit" in r ? r.omit : [];
  // milestone 可能已在 requires 里（多数 type 都写了），去重后再补隐式的那份
  const req = [...new Set([...r.requires, ...(omitted.includes("milestone") ? [] : ["milestone"])])];
  w(`| \`${t}\` | ${r.from} → ${r.to} | ${req.map((k) => `\`${k}\``).join(" ")} | ${r.description} |`);
}
w();
w(`共 ${types.length} 条。\`to\` 由 \`type\` 决定，不由调用方传——所以「发错地址」在类型层面无从表达。`);
w();

w("## 流转图");
w();
w("```mermaid");
w("flowchart LR");
for (const role of roles) w(`  ${role}["${role.toUpperCase()}"]`);
for (const t of types) {
  const r = ROUTES[t];
  w(`  ${r.from} -->|${t}| ${r.to}`);
}
w("```");
w();

w("## 各角色可发的 type");
w();
w("`send_task` 的参数 schema 按角色生成，所以越权在类型层就不可能——");
w("dev 的 schema 里没有 `arch` 这个选项，不需要运行时拦截。");
w();
w("| 角色 | 可发 | schema 必填 |");
w("|---|---|---|");
for (const role of roles) {
  const mine = typesFrom(role);
  if (mine.length === 0) {
    w(`| ${role} | —（伪角色：有收件箱、无窗口） | — |`);
    continue;
  }
  const schema = sendTaskSchema(role);
  const req = (schema.required ?? []).map((k) => `\`${k}\``).join(" ") || "—";
  w(`| ${role} | ${mine.map((t) => `\`${t}\``).join(" ")} | ${req} |`);
}
w();

w("## 收件箱");
w();
w("单槽位文件，一个角色一个。语义与取舍见 `src/channel/inbox.ts` 文件头。");
w();
for (const role of roles) w(`- ${role} → \`.pi/messages/to-${role}.json\``);
w();

writeFileSync(OUT, lines.join("\n") + "\n", "utf-8");
console.log(`已生成 ${OUT}（${types.length} 条通道，${lines.length} 行）`);
