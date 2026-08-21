/**
 * D6 接入路径唯一真验收：临时空目录 → 写三项配置 → 扩展被 mock-pi 加载，诊断为零
 *
 * 老仓库从来没有测过「从零接入」这条路（唯一的接入项目是手工拼的）。
 * 08-dist 的形状是「装一次、配三项、开一次」——D6 验的就是这三步里
 * 机器能验的部分：写三项配置后，扩展加载不报 fatal/warn。
 *
 * mock-pi 加载 = 调扩展的 default 函数（它读 WF_ROLE 决定是否接线）。
 * 三个角色各自设 env 加载一次，断言：没有告警（角色激活正确）、
 * 工具注册了（wire 真的跑了）。
 *
 * 配置用 templates/wf.config.json（模板即可运行示例，D-25）。
 * 临时目录是**空的**——三项配置 + 规划书之外什么都没有，这正是接入现场。
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { inspectConfig } from "../../src/config/index.ts";
import archExt from "../../extensions/arch.ts";
import devExt from "../../extensions/dev.ts";
import testerExt from "../../extensions/tester.ts";
import { fakePi } from "../adapter/_fixture.ts";

function emptyProject() {
  const root = mkdtempSync(join(tmpdir(), "wf-d6-"));
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

/** 写三项配置 + 规划书，回真实诊断 */
function setup(root: string) {
  const tpl = JSON.parse(readFileSync(join(process.cwd(), "templates/wf.config.json"), "utf-8"));
  const cfg = { ...tpl, plan: "docs/plan.md", source: "src", test: null };
  writeFileSync(join(root, "wf.config.json"), JSON.stringify(cfg, null, 2), "utf-8");
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(
    join(root, "docs/plan.md"),
    readFileSync(join(process.cwd(), "templates/plan.minimal.md"), "utf-8"),
    "utf-8",
  );
  return inspectConfig(root);
}

describe("D6 接入路径", () => {
  it("空目录 + 三项配置 → inspectConfig 诊断为零（fatal/warn 都没有）", () => {
    const p = emptyProject();
    try {
      const { cfg, diagnostics } = setup(p.root);
      expect(cfg).not.toBeNull();
      expect(diagnostics.filter((d) => d.level === "fatal" || d.level === "warn")).toEqual([]);
    } finally {
      p.cleanup();
    }
  });

  it("三个扩展在 mock-pi 里各加载一次，角色激活无告警、工具已注册", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const saved = process.env.WF_ROLE;
    const p = emptyProject();
    try {
      setup(p.root);

      const roles = [
        ["arch", archExt],
        ["dev", devExt],
        ["tester", testerExt],
      ] as const;
      const pis = roles.map(([role, ext]) => {
        process.env.WF_ROLE = role;
        const pi = fakePi();
        ext(pi as never);
        return { role, pi };
      });

      // 角色激活正确：没有「不是已知角色」的告警
      expect(warn).not.toHaveBeenCalled();
      // 每个窗口都注册了 send_task（wire 真的跑了）
      for (const { role, pi } of pis) {
        const has = pi.tools.some((t) => t.name === "send_task");
        expect(has, `${role} 窗口没注册 send_task`).toBe(true);
      }
    } finally {
      process.env.WF_ROLE = saved;
      warn.mockRestore();
      p.cleanup();
    }
  });
});
