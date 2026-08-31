/**
 * wired-check：台账声称的检查命令真存在且已接线。
 *
 * 判据原文在 criterion.md。从 scripts/check-disciplines.mjs 的第 [3] 段提炼。
 *
 * 「已接线」的判据：script 名出现在自动钩子集合的命令体里（或它自己就是钩子之一）。
 * npm 生态的缺省钩子 = `test` + 所有 `pre*` / `post*`；其它生态（bun + CI、Makefile、
 * pre-commit）用 options.autoHooks 指名 —— 那是「每轮自动跑」在不同生态的同一判据，
 * 不是新判据。criterion.md 不变。
 *
 * 只查台账**最后一列**（落点列）里的命令：正文里提到某个命令是叙述，落点声称的才是承诺。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export async function check({ root, options }) {
  const rel = options.file;
  const pkgFile = join(root, "package.json");

  if (!existsSync(join(root, rel))) {
    return { ok: false, reason: `台账文件不存在：${rel}（options.file 指错了）` };
  }
  if (!existsSync(pkgFile)) {
    return {
      ok: false,
      reason:
        `本项目没有 package.json，而这道机制靠它判断「已接线」。\n` +
        `换生态请换掉本包的 check.mjs（判据不变：声称的命令必须存在且每轮自动跑）。`,
    };
  }

  const pkg = JSON.parse(readFileSync(pkgFile, "utf-8"));
  const scripts = pkg.scripts ?? {};

  /**
   * 自动钩子集合。缺省（autoHooks 为空）= npm 生态的 test + pre/post 前缀钩子（含它们命令体里
   * 串的）。options.autoHooks = ["check", "test"] 用于 bun + CI 生态（无 pre/post 约定，
   * 「每轮自动跑」由 CI 工作流调用 check/test 实现）——同一判据的生态适配。
   */
  const hooks = options.autoHooks ?? [];
  const wired = new Set();
  for (const [name, body] of Object.entries(scripts)) {
    const isDefaultHook =
      hooks.length === 0 && (name === "test" || name.startsWith("pre") || name.startsWith("post"));
    const isNamedHook = hooks.includes(name);
    if (!isDefaultHook && !isNamedHook) continue;
    wired.add(name);
    for (const m of String(body).matchAll(/\b(?:npm run|bun run) ([\w:-]+)/g)) wired.add(m[1]);
  }

  const idRe = new RegExp(options.idPattern);
  const cmdRe = new RegExp(options.commandPattern, "g");
  /** id → 它声称的命令列表。取行的最后一列（落点列）；一行可声称多个（如 `bun run check` / `bun run test`） */
  const claims = new Map();
  for (const line of readFileSync(join(root, rel), "utf-8").split("\n")) {
    const idm = idRe.exec(line);
    if (!idm) continue;
    const landing = /\|([^|]*)\|\s*$/.exec(line);
    if (!landing) continue;
    const cmds = [...landing[1].matchAll(cmdRe)].map((m) => m[1]);
    if (cmds.length > 0) claims.set(idm[1], (claims.get(idm[1]) ?? []).concat(cmds));
  }

  if (claims.size === 0) {
    return { ok: true, note: `${rel} 的落点列没有声称任何命令（全部是规约档，诚实）` };
  }

  const problems = [];
  for (const [id, cmds] of claims) {
    for (const script of cmds) {
      if (!scripts[script]) {
        problems.push(`${id} 声称命令 ${script}（npm/bun run），但 package.json 里没有这个 script`);
      } else if (!wired.has(script)) {
        problems.push(
          `${id} 的命令 ${script} 存在但**未接线**（不在自动钩子里：npm 生态的 test/pre/post 前缀，或 options.autoHooks 指名的那几个）—— ` +
            `没人调用的检查器比不存在更坏，因为台账声称有机制`,
        );
      }
    }
  }

  if (problems.length === 0) {
    return { ok: true, note: `${rel}：${claims.size} 条声称的命令全部存在且已接线` };
  }
  return { ok: false, reason: `${rel}\n${problems.map((p) => `- ${p}`).join("\n")}` };
}
