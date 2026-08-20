/**
 * G7 `templates/wf.config.json` 本体能被真实解析器吃下去
 *
 * 这条补的是一个「宣称的可运行示例」：模板建出来时，`fields.ts` 与 `_fixture.ts`
 * 的文件头都声称它是字段表的可运行示例，但**全仓库没有任何东西读它**——
 * 解析器不认识它,字段表改了它也不红。那正是 D-02 的形状:声称有,机制没有。
 *
 * 与 M4 的 L8（`templates/plan.md` 本体能被 `parsePlan` 解析）是同一个模式:
 * 模板进测试，模板与解析器才同源。老仓库那两份格式分裂两个月没人发现，
 * 就是因为模板从来没被解析过一次。
 *
 * 顺带固化一条边界:占位符禁令只管 `src/roles/`（G6），**不该误伤 config**。
 * `roleNotes` 里写 `<技术栈>` 是对的——它是给接入者填的槽,而规约里的占位符
 * 是被烤进模板的项目事实。两者形状相同,判据相反。
 */
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CONFIG_FILENAME, inspectConfig } from "../../src/config/index.ts";

const TEMPLATE = "templates/wf.config.json";

/** 把模板原样拷进临时项目根——不改一个字节，否则测的就不是模板本体了 */
function projectFromTemplate(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "wf-G7-"));
  copyFileSync(TEMPLATE, join(root, CONFIG_FILENAME));
  return {
    root,
    cleanup: () => {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        /* Windows EBUSY 不该让用例红 */
      }
    },
  };
}

describe("G7 模板即可运行示例", () => {
  it("模板本体解析成功，零 fatal", () => {
    const p = projectFromTemplate();
    try {
      const { cfg, diagnostics } = inspectConfig(p.root);
      const fatals = diagnostics.filter((d) => d.level === "fatal");
      expect(fatals.map((d) => d.message)).toEqual([]);
      expect(cfg).not.toBeNull();
    } finally {
      p.cleanup();
    }
  });

  it("模板里没有未知字段（模板与字段表同源）", () => {
    const p = projectFromTemplate();
    try {
      const { diagnostics } = inspectConfig(p.root);
      // 字段表删一个字段而模板忘改 → 这里红。反向也一样:模板拼错字段名 → 这里红
      expect(diagnostics.filter((d) => d.level === "warn").map((d) => d.message)).toEqual([]);
    } finally {
      p.cleanup();
    }
  });

  it("模板展示了全部九个字段（不只是必填三项）", () => {
    const p = projectFromTemplate();
    try {
      const { cfg } = inspectConfig(p.root);
      // 模板的用途是「照着填」，只写必填三项等于把可选字段藏起来
      const shown = Object.keys(
        JSON.parse(readFileSync(TEMPLATE, "utf-8")) as Record<string, unknown>,
      );
      expect(shown.length).toBe(9);
      expect(cfg?.testPass).toBeTypeOf("string");
      expect(cfg?.gatePass).toBeTypeOf("string");
      expect(cfg?.roleNotes).toBeTypeOf("string");
    } finally {
      p.cleanup();
    }
  });

  it("roleNotes 里的 <占位符> 被接受（G6 的禁令只管 src/roles/）", () => {
    const p = projectFromTemplate();
    try {
      const { cfg, diagnostics } = inspectConfig(p.root);
      expect(cfg?.roleNotes).toMatch(/<[^>]+>/);
      expect(diagnostics.filter((d) => d.level === "fatal")).toEqual([]);
    } finally {
      p.cleanup();
    }
  });
});
