import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],

    // C1 要等轮询兜底真的触发（≥10s），默认 5s 不够。
    // 上限 20s 是有意的：plan.md M1 断言「整个 channel 套件 30 秒内自行退出」，
    // 单个用例卡满 20s 就已经说明 Stop 没关掉定时器。
    testTimeout: 20_000,
    hookTimeout: 20_000,

    // 每个用例在 mkdtemp 临时目录里跑，互不见面，可以并行。
    // 但同一文件内串行（vitest 默认），因为 C2/C3 依赖「重启」的时序。
    fileParallelism: true,
  },
});
