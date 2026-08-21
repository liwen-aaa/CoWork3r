/**
 * A8 无字面量：adapter 层不出现 `to: "<role>"` 与 `to-*.json` 文件名
 *
 * `to` 由 ROUTES 表决定（02-protocol），收件箱文件名由 channelPaths 决定（01-channel）。
 * adapter 层出现任何一处硬编码 = 两处权威（D-04）——表改了这里不跟着改，消息投错
 * 地址而没有任何信号。
 *
 * 判据：grep `src/adapter/` 与 `extensions/`，不得出现：
 *   1. `to: "arch"` / `to: "dev"` / `to: "tester"` / `to: "human"`（字面量投递目标）
 *   2. `to-arch.json` 这类文件名（字面量路径）
 *
 * 注释也算（改名时 grep 不到注释里那个——plan.md M1 那条同样的教训）。
 */
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function grep(pattern: string, dirs: string[]): string {
  try {
    return execSync(`grep -rn "${pattern}" ${dirs.join(" ")}`, {
      cwd: ROOT,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return ""; // 无匹配 = grep 退出码 1，正好
  }
}

describe("A8 无字面量", () => {
  it('src/adapter 与 extensions 无 `to: "<role>"` 字面量', () => {
    const out = grep('to: "arch"\\|to: "dev"\\|to: "tester"\\|to: "human"', [
      "src/adapter",
      "extensions",
    ]);
    expect(out).toBe("");
  });

  it('src/adapter 与 extensions 无 `to-*.json` 文件名字面量', () => {
    const out = grep("to-arch\\.json\\|to-dev\\.json\\|to-tester\\.json\\|to-human\\.json", [
      "src/adapter",
      "extensions",
    ]);
    expect(out).toBe("");
  });

  it("配置文件里也不许（templates 除外——模板是给人抄的示例）", () => {
    // 包定义、launch 脚本、extensions 都不能有 to-*.json
    const out = grep("to-arch\\.json\\|to-dev\\.json\\|to-tester\\.json\\|to-human\\.json", [
      "launch",
    ]);
    expect(out).toBe("");
  });
});
