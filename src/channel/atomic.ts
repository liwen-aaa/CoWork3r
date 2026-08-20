/**
 * 原子写：写 .tmp → rename。**唯一允许直接调 writeFileSync 的文件。**
 *
 * C4：并发窗口同时读写同一文件是常态。非原子写会产生半截 JSON，
 * 然后被 catch 静默吞掉，症状是「状态莫名回退」。
 *
 * 「只有本文件能调 writeFileSync」这条可以用 grep 检查，而且 C4 有一个用例在 grep
 * （plan.md M1 也有一条断言）。这是把「有没有漏一处」变成可判定的。
 */
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
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

export function writeJsonAtomic(file: string, data: unknown): void {
  writeTextAtomic(file, JSON.stringify(data, null, 2));
}
