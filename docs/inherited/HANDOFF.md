# 交接：给重构 work-flow 的下一个工程

> 写给准备重构这个仓库的人（或 agent）。
> 不讲历史，只讲：**哪些必读、哪些别细看、哪些直接抄、哪些必须重做。**
> 前任已做到哪一步：见文末「当前进度」。

---

## 一、这个仓库到底是什么

一套装到**别的项目**里的三窗口 AI 协作工作流。work-flow 自身不运行——你在这个目录里永远看不到它工作。

它同时是三个东西，而这是当前所有混乱的根源：

| 身份 | 体量 | 谁消费 | 重构时 |
|---|---|---|---|
| 能跑的工具 | `extensions/` 1898 行 + `templates/` | 接入项目 | **保住行为，可重组结构** |
| 关于 AI 协作的主张 | `docs/methodology/` 21KB + 11 份 ADR | 人（读者） | 大部分可弃，见 §4 |
| 证明主张有效的自证系统 | `scripts/` **1995 行** + `contracts/` | 没有人 | **大幅砍，见 §4** |

第三行是关键诊断：**自检代码比运行时代码还多**，且其中四项机制的驱动源是前一项机制自身，不是用户遇到的问题。

---

## 二、必读（按顺序，约 30 分钟）

只有四份。读完就能开工。

### 1. `docs/run/hard-won-constraints.md` ★最重要

30 条用真实事故换来的约束，分 A–F 组。格式是「现象 → 现有落点 → 新版必须保留什么」。

**它比这个仓库的任何代码都值得保留。** 实现可以全部重写，这份清单不变。
新版本违反任一条即为回归——它就是你的验收标准。

优先读 A 组（通道与状态）和 B 组（静默失败）。这两组是"重写时最容易丢、丢了最难查"的。

### 2. `docs/adr/0011-minimal-adoption-budget.md`

三项预算：**读 ≤2 文件 / 配 ≤3 项 / 跑 1 条命令**。这是"最小"的可测定义。
附带一条反自指约束：新增验证机制前问「它保护用户能力，还是保护本仓库的自证」。

前任重构前实测：读 3 / 配 25 / 跑 5 步 —— 三项全超。F1 已把配和跑压到 3 和 1。

### 3. `CONTEXT.md`

术语表。唯一术语来源。碰到"里程碑/轮次/双保险/S 级/连接模式/断言源"这些词回来查。

### 4. `docs/run/refactor-design.md`

前任的重构设计与验收判据。**但它有一个已知偏差**（见 §5），读时留意。

---

## 三、别细看的实现（知道它在干什么就够）

### `extensions/lib/agent-lib.ts` —— 922 行，不要通读

结构上是一团，但**行为是对的**。它的实际切分是（注释已划好，只是没落成文件）：

| 行范围 | 内容 | 有 pi 依赖？ |
|---|---|---|
| 1–405 | `createAgentLib` 闭包：通道、状态、handoff、启动简报 | ✅ 有 |
| 406–452 | `planQualityGate` 规划书验收断言可测性 | ❌ 纯函数 |
| 453–561 | `inspectWorkflowConfig` 配置诊断 | ❌ 纯函数 |
| 562–695 | `inspectConventions` 约定台账 | ❌ 纯函数 |
| 696–751 | `artifactStructureGate` 产出结构 | ❌ 纯函数 |
| 752–810 | `snapshotSource` / `diffSnapshots` 文件快照 | ❌ 纯函数 |
| 811–922 | wayfinder 票解析 | ❌ 纯函数 |

**`createAgentLib` 返回 38 个东西**，三个 agent 各取所需，无边界。这是最该重构的地方，见 §5。

**只有 1–405 行需要你真正理解**，因为宪法 A 组（轮询兜底、条件清空、原子写、计数持久化）全落在这一段。
后面 517 行是纯函数，行为由 `verify-extensions.mjs` 的 131 项覆盖，拆分时跑一遍就知道对不对。

### `extensions/{arch,dev,tester}-agent.ts` —— 各 14–19KB

