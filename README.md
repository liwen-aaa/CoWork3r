# work-flow

> 三窗口 AI 协作工作流(pi 扩展):把「AI 谎报完成」堵在机制层。

状态:**六里程碑全部验收**(2026-08-23)｜ 平台:Windows + [pi](https://github.com/earendil-works/pi) ｜ 运行时:Node ≥ 22.19

用人话告诉 ARCH 你想做什么,它拆成里程碑,DEV 写代码、TESTER 按断言逐条验收、你确认放行,循环推进。窗口收到消息自动唤醒,随时可介入,**未经验证和人工确认,任何东西都不算完成**。

---

## 它能做什么

- **三窗口协作**:ARCH(规划与分发)/ DEV(实现)/ TESTER(验收)三个隔离的 pi 窗口,经磁盘文件通道通信,互不可见对方上下文。
- **完成声明被机制拦截**:生产者不能宣布自己完成——DEV 的产出必须由 TESTER 独立验收,且验收判据是**人签字过的断言**。
- **验收走断言表**:每个里程碑带 `[auto]`(命令/路径,可机器验证)与 `[human]`(人确认)两类断言,TESTER 逐条验证,全部通过才放行。
- **判据变更要人批**:gate 判据(匹配规则/阈值/必填字段)的修改是体系结构变更,必须升级给人审批——评分函数不能改自己的尺子。
- **窗口自动唤醒**:消息落盘即触发目标窗口,无需人手动踢;重启不丢消息,并发不乱。
- **随时介入**:三个真窗口给人看和介入,干预自动留痕;你只做三件事——看进度、说需求、确认放行。
- **生成物自动重生**:协议文档、进度表由脚本从代码/规划书生成,杜绝手写第二份权威。
- **哑弹审计**:接线检查(`npm run check:wiring`)抓「有实现、有测试、有文档、零调用点」的死机制——它伪装成防线,比没有防线更危险。

## 工作原理(30 秒版)

```
ARCH ──分发──▶ DEV ──产出──▶ TESTER ──验收──▶ 你(确认/放行)
  ▲                                                        │
  └───────────────── 下一里程碑 ◀──────────────────────────┘
```

- 三个独立 pi 进程 + 磁盘文件消息通道(单槽位锁,禁止覆盖)。
- 拦截链装在 `tool_call` 上:行为发生时拦截,当场收 reason 改,而不是事后检查产物。
- 两条支柱:**生产者不能宣布自己完成**(DEV 与 TESTER 是两个隔离上下文)、**纪律不进拦截链就不会被遵守**(gate 是代码,不是提示词)。

设计为什么长这样、被否决的替代方案,见 [`docs/consensus.md`](docs/consensus.md) 与 [`docs/decisions.md`](docs/decisions.md)。

## 快速开始

前置条件:Node ≥ 22.19、已安装 [pi](https://github.com/earendil-works/pi)、Windows Terminal(可选,用于三窗口布局)。

**1. 安装扩展**(在你的目标项目里):

```bash
npm install <本仓库绝对路径>     # 或 pi install -l <本仓库绝对路径>
```

**2. 写规划书与配置**(拷模板改):

```bash
cp templates/plan.minimal.md docs/plan.md
cp templates/wf.config.json wf.config.json   # 改 test/gate 为你的项目命令
```

规划书语法见 [`templates/plan.md`](templates/plan.md)(可运行示例)。

**3. 打开三窗口:**

```powershell
launch\trio.ps1 -Root <项目根目录>    # 或双击 launch/trio.bat
```

对 ARCH 窗口用人话说你要做什么,系统开始自动流转:ARCH 拆里程碑 → DEV 实现 → TESTER 验收 → 你确认 → 下一轮。

> 平台说明:当前 `launch/` 脚本面向 Windows(ps1/bat);扩展本身与平台无关,可在任意支持 pi 的环境手动按 `WF_ROLE=arch|dev|tester` 启动三个窗口。

## 目录结构

| 路径 | 是什么 |
|---|---|
| `src/` | 实现。七层依赖单向,`pi` 只出现在最外层且只作参数传入 |
| `extensions/` | 三个窗口的 pi 扩展入口(按 `WF_ROLE` 激活) |
| `launch/` | 三窗口启动脚本(Windows) |
| `tests/` | 测试。**文件名 = 约束编号**,`ls tests/channel/` 就是 M1 的验收清单 |
| `templates/` | 规划书与配置模板(断言语法的可运行示例) |
| `docs/` | 文档:纪律、共识、决策、验收记录、协议(见下) |

## 文档导航

| 你想 | 读 |
|---|---|
| 了解设计意图(为什么长这样) | [`docs/consensus.md`](docs/consensus.md) → [`docs/decisions.md`](docs/decisions.md) |
| 理解架构分层 | [`docs/modules/README.md`](docs/modules/README.md) 依赖图 |
| 协议与消息通道 | [`docs/protocol.md`](docs/protocol.md)(生成物) |
| 里程碑状态 | [`docs/progress.md`](docs/progress.md)(生成物) |
| 动手改代码 | [`AGENTS.md`](AGENTS.md)(读序)+ [`docs/disciplines.md`](docs/disciplines.md)(判据) |
| 看真实失败记录 | [`docs/verification/`](docs/verification/) —— M6.6 判 FAIL:344 用例全绿而完成路径从未接线 |

## 开发

```bash
npm i
npm test              # vitest;pretest 先跑 6 个纪律检查(D-41/D-47/D-49/D-52 等)
npm run typecheck     # tsc --noEmit
npm run docs:progress # 重生进度表
npm run docs:protocol # 重生协议文档
```

## 背景

本项目是前身 `work-flow` 的**重组**而非重写:事故换来的实现逐字照抄,自证机制大幅削减。
前身的问题:自检代码 1995 行超过运行时 1898 行、文档与实现不符、无版本控制。
哪些照抄、哪些只抄判据、哪些别碰,见 [`docs/inherited/reuse.md`](docs/inherited/reuse.md)。

## 贡献

项目按「判据 + 落点」纪律运行(见 `docs/disciplines.md`)。新机制接入前请自查:

1. 它保护用户能力,还是保护仓库自证?(D-40)
2. 它的判据能否写出「会红的真实输入」?(T14 红场景标准)
3. 它有没有生产调用点,还是又一个哑弹?(D-49)

## 许可证

[GNU Affero General Public License v3.0](LICENSE)。

使用本项目代码/衍生作品的网络服务,须以相同许可证开源其源码(AGPL-3.0 §13)。
