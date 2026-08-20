# 架构：模块清单

> 一个模块一份 .md。写完的打 ✅，写作中的打 🚧，还没动的留空。
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
| 01 | [channel](01-channel.md) | ✅ | 消息写下 → 对方被唤醒读到，重启不丢、并发不乱 |
| 02 | [protocol](02-protocol.md) | ✅ | 谁能给谁发什么；路由/schema/文档都从一张表派生 |
| 03 | [config](03-config.md) | ✅ | 项目事实的唯一落点；配错必须吵，不配可以静默 |
| 04 | [plan](04-plan.md) | ✅ | 规划书解析；`[auto]`/`[human]` 断言语法定义在这里 |
| 05 | [gates](05-gates.md) | ✅ | 纯函数判定：断言可测、产出结构、快照、真跑命令、人的问题 |
| 06 | [roles](06-roles.md) | ✅ | 三份静态规约 + system prompt 注入 + 注入自检 |
| 07 | [adapter](07-adapter.md) | ✅ | 三个薄扩展：接线、确定性状态流转、/status |
| 08 | [dist](08-dist.md) | ✅ | pi package、launch 脚本、澄清入口、research 命令 |

## 下一步

架构文档已完整（八份），开工前置已清。当前位置：**M1 通道层**。

| # | 事 | 阶段 | 状态 |
|---|---|---|---|
| 1 | 本项目自己的 [`plan.md`](../plan.md) | 开工前 | ✅ 断言逐条签字完毕 |
| 2 | 回归 fixture（老仓库真实产物 6 份） | 开工前 | ✅ 在 [`../inherited/fixtures/`](../inherited/fixtures/) |
| 3 | 骨架 e2e 测试的形状 | ~~开工前~~ → M6 | ⬜ **不再是前置**。mock-pi 的 API 清单 = wire.ts 碰了 pi 哪几个方法，从接口导出而不是输入，提前写就是猜。事后补不回来的只有注入缝，已由 D-07 + [M6.A9](../plan.md) 钉住 |
| 4 | 老仓库宪法 30 条 → `docs/constitution.md` | 不阻塞开工 | ⬜ 阻塞的是「重写时别踩坑」，可在 M1–M6 过程中逐条核对迁入 |

里程碑四步循环（第四步就是 D-06，不得拖到最后）：

```
写测试（用例名 = 断言编号）→ 写实现 → 跑绿 → 拆对应的 NN-*.md
```

顺序：M1 →（M2 / M3 / M4 三者互不依赖，但按「同一时刻只推进一条线」串行）→ M5（汇合）→ M6。

开工后的持续动作（D-06）：每完成一个模块，把对应的 `NN-*.md` 拆进代码与测试，模块表该行标 📄→🧹。
八份全部收缩完毕时，`docs/modules/` 只剩本文件。

## 相关文件

| 路径 | 是什么 |
|---|---|
| [`../disciplines.md`](../disciplines.md) | 纪律台账：判据 + 落点。**动手前读** |
| [`../../templates/plan.md`](../../templates/plan.md) | 规划书骨架 = 04-plan 解析器语法的可运行示例 |
| `../constitution.md` | 老仓库 30 条事故约束（待迁移，编号 A1–F3 不变） |
| [`../inherited/HANDOFF.md`](../inherited/HANDOFF.md) | 老仓库交接文件（备查，非现行设计） |
| [`../inherited/old-README.md`](../inherited/old-README.md) | 老仓库 README（备查，描述的是已废弃形态） |
