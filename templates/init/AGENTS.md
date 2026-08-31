# <项目名>

<一句话：这个项目是什么>

**本文件只指路，规则正文在各文件里。** 它被**三个窗口共读**（arch / dev / tester 都是 pi 进程），
所以这里只放对三个角色同为真的东西 —— 角色专属的一个字都不写，否则 dev 读到 tester 该看的，
上下文隔离就稀释了。角色行为在内置规约里（`/role` 打印），项目事实在 `wf.config.json` 的 `roleNotes`。

## 每次都读

- [`docs/disciplines.md`](docs/disciplines.md) — 纪律台账，动手前读。**拿到常驻机制的条目离开本读序**，被拦时以机制输出为准（判据原文会随拦截一起打印）；`node scripts/mech.mjs list` 看哪些已有机制

## 按需

- [`docs/plan.md`](docs/plan.md) — 当前里程碑的断言 = 验收标准
- [`docs/consensus.md`](docs/consensus.md) — 设计共识：为什么长这样。改设计前读

## 默认不读

- [`docs/decisions.md`](docs/decisions.md) — 归档，用途是三个月后有人问「为什么不用 X」。**不进每轮读序**

## 边界

- 断言只有人能改。你认为断言错了 → 往规划书「风险与未决」写清怎么改 + 升级给人
- gate 与 check 脚本、`mechanisms/*/criterion.md` 的**判据本体**（匹配规则 / 阈值 / 必填字段）变更要人批；reason 措辞与代码重构自主
- 新加纪律前先问：它有被观察到的失败模式吗？写得出「会红的真实输入」吗？写不出就只能是「规约」档（承认会被跳过）
- 提议删除文件可以，执行删除不行
