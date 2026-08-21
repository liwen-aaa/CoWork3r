/**
 * G-source：生产文件真的动了吗。
 *
 * 堵的是「只写产出说明不写生产内容」——投递一份漂亮的 dev-output，而 `source`
 * 里一个字节没改。
 *
 * ── 为什么是快照而不是 git diff ──────────────────────────
 * 基准不同。git 的基准是 commit，而**修复轮之间没有 commit**（dev 改一版投一次，
 * tester 打回再改一版，中间不提交）。快照的基准是「上次投递点」，那正是要比的东西。
 * 老仓库当年用快照是因为两个项目都没有 .git；现在有了，但基准这件事没变。
 *
 * ── 为什么存内容 hash 而不是 size + mtime ────────────────
 * 架构文档原本写的是 `{相对路径 → size + mtime}`。实测否掉了：同长度改动
 * （`aaa` → `bbb`）在同一个时钟刻度内 size 与 `mtimeMs` **完全相同**
 * （实测两次写入 mtimeMs 都是 …248.559），于是「改了内容」被判成「没改」。
 * 这种漏放正是这道 gate 存在的理由的反面，所以改用 sha256 前 16 位。
 * 代价是要读文件内容——source 是人手写的代码目录，量级可接受。
 *
 * `source` 是必填字段（03-config），所以没有「未配则跳过」这个降级路径。
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { channelPaths, writeJsonAtomic } from "../channel/index.ts";
import { block, ok, type Result } from "./types.ts";

const NAME = "G_source";

/** 不进快照的目录：它们不是人写的生产内容，且体量会让读文件变慢 */
const SKIP_DIRS = new Set(["node_modules", ".git", ".pi", "dist", "build", "coverage"]);

type Snapshot = Record<string, string>;

function hash(text: Buffer): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/** 递归收集 `{相对路径 → 内容 hash}`。路径不存在则返回 null（与「空目录」区分） */
function snapshot(root: string, source: string): Snapshot | null {
  const abs = join(root, source);
  let st: ReturnType<typeof statSync>;
  try {
    st = statSync(abs);
  } catch {
    return null;
  }

  const out: Snapshot = {};

  if (st.isFile()) {
    out[relative(root, abs).replaceAll("\\", "/")] = hash(readFileSync(abs));
    return out;
  }

  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      if (SKIP_DIRS.has(name)) continue;
      const full = join(dir, name);
      let s: ReturnType<typeof statSync>;
      try {
        s = statSync(full);
      } catch {
        continue; // 读不到就跳过：竞态删除不该让 gate 崩
      }
      if (s.isDirectory()) {
        walk(full);
        continue;
      }
      out[relative(root, full).replaceAll("\\", "/")] = hash(readFileSync(full));
    }
  };
  walk(abs);
  return out;
}

function baselineFile(root: string): string {
  return channelPaths(root).sourceBaseline;
}

function readBaseline(root: string): Snapshot | null {
  try {
    const raw = JSON.parse(readFileSync(baselineFile(root), "utf-8")) as unknown;
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
    return raw as Snapshot;
  } catch {
    return null;
  }
}

/**
 * 投递成功后调它，把基线推进到本次投递点。
 *
 * 走 01-channel 的原子写：并发窗口下半截 JSON 会被 `readBaseline` 的 catch 吞成
 * 「无基线」，症状是这道 gate 静默放行一次。
 */
export function takeSourceBaseline(root: string, source: string): void {
  const snap = snapshot(root, source);
  if (snap === null) return; // 路径不存在时不写基线，让下次 gate 报配置问题
  writeJsonAtomic(baselineFile(root), snap);
}

export function G_source(ctx: { root: string; source: string }): Result {
  const now = snapshot(ctx.root, ctx.source);
  if (now === null) {
    return block(
      NAME,
      `配置里的 source 指向不存在的路径：${ctx.source}（改 wf.config.json 的 source 字段）`,
    );
  }

  const base = readBaseline(ctx.root);
  // 首次投递没有基线 —— 放行。这不是漏洞：第一次投递本身就是「从无到有」
  if (base === null) return ok();

  const changed =
    Object.keys(now).some((k) => base[k] !== now[k]) ||
    Object.keys(base).some((k) => !(k in now));

  if (!changed) {
    return block(
      NAME,
      `${ctx.source} 自上次投递以来没有变化（${Object.keys(now).length} 个文件的内容都没动）。` +
        `产出说明写得再好也不算改动——先改代码`,
    );
  }
  return ok();
}
