# 模块 08：dist（分发与接入）

> **职责一句话**：让一个新项目从零到三窗口就绪——装一次、配三项、开一次。
> **依赖**：无代码依赖。它是包装层与入口层。
> **读者**：接入项目的人（只读「接入」一节）。
>
> 老仓库对应物：「五件套」清单 + `scripts/adopt.mjs`（294 行生成器）+ `templates/launch/*` +
> `verify-compliance.mjs`（321 行合规检查器）+ IF-001/IF-005 两份契约。本模块把生成器和检查器都吃掉。

## 为什么它是独立一层

老仓库的接入路径是「复制 `extensions/` → 复制 `state.json` → `npm i typebox` → 生成三份 SKILL → 生成四个启动脚本」，五步手工，21 个占位符要替换对。

然后为了压这个成本，长出一个 294 行生成器；为了验证生成器的产物，长出一个 321 行合规检查器；为了给检查器判据，长出六份契约。**615 行工具 + 六份契约，服务的是「复制文件」这件事。**

而 pi 本来就有分发机制：`pi install`，约定目录自动发现，`typebox` 是 bundled core package（文档明说该进 `peerDependencies` 而不是让每个项目自己装）。老仓库那条「优先用成熟方案，不自造轮子」的开发约束，在这里被自己违反了——L1 那次「扩展被静默丢弃」的事故，根因是打包方式错了，不是人忘了装依赖（D-31）。

所以本层的形状是：**包定义 + 三项配置 + 一个启动脚本。生成器和检查器都不存在。**

## 包定义

```jsonc
// package.json
{
  "name": "@<scope>/work-flow",
  "keywords": ["pi-package"],
  "peerDependencies": { "typebox": "*" },   // pi 自带，不打包、不让人装
  "pi": {
    "extensions": ["./extensions"]           // 三个入口文件
  }
}
```

`skills` 不声明——角色规约不走 skill 机制（06-roles）。

**`typebox` 进 `peerDependencies` 是这一层最实质的一处修正。** 老仓库让每个接入项目 `npm i typebox`，装晚了扩展就被静默丢弃，唯一症状是调工具时报 "Tool send_task not found"。pi 文档列了五个 bundled core package（`pi-ai` / `pi-agent-core` / `pi-coding-agent` / `pi-tui` / `typebox`），明确要求 `peerDependencies: "*"` 且不要 bundle。按文档做，这个故障类别整个消失。

## 接入（三步）

```bash
# 1. 装
pi install git:github.com/<user>/work-flow@v1

# 2. 配（项目根，三个必填）
cat > wf.config.json <<'EOF'
{ "plan": "docs/plan.md", "source": "src", "test": "npm test" }
EOF

# 3. 开（人，在物理终端）
powershell -File node_modules/.../launch/trio.ps1
```

读 1 个文件（本节）、配 3 项、跑 1 条命令 + 1 次启动。对照老仓库实测的「读 3 / 配 25 / 跑 5 步」。

没有「五件套清单」，因为没有五件套——`.pi/extensions/` 由 `pi install` 管，`state.json` 由扩展首次运行时创建，规约在包里，launch 脚本在包里。

**唯一需要人写对的东西是那三个值**，而它们写错会在启动时被 03-config 的诊断抓住（fatal + 拦截）。这就是不需要合规检查器的原因：判据在运行时，不在一个独立脚本里。

## launch 脚本

```
launch/
├── trio.ps1        三窗口编排（纯 ASCII）
├── arch.bat        单窗口入口
├── dev.bat
└── tester.bat
```

四条硬约束，全部来自真实翻车：

**纯 ASCII。** PowerShell 5.1 读 UTF-8 无 BOM 时按 GBK 解码，中文注释会破坏语法解析，报错还指向错误的行。

**竖排三窗口，比例 0.3 / 0.35 / 0.35**，用 Windows Terminal 的 `sp -V --size`，实时读 `Screen::WorkingArea` 而不硬编码像素。老仓库明确记录过「自造窗口定位脚本已被否决」——这份逻辑照抄，不重造。

**单实例防重。** 检测到 ≥3 个带 `WF_ROLE` 的进程就拒绝再开。同角色多实例会竞争消费同一收件箱，消息被你看不见的窗口吃掉，**这个故障没有任何可见症状**（01-channel 的 C6）。日常更新扩展用 `/reload`，不重开 bat。

