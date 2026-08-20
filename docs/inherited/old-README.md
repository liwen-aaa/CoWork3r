# work-flow — 通用多角色协作工作流（pi 扩展）

> 三窗口（ARCH / DEV / TESTER）+ 文件消息通道 + 代码级门禁，把「AI 谎报完成」和「规划书漂移」堵在机制层。
> 来源：float-task-proj（去除项目耦合后通用化）。本仓库 = **模板库/共享资产**；dogfood 实测在 work-flow-paper。

## 从哪里开始

| 你是 | 先读 |
|---|---|
| 人，想用它 | 本文件 → [`docs/run/onboarding.md`](docs/run/onboarding.md) |
| **要重构这个仓库** | [`HANDOFF.md`](HANDOFF.md)（必读什么 / 别细看什么 / 能抄什么 / 该砍什么） |
| 人，想懂设计 | [`docs/methodology/layered-development.md`](docs/methodology/layered-development.md) |
| agent，要在本仓库工作 | [`AGENTS.md`](AGENTS.md)（读序 + 可改边界）+ [`MANIFEST.json`](MANIFEST.json)（结构清单） |
| 接入项目，要知道边界 | [`contracts/published/INDEX.md`](contracts/published/INDEX.md) → 契约本体在 `active/`（**只读这里**） |
| 任何人，碰到术语 | [`CONTEXT.md`](CONTEXT.md)（唯一术语来源） |

## 运行形态

```
用户「启动 M{N}」
  → ARCH 读规划书 → send_task 分配 dev（plan quality gate 校验验收断言可测，不可测拦截）
  → DEV 增量开发 → 写 logs/dev-output-M{N}.md（未写 / 生产文件无变化 → 拦截投递）
  → TESTER 写测试并运行（无测试 = FAIL）→ 报告判定
      ├─ FAIL → fix_request 发回 dev 逐条修复（轮次自动 +1，上限 max_rounds）
      │         同一问题 ID ≥3 轮 → escalation 上报 arch；连续失败达上限 → stuck 请人工介入
      └─ PASS → 真跑 testCmd/gateCmd（失败拦截）→ manual_verification 进入人工验证等待
  → 人实机核对 → TESTER 窗口 /pass <验证了什么>（无凭证拒绝）→ milestone_passed 投递 arch
  → ARCH 更新规划书状态，分配下一里程碑（或收尾报告）
```

- **L/M 级（常规）**：如上。人工验证是关卡不是阻断（`/status` 与重启简报都会主动提示待人工）。
- **S 级（轻量）**：≤2 文件/不动数据模型/不改交互语义/测试可覆盖 → 四关卡（回归门禁 → 增量测试 → feature-log → 构建交付）→ `report_s` 登记（extension 校验判据）；tester 每 5 单抽检。消息 body 首行 `[S]`，由用户直接下给 dev，arch 不参与。
- **大功能（规划层）**：destination 可见、route 看不清时，ARCH 建 wayfinder 决策地图（`/wayfind`），逐票解析后交棒执行层。实现已按 ADR-0008 收窄为「闭环 + 最小命令」，生成类降级 SKILL。

## 核心机制（一句话）

