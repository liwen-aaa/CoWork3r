# 架构：模块清单

> **先读本文件**（`ls` 里它排在 01–08 之后，但它是这个目录的入口）。

> 一个模块一份 .md。写完的打 ✅，写作中的打 🚧，还没动的留空。**代码落地并拆完文档的打 🧹**。
> 每份的固定结构：职责一句话 / 为什么独立一层 / 目录 / 设计点 / 对外接口 / 不负责什么 / 已知取舍 / 验收。
>
> ⚠️ **这些文档是脚手架（D-06）**。模块代码落地后就要拆：职责与「不负责什么」进源码文件头，
> 设计点变测试名，取舍理由进 `decisions.md`，本文件只留下面那张依赖图。
> 代码已写而文档未收缩 = 两份权威（D-04）。
>
> 依赖方向严格单向，**下面的不能 import 上面的**（指**运行时依赖**：值、函数、副作用）。
> **类型**由拥有它的模块导出；其它层可 `import type` 取用，只要依赖图无环。
> 例：02-protocol 零依赖；01-channel 从它 `import type { Message, Role }`——无环，成立。
> 不要为此加 `shared/types.ts`：它会变成第二权威，分层去死。

```
07-adapter        唯一 import pi 的一层
   ├── 06-roles       角色规约（注入 system prompt）
   ├── 05-gates       纯函数判定 {ok, reason}
   ├── 04-plan        规划书解析（断言语法的唯一定义处）
   ├── 03-config      项目事实的唯一落点
   ├── 02-protocol    type × from × to 表
   └── 01-channel     只依赖 node:fs
08-dist           分发与接入（pi package / launch 脚本）
```

| # | 模块 | 状态 | 一句话 |
|---|---|---|---|
| 01 | channel | 🧹 | 消息写下 → 对方被唤醒读到，重启不丢、并发不乱。**文档已拆**：职责与边界 → [`src/channel/index.ts`](../../src/channel/index.ts) 文件头，磁盘布局 → `paths.ts`，单槽位取舍 → `inbox.ts`，C1–C8 设计点 → [`tests/channel/`](../../tests/channel/) 用例名与注释 |
| 02 | protocol | 🧹 | 谁能给谁发什么；路由/schema/文档都从一张表派生。**文档已拆**：为什么独立一层 / 一表四处派生 / 不负责什么 → [`src/protocol/index.ts`](../../src/protocol/index.ts) 文件头，与老仓库的四处差异 → `routes.ts`，两个函数为何分开 → `build.ts`，P1–P5 设计点 → [`tests/protocol/`](../../tests/protocol/) 用例名与注释，通道表与流转图 → [`docs/protocol.md`](../protocol.md)（生成物） |
| 03 | config | 🧹 | 项目事实的唯一落点；配错必须吵，不配可以静默。**文档已拆**：为什么独立一层 / 不负责什么 / 取舍 → [`src/config/index.ts`](../../src/config/index.ts) 文件头，字段语义与 legacy 名单 → `fields.ts`，诊断分级判据 → `inspect.ts`，可运行示例 → [`templates/wf.config.json`](../../templates/wf.config.json)，G1–G6 设计点 → [`tests/config/`](../../tests/config/) 用例名与注释 |
| 04 | plan | 🧹 | 规划书解析；`[auto]`/`[human]` 断言语法定义在这里。**文档已拆**：职责 / 为什么独立一层 / 不负责什么 → [`src/plan/index.ts`](../../src/plan/index.ts) 文件头，S1–S7 语法 → `grammar.ts`，三段式与报错带行号 → `parse.ts`，wayfinder 平替 → `frontier.ts`，数据结构 → `types.ts`，L1–L9 设计点 → [`tests/plan/`](../../tests/plan/) 用例名与注释，可运行示例 → [`templates/plan.md`](../../templates/plan.md) |
| 05 | gates | 🧹 | 纯函数判定：断言可测、产出结构、快照、真跑命令、人的问题。**文档已拆**：职责 / 为什么独立一层 / 链是数据与顺序 / 不负责什么 → [`src/gates/index.ts`](../../src/gates/index.ts) 文件头，五道 gate 的判据与取舍 → `plan-ready.ts` / `artifact.ts` / `source-changed.ts` / `run-command.ts` / `human-questions.ts` 文件头，G1–G10 设计点 → [`tests/gates/`](../../tests/gates/) 用例名与注释，`buildCmd` 随 S 档位砍掉的取舍 → [`src/config/fields.ts`](../../src/config/fields.ts) |
| 06 | roles | 🧹 | 三份静态规约 + system prompt 注入 + 注入自检。**文档已拆**：为什么不用 pi skill / 三类内容切分 / 取舍 → [`src/roles/index.ts`](../../src/roles/index.ts) 文件头，加载与拼接与特征串 → `inject.ts`，规约本体 → `arch.md` `dev.md` `tester.md`，R1–R6 设计点 → [`tests/roles/`](../../tests/roles/) 用例名与注释 |
| 07 | adapter | 🧹 | 三个薄扩展：接线、确定性状态流转、/status。**文档已拆**：职责 / 为什么必须薄 / 不负责什么 → [`src/adapter/index.ts`](../../src/adapter/index.ts) 文件头，四个钩子与 send_task 工具 / root 从 ctx.cwd 来 → [`src/adapter/wire.ts`](../../src/adapter/wire.ts) 文件头，状态流转表 → `flow.ts`，/status 四行 → `status.ts`，A1–A9 + E1 设计点 → [`tests/adapter/`](../../tests/adapter/) 与 [`tests/e2e/`](../../tests/e2e/) 用例名与注释 |
| 08 | dist | 🧹 | 分发与接入：pi package、launch 脚本、澄清入口、research 命令。**文档已拆**：包定义与 typebox peerDep 取舍 → [`package.json`](../../package.json) + D1/D2，launch 脚本（老仓库照抄 + 三条废弃形态改掉）→ [`launch/`](../../launch/) + D3/D4，澄清入口 → [`skills/plan/SKILL.md`](../../skills/plan/SKILL.md) + D5，research 状态机 → [`src/dist/research.ts`](../../src/dist/research.ts) + D7，接入路径验收 → D6，命令注册 → [`src/adapter/commands.ts`](../../src/adapter/commands.ts) |

