#!/usr/bin/env node
/**
 * 机制包运行器 —— 「判据 + 会红的机制」这一对的最小可发布单元。
 *
 * 为什么需要它：纪律的文字能拷，纪律的执行力不能拷。整包搬 disciplines.md 到新项目，
 * 每条的落点都退回「规约」= 接受它会被跳过（D-02）。可移植的单元因此不是那条纪律，
 * 是「判据原文 + 一个会红的机制」——机制装进 pretest 每轮自动跑，判据原文随 block
 * 到达（agent 第一次知道它存在就是被拦的那一刻，D-48 的前提）。
 *
 * 四个子命令：
 *   list                  有哪些包、装了哪些
 *   run [id...]           在当前项目上跑（缺省跑 mech.json 的 install 列表）
 *   selftest [id...]      拿包自带的 fixture 真跑一遍：红例必红、绿例必绿（准入闸）
 *   install <id...>       selftest → 在本项目跑一次 → 记进 mech.json（--wire 才动 package.json）
 *
 * 准入闸就是 T14 的红场景标准搬到装机时刻：**写不出会红的真实输入 = 它是投影不是判据**，
 * 拒装。同时它也是包自己的哑弹检查（D-49 的形状套在包上），而且必须两头都卡：
 *   恒绿的包 → 红例红不了 → 拒装（你以为有防线而它什么都拦不住）
 *   恒红的包 → 绿例红了 → 拒装（它会在真项目上被 skip，接着整条链都没人看）
 * 只要红例不够：把 check 写成「永远返回红」也能过那一关。
 *
 * 包目录解析相对本文件（装进别的项目后在 node_modules 里也成立），
 * 项目根 = process.cwd()。
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKS_DIR = resolve(HERE, "..", "mechanisms");
const ROOT = process.cwd();
const MECH_FILE = join(ROOT, "mech.json");

// ── 包与项目配置 ──────────────────────────────────────────

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return fallback;
  }
}

/** 所有可用的包（mechanisms/ 下带 pack.json 的目录） */
function allPacks() {
  if (!existsSync(PACKS_DIR)) return [];
  return readdirSync(PACKS_DIR)
    .filter((name) => existsSync(join(PACKS_DIR, name, "pack.json")))
    .map((name) => ({ id: name, dir: join(PACKS_DIR, name), ...readJson(join(PACKS_DIR, name, "pack.json"), {}) }));
}

function pack(id) {
  const p = allPacks().find((x) => x.id === id);
  if (!p) {
    console.error(`没有这个机制包：${id}\n可用：${allPacks().map((x) => x.id).join(" / ") || "（无）"}`);
    process.exit(2);
  }
  return p;
}

/** 项目侧配置。装了哪些包 + 每包的本项目参数（历史例外、落点路径这类天生按项目变的东西） */
function projectMech() {
  return readJson(MECH_FILE, { install: [], options: {} });
}

function optionsFor(p, mech) {
  return { ...(p.defaults ?? {}), ...((mech.options ?? {})[p.id] ?? {}) };
}

async function loadCheck(p) {
  const mod = await import(pathToFileURL(join(p.dir, p.check ?? "check.mjs")).href);
  if (typeof mod.check !== "function") throw new Error(`${p.id} 的 ${p.check ?? "check.mjs"} 没有导出 check()`);
  return mod.check;
}

function criterion(p) {
  return readFileSync(join(p.dir, "criterion.md"), "utf-8").trim();
}

// ── list ────────────────────────────────────────────────

function cmdList() {
  const mech = projectMech();
  const installed = new Set(mech.install ?? []);
  const packs = allPacks();
  if (packs.length === 0) {
    console.log("mechanisms/ 下没有包");
    return 0;
  }
  console.log(`机制包（项目：${ROOT}）\n`);
  for (const p of packs) {
    console.log(`${installed.has(p.id) ? "●" : "○"} ${p.id}  [${p.applies ?? "any"}]`);
    console.log(`    判据：${p.criterion ?? "（pack.json 缺 criterion 一句话）"}`);
    console.log(`    来源：${p.origin ?? "（未记来源事故）"}`);
  }
  console.log(`\n● 已装（进 mech.json 的 install）  ○ 候选\n装：node scripts/mech.mjs install <id>`);
  return 0;
}

