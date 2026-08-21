# work-flow-remake 规划书

> 澄清：2026-08-20 ｜ 断言逐条签字：**已**（第一版，6 条 `[human]` 逐条过人）
>
> 格式定义见 [`templates/plan.md`](../templates/plan.md)，解析器见 04-plan。
> 本文件同时是 L8/L9 之外的第三个真实解析样本——它自己必须能被 `parsePlan` 吃下去。

## 目标

一套三窗口协作工作流，`pi install` 装进任意项目，把「AI 谎报完成」堵在机制层。
成功 = 在一个新建的空项目里，从零接入并跑通一个里程碑的完整流转（分发 → 开发 → FAIL → 修 → PASS → 人工放行）。
不做：第二个执行适配器（CI / 单窗口自动化）、wayfinder 票系统、S/L 档位、契约版本机制、独立合规检查器。

**提交纪律（M1–M6 手工期）**：每里程碑**至少**三个 commit——测试（全红，证明断言未迁就实现）／实现（全绿）／文档收缩（D-06）。
那三个是**顺利路径断言**，不是提交纪律本身；真正的纪律是 D-45（一个提交一件事），且 **D-45 覆盖固定数**（D-46）。
所以：修复轮各自一个 commit，人工放行凭证另一个。M1 实际走了 5 个（三轮返工），不是违纪。
不 commit 红的实现。M6 之后 commit 权移交 tester `/pass`（见未决 P6）。

> 当前形态的已知缺口：三个提交的产出物分别对应 tester / dev / arch，**但一人扮三角色，没有上下文隔离**。
> 我写的测试在判我写的实现，这正是 D-01 要防的形状。M3 发生过两回（tester.md 超一行、
> gatePass 文档冲突），两次都是自己发现自己定，没有第二双眼。真实形态下前者该是 tester 报 FAIL
> 给 dev，后者该是 dev 发 escalation 给 arch 由人裁决。**这个缺口到 M6 三窗口跑起来才能补**，
> 它的验收点就是 M6 那条 `[human]`。在那之前这是已知、且当前形态下无法修的。

**复用老仓库**：可近乎逐字照抄的部分已逐项列在 [`docs/inherited/reuse.md`](inherited/reuse.md)，实现时先查那份清单再动手写。

## 里程碑 M1 通道层可用 ✅

### 断言

- [auto] `npm test -- tests/channel` 全绿，且用例文件恰好覆盖 C1–C8（8 个约束、10 个文件）
- [auto] 存在 `src/channel/{paths,atomic,state,inbox,watch,counters,index}.ts`
- [auto] `grep -rln "writeFileSync" src/ | grep -v "channel/atomic.ts"` 无输出（**注释也算违反**：扫源码文本不解析 AST，因为改名时 grep 不到注释里那个）
- [auto] `grep -rln "to-dev.json\|to-arch.json\|to-tester.json\|to-human.json" src/ | grep -v "channel/paths.ts"` 无输出（同上，注释也算）
- [auto] `npm test -- tests/channel` 进程在 30 秒内自行退出（`Stop` 真的关掉了定时器）
- [human] 拔掉 `fs.watch` 后，在真实 pi 进程的窗口里投一条消息，不碰键盘，等它被轮询处理（≥10s）。日志里要有明确的轮询触发标记，不是 mock 定时器凑出来的 —— C1 验函数行为，这条验真实事件循环里 `setInterval` 没被饿死

### 涉及

- `src/channel/`、`tests/channel/`
- `src/protocol/{routes,message}.ts` —— **仅** `ROUTES` 表与类型定义；`build` / `validate` / schema 生成属 M2，M1 不写
- （上一行的方向是依赖图告诉我们的：01-channel 从 02-protocol `import type`，C8 要比对 `ROUTES[type].to`。写本文时只看了「M2 依赖 M1」这一个方向，漏了类型侧的反向依赖。C8 的校验在 M1 就是一行比对，M2 再收进 `validate`）

## 里程碑 M2 协议表驱动路由 ✅

### 断言

- [auto] `npm test -- tests/protocol` 全绿，含 P1–P5
- [auto] P1 遍历 `ROUTES` 全部 9 条，逐条断言消息落在 `ROUTES[type].to` 对应的收件箱文件
- [auto] `npm run docs:protocol` 重跑后 `git diff --exit-code` 无输出（生成物与表一致）
- [auto] `grep -rn 'to: "\(arch\|dev\|tester\|human\)"' src/ | grep -v protocol/routes.ts` 无输出
- [auto] `grep -rn "buildMessage\|routeValidate" tests/` 无输出 —— M1 的临时 fixture 函数已换成 `import { build }` / `import { validate }`（本条是那两个函数的唯一机制落点：它们不是未决（已定怎么做）、不靠谁记得）

> 本里程碑无 `[human]` 断言：原有一条「开真窗口看 dev 的 send_task 里没有 arch」已挪到 M6——
> `send_task` 工具在 07-adapter 才注册，而它与 M6 那条「真开三窗口」看的是同一个东西（LLM 实际收到的工具面）。

