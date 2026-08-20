# work-flow-remake 规划书

> 澄清：2026-08-20 ｜ 断言逐条签字：**已**（第一版，6 条 `[human]` 逐条过人）
>
> 格式定义见 [`templates/plan.md`](../templates/plan.md)，解析器见 04-plan。
> 本文件同时是 L8/L9 之外的第三个真实解析样本——它自己必须能被 `parsePlan` 吃下去。

## 目标

一套三窗口协作工作流，`pi install` 装进任意项目，把「AI 谎报完成」堵在机制层。
成功 = 在一个新建的空项目里，从零接入并跑通一个里程碑的完整流转（分发 → 开发 → FAIL → 修 → PASS → 人工放行）。
不做：第二个执行适配器（CI / 单窗口自动化）、wayfinder 票系统、S/L 档位、契约版本机制、独立合规检查器。

**提交纪律（M1–M6 手工期）**：每里程碑三个 commit——测试（全红，证明断言未迁就实现）／实现（全绿）／文档收缩（D-06）。
不 commit 红的实现。M6 之后 commit 权移交 tester `/pass`（见未决 P6）。

**复用老仓库**：可近乎逐字照抄的部分已逐项列在 [`docs/inherited/reuse.md`](inherited/reuse.md)，实现时先查那份清单再动手写。

## 里程碑 M1 通道层可用

### 断言

- [auto] `npm test -- tests/channel` 全绿，且用例文件恰好覆盖 C1–C8（8 个约束、10 个文件）
- [auto] 存在 `src/channel/{paths,atomic,state,inbox,watch,counters,index}.ts`
- [auto] `grep -rln "writeFileSync" src/ | grep -v "channel/atomic.ts"` 无输出
- [auto] `grep -rln "to-dev.json\|to-arch.json\|to-tester.json\|to-human.json" src/ | grep -v "channel/paths.ts"` 无输出
- [auto] `npm test -- tests/channel` 进程在 30 秒内自行退出（`Stop` 真的关掉了定时器）
- [human] 拔掉 `fs.watch` 后，在真实 pi 进程的窗口里投一条消息，不碰键盘，等它被轮询处理（≥10s）。日志里要有明确的轮询触发标记，不是 mock 定时器凑出来的 —— C1 验函数行为，这条验真实事件循环里 `setInterval` 没被饿死

### 涉及

- `src/channel/`、`tests/channel/`

## 里程碑 M2 协议表驱动路由

### 断言

- [auto] `npm test -- tests/protocol` 全绿，含 P1–P5
- [auto] P1 遍历 `ROUTES` 全部 9 条，逐条断言消息落在 `ROUTES[type].to` 对应的收件箱文件
- [auto] `npm run docs:protocol` 重跑后 `git diff --exit-code` 无输出（生成物与表一致）
- [auto] `grep -rn 'to: "\(arch\|dev\|tester\|human\)"' src/ | grep -v protocol/routes.ts` 无输出
- [human] dev 窗口的 `send_task` 工具面里看不到 `arch` 这个投递目标 —— schema 按角色生成是「越权在类型层不可能」的全部依据，我要开一次真窗口看工具描述

### 涉及

- `src/protocol/`、`tests/protocol/`

### 依赖

- M1

## 里程碑 M3 配置与规约

### 断言

- [auto] `npm test -- tests/config tests/roles` 全绿，含 G1–G6、R1–R6
- [auto] G5 区分两种情况：`test: null` → 诊断级别 `info`；`test` 字段缺失 → `fatal`
- [auto] G2 断言配置语法错时 `cfg === null`（不是 `{}`）
- [auto] `grep -rn "<[A-Z_]\{2,\}>" src/roles/` 无输出（规约零占位符）
- [auto] `wc -l src/roles/*.md` 每份 ≤ 40 行
- [human] 三份规约读起来是「你是谁」而不是「系统怎么工作」 —— 老仓库 242 行里一半是流程说明，这个膨胀无法用行数以外的方式检测，我得自己读一遍

### 涉及

- `src/config/`、`src/roles/`、`tests/config/`、`tests/roles/`

### 依赖

- M1

## 里程碑 M4 规划书解析

### 断言

- [auto] `npm test -- tests/plan` 全绿，含 L1–L9
- [auto] L8 用 `templates/plan.md` 本体作输入，解析成功
- [auto] L9 用 `docs/inherited/fixtures/paper-plan.md`（老仓库真实规划书副本）作输入，解析失败且错误含行号
- [auto] L1 最小样本（一里程碑一断言、无可省节）解析成功
- [auto] 本文件（`docs/plan.md`）能被 `parsePlan` 解析成功，且解出 6 个里程碑
- [human] 用本语法重写一次某个里程碑的断言，全程语法自洽：出现任何「不得不绕过语法、用自然语言糊过去」的地方即判 FAIL

