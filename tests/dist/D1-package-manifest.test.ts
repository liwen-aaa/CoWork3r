/**
 * D1 包清单：package.json 的 pi.extensions 指向真实存在的三个入口文件
 *
 * 08-dist 的形状是「包定义 + 三项配置 + 一个启动脚本」。pi 靠 `pi.extensions`
 * 发现扩展——指向的文件不存在，扩展被静默丢弃，唯一症状是调工具时报
 * "Tool send_task not found"（老仓库 L1 那次事故的根因是打包方式错了）。
 *
 * 判据：pi.extensions 数组里的每个条目都存在且是文件。
 * extensions/ 目录本身也在（pi 按目录发现）。
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function manifest(): { pi?: { extensions?: string[] }; keywords?: string[] } {
  return JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")) as {
    pi?: { extensions?: string[] };
    keywords?: string[];
  };
}

describe("D1 包清单", () => {
  it("package.json 声明了 pi.extensions", () => {
    expect(manifest().pi?.extensions?.length).toBeGreaterThan(0);
  });

  it("pi.extensions 指向的路径真实存在", () => {
    for (const p of manifest().pi?.extensions ?? []) {
      const full = join(ROOT, p);
      expect(existsSync(full), `pi.extensions 条目 ${p} 不存在`).toBe(true);
      const st = statSync(full);
      // 目录或文件都行（pi 两者都支持），但必须真的在
      expect(st.isDirectory() || st.isFile()).toBe(true);
    }
  });

  it("extensions/ 下有三个角色入口", () => {
    const dir = join(ROOT, "extensions");
    expect(existsSync(dir)).toBe(true);
    for (const f of ["arch.ts", "dev.ts", "tester.ts"]) {
      expect(existsSync(join(dir, f)), `缺 extensions/${f}`).toBe(true);
    }
  });

  it("keywords 含 pi-package（可被发现）", () => {
    expect(manifest().keywords?.includes("pi-package")).toBe(true);
  });
});