// ── run ─────────────────────────────────────────────────

async function cmdRun(ids) {
  const mech = projectMech();
  const targets = ids.length > 0 ? ids : (mech.install ?? []);
  if (targets.length === 0) {
    console.log("本项目未装任何机制包（mech.json 的 install 为空）。装一个：node scripts/mech.mjs install <id>");
    return 0;
  }
  let failed = 0;
  for (const id of targets) {
    const p = pack(id);
    const opts = optionsFor(p, mech);
    const r = await (await loadCheck(p))({ root: ROOT, options: opts });
    const label = opts.as ? `${id}（本项目编号 ${opts.as}）` : id;
    if (r.ok) {
      console.log(`✓ ${label}`);
      continue;
    }
    failed++;
    console.log(`✗ ${label}`);
    console.log(indent(r.reason ?? "（机制没给 reason —— 那等于没给判据）"));
    console.log(`\n判据原文：\n${indent(criterion(p))}\n`);
  }
  console.log(`判定：${failed === 0 ? "PASS" : `FAIL（${failed} 个机制红）`}`);
  return failed === 0 ? 0 : 1;
}

function indent(text) {
  return text
    .split("\n")
    .map((l) => `  ${l}`)
    .join("\n");
}

// ── selftest（准入闸）────────────────────────────────────

/** fixture/<case>/fixture.json 每个一例。files/ 铺进临时项目；history/ 按名序提交成 git 历史 */
function casesOf(p) {
  const base = join(p.dir, "fixture");
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .filter((name) => existsSync(join(base, name, "fixture.json")))
    .map((name) => ({ name, dir: join(base, name), ...readJson(join(base, name, "fixture.json"), {}) }));
}

function git(cwd, args) {
  execFileSync("git", ["-c", "user.email=mech@local", "-c", "user.name=mech", ...args], {
    cwd,
    stdio: "pipe",
  });
}

/** 把一个 case 铺成临时项目。返回项目根 */
function materialize(c) {
  const tmp = mkdtempSync(join(tmpdir(), "wf-mech-"));
  if (existsSync(join(c.dir, "files"))) cpSync(join(c.dir, "files"), tmp, { recursive: true });
  if (c.git) {
    git(tmp, ["init", "-q"]);
    const target = join(tmp, c.git.path);
    mkdirSync(dirname(target), { recursive: true });
    for (const rel of c.git.commits) {
      writeFileSync(target, readFileSync(join(c.dir, rel), "utf-8"));
      git(tmp, ["add", "-A"]);
      git(tmp, ["commit", "-q", "-m", rel]);
    }
  }
  return tmp;
}

