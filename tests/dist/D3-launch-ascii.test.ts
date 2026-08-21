/**
 * D3 launch 纯 ASCII：PowerShell 5.1 读 UTF-8 无 BOM 时按 GBK 解码，
 * 中文注释会破坏语法解析，报错还指向错误的行。所以 launch/* 全部纯 ASCII。
 *
 * 判据：文件里一个非 ASCII 字节都不能有（BOM 也算——UTF-8 BOM 是 EF BB BF）。
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const LAUNCH = join(process.cwd(), "launch");

describe("D3 launch 纯 ASCII", () => {
  it("launch/ 下所有文件（ps1 + bat）都是纯 ASCII", () => {
    const files = readdirSync(LAUNCH).filter((f) => f.endsWith(".ps1") || f.endsWith(".bat"));
    expect(files.length).toBeGreaterThanOrEqual(4);
    for (const f of files) {
      const buf = readFileSync(join(LAUNCH, f));
      for (let i = 0; i < buf.length; i++) {
        if (buf[i]! > 0x7f) {
          throw new Error(`${f} 第 ${i} 字节是 0x${buf[i]!.toString(16)}——非 ASCII（中文注释或 BOM）`);
        }
      }
    }
  });

  it("至少包含 trio.ps1 与三个 bat（结构完整）", () => {
    const files = readdirSync(LAUNCH);
    for (const f of ["trio.ps1", "arch.bat", "dev.bat", "tester.bat", "trio.bat"]) {
      expect(files, `缺 ${f}`).toContain(f);
    }
  });
});
