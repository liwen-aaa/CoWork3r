# 进度（生成物，勿手改）

> 由 `npm run docs:progress` 生成。**权威是 [`plan.md`](plan.md) 的里程碑标题**（`✅` 标记）
> + `docs/modules/` 剩余份数 + vitest 实测计数。
>
> 进度曾同时手写在 README、modules 散文、modules 表三处，全部过时且互不一致——
> 那是 D-04 + D-02 的合并症状。手写数字同理：三处写过 19 / 23 / 78，没一处对得上实测。

| 里程碑 | 内容 | 断言 | 用例 | 状态 |
|---|---|---|---|---|

已验收 0/0 个里程碑。

## 文档收缩（D-06）

八份模块文档已拆 **4** 份，剩 **4** 份：

- `docs/modules/04-plan.md`
- `docs/modules/05-gates.md`
- `docs/modules/07-adapter.md`
- `docs/modules/08-dist.md`

代码已落地而文档未收缩 = 两份权威。一个里程碑的第三个 commit 就是拆它对应的那份。

## 常驻机制

离开每轮读序的纪律条目（D-48），它们由 `npm test` 的 pretest 自动跑：

| 条目 | 机制 |
|---|---|
| D-41 自检不得超过运行时 | `npm run check:testsize` |
| D-47 只增不改有机制 | `npm run check:disciplines` |