async function cmdSelftest(ids) {
  const packs = ids.length > 0 ? ids.map(pack) : allPacks();
  let failed = 0;
  for (const p of packs) {
    const cases = casesOf(p);
    const reds = cases.filter((c) => !c.expectGreen);
    const greens = cases.filter((c) => c.expectGreen);
    if (reds.length === 0) {
      failed++;
      console.log(`✗ ${p.id}：没有会红的 fixture —— 写不出「会红的真实输入」的机制是投影不是判据，拒装`);
      continue;
    }
    if (greens.length === 0) {
      failed++;
      console.log(
        `✗ ${p.id}：没有 expectGreen 的 fixture —— ` +
          `只有红例的话，把 check 写成「永远返回红」也能过闸，而恒红的机制会在真项目上被 skip`,
      );
      continue;
    }
    const check = await loadCheck(p);
    for (const c of cases) {
      const tmp = materialize(c);
      try {
        const r = await check({ root: tmp, options: { ...(p.defaults ?? {}), ...(c.options ?? {}) } });
        if (c.expectGreen) {
          if (r.ok) {
            console.log(`✓ ${p.id}/${c.name} 真绿（${c.why ?? "合法输入不该红"}）`);
          } else {
            failed++;
            console.log(
              `✗ ${p.id}/${c.name}：这份输入应该绿，实际红了 —— 恒红的机制会被 skip\n${indent(r.reason ?? "")}`,
            );
          }
          continue;
        }
        if (r.ok) {
          failed++;
          console.log(`✗ ${p.id}/${c.name}：这份输入应该红，实际绿了 —— 机制恒绿 = 哑弹`);
        } else if (c.expectRed && !(r.reason ?? "").includes(c.expectRed)) {
          failed++;
          console.log(`✗ ${p.id}/${c.name}：红了但不是预期那条（缺 ${JSON.stringify(c.expectRed)}）\n${indent(r.reason ?? "")}`);
        } else {
          console.log(`✓ ${p.id}/${c.name} 真红（${c.why ?? c.expectRed ?? "见 fixture.json"}）`);
        }
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    }
  }
  console.log(`判定：${failed === 0 ? "PASS" : `FAIL（${failed} 例）`}`);
  return failed === 0 ? 0 : 1;
}

// ── install ─────────────────────────────────────────────

async function cmdInstall(ids, wire) {
  if (ids.length === 0) {
    console.error("用法：node scripts/mech.mjs install <id...> [--wire]");
    return 2;
  }
  // 准入闸：先证明它会红，再证明它在本项目上不是恒红
  const st = await cmdSelftest(ids);
  if (st !== 0) {
    console.log("\n拒装：准入闸未过（fixture 红不了 = 恒绿哑弹）");
    return 1;
  }
  const mech = projectMech();
  const install = new Set(mech.install ?? []);
  for (const id of ids) install.add(id);
  const next = { ...mech, install: [...install], options: mech.options ?? {} };
  for (const id of ids) {
    const p = pack(id);
    if (!next.options[id]) next.options[id] = { ...(p.defaults ?? {}) };
  }
  writeFileSync(MECH_FILE, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`\n已记进 mech.json：${ids.join(" / ")}（参数用缺省，按项目改 options）`);

  console.log("\n在本项目上跑一次：");
  const runCode = await cmdRun(ids);
  if (runCode !== 0) {
    console.log("\n注意：装上即红。这不是拒装理由（可能就是它抓到了真问题），但先把它修绿再串进 pretest。");
  }

  const pkgFile = join(ROOT, "package.json");
  const line = "node scripts/mech.mjs run";
  if (!existsSync(pkgFile)) {
    console.log(`\n本项目没有 package.json —— 机制还没有落点。把 \`${line}\` 挂进你的每轮钩子（Makefile / CI / pre-commit），否则它只是能跑，不是在跑（D-02）。`);
    return runCode;
  }
  const pkg = readJson(pkgFile, {});
  const pretest = pkg.scripts?.pretest ?? "";
  if (pretest.includes("mech.mjs run") || pretest.includes("wf:mech")) {
    console.log("\npretest 已串 mech run —— 每轮自动跑。");
    return runCode;
  }
  if (!wire) {
    console.log(`\n还差最后一步（机制不进每轮钩子就等于不存在）：\n  package.json → scripts.pretest 串上 "${line}"\n  或重跑本命令带 --wire 由我改。`);
    return runCode;
  }
  pkg.scripts = pkg.scripts ?? {};
  pkg.scripts["wf:mech"] = line;
  pkg.scripts.pretest = pretest === "" ? "npm run wf:mech" : `npm run wf:mech && ${pretest}`;
  writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log('\n已改 package.json：新增 scripts."wf:mech"，并串进 pretest 首位。');
  return runCode;
}

// ── 入口 ────────────────────────────────────────────────

const [cmd, ...rest] = process.argv.slice(2);
const args = rest.filter((a) => !a.startsWith("--"));
const flags = new Set(rest.filter((a) => a.startsWith("--")));

const code = await (async () => {
  switch (cmd) {
    case "list":
      return cmdList();
    case "run":
      return cmdRun(args);
    case "selftest":
      return cmdSelftest(args);
    case "install":
      return cmdInstall(args, flags.has("--wire"));
    default:
      console.log(
        [
          "机制包运行器",
          "",
          "  node scripts/mech.mjs list                 有哪些包、装了哪些",
          "  node scripts/mech.mjs run [id...]          在本项目上跑（缺省 mech.json 的 install）",
          "  node scripts/mech.mjs selftest [id...]     拿 fixture 真跑，必须红（准入闸）",
          "  node scripts/mech.mjs install <id> [--wire]  准入闸 → 记 mech.json →（--wire）串进 pretest",
          "",
          "包的形状与怎么加一个：mechanisms/README.md",
        ].join("\n"),
      );
      return cmd === undefined ? 0 : 2;
  }
})();
process.exit(code);
