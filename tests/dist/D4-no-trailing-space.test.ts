/**
 * D4 launch 无尾随空格：`set WF_ROLE=arch` 行尾不能有空格。
 *
 * 老仓库那次事故：行尾一个空格 → `WF_ROLE="arch "`（带尾随空格）→ 07-adapter
 * 的角色激活检查不匹配 → 窗口静默不激活，症状是「窗口开着但没有就绪通知」。
 *
 * 两道一起堵：本测试 grep 检查（生成物侧），A1 检查 wire/extension 的告警
 * （运行时侧）。
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const LAUNCH = join(process.cwd(), "launch");

describe("D4 launch 无尾随空格", () => {
  it("所有 set WF_ROLE= 行行尾无空格", () => {
    const files = readdirSync(LAUNCH).filter((f) => f.endsWith(".ps1") || f.endsWith(".bat"));
    for (const f of files) {
      const lines = readFileSync(join(LAUNCH, f), "utf-8").split(/\r?\n/);
      for (const line of lines) {
        if (line.includes("set WF_ROLE=")) {
          expect(line, `${f} 的 WF_ROLE 行有尾随空格`).toBe(line.trimEnd());
        }
      }
    }
  });

  it("set WF_ROLE=<值> 与 && 之间无空格（值尾随空格 = 老仓库那次事故）", () => {
    // trio.ps1 是行中写法：`set WF_ROLE=dev&& pi`。cmd 的 `set VAR=value && cmd`
    // 会把 && 前的空格吃进值里 → WF_ROLE="dev " → 角色激活不匹配 → 窗口静默。
    // 实测：`set WF_ROLE=dev&& echo` → [dev]；`set WF_ROLE=dev && echo` → [dev ]。
    // 判据：set WF_ROLE= 后面紧跟非空格字符，直到 && 或行尾，中间无空格。
    const files = readdirSync(LAUNCH).filter((f) => f.endsWith(".ps1") || f.endsWith(".bat"));
    for (const f of files) {
      const lines = readFileSync(join(LAUNCH, f), "utf-8").split(/\r?\n/);
      for (const line of lines) {
        const m = /set WF_ROLE=(\S*)(\s+)(&&.*|$)/.exec(line);
        if (m) {
          // 值后跟空白再跟 && 或行尾：空格被 cmd 的 set 吃进值里 → WF_ROLE 带尾随空格
          expect(m[2]!.length, `${f}: set WF_ROLE=${m[1]} 值后有空格（会被 cmd 吃进值，值变 "${m[1]} "）`).toBe(0);
        }
      }
    }
  });
});
