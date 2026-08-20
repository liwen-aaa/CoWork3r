/**
 * G2 语法错 / 空文件 / 顶层非对象 → fatal 且 cfg === null
 *
 * `cfg === null` 是这条的重点，不是 fatal。
 *
 * 老仓库是 `catch { return {} }`：下游拿到一个「看起来能用」的配置，所有可选字段
 * undefined，于是每个 gate 都静默跳过——一个逗号写错就能让整条验证链无声关闭，
 * 而配置者以为自己配了。返回 null 让类型层面就没有这个机会：下游必须先处理 null，
 * 而处理 null 的唯一合理做法是「不能宣布完成」。
 */
import { describe, expect, it } from "vitest";

import { inspectConfig } from "../../src/config/index.ts";
import { makeProject } from "./_fixture.ts";

const BROKEN: [string, string][] = [
  ["多一个逗号", '{ "plan": "docs/plan.md", "source": "src", "test": "npm test", }'],
  ["少一个引号", '{ plan: "docs/plan.md", "source": "src", "test": "npm test" }'],
  ["空文件", ""],
  ["只有空白", "  \n\t "],
  ["顶层是数组", '["plan", "source"]'],
  ["顶层是字符串", '"just a string"'],
  ["顶层是 null", "null"],
  ["顶层是数字", "42"],
  ["截断的 JSON", '{ "plan": "docs/pl'],
];

describe("G2 语法与结构", () => {
  for (const [label, content] of BROKEN) {
    it(`${label} → fatal 且 cfg === null`, () => {
      const p = makeProject(`G2-${label.replace(/[^\w]/g, "")}`);
      try {
        p.write(content);
        const { cfg, diagnostics } = inspectConfig(p.root);

        expect(cfg).toBeNull();
        expect(diagnostics.some((d) => d.level === "fatal")).toBe(true);
        // message 非空：它会进拦截提示
        for (const d of diagnostics) expect(d.message.trim().length).toBeGreaterThan(0);
      } finally {
        p.cleanup();
      }
    });
  }

  it("空文件的 fatal 要说清「不是主动不配」", () => {
    const p = makeProject("G2-empty-msg");
    try {
      p.write("");
      const { diagnostics } = inspectConfig(p.root);
      const msg = diagnostics.map((d) => d.message).join(" ");
      // 人看到这条要知道下一步干什么，而不只是「文件坏了」
      expect(msg).toMatch(/wf\.config\.json/);
    } finally {
      p.cleanup();
    }
  });
});
