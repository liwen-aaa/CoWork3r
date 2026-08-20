/**
 * tests/config/_fixture.ts — 配置层测试的共用环境
 *
 * 只提供「临时项目根 + 往里写一份 wf.config.json」。不提供「合法配置样本」的字面量——
 * 那份样本应该是 `templates/wf.config.json`（真实模板），从文件读（D-25）。
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function makeProject(label: string): {
  root: string;
  write: (content: string) => void;
  writeJson: (obj: unknown) => void;
  cleanup: () => void;
} {
  const root = mkdtempSync(join(tmpdir(), `wf-${label}-`));
  const file = join(root, "wf.config.json");
  return {
    root,
    /** 写原始文本：语法错、空文件、非对象这些都要能造出来 */
    write: (content: string) => writeFileSync(file, content, "utf-8"),
    writeJson: (obj: unknown) => writeFileSync(file, JSON.stringify(obj, null, 2), "utf-8"),
    cleanup: () => {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        /* Windows EBUSY 不该让用例红 */
      }
    },
  };
}

/** 三项必填的最小合法配置。字段名从类型来，值是占位——测的是机制不是内容 */
export const MINIMAL = { plan: "docs/plan.md", source: "src", test: "npm test" };