**不用 `FindWindow` 定位。** pi 的 TUI 会用 ANSI 转义覆盖窗口标题，按 title 找窗口找不到。用 `wt --title` + `--suppressApplicationTitle`。

`set WF_ROLE=arch` 这一行**行尾不能有空格**。生成时 trim，测试里 grep 检查（见验收）。老仓库那次事故就是这一个空格，加上 07-adapter 现在会告警，两道一起堵。

## 澄清入口

规划书由一次显式触发的澄清对话产出，独立会话，产出落在项目仓库里。

**这一处用 pi skill**，因为语义匹配：一次性、显式触发、用完就走、不需要常驻上下文。渐进披露对角色规约是缺陷，对这个恰好是优点。

```
skills/plan/SKILL.md
```

内容只有四十行左右的对话纪律，**模板不复述**（指向 `templates/plan.md`，D-04）：

- 事实自己查：能从代码/文档/命令查到的（技术栈、测试基建、既有约定）用工具查，不问人。只问决策。
- 一次一问，每问带推荐答案与理由。
- 断言逐条签字（D-24）：不是「这份规划书你看一下」，是逐条念「这条做到了你认不认」。`[human]` 条目必须是人自己的话（D-21）。
- 能不能精确陈述，不是能不能回答（D-10）：说得清就进未决表，说不清就留在「说不清的」，不许提前切块。
- 想直接动手了 = 该交棒了（D-11）。
- 不到签字不写盘。

**写盘前跑一次解析**（04-plan 的 `parsePlan`），格式不对当场报错带行号。这是 D-02 用在澄清阶段——不然格式错要等到 arch 第一次分发才暴露，而那时人已经开完三个窗口了（老仓库四份规划书全部通不过 gate 却没人发现，就是这个原因）。

第二次以后的功能补完**不必跑澄清**——人直接手写一节，格式由 gate 兜。澄清 skill 只用在项目开头和「我又想不清楚了」的时候。

## research 命令

未决表里 `[auto]` 的条目，派出去查。**砍掉 wayfinder 后这是唯一的外查通道**，所以它需要正式规格。

```
/research            列出 frontier.toQuery（能查的那几条）
/research P2         派查 P2
/research P2 --redo  已回的重查（覆盖旧 note，要求显式确认）
```

**序号是 `Pending.id`（P1 / P2…）**，不是行号、不是展示序号。id 由 04-plan 解析时分配，删行不回收——
所以你在 `/status` 里看到的 P2，和一小时后打的 `/research P2` 是同一条，即使中间删了别的行。

### 状态机

`Pending.status` 三态，与 04-plan 的 `frontier` 输出一一对应：

```
open ──/research──> querying ──成功──> answered
                        │
                        └─失败─→ open（回退）+ 末尾追加「上次失败：<原因>」
```

| 状态 | 写在未决表里的样子 | 进 `frontier` 的哪一组 |
|---|---|---|
| `open` | `[auto] 待查` | `toQuery`（前置已清）/ `blocked` |
| `querying` | `[auto] 查中` | 不进任何组（避免重复派） |
| `answered` | `[auto] 已回 → wf/notes/<slug>.md` | `answered` |

**失败回退到 `open` 而不是新增一个 `failed` 态**：四态会让失败条目沉到底，而它正是最需要你看一眼的。
回 `open` 则它下次仍出现在 `toQuery` 里（带失败原因），你自然会重试或改成 `[human]`。

### slug 与写盘

`slug` 从条目文本取前 24 个字符转小写短横线，冲突则追加 `-2`。note 固定三节：

```markdown
# <条目原文>
## 结论
<一句话。写不出一句话 = 没查完>
## 依据
<链接 / 引文 / 命令输出。无依据的结论不得标 answered>
```

无「依据」节或该节为空 → 视为失败，回退 `open`。这是 D-02 用在外查上：
没依据的结论和没查一样危险，而且更危险——它看起来已经完成了。

### 并发与幂等

多条 `toQuery` 可并行派（它们无依赖关系，否则就不在 `toQuery` 里）。
重复 `/research P2` 在 `querying` 态时直接拒（提示“已在查”），幂等。

这一套是原版 wayfinder 的 research 票 + AFK 语义的平替，成本是一个命令，
而不是一套票格式 + 一条专用消息 type + claim/resolve 工具。