| 机制 | 落点 | 堵什么 |
|---|---|---|
| 单槽位文件 inbox + fs.watch | `to-{role}.json` + 原子写 | 零基础设施消息通道 |
| 处理后条件清空 + `.processed-{role}` + 10s 轮询兜底 | `watchInbox` | 旧消息重放误判；Windows fs.watch 漏事件 |
| 双保险 | 产出文件未写拦截投递 / 会话结束未投递提醒 | 空产出、忘投递 |
| 真跑测试 | wf-config `testCmd`/`testDir`，PASS 前执行 | 谎报 PASS（代码审查≠功能测试） |
| 产物自检 | wf-config `gateCmd`，PASS 前冷启动跑一遍 | 构建过了但产物不可用（白屏/dev 模式） |
| 生产文件快照 | wf-config `sourceDir`，投递前 diff（无 git 依赖，ADR-0009） | 只写 dev-output 不写生产 |
| plan quality gate | 分发前校验规划书验收断言可测 | 不可测导致 tester 中途卡死 |
| 阈值保护 | `max_rounds` + 同问题 ≥3 轮升级 | 无限修复循环、实现问题掩盖架构问题 |
| 人工验证关卡 | `/pass <验证了什么>`（无说明拒绝）+ 通过后自动 commit | 无凭证放行、半成品入历史 |
| L0 交接 | `logs/handoff-{role}.md` + 启动接管简报 | 窗口重启失忆 |
| S 级硬校验 | `report_s`（文件数 / 黑名单 / feature-log / `buildCmd`） | L 级伪装成 S 级 |
| 产出结构 gate | 三处拦截链校验非空 + 必需小节（IF-004@v2） | 空文件占位、报告缺关键节 |
| 配置诊断 | wf-config 语法/字段/正则校验，fatal 阻断 PASS（IF-002@v3） | 配置写错 → 所有 gate 静默关闭 |
| 约定台账 | `CONVENTIONS.md` 机制约定的落点必须指得到实体（IF-006） | 约定写在票里但从未进 gate |
| 越权拦截 | dev→arch 仅限带 ticket 的 `ticket_result`（ADR-0007） | dev 绕过 tester 直连 arch |
| 文档一致性 | tester 每轮审查 + 报告必含「文档一致性」节 | 文档漂移 |
| 私域 | `.human-only/`，AI 禁止读取 | 反思层内容入上下文 |

> 计数持久化（`logs/issue-counts-{role}.json`、`logs/tester-last-milestone.txt`、`.pi/messages/dev-change-baseline.json`）保证窗口重启不丢状态。

## 消息通道（零基础设施）

```
.pi/messages/
├── to-arch.json / to-dev.json / to-tester.json / to-human.json   （单槽位，原子写）
├── state.json                  { current_milestone, current_round, max_rounds, consecutive_fails, current_map }
├── wf-config.json              测试/构建/快照配置（可选，见 docs/run/wf-config.md）
├── dev-change-baseline.json    生产文件快照基线（dev 投递点）
└── .processed-{role}           mtime 标记，防窗口重启后重复处理
```

消息字段 `{ from, to, type, milestone, round, body, refs, timestamp }`（FAIL 另带 `issues[]`，票回执另带 `ticket`）。

线上实际流转的 type：

| type | 方向 | 触发 |
|---|---|---|
| `task_assignment` | arch → dev | 分配里程碑 |
| `review_request` | dev → tester | 开发/修复完成 |
| `fix_request` | tester → dev | 判定 FAIL，或人工 `/fail` |
| `manual_verification` | tester → human | 判定 PASS，等人核对 |
| `milestone_passed` | tester → arch | 人工 `/pass` |
| `escalation` | tester → arch / arch → human | 同问题 ≥3 轮，或 arch 判不了 |
| `stuck` | tester → human | 连续失败达 `max_rounds` |
| `ticket_result` | dev → arch | research/prototype 票回执 |
| `report` | arch → human | 收尾/状态报告 |

（`verdict` 只是 tester `send_task` 的参数，不是消息 type。）

## 命令与工具（按角色）

| 角色 | 工具 | 命令 |
|---|---|---|
| arch | `send_task`、`claim_ticket`*、`resolve_ticket`* | `/status`、`/wayfind`* |
| dev | `send_task`、`report_s` | `/status` |
| tester | `send_task` | `/status`、`/pass <验证了什么>`、`/fail: 原因` |

\* wayfinder 相关命令/工具与 `send_task.ticket` 字段只在 `docs/wayfinding/maps/` 下存在真实地图时注册——工具 description 全量进 LLM 上下文，无地图的项目不烧这份 token。

## 接入新项目

五件套缺一不可（extensions / state.json / 三个 SKILL / 三个 bat / launch-trio.ps1），完整清单与步骤见 `docs/run/onboarding.md`；可选配置见 `docs/run/wf-config.md`。

接入项目消费的边界契约在 `contracts/published/active/`（IF-001…006：角色激活 / wf-config / 消息通道 / 产出文件 / SKILL 占位符 / 约定台账）——只读该目录，不读 `extensions/` 源码。设计侧与开发侧的连接模式选择见 `docs/run/connection-modes.md`（决策：ADR-0010）。