### 涉及

- `src/protocol/`、`tests/protocol/`

### 依赖

- M1

## 里程碑 M3 配置与规约 ✅

### 断言

- [auto] `npm test -- tests/config tests/roles` 全绿，含 G1–G7、R1–R6
- [auto] G5 区分两种情况：`test: null` → 诊断级别 `info`；`test` 字段缺失 → `fatal`
- [auto] G2 断言配置语法错时 `cfg === null`（不是 `{}`）
- [auto] `src/roles/{arch,dev,tester}.md` 三份文件存在（拆自下一条：文件缺失与内容超标红因不同，混在一条里看不出区别）
- [auto] `wc -l src/roles/*.md` 每份 ≤ 40 行（老仓库三份 SKILL 是 72/81/89，涨的全是流程说明与项目事实）
- [auto] `grep -rn "<[A-Z_]\{2,\}>" src/roles/` 无输出（规约零占位符——项目事实只从 config 注入）
- [auto] G7 用 `templates/wf.config.json` 本体作输入，`inspectConfig` 零 fatal 零 warn（模板即可运行示例；镜像 M4.L8。补的是「声称有示例而无人读它」这个 D-02 形状）
- [auto] R3/R5 用 fake event 测纯函数 `buildSystemPrompt(role, notes, base)`：返回值以 base 开头（是追加不是替换）；特征串缺失时能被检出。真正挂到 `before_agent_start` 属 M6
- [human] 三份规约读起来是「你是谁」而不是「系统怎么工作」 —— 老仓库 242 行里一半是流程说明，这个膨胀无法用行数以外的方式检测，我得自己读一遍

### 涉及

- `src/config/`、`src/roles/`、`tests/config/`、`tests/roles/`

### 依赖

- M1

## 里程碑 M4 规划书解析

### 断言

- [auto] `npm test -- tests/plan` 全绿，每个用例文件名对应一条语法条目（L<n>）
- [auto] L8 用 `templates/plan.md` 本体作输入，解析成功
- [auto] L9 用 `tests/fixtures/paper/paper-plan.md`（老仓库真实规划书副本）作输入，解析失败且错误含行号
- [auto] 本文件（`docs/plan.md`）能被 `parsePlan` 解析成功，且解出 6 个里程碑
- [human] 用本语法重写一次某个里程碑的断言，全程语法自洽：出现任何「不得不绕过语法、用自然语言糊过去」的地方即判 FAIL

### 涉及

- `src/plan/`、`tests/plan/`、`tests/fixtures/paper/`

### 依赖

- M1

## 里程碑 M5 拦截链

### 断言

- [auto] `npm test -- tests/gates` 全绿，含 T1–T10
- [auto] T10 用老仓库四份真实 `test-report-M*.md` 副本作输入，四份全部 block
- [human] 拦截提示读起来知道下一步该干什么 —— 这是 dev 4/4 与 tester 0/4 的唯一差别来源，措辞质量决定纪律是否被遵守

### 涉及

- `src/gates/`、`tests/gates/`、`tests/fixtures/paper/`

### 依赖

- M2, M3, M4

## 里程碑 M6 三窗口跑通

### 断言

- [auto] `npm test -- tests/adapter tests/e2e` 全绿，含 A1–A9 与 E1（E1 = `tests/e2e/` 的完整一圈，规格见 07-adapter 验收节）
- [auto] A9 前半：`grep -rn "@earendil-works/pi-coding-agent" src/ | grep -v "import type"` 无输出 —— 本条的意思是「pi 在 `src/` 里只以类型存在」，`import type { ExtensionAPI }` 是允许的、被禁的是值导入（常量、工厂函数、任何有运行时的东西）
- [auto] A6 断言 `extensions/*.ts` 各 ≤ 30 行、`src/adapter/wire.ts` ≤ 120 行
- [auto] A4 遍历 `flow.ts` 状态表全部 9 个 type
- [human] dev 窗口的 `send_task` 工具面里看不到 `arch` 这个投递目标（**M2 移入**）—— P2 验的是 schema 对象的内容，而 LLM 看到的是 pi 序列化后的工具描述，中间可能丢字段、变形、截断。schema 按角色生成是「越权在类型层不可能」的全部依据
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
- P5 M6 那条人工断言用什么任务来跑 —— [human] 归我 —— 前置：无
- P6 commit 权从手工移交 tester `/pass` 的分界点 —— [human] 归我 —— 前置：P5
- P7 宪法 30 条迁入后进不进每轮读序 —— [human] 归我 —— 前置：无
  （触发器：宪法迁入那天。倾向是**不进**——它管「实现别踩坑」，正确读法是按区域按需读，
  那样「读序翻倍」这个担心就不存在。设计已定：D-48 一条一条生效；安全网已在：
  `check:disciplines` 第三项查「声称的机制真存在且已接线」）

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
