# work-flow

三窗口 AI 协作工作流（pi 扩展）：把「AI 谎报完成」堵在机制层。

三个隔离的窗口（ARCH / DEV / TESTER）+ 文件消息通道 + 装在 `tool_call` 上的拦截链。
两条支柱：**生产者不能宣布自己完成**（所以 dev 与 tester 是两个上下文）、
**纪律不进拦截链就不会被遵守**（所以 gate 是代码，不是提示词）。

## 状态：在建，不可用

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M1 | 通道层（消息落盘、唤醒、状态持久化） | ✅ 六条断言全齐（23 用例绿 + [人工凭证](docs/verification/M1.md)） |
| M2 | 消息协议（路由表驱动） | 未开始 |
| M3 | 配置与角色规约 | 未开始 |
| M4 | 规划书解析（断言语法） | 未开始 |
| M5 | 拦截链（五道 gate） | 未开始 |
| M6 | 三窗口跑通 + 可接入 | 未开始 |

八份架构文档已完整（`docs/modules/`），代码从 M1 开始逐层落地。
M6 之前无法接入任何项目。

## 现在能跑什么

```bash
npm i
npm test            # vitest，当前 10 文件 19 用例
npm run typecheck   # tsc --noEmit
```

## 目录

| 路径 | 是什么 |
|---|---|
| `src/` | 实现。七层依赖单向，`pi` 只出现在最外层且只作参数传入 |
| `tests/` | 测试。**文件名 = 约束编号**，所以 `ls tests/channel/` 就是 M1 的验收清单 |
| `docs/modules/` | 架构：一模块一份。代码落地后逐份收缩（见 `disciplines.md` D-06） |
| `docs/disciplines.md` | 32 条纪律，每条带判据与落点。落点写「规约」= 明确承认它会被跳过 |
| `docs/plan.md` | 本项目规划书。断言即验收标准 |
| `docs/inherited/` | 前身项目的交接与复用清单（`前身仓库 work-flow`，已留档） |
| `templates/` | 规划书骨架 = 断言语法的可运行示例 |

## 从哪里开始读

| 你是 | 读 |
|---|---|
| 想懂它为什么这么设计 | [`docs/modules/README.md`](docs/modules/README.md) 的依赖图，然后挑一层看 |
| 要动代码 | [`AGENTS.md`](AGENTS.md)（读序）+ [`docs/disciplines.md`](docs/disciplines.md)（动手前查相关条目） |
| 想知道前身踩过什么坑 | [`docs/inherited/reuse.md`](docs/inherited/reuse.md)——哪些照抄、哪些只抄判据、哪些别碰 |

## 与前身的关系

前身在 `前身仓库 work-flow`（已留档，不再维护）。它能跑，但自检代码 1995 行超过运行时 1898 行，
文档描述的架构与实现不符，且无版本控制。

本仓库不是重写而是**重组**：事故换来的实现逐字照抄（通道层的轮询兜底、条件清空、原子写），
自证机制大幅削减（六份契约、版本归档、合规检查器、约定台账全部取消）。
判据见 `docs/inherited/reuse.md`。