**你不需要记住派出去了什么**——`/status` 第三行会显示「1 条查回来了」（D-30）。

## 接入前自查（`/doctor`）

不开三窗口也能验一下配置与规划书。这是老仓库 `verify-compliance.mjs` 唯一值得保留的使用场景。

**硬约束：不得引入任何新判据。** 它只是两个现有函数的五行包装：

```ts
const { cfg, diagnostics } = inspectConfig(root);        // 03-config
const plan = cfg && parsePlan(root, cfg.plan);            // 04-plan
// 打印 diagnostics + plan 错误 + 首个未 passed 里程碑的 checkMilestone 结果
```

为什么要把“不引入新判据”写成硬约束：老仓库那个 321 行检查器一开始也只是包装，
后来为了“多查一点”长出自己的判据，而判据一旦在两处就会漂（最后长出六份契约）。
判据只能在 03/04/05，`/doctor` 只能转述。

它不是独立脚本，是扩展里的一个命令——因为它验的正是“扩展能不能加载”，能跑到就已经答了一半。

## 目录总览（装完之后）

```
<项目根>/
├── wf.config.json        你写的三项
├── wf/                   人读的记录，进 git
│   ├── dev-output-M1.md
│   ├── test-report-M1.md
│   ├── handoff-<role>.md
│   └── notes/            research 结果
├── .pi/
│   ├── messages/         机器水位，进 .gitignore
│   └── ...               pi install 管的东西
└── docs/plan.md          规划书（路径由 wf.config.json 指定）
```

## 不负责什么

- **不负责开窗口** —— 脚本由人在物理终端执行。agent 会话内开窗口曾误杀自身终端（D-33，无例外）。
- **不负责装依赖** —— `pi install` 做这件事。`typebox` 走 peerDependencies。
- **不负责校验接入是否正确** —— 判据在 03-config 的运行时诊断。**不做独立的合规检查器**（老仓库那个 321 行脚本连同六份契约一起消失）。
- **不负责跨平台** —— launch 资产是 Windows（bat + PowerShell）。其它平台未验证，明确标为留白而不是假装支持。

## 已知取舍

**没有生成器。** 老仓库的 294 行 `adopt.mjs` 消失，因为它生成的东西现在要么在包里（规约、脚本），要么是三行 JSON（配置）。生成器存在的前提是「每个项目需要一份定制的副本」，而占位符归零之后这个前提不成立了。

**没有合规检查器。** 它的判据分两类：五件套完整性（现在由 `pi install` 保证）和配置正确性（现在由启动时诊断保证）。老仓库需要它，是因为接入产物是手工拼的、错了没有运行时信号。

**Windows only。** 这是真实降级，不是疏漏。跨平台等真有人在别的系统上用（D-42）。

## 验收

```
tests/dist/
├── D1-package-manifest.test.ts  package.json 的 pi.extensions 指向真实存在的三个文件
├── D2-peer-dep.test.ts          typebox 在 peerDependencies 且不在 dependencies
├── D3-launch-ascii.test.ts      launch/*.ps1 全部为纯 ASCII
├── D4-no-trailing-space.test.ts grep：launch/* 里 set WF_ROLE=<值> 行尾无空格
├── D5-plan-skill.test.ts        skills/plan/SKILL.md 不复述模板，且它引用的 templates/plan.md 真存在
├── D6-adopt-e2e.test.ts         临时空目录 → 写三项配置 → mock-pi 同进程加载三个扩展，诊断为零
└── D7-research-state.test.ts    open→querying→answered；无「依据」节 → 回退 open；querying 时重派被拒
```

**D6 是接入路径的唯一真验收。** 老仓库从来没有测过「从零接入」这条路（唯一的接入项目是手工拼的），backlog 里那一项到最后也是空的。

---

**已写模块**：01-channel（已收缩进 `src/channel/`） ｜ 02-protocol（已收缩进 `src/protocol/`） ｜ [03-config](03-config.md) ｜ [04-plan](04-plan.md) ｜ [05-gates](05-gates.md) ｜ [06-roles](06-roles.md) ｜ [07-adapter](07-adapter.md) ｜ 08-dist（本文）

**架构文档完整。** 下一步见 [模块清单](README.md#下一步)。
