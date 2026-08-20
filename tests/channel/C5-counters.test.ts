/**
 * C5 跨轮计数必须落盘
 *
 * 「同一问题连续出现 3 轮 → 升级」依赖跨轮累计。
 * 窗口重启是常态不是异常，计数在内存里就等于阈值永远达不到。
 *
 * 老仓库的 `bumpIssueCounts` 逻辑本身平凡，但「必须落盘」这件事是重启丢计数换来的。
 */
import { describe, expect, it } from "vitest";

import { bumpCounters } from "../../src/channel";
import { makeRoot } from "./_fixture";

describe("C5 跨轮计数", () => {
  it("跨「重启」累计到阈值", () => {
    const { root, cleanup } = makeRoot("C5-count");
    try {
      // 每次 bumpCounters 调用都从磁盘读、写回磁盘——没有进程内缓存，
      // 所以三次独立调用等价于三个窗口生命周期
      expect(bumpCounters(root, "dev", ["M1-002"], 3)).toEqual([]);
      expect(bumpCounters(root, "dev", ["M1-002"], 3)).toEqual([]);
      expect(bumpCounters(root, "dev", ["M1-002"], 3)).toEqual(["M1-002"]);
    } finally {
      cleanup();
    }
  });

  it("不同角色的计数互不干扰", () => {
    const { root, cleanup } = makeRoot("C5-role");
    try {
      bumpCounters(root, "dev", ["X-1"], 2);
      bumpCounters(root, "dev", ["X-1"], 2);
      // tester 从零开始——counters-<role>.json 按角色分文件
      expect(bumpCounters(root, "tester", ["X-1"], 2)).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("多个 id 一次累加，只返回达到阈值的", () => {
    const { root, cleanup } = makeRoot("C5-multi");
    try {
      bumpCounters(root, "dev", ["A", "B"], 2);
      expect(bumpCounters(root, "dev", ["A"], 2)).toEqual(["A"]);
    } finally {
      cleanup();
    }
  });
});
