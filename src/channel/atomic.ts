/**
 * 原子写：写 .tmp → rename。**唯一允许直接调 writeFileSync 的文件。**
 *
 * C4：并发窗口同时读写同一文件是常态。非原子写会产生半截 JSON，
 * 然后被 catch 静默吞掉，症状是「状态莫名回退」。
 *
 * 「只有本文件能调 writeFileSync」这条可以用 grep 检查，而且 C4 有一个用例在 grep
 * （plan.md M1 也有一条断言）。这是把「有没有漏一处」变成可判定的。
 */
import { appendFileSync, constants, copyFileSync, existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * `.tmp` 后缀带 pid：同一目录下多个进程同时原子写同一个文件时，
 * 各写各的临时文件，rename 才是真正的竞争点（而 rename 是原子的）。
 * 共用一个 `.tmp` 名字会让两个进程互相写坏对方的中间态。
 */
function tmpName(file: string): string {
  return `${file}.${process.pid}.tmp`;
}

export function writeTextAtomic(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = tmpName(file);
  writeFileSync(tmp, text, "utf-8");
  renameSync(tmp, file);
}

/**
 * 独占写（O_EXCL 语义）：目标已存在即失败，不覆盖。**文件名本身是锁**（共识 #4）。
 *
 * 与 `writeTextAtomic` 的分工：
 *   writeTextAtomic  覆盖写    —— 幂等写入：水位、state、基线（最后一次写赢）
 *   writeTextExclusive 禁止覆盖 —— 单槽位收件箱投递（同一方向同时只允许一条在飞）
 *
 * 为什么不是「peek 检查 + writeTextAtomic」：三个窗口是三个进程，检查与写入之间
 * 另一个进程可能已经写入——分离的检查有竞态窗口。`copyFileSync` 的 `COPYFILE_EXCL`
 * 把「检查非空」和「写入」合并成一个跨进程原子的动作：目标存在 → EEXIST，
 * 不存在 → 拷贝。
 *
 * 为什么保留 .tmp：copyFileSync 直接写目标会失去防半写——写入中途进程被杀，
 * 目标留下半截 JSON，而那个半截文件会让后续所有投递都 EEXIST 拒绝（锁被污染）。
 * 写 .tmp（可被下次覆盖）→ copyFileSync(COPYFILE_EXCL) → unlink tmp：
 * 半写只坏 .tmp，目标要么完整要么不存在。
 */
export function writeTextExclusive(
  file: string,
  text: string,
): { ok: true } | { ok: false; reason: string } {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = tmpName(file);
  writeFileSync(tmp, text, "utf-8");
  try {
    copyFileSync(tmp, file, constants.COPYFILE_EXCL);
    try {
      unlinkSync(tmp);
    } catch {
      /* tmp 残留不影响语义，下次写会覆盖 */
    }
    return { ok: true };
  } catch (e) {
    try {
      unlinkSync(tmp);
    } catch {
      /* 同上 */
    }
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "EEXIST") {
      return { ok: false, reason: `目标 ${file} 已存在（单槽位：同一方向同时只允许一条在飞，上一条还没被处理）` };
    }
    return { ok: false, reason: `写入 ${file} 失败：${String(e)}` };
  }
}

export function writeJsonAtomic(file: string, data: unknown): void {
  writeTextAtomic(file, JSON.stringify(data, null, 2));
}

/**
 * 追加一段（台账语义）。首次写入时先落 `header`。
 *
 * 与上面两个的分工：前两个是**状态**（最后一次写赢 / 文件名即锁），
 * 这个是**台账**：只增不改，过往条目不得被覆盖——待人工事项覆盖一条
 * 就是一件事静默消失（D-30：需要人主动去找才看得见的待办 = 无效载体）。
 *
 * 不走 .tmp + rename：追加的原子单位是一段文本而不是整个文件，`appendFileSync`
 * 在 O_APPEND 下小写入不会交错；而 rename 会拿旧快照覆盖并行窗口刚追加的那条。
 */
export function appendTextAtomic(file: string, text: string, header?: string): void {
  mkdirSync(dirname(file), { recursive: true });
  const head = header !== undefined && !existsSync(file) ? header : "";
  appendFileSync(file, `${head}${text}`, "utf-8");
}