三个角色的 pi 扩展。结构一致：`session_start` 装简报 → `tool_call` 拦截链 → `registerTool` → `watchInbox`。
**看一个就懂三个**，建议看 `tester-agent.ts`（拦截链最完整）。

### `scripts/verify-extensions.mjs` —— 58KB，绝对不要通读

17 组 131 项 mock 行为验证。**它是你重构的安全网，不是要读的东西。**
用法只有一条：改完 `extensions/` 跑它，全绿就是没拆坏。

### `scripts/verify-compliance.mjs` —— 检查某个接入项目是否合规

抓到过真缺陷（`--skill` 指向不存在的目录）。这个值得留。

---

## 四、可以直接复用 / 该砍掉

### 直接抄，不用改

| 资产 | 为什么 |
|---|---|
| `extensions/` 1–405 行的通道实现 | 每一处都对应一次真实事故（宪法 A 组）。重写必踩 |
| `scripts/adopt.mjs` | F1 刚做的接入生成器，21 占位符 → 3 必填。已在新空项目验过 |
| `templates/skills/_template-*/SKILL.md` | 三个角色的行为规约，实战跑过四个里程碑 |
| `templates/launch/*.template` | 三窗口启动脚本。`launch-trio.ps1` 的自适应屏幕逻辑不要重造 |
| `docs/run/lessons-learned.md` L1–L16 | 事故原文。宪法是它的浓缩版，细节在这里 |

### 该砍或该合并（前任没敢动，你应该动）

| 目标 | 现状 | 判断 |
|---|---|---|
| **六份契约** `contracts/published/active/` | 描述的是**文件格式和环境变量**，不是代码接口 | IF-001/002/004 有真实价值（角色激活、配置、产出结构）。IF-003 是消息格式，可合进代码类型定义。IF-005 在 F1 之后基本失效（生成器替人填了）。IF-006 台账机制成本高于收益 |
| **契约版本机制** `archive/` + `verify-contracts.mjs` | 8.8KB 脚本 + 四份 `ARCHIVED.md` | **建它的理由是"无 git 会丢失全文"。现在有 git 了。** 可整套砍掉，用 git 历史替代 |
| `verify-manifest.mjs` + `MANIFEST.json` | 校验自证物自身 | 典型的自证增殖。目录结构简化后没有存在理由 |
| `verify-docs-links.mjs` | 183 个引用逐个验存在 | 引用总量收敛后价值下降。**但搬目录时它是唯一兜底**，砍在最后 |
| `CONVENTIONS.md` 约定台账 | 26 条 + `inspectConventions` 133 行 | 它解决的问题（约定写在票里未进 gate）是真的，但方案重。可考虑降为一份纯文档清单，去掉机制校验 |
| `docs/methodology/layered-development.md` | 21KB，讲 `docs/specs/{pending,active,archive,proposals}/` | **它描述的架构在本仓库不存在**，且第 9 节与实现矛盾。要么改成如实描述，要么移出仓库当独立文章 |
| `docs/archive/` 七份 69KB | 被 ADR 溯源引用 | 不删但也别读。它们是 ADR 的脚注 |

**砍的顺序很重要**：先砍 `verify-contracts.mjs` + `archive/`（git 已替代），再砍 `verify-manifest.mjs`，
最后才动 `verify-docs-links.mjs`（它要给搬目录兜底）。

---

## 五、前任设计里的一个偏差（重要）

`docs/run/refactor-design.md` 把 `extensions/` 列为"不动"，理由是含事故换来的实现 + 已同步 paper。
**理由成立，但它掩盖了一件事：不动它，"改这个东西很难"就永远不解决。**

两个问题不是一回事：

| 问题 | 症状 | F1 生成器能解决吗 |
|---|---|---|
| 用它麻烦 | 25 个占位符、5 步手工 | ✅ 已解决 |
| **改它难** | 922 行单文件、38 个导出、无模块边界 | ❌ 完全没碰 |

如果你的重构目标包含"让它可维护"，**第一件事应该是拆 `agent-lib.ts`**：

