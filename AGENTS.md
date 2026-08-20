# work-flow-remake

三窗口协作工作流。**本文件只指路，规则正文在各文件里**（D-04）。

## 每次都读

- [`docs/disciplines.md`](docs/disciplines.md) — 纪律台账，动手前读

## 按需

- [`docs/modules/README.md`](docs/modules/README.md) — 依赖图 + 当前进度
- `docs/modules/NN-*.md` — **只读你在改的那一个**（模块完工即拆，索引见上）
- [`docs/plan.md`](docs/plan.md) — 当前里程碑的断言 = 验收标准
- [`docs/inherited/reuse.md`](docs/inherited/reuse.md) — 写实现前查：这段能不能照抄老仓库

## 默认不读

- [`docs/inherited/HANDOFF.md`](docs/inherited/HANDOFF.md)、[`docs/inherited/old-README.md`](docs/inherited/old-README.md) — 老仓库备查，描述已废弃形态

## 边界

- `src/` 里 pi 只能 `import type` — D-07，A9 会 grep
- 模块完工要拆掉对应的 `NN-*.md` — D-06
- 每里程碑三个 commit：测试红 → 实现绿 → 文档收缩