### 涉及

- `src/plan/`、`tests/plan/`、`docs/inherited/fixtures/`

### 依赖

- M1

## 里程碑 M5 拦截链

### 断言

- [auto] `npm test -- tests/gates` 全绿，含 T1–T10
- [auto] T2 断言：一条断言的里程碑，产出文件写一行结论即通过（不要求任何固定小节）
- [auto] T3 断言：漏一条断言时，`reason` 字符串包含缺失的断言编号
- [auto] T9 断言：结构 gate 不过时，`run-command` 未被调用（用 spy 计数）
- [auto] T10 用老仓库四份真实 `test-report-M*.md` 副本作输入，四份全部 block
- [auto] T8 断言：配置 fatal 时 `verdict_pass` 被 block、`review_request` 放行
- [human] 拦截提示读起来知道下一步该干什么 —— 这是 dev 4/4 与 tester 0/4 的唯一差别来源，措辞质量决定纪律是否被遵守

### 涉及

- `src/gates/`、`tests/gates/`、`docs/inherited/fixtures/`

### 依赖

- M2, M3, M4

## 里程碑 M6 三窗口跑通

### 断言

- [auto] `npm test -- tests/adapter tests/e2e` 全绿，含 A1–A9
- [auto] A9 前半：`grep -rn "@earendil-works/pi-coding-agent" src/ | grep -v "import type"` 无输出 —— 本条的意思是「pi 在 `src/` 里只以类型存在」，`import type { ExtensionAPI }` 是允许的、被禁的是值导入（常量、工厂函数、任何有运行时的东西）
- [auto] A9 后半：同进程 `wire()` 三次、各传一个 fake pi → 三份 `channelPaths` 的 root 互不相同（状态隔离），且 A 的 fake pi 上没有收到过 B 注册的工具（注册隔离）
- [auto] A1 断言 `WF_ROLE="arch "`（尾随空格）时告警文本含 `"arch "`（带引号的 JSON 表示）
- [auto] A6 断言 `extensions/*.ts` 各 ≤ 30 行、`src/adapter/wire.ts` ≤ 120 行
- [auto] A4 遍历 `flow.ts` 状态表全部 9 个 type
- [auto] e2e 骨架：临时目录 fixture 项目跑完整一圈（分发 → 产出 → FAIL → 修 → PASS → `/pass` → 回 arch），断言每步的消息落点与状态变化
- [human] 在一个新建空项目里真开三个窗口，跑通一个里程碑 —— 这是唯一能证明「它真的在运行」的事，mock-pi 永远证明不了

### 涉及

- `src/adapter/`、`extensions/`、`tests/adapter/`、`tests/e2e/`、`launch/`、`package.json`

### 依赖

- M5

### 风险与未决

- **mock-pi 的保真度**：e2e 用同进程 mock 驱动三个适配器，它验的是接线正确，不验 pi 真实行为（事件时序、`sendUserMessage` 语义、系统提示注入链）。这是 `[human]` 那条存在的理由，不能用 e2e 顶掉。
- **mock-pi 的 API 清单不预先定**：它等于「wire.ts 碰了 pi 对象上的哪几个方法」，M1–M5 之前写出来是猜。事后补不回来的只有注入缝，那一条已由 A9 钉住（D-07）。

## 未决

- P1 规约注入被后续扩展替换掉时，MARK 自检能不能真的发现 —— [auto] 待查 —— 前置：无
- P2 pi 的 `before_agent_start` 在 `--print` 模式（无 TUI）下是否照常触发 —— [auto] 待查 —— 前置：无
- P3 单窗口降级要不要给 `dev-only` 启动脚本 —— [human] 归我 —— 前置：P2
- P4 `docs/decisions.md` 从哪个里程碑开始写第一行 —— [human] 归我 —— 前置：无
- P5 M6 那条人工断言用什么任务来跑 —— [human] 归我 —— 前置：无
- P6 commit 权从手工移交 tester `/pass` 的分界点 —— [human] 归我 —— 前置：P5

## 说不清的

- 多个项目共用同一份 work-flow 时，版本怎么钉（`pi install` 的 ref 够不够）
- 一个里程碑做到一半发现断言错了，除了 escalation 往返之外有没有更轻的路
- 宪法 30 条里有多少条会在实现中被证明其实不必要

## 不做

- 第二个执行适配器（CI / 单窗口自动化）
- wayfinder 票系统与决策地图
- S/L 档位判定与 `report_s`
- 契约发布、版本化、归档机制
- 独立的合规检查器脚本
- 非 Windows 平台的 launch 脚本