```
lib/
├── channel.ts       通道：watchInbox / writeMessage / state / .processed
│                    ← 宪法 A1–A5 全在这里，最不该被别的东西污染
├── config.ts        inspectWorkflowConfig / readStatusFile
├── artifacts.ts     artifactStructureGate / snapshotSource / diffSnapshots
├── plan.ts          planQualityGate
├── conventions.ts   inspectConventions（若保留台账机制）
├── tickets.ts       wayfinder 票解析
└── session.ts       bootBriefing / registerStatus / writeHandoff
```

切分判据不用猜：**前六个都是纯函数、零 pi 依赖**（代码注释已经这么标了），只有 `session.ts` 要 `ExtensionAPI`。
这不是设计，是把已有事实写成文件。

安全网：`verify-extensions.mjs` 覆盖了这些函数的行为，拆完跑一遍。纯机械重构，不改行为。

代价：拆完 `extensions/` 与 `work-flow-paper/.pi/extensions/` 分叉。paper 已收尾，可以不同步。

---

## 六、绝对不要重造的三件事

1. **`fs.watch` 的轮询兜底**（宪法 A1）。Windows 上事件会漏，整条流水线静默停止。10 秒 `setInterval` 兜底，零成本。
2. **消息处理后的条件清空**（宪法 A2）。只清不比对 → 误删并发新消息；只比对不清 → 旧消息重放。两者都要。
3. **`launch-trio.ps1` 的屏幕自适应**。前任明确记录过"自造窗口定位脚本已被否决"。

---

## 七、三个静默坑（会浪费你半天）

按踩到概率排序。它们的共同点是**无任何报错**：

| 坑 | 症状 | 有机制拦吗 |
|---|---|---|
| `set WF_ROLE=arch ` 尾随空格 | 窗口完全失活，唯一线索是没有"就绪"通知 | 只有 `verify-compliance.mjs` 静态查。**运行时至今无告警**——宪法 B2 是清单里唯一"记录了但没修"的条目，重构时顺手修掉 |
| `--skill` 指向不存在的目录 | 同上。paper 曾两坑同中（`paper-arch` vs `paper-architect`） | `verify-compliance.mjs`；F1 生成器已从源头消除（按约定生成目录名） |
| `wf-config.json` 少个逗号 | 所有 gate 无声关闭，PASS 毫无验证依据 | 已修（`inspectWorkflowConfig` 报 fatal） |

---

## 八、当前进度与可回退点

有 git（本次重构前才 `git init`，此前所有历史不可恢复）。

```
8fa8689  F1: 接入生成器 adopt.mjs（21 占位符 → 3 必填，5 步 → 1 命令）
e7b30fa  第 2 步：重构设计（待拍板，未实施）
b8a72ac  第 1 步：抽经验为重构宪法
f4872f1  基线：重构前的完整现状
```

`docs/backlog.md` 线 F 是未完成清单：

| 项 | 状态 |
|---|---|
| F1 接入生成器 | ✅ 已完成并验证（新空项目 → 合规通过） |
| F2 占位符收敛 21→5 | 部分完成（F1 已实现替换逻辑，`templates/` 模板本身未改、IF-005 未升版） |
| F3 QUICKSTART 单文件 | ❌ 未做（"读 3 → 1" 还没兑现） |
| F4 三个身份分家 | ❌ 未做，且依赖 F1–F3 |
| F5 修宪法 B2（角色识别可观测） | ❌ 未做，三行改动 |
| F6 端到端验收 | 部分（F1 自测覆盖了生成，未真开三窗口） |

**验证现状**：`npm run verify` 五项全绿。这是你的起点基线，重构中随时可回退到任一提交。

---

## 九、如果只做一件事

拆 `agent-lib.ts`（§5）。

理由：它是"改这个东西很难"的唯一根源，有完整测试覆盖当安全网，纯机械重构不改行为，
而且拆完之后其余所有决策（砍哪些自检、契约怎么收敛）都会变得明显——
因为你能第一次看清哪个模块真的被谁依赖。
