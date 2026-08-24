# work-flow

三窗口 AI 协作工作流（pi 扩展）：把「AI 谎报完成」堵在机制层。

三个隔离的窗口（ARCH / DEV / TESTER）+ 文件消息通道 + 装在 `tool_call` 上的拦截链。
两条支柱：**生产者不能宣布自己完成**（所以 dev 与 tester 是两个上下文）、
**纪律不进拦截链就不会被遵守**（所以 gate 是代码，不是提示词）。

## 状态：六里程碑全部验收

进度看 [`docs/progress.md`](docs/progress.md)（生成物，`npm run docs:progress`）。
本文不再手写里程碑表——它曾同时存在于三处并全部过时，那是 D-04 + D-02 的合并症状。

八份架构文档已完整（`docs/modules/`）且代码全部落地，M1–M6 已验收（2026-08-23）。
接入与分发：`pi install -l <本仓库绝对路径>` + `launch/trio.ps1` 三窗口（见 `docs/plan.md` M6）。

## 当前等你拍板的事（决策者入口）

> 六里程碑**全部验收**（2026-08-23）：M6 已验收，里程碑阶段结束。
> 后续 = 在真实项目里接入并跑里程碑（`pi install -l` + `launch/trio.ps1`）。
> 详情看 [`docs/progress.md`](docs/progress.md)（生成物）——本文不再手写里程碑表。

## 现在能跑什么

```bash
npm i
npm test              # vitest；pretest 会先跑 D-41 / D-47 两个纪律检查
npm run typecheck     # tsc --noEmit
npm run docs:progress # 重生进度表
npm run docs:protocol # 重生协议文档
```

## 目录

| 路径 | 是什么 |
|---|---|
| `src/` | 实现。七层依赖单向，`pi` 只出现在最外层且只作参数传入 |
| `tests/` | 测试。**文件名 = 约束编号**，所以 `ls tests/channel/` 就是 M1 的验收清单 |
| `docs/modules/` | 架构：一模块一份。代码落地后逐份收缩（见 `disciplines.md` D-06） |
| `docs/disciplines.md` | 纪律台账，每条带判据与落点。落点写「规约」= 明确承认它会被跳过 |
| `docs/progress.md` | **生成物**（`npm run docs:progress`）：里程碑状态、实测用例数、D-06 收缩进度。勿手改 |
| `docs/plan.md` | 本项目规划书。断言即验收标准 |
| `docs/protocol.md` | **生成物**（`npm run docs:protocol`）：通道表、流转图、各角色可发的 type。勿手改 |
| `docs/decisions.md` | 决策记录，追加式。准入门槛见 `disciplines.md` D-13 —— 够格才写 |
| `docs/inherited/` | 前身项目的交接与复用清单（`前身仓库 work-flow`，已留档） |
| `templates/` | 规划书骨架 = 断言语法的可运行示例 |

## 从哪里开始读

| 你是 | 读 |
|---|---|
| 要验收里程碑 / 拍未决判定 | 本文「当前等你拍板的事」表，逐项落点 |
| 想懂它为什么这么设计 | [`docs/modules/README.md`](docs/modules/README.md) 的依赖图，然后挑一层看 |
| 要动代码 | [`AGENTS.md`](AGENTS.md)（读序）+ [`docs/disciplines.md`](docs/disciplines.md)（动手前查相关条目） |
| 想知道前身踩过什么坑 | [`docs/inherited/reuse.md`](docs/inherited/reuse.md)——哪些照抄、哪些只抄判据、哪些别碰 |

## 与前身的关系

前身在 `前身仓库 work-flow`（已留档，不再维护）。它能跑，但自检代码 1995 行超过运行时 1898 行，
文档描述的架构与实现不符，且无版本控制。

本仓库不是重写而是**重组**：事故换来的实现逐字照抄（通道层的轮询兜底、条件清空、原子写），
自证机制大幅削减（六份契约、版本归档、合规检查器、约定台账全部取消）。
判据见 `docs/inherited/reuse.md`。