> 前置流程：开工前先 `/grill-with-docs` 产出任务规划书（`templates/skills/grill-with-docs/`）。**没有规划书，arch 不应分发任何任务**——plan quality gate 会在分发时拦下来。
>
> 三窗口是运行形态不是可选优化：没有实际开出三个窗口，work-flow 未在运行。

## 自检

```bash
npm run verify                        # 跑全部四项仓库自检
node scripts/verify-extensions.mjs    # 扩展行为：17 组 / 131 项（注册隔离、双保险、消息端到端、各门禁拦截）
node scripts/verify-inbox-clear.mjs   # inbox 条件清空与并发不误清
node scripts/verify-docs-links.mjs    # 文档链接与仓库内路径引用完整性
node scripts/verify-manifest.mjs      # MANIFEST.json 与真实结构一致（含 AGENTS.md 读序同步）
node scripts/verify-contracts.mjs     # 契约生命周期：index.yaml ↔ active/ ↔ archive/ ↔ INDEX.md
node scripts/verify-compliance.mjs <项目路径>   # 契约合规：接入项目是否满足 IF-001…006
```

前五项在本仓库根目录跑（前两项是 mock 验证，不启动真实 pi 进程）。最后一项指向任意接入项目
（退出码 0 合规 / 1 不合规 / 2 用法错），它复用运行时的纯函数判据，不重复实现——验扩展行为与验消费侧合规是两件事。

## 环境变量

`WF_ROLE`（arch/dev/tester，决定激活哪个扩展）｜ `WF_MILESTONE_PREFIX`（默认 `M`，如 own-html 用 `P`）。

## 文档地图（本仓库自身）

```
CONTEXT.md                术语表（无实现）—— 先读
AGENTS.md                 agent 读序 + 可改边界
MANIFEST.json             机器可读结构清单（读序 / 边界 / 自检命令）
CONVENTIONS.md            约定台账（机制约定的落点 / 人工约定的理由）
README.md                 本文件（入口地图）

extensions/               运行时代码（三窗口适配器）：{arch,dev,tester}-agent.ts + lib/agent-lib.ts
contracts/published/      对接入项目的边界契约
  active/                 当前有效（IF-001…006）—— 消费侧只读这里
  archive/<id>/v<n>/      已被取代的版本（不可当成现行契约）
  INDEX.md / index.yaml   人读索引 / 机读索引（须一致）
templates/                接入时复制的模板种子：skills/ + launch/ + messages/state.json
scripts/                  自检：verify-extensions / verify-inbox-clear / verify-compliance（+ lib/ fixture）

docs/
  README.md               文档导航
  methodology/            方法论长文（决策 → 契约 → 实现 → 证据）
  run/                    现行运维：onboarding / wf-config / connection-modes / lessons-learned / window-orchestration
  adr/                    硬决策（ADR-0001…0010，追加式）
  backlog.md              仅未完成项
  archive/                备查（默认不检索）
  wayfinding/             已结案决策地图，兼作 verify fixture（默认不检索）
```

目录职责分开：`extensions/` 是**运行时源码**（被复制到接入项目的 `.pi/extensions/`），`templates/` 是**模板种子**（被复制到 `.pi/skills/`、`.pi/launch/`、`.pi/messages/`）。
两者都不在本仓库运行——本仓库不跑三窗口流水线。

## 开发约束（血泪教训，详见 `docs/run/lessons-learned.md`）

1. **需要工具/方案/能力时，优先从 GitHub/网络搜集成熟方案**（先调研），有成熟可用的直接采用，**不自造轮子**（自造 ASCII 监控面板、窗口定位脚本均已被否决）。
2. **禁止在 agent 会话内乱开窗口/浏览器/VS Code**——开窗口由人在物理终端执行（曾误杀自身终端）。
3. **新机制门槛**：必须有「被观察到的失败模式」或「被卡住的实际场景」才实现；纯"如果……会更好"的预埋一律进 `docs/archive/` 设计存档，不实现。
4. **环境即边界**：编译/工具链错误不循环尝试，记录 + 报告，最多试 1 次替代方案。
5. **可观测性用成熟方案**：pi session 本地可观测用 AgentLens（`npm i -g @roberttlange/agentlens`）。
