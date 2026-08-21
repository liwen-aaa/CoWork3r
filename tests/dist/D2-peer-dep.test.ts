/**
 * D2 peerDependencies：typebox 在 peerDependencies 且不在 dependencies
 *
 * pi 文档列了五个 bundled core package（pi-ai / pi-agent-core / pi-coding-agent /
 * pi-tui / typebox），明确要求 `peerDependencies: "*"` 且不要 bundle、不要让人装。
 *
 * 老仓库让每个接入项目 `npm i typebox`，装晚了扩展就被静默丢弃，唯一症状是
 * 调工具时报 "Tool send_task not found"。按文档做，这个故障类别整个消失。
 *
 * 判据：typebox 在 peerDependencies，且不在 dependencies（也不在 devDependencies
 * ——本仓库自己测扩展时用的是 pi-coding-agent 自带的，不另装）。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function manifest(): {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
} {
  return JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
}

describe("D2 typebox 走 peerDependencies", () => {
  it("typebox 在 peerDependencies 且版本为 *（pi 自带，不钉版本）", () => {
    expect(manifest().peerDependencies?.typebox).toBeDefined();
    expect(manifest().peerDependencies?.typebox).toBe("*");
  });

  it("typebox 不在 dependencies（不让接入项目装）", () => {
    expect(manifest().dependencies?.typebox).toBeUndefined();
  });

  it("typebox 不在 devDependencies（本仓库不另装——pi 自带）", () => {
    expect(manifest().devDependencies?.typebox).toBeUndefined();
  });
});