## 下一步

架构文档已完整（八份），开工前置已清。
**当前位置与收缩进度看 [`../progress.md`](../progress.md)**（生成物）——本文不写进度，
因为这里曾写过一份而它过时了（说「当前 M1」时实际已到 M3）。一概念一权威（D-04）。

| # | 事 | 阶段 | 状态 |
|---|---|---|---|
| 1 | 本项目自己的 [`plan.md`](../plan.md) | 开工前 | ✅ 断言逐条签字完毕 |
| 2 | 回归 fixture（老仓库真实产物 6 份） | 开工前 | ✅ 在 [`../../tests/fixtures/paper/`](../../tests/fixtures/paper/) |
| 3 | 骨架 e2e 测试的形状 | ~~开工前~~ → M6 | ⬜ **不再是前置**。mock-pi 的 API 清单 = wire.ts 碰了 pi 哪几个方法，从接口导出而不是输入，提前写就是猜。事后补不回来的只有注入缝，已由 D-07 + [M6.A9](../plan.md) 钉住 |
| 4 | 老仓库宪法 30 条 → `docs/constitution.md` | 不阻塞开工 | ⬜ 阻塞的是「重写时别踩坑」，可在 M1–M6 过程中逐条核对迁入 |

里程碑四步循环（第四步就是 D-06，不得拖到最后）：

```
写测试（用例名 = 断言编号）→ 写实现 → 跑绿 → 拆对应的 NN-*.md
```

顺序：M1 →（M2 / M3 / M4 三者互不依赖，但按「同一时刻只推进一条线」串行）→ M5（汇合）→ M6。

开工后的持续动作（D-06）：每完成一个模块，把对应的 `NN-*.md` 拆进代码与测试，模块表该行标 📄→🧹。
八份全部收缩完毕时，`docs/modules/` 只剩本文件。**已拆几份不写在这里——数文件，见 [`../progress.md`](../progress.md)。**

## 相关文件

| 路径 | 是什么 |
|---|---|
| [`../disciplines.md`](../disciplines.md) | 纪律台账：判据 + 落点。**动手前读** |
| [`../../templates/plan.md`](../../templates/plan.md) | 规划书骨架 = [`src/plan/grammar.ts`](../../src/plan/grammar.ts) 语法的可运行示例 |
| `../constitution.md` | 老仓库 30 条事故约束（待迁移，编号 A1–F3 不变） |
| [`../inherited/HANDOFF.md`](../inherited/HANDOFF.md) | 老仓库交接文件（备查，非现行设计） |
| [`../inherited/old-README.md`](../inherited/old-README.md) | 老仓库 README（备查，描述的是已废弃形态） |
