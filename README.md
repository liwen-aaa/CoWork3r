# work-flow

三窗口 AI 协作工作流（pi 扩展）：把「AI 谎报完成」堵在机制层。

三个隔离的窗口（ARCH / DEV / TESTER）+ 文件消息通道 + 装在 `tool_call` 上的拦截链。
两条支柱：**生产者不能宣布自己完成**（所以 dev 与 tester 是两个上下文）、
**纪律不进拦截链就不会被遵守**（所以 gate 是代码，不是提示词）。

## 状态：在建，不可用

进度看 [`docs/progress.md`](docs/progress.md)（生成物，`npm run docs:progress`）。
本文不再手写里程碑表——它曾同时存在于三处并全部过时，那是 D-04 + D-02 的合并症状。

八份架构文档已完整（`docs/modules/`），代码从 M1 开始逐层落地。
M6 之前无法接入任何项目。

## 当前等你拍板的事（决策者入口）

> 六里程碑中 M1–M5 已验收，M6 在建（`docs/progress.md`，生成物）。
> 下面每件事都有**权威落点**——判定写在落点文件里，本表不重复内容（D-04），只指路。

| 事 | 现在是什么状态 | 你要做什么 | 落点（判定写这里） |
|---|---|---|---|
| ① M5 验收判定 | tester 三修复轮已完成，凭证待签 | 读 `M5-wording.md`（20 条实跑拦截文案），签 PASS/FAIL | [`docs/verification/M5.md`](docs/verification/M5.md) |
| ② M6 修复轮判定 | tester 验出 3 个真 bug 已修（schema artifact / 自检未接线 / 单 type 投递） | 读 `M6-fixes.md` 的三修复记录，签 PASS/FAIL | [`docs/verification/M6-fixes.md`](docs/verification/M6-fixes.md) |
| ③ M6.5 判定 | dev 工具面无 arch 目标（真进程已验），凭证待签 | 复核凭证里的验证输出，签 PASS/FAIL | [`docs/verification/M6.md`](docs/verification/M6.md)（断言一） |
| ④ M6.6 真跑 | launch 就绪，步骤已含 FAIL→修（P5 判定） | 真开三窗口跑通一个里程碑，按 M6.md 步骤 10 步 | [`docs/verification/M6.md`](docs/verification/M6.md)（断言二） |
| ⑤ 未决 P3/P5/P7 | arch 已给倾向（P5=含 FAIL→修、P7=不进读序、P3=不加脚本），条目已从未决表删除 | 确认或驳回 arch 的判定；P5 已体现在 M6.md 步骤里 | `docs/plan.md` 的「提交纪律」节与「不做」节 |
| ⑥ 注入自检断言缺口 | 实现已接线（agent_start 自检 + A9b 测试），但 plan.md 断言表没钉住它 | 三选一：①补 [auto] 断言 ②接受缺口删 R5 注释 ③挪后续 | `docs/plan.md` 风险节「注入自检未接通」条 |
| ⑦ schema↔gates 一致性缺口 | 通道已通（artifact 已加），但无自动化测试防回退 | 二选一：补测试（派 dev）/ 接受为已知风险 | `docs/plan.md` 风险节「schema↔gates 一致性测试缺口」条 |

**完成 ①–④ 后**：M6 打 ✅，`npm run docs:progress` 重生进度表，六里程碑全验收。
**⑤–⑦ 是收尾决策**，不阻塞 M6 验收，但拖久了会丢失上下文（判定只活在对话里）。

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
