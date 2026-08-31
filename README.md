# work-flow

> 三窗口 AI 协作工作流（pi 扩展）：把「AI 谎报完成」堵在机制层。

状态：**六里程碑全部验收**（2026-08-23）｜ 平台：Windows / Linux / macOS ｜ 运行时：Node ≥ 22.19 ｜ 依赖 [pi](https://github.com/earendil-works/pi)

用人话告诉 ARCH 你想做什么，它拆成里程碑，DEV 写代码、TESTER 按断言逐条验收、你确认放行，循环推进。窗口收到消息自动唤醒，随时可介入，**未经验证和人工确认，任何东西都不算完成**。

本文是**使用流程**。设计意图见 [`docs/consensus.md`](docs/consensus.md)，判据台账见 [`docs/disciplines.md`](docs/disciplines.md)。

---

## 使用流程

四个阶段，**顺序不能换**。跳过阶段 0/1 直接开三窗口，得到的是三个报配置错的窗口 —— 三窗口的前提是已经有断言。

```
阶段 0  装 + 铺骨架         你有一个想法，项目里只有这套流程
阶段 1  单窗口澄清           想法 → 目标三句 + M0 断言 + 逐条签字
阶段 2  M0 自举             建测试基建，收尾时 test: null → 真命令
阶段 3  三窗口循环           ARCH 分发 → DEV 实现 → TESTER 验收 → 你放行
阶段 4  收尾与下一轮         文档收缩、凭证落盘、进度表重生
```

### 阶段 0：装 + 铺骨架

在你的目标项目里：

```bash
npm install <本仓库绝对路径>          # 或 pi install -l <本仓库绝对路径>
node node_modules/work-flow/scripts/init.mjs   # 在本仓库里开发时：npm run init
```

`init` 铺的东西（已存在的文件一律跳过，重跑安全）：

| 文件 | 状态 | 为什么是这个状态 |
|---|---|---|
| `AGENTS.md` | 十来行，只指路 | **三个窗口共读**，所以只放对三角色同为真的东西。角色专属的一个字都不写，否则 dev 读到 tester 该看的，上下文隔离就稀释了 |
| `wf.config.json` | `test: null` | day 0 填不出测试命令，而缺字段是 fatal。`null` = **显式声明**「暂时无法自动测」，不是静默降级 |
| `docs/plan.md` | 目标节 + 一个 M0 | 最小合法形态 = 一个里程碑 + 一条断言 |
| `docs/disciplines.md` | **只有两条** | 见下 |
| `docs/consensus.md` | 空 | 第一条共识来自第一次真实的设计争论。没争论过的「共识」是一个人的偏好 |
| `docs/decisions.md` | 空 | 只在实现之后写。可能整个项目一行都没有，那不是缺失 |
| `mech.json` | 装了语言无关的机制包 | 见「把纪律带进新项目」 |

**为什么纪律表只有两条。** 拷四十条判据过来，每条的落点都会退回「规约」= 接受它会被跳过 —— 那是一份很有说服力而全部不生效的文档。day 0 只有 D-01（生产者不能宣布自己完成）与 D-02（纪律不进拦截链就不会被遵守）有资格进表：装了工作流它们就有落点，不需要本项目先出事故。**第三条等第一次真实事故。** 三份空表不是占位符，是生长位置已经定好。

### 阶段 1：单窗口澄清（先不要开三窗口）

```bash
pi        # 然后说「用 plan skill 帮我澄清这个项目」
```

产出 `docs/plan.md` 的三样东西，缺一样就还没到开工：

- **目标三句**：要什么 / 成功 = 什么 / 不做什么。这三句 day 0 就写得出来，不需要任何技术决策。写不出「成功 = 什么」说明还得继续聊。
- **M0 断言**：`[auto]` 带得出命令或路径（写不出命令说明它其实是 `[human]`），`[human]` 是你自己的原话。
- **逐条签字**：一条条念给你「这条做到了你认不认」。整份「你看一下」不算签字。

退出条件：**想直接动手写代码了 = 该交棒了。**

技术栈与测试基建在这一步定。执刀权按领域流动 —— 陌生领域 agent 执刀、你持有目的 + 用断言评审；熟悉领域你执刀、agent 当陪练。无论谁执刀，**验收标准永远在你手里**（详见 [`src/roles/human.md`](src/roles/human.md)）。

### 阶段 2：M0 自举

M0 是自举里程碑：它的产出物之一就是「以后怎么验收」这件事本身。TESTER 要跑 `cfg.test` 才能报 PASS，而那条命令正是 M0 的产物。所以 M0 期间：

- `test` 保持 `null`，PASS 只靠结构检查 + 人工关卡（启动状态条会常驻一行提醒）；
- 断言只能走路径存在性 `[auto]` 与 `[human]`；
- **收尾动作 = 把 `test` 从 `null` 改成真命令。** 从那一刻起 gate 才有牙。

### 阶段 3：三窗口循环

```powershell
launch\trio.ps1 -Root <项目根目录>     # Windows（Windows Terminal 三格布局），或双击 launch/trio.bat
./launch/trio.sh <项目根目录>          # Linux / WSL / macOS（需 tmux）
```

手动开也行：`WF_ROLE=arch|dev|tester pi` 各一个终端。

对 ARCH 窗口用人话说你要做什么，然后：

```
ARCH ──分发──▶ DEV ──产出──▶ TESTER ──验收──▶ 你（确认/放行）
  ▲                                                        │
  └───────────────── 下一里程碑 ◀──────────────────────────┘
```

**你只做三件事：**

| 动作 | 怎么做 |
|---|---|
| **看** | 状态条常驻四行（里程碑 / 轮次 / 待你判定 / 未决）。等你判定的事逐条记在 `wf/human-pending.md`，你不需要记任何状态 |
| **说** | 只对 ARCH 窗口说人话，它翻译成确定格式。也可以直接打断任何窗口 —— 那会被自动留痕 |
| **确认** | 只有放行时需要。ARCH 把凭证（你的原话 + 它的整理）贴给你看，你说「确认」或「不对」。**放行是单向门，发错了整个里程碑白做，所以只有它需要你点一次头** |

放行有两道机器判据，都不是 ARCH 能自证的：① TESTER 报过 `verdict_pass`（证明人真的被问到了，这个标记 ARCH 写不到）② 凭证三段齐全。你说「不行」重走一轮后旧许可自动作废。

常用命令：`/status` 四行状态 ｜ `/doctor` 配置与规划书自查 ｜ `/role` 打印当前规约 ｜ `/research` 未决表 `[auto]` 条目派查。

### 阶段 4：收尾与下一轮

你确认放行后，ARCH 执行收尾：文档收缩（架构文档拆进代码文件头与测试名）、标已验收、重生进度表、凭证落盘。然后你说下一个里程碑。

---

## 把纪律带进新项目（机制包）

**可移植的单元不是纪律的文字，是「判据原文 + 会红的机制」这一对。** 判据单独走就退回「规约」档；机制随代码走才带得动执行力。

```bash
node scripts/mech.mjs list                 # 有哪些包、装了哪些
node scripts/mech.mjs run                  # 在本项目上跑（mech.json 的 install）
node scripts/mech.mjs install <id> --wire  # 准入闸 → 记 mech.json → 串进 pretest
```

**准入闸**：`install` 先拿包自带的 fixture 真跑一遍 —— 红例必须红、绿例必须绿，两头都卡住才让装。

- 红例红不了 → 恒绿的机制 = 哑弹，你以为有防线而它什么都拦不住；
- 绿例红了 → 恒红的机制会被 skip，接着整条检查链都没人看。

这是「写不出会红的真实输入 = 它是投影不是判据」搬到装机时刻执行。写不出的经验本来就该留在散文里被跳过，装上去只是让人以为有防线。

**判据按需到达**：机制被拦时，`criterion.md` 的判据原文随 reason 一起打印。所以有机制的条目**离开每轮读序** —— 读序付费（每轮 token），机制免费（一次性接线）。agent 第一次知道某条纪律存在，就是被拦的那一刻。

现有三个包（详见 [`mechanisms/README.md`](mechanisms/README.md)）：

| id | 判据 | 适用 |
|---|---|---|
| `append-only-ledger` | 台账条目只增不改，编号严格递增 | 任何语言 |
| `claimed-landing` | 标了「已物化 ✅」的落点必须真存在 | 任何语言 |
| `wired-check` | 台账声称的 `npm run x` 必须存在且已接线 | Node（判据通用，换生态只重写 `check.mjs`） |

前两个是 day 0 缺省装机集。装不了的会**显式说出来**，不静默缺失。

**新包的唯一合法来源是下游项目的真实事故** —— 哪个项目撞出一个能写红场景的新形状，它才有资格发回上游。按预判增长的包数就是机制膨胀本身。

**判据持有权（反向坑）**：判据从上游包来，意味着升级会静默换掉判据，而人从没被问过。所以包按 ref 钉住，升级时把 `criterion.md` 的 diff 摆给人批。项目侧参数（`mech.json` 的 `options`）人可以改，判据本体不由项目改。

---

## 它凭什么拦得住

- **完成声明被机制拦截**：生产者不能宣布自己完成 —— DEV 的产出必须由 TESTER 独立验收（两个隔离上下文，互不可见），判据是**人签字过的断言**。
- **拦截链装在 `tool_call`**：行为发生时拦，当场收 reason 改，而不是事后检查产物。提示词级的要求会被跳过，所以纪律必须是代码。
- **判据变更要人批**：gate 判据（匹配规则/阈值/必填字段）的修改是体系结构变更，必须升级给人 —— 评分函数不能改自己的尺子。
- **哑弹审计**：`npm run check:wiring` 抓「有实现、有测试、有文档、零调用点」的死机制 —— 它伪装成防线，比没有防线更危险。
- **生成物自动重生**：协议文档、进度表由脚本从代码/规划书生成，杜绝手写第二份权威。

## 目录结构

| 路径 | 是什么 |
|---|---|
| `src/` | 实现。七层依赖单向，`pi` 只出现在最外层且只作类型 |
| `extensions/` | 三个窗口的 pi 扩展入口（按 `WF_ROLE` 激活） |
| `launch/` | 三窗口启动脚本（Windows: ps1/bat；Unix: trio.sh/tmux） |
| `mechanisms/` | 机制包：判据 + 会红的 fixture + 检查脚本 |
| `templates/` | 规划书与配置模板；`templates/init/` 是 day 0 骨架 |
| `tests/` | 测试。**文件名 = 约束编号**，`ls tests/channel/` 就是 M1 的验收清单 |
| `docs/` | 纪律、共识、决策、验收记录、协议 |

## 文档导航

| 你想 | 读 |
|---|---|
| 了解设计意图（为什么长这样） | [`docs/consensus.md`](docs/consensus.md) → [`docs/decisions.md`](docs/decisions.md) |
| 知道自己该做什么 | [`src/roles/human.md`](src/roles/human.md)（人的操作说明） |
| 理解架构分层 | [`docs/modules/README.md`](docs/modules/README.md) 依赖图 |
| 写规划书 | [`templates/plan.md`](templates/plan.md)（可运行示例）+ [`skills/plan/SKILL.md`](skills/plan/SKILL.md) |
| 动手改代码 | [`AGENTS.md`](AGENTS.md)（读序）+ [`docs/disciplines.md`](docs/disciplines.md)（判据） |
| 看真实失败记录 | [`docs/verification/`](docs/verification/) —— M6.6 判 FAIL：344 用例全绿而完成路径从未接线 |

## 开发

```bash
npm i
npm test                # vitest；pretest 先跑纪律检查 + 机制包（selftest + run）
npm run typecheck
npm run check:mech-selftest   # 机制包准入闸（红例必须红、绿例必须绿）
npm run docs:progress   # 重生进度表
npm run docs:protocol   # 重生协议文档
```

## 已知缺口

`npm test` 当前红两条，都需要人裁决（判据本体变更与断言变更不由 agent 自主改）：

1. **~~`check:disciplines` 报 D-44 被删。~~（已解决）** 例外名单按 commit hash 登记（`ALLOWED_DELETIONS`），而公开前的历史改写（`855e6aa` 一线）换掉了全部 hash，`42bd0e7` 已不存在，实际那次删除现在的 hash 是 `60b9646`。已按第一条路（更新 hash）处理。**残留：这是治标——「按 hash 登记例外」这个形态扛不住下一次 rebase，改成按内容登记属判据本体变更，仍需人批（D-51）。** 教训已写成 D-55：判「不可修复」之前必须先用 `git cat-file -e` 证伪例外登记。
2. **~~`D3-launch-ascii` 报 `launch/` 非纯 ASCII。~~（已解决）** 报错的是 `trio.ps1` 自己——注释里残留一个中文词（`work-flow-paper 留档仓库的 launch 脚本`），已改为英文。断言与过滤器本来就只扫 `.ps1`/`.bat`，`trio.sh` 从未在范围内：**断言是对的，文件才是错的**，所以修文件而不是收窄断言。

## 背景

本项目是前身 `work-flow` 的**重组**而非重写：事故换来的实现逐字照抄，自证机制大幅削减。前身的问题：自检代码 1995 行超过运行时 1898 行、文档与实现不符、无版本控制。哪些照抄、哪些只抄判据、哪些别碰，见 [`docs/inherited/reuse.md`](docs/inherited/reuse.md)。

## 贡献

新机制接入前请自查：

1. 它保护用户能力，还是保护仓库自证？
2. 它的判据能否写出「会红的真实输入」？
3. 它有没有生产调用点，还是又一个哑弹？

三条都过且机制与语言无关 → 考虑做成机制包（`mechanisms/README.md`）。

## 许可证

[GNU Affero General Public License v3.0](LICENSE)。使用本项目代码/衍生作品的网络服务，须以相同许可证开源其源码（AGPL-3.0 §13）。
