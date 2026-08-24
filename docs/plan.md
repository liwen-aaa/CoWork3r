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
不 commit 红的实现。M6 之后 commit 权移交 tester `/pass`——**分界点 = M6 验收通过**（M6-fixes.md 判定 + M6.5 + M6.6 三份人工凭证落盘）之后：dev 按 D-45 自提交（红测试 / 绿实现），`/pass`（verdict_pass）是「该轮产物可落盘」的机械信号、验收凭证随 /pass 落盘提交，arch 收尾做文档收缩提交 + 进度表重生，人只在里程碑边界核查。

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

## 里程碑 M4 规划书解析 ✅

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

## 里程碑 M5 拦截链 ✅

### 断言

- [auto] `npm test -- tests/gates` 全绿，含 T1–T10
- [auto] T10 用老仓库四份真实 `test-report-M*.md` 副本作输入，四份全部 block
- [human] 拦截提示读起来知道下一步该干什么 —— 这是 dev 4/4 与 tester 0/4 的唯一差别来源，措辞质量决定纪律是否被遵守

### 涉及

- `src/gates/`、`tests/gates/`、`tests/fixtures/paper/`

### 依赖

- M2, M3, M4

## 里程碑 M6 三窗口跑通 ✅

### 断言

- [auto] `npm test -- tests/adapter tests/e2e` 全绿，含 A1–A9 与 E1（E1 = `tests/e2e/` 的完整一圈，规格见 07-adapter 验收节）
- [auto] A9 前半：`grep -rn "@earendil-works/pi-coding-agent" src/ | grep -v "import type"` 无输出 —— 本条的意思是「pi 在 `src/` 里只以类型存在」，`import type { ExtensionAPI }` 是允许的、被禁的是值导入（常量、工厂函数、任何有运行时的东西）
- [auto] A6 断言 `extensions/*.ts` 各 ≤ 30 行、`src/adapter/wire.ts` ≤ 140 行
  （120 → 140，人改 2026-08-24：M6-013 agent_end 收尾提醒判定加入后超 120，140 仍薄）
- [auto] A4 遍历 `flow.ts` 状态表全部 9 个 type
- [human] dev 窗口的 `send_task` 工具面里看不到 `arch` 这个投递目标（**M2 移入**）—— P2 验的是 schema 对象的内容，而 LLM 看到的是 pi 序列化后的工具描述，中间可能丢字段、变形、截断。schema 按角色生成是「越权在类型层不可能」的全部依据
- [human] 在一个新建空项目里真开三个窗口，跑通一个里程碑 —— 这是唯一能证明「它真的在运行」的事，mock-pi 永远证明不了

### 涉及

- `src/adapter/`、`extensions/`、`tests/adapter/`、`tests/e2e/`、`launch/`、`package.json`

### 依赖

- M5

### 风险与未决

- **mock-pi 的保真度**：e2e 用同进程 mock 驱动三个适配器，它验的是接线正确，不验 pi 真实行为（事件时序、`sendUserMessage` 语义、系统提示注入链）。这是 `[human]` 那条存在的理由，不能用 e2e 顶掉。
- **空 state 的首个 task_assignment 必崩（2026-08-22 真进程实测，通道级）**：state 里无里程碑时（本仓库 `.pi/messages/state.json` 不存在）arch 发 task_assignment，`guardNoMilestone` 放行后 G_plan 收到 `milestone: null` → `checkMilestone(null)` 读 `m.passed` 崩（`src/plan/parse.ts:317`，实测错误串 `Cannot read properties of null (reading 'passed')`）。根因：`wire.ts` 的 tool_call 只从 state 取里程碑，task_assignment 的里程碑在 `event.input.milestone` 里，没被解析出来传给 G_plan——`guard.ts` 文件头记过同一形状（「M6.6 机器部分执行时」抓到过），但修复只改了 block 语义、没改 null 传递，不完整。测试没抓到：E1 第 68 行预写 `state.milestone="M1"`，绕过了空 state 路径。影响：空项目真开窗口首次分发必崩，M6.6 无法跑。修复方向（派 dev）：tool_call 对 task_assignment 用 `event.input.milestone` 解析里程碑再进链；补一条空 state 分发不崩的用例（或让 E1 首步不预写 state）。
  **arch 判定（2026-08-22 会话）**：实现级故障，不是架构假设错——task_assignment 的 milestone 本就是协议必填字段、就在消息里，错在 wire 层只从 state 取里程碑、没读消息字段。修复已实现（工作区，随 M6 下个提交）：`guardNoMilestone(type, stateM, inputMilestone, plan)` 对 task_assignment 从 `event.input.milestone` 解析里程碑再进链，其余 type 空 state 下 block 并说明；回归防线 = E1 首步不预写 state（改后全绿）。边界定案：`arch:report` 保持 block——判定可接受（空 state 下没有可报告的工作对象，就绪状态由启动简报覆盖；将来需要时 guard 加一行豁免即可）。
- **mock-pi 的 API 清单不预先定**：它等于「wire.ts 碰了 pi 对象上的哪几个方法」，M1–M5 之前写出来是猜。事后补不回来的只有注入缝，那一条已由 A9 钉住（D-07）。
- **注入自检（P1）已接通；断言表是否点名 A9b —— 已定**：P1 查证时点 `specPresent` 无调用点是历史事实（wf/notes/p1-mark.md）；修复轮已闭环——`src/adapter/selfcheck.ts` 挂 `agent_start` + `ctx.getSystemPrompt()` 查特征串、不在则告警，A9b 三用例钉住行为（正常不告警 / 整份替换告警且含角色 / 角色区分），真进程复测过。**arch 判定：不补新断言**——A9b 在 M6.1 的 `npm test -- tests/adapter` 目录范围内，M6.1 已覆盖；再补一条 grep 断言属 D-40 ②问里的「保护自证」（用户能力已由 A9b 保护：规约被替换时窗口正常、工具在、仅模型不知道自己是谁——这个静默症状现在会被检出）。残余小事：R5 头注释「M6 负责把它挂到 agent_start 上并接 notify」已兑现，建议改为指向 A9b（一句话，随下次提交）。
- **schema↔gates 一致性测试缺口（M6-003 修复方向未全落）**：tester 的 M6-003 修复方向含「补 schema 生成属性集合 == gates 消费字段 的校验测试」，修复轮未加（`grep artifact tests/` 仅 E1 与 gates 侧命中）。现状：`FIELDS` 与 union 基础集已含 artifact（可选字段），真进程复测投递成功——**通道已通，不阻塞修复轮判定**。但若将来从 `FIELDS`/union 删掉 artifact，无自动化测试会红（E1 直调 execute 绕过 schema 校验、fakePi 不校验参数）。建议补一条测试：用真实 `sendTaskSchema(role)` 断言 dev/tester 的 schema 属性含 artifact，顺带让 E1 走 schema 校验路径（D-25）。归人定：补进修复轮（派 dev）或接受为已知风险。
- **agent_end 提醒的 followUp 自循环（2026-08-22 真进程实测，通道级）**：state 有里程碑后，agent_end 每轮发 followUp 提醒「本轮结束请调 send_task 投出去」，而 pi 的 `sendUserMessage` **总是触发新回合** → 提醒 → 新回合 → 再提醒 → 三窗口全卡死（本仓库 arch 投 task_assignment 后实测）。根因：提醒钩子没防 followUp 自触发。修复（工作区，随 M6 下个提交）：agent_end 检查本轮消息流——已调过 send_task（含被 block 的尝试）或本轮就是上一条提醒触发的回合（user 消息带「wf: 本轮结束」文案）→ 不提醒；LLM 看过一次提醒就够，第二轮回合不再发，循环必停。回归防线：A9c 五用例（提醒正面行为 / 投完不追着问 / 提醒不重复=循环停止条件 / 无工作对象不提醒 / 无会话窗口不提醒）。
  **arch 判定（2026-08-22 会话）**：实现级故障，不是架构假设错——三窗口架构与「未投递提醒」本身都对，错在提醒的触发条件没考虑 `sendUserMessage` 的副作用（总触发新回合）。修复已实现（工作区未提交，全绿 41 passed 含 A9c，D-41 第九次审已落盘）。**流程备注**：A9c 是 tester R4 判定（02:33，36 passed）之后引入的未提交改动，不在 R3 问题清单里——它是 R4 后真进程复测逮到的第四个通道级问题；随修复轮提交并纳入复验范围。
  **真进程实证（2026-08-22 本轮会话）：A9c 修复失效，死循环仍在烧。** 修复后收到第二条「本轮结束」提醒（预告过的观测点命中）。根因：`agent_end` 的 `event.messages` 里 followUp 投递的 user 消息 content 是**数组形态** `[{type:"text", text:"…"}]`——pi 源码 `dist/core/agent-session.js` 的 `_queueFollowUp` 构造 `content = [{type:"text", text}]`（约 1048 行）——而 A9c 检查 `typeof m.content === "string" && m.content.startsWith("wf: 本轮结束")` 只认 string → 数组漏判 → sent=false → 每轮 agent_end 必再提醒。**A9c 用例③的 mock 用 string content 是错误假设**（D-25：mock 与真实结构脱钩，测试绿、真实链路断——与 M6-003/E1 绕 schema 同形状）。修复方向（已派 dev）：wire.ts 的 user 文本提取兼容 string 与数组两形态；A9c 用例③改真实数组形态；修后真进程复测循环停。
- **唤醒链路缺失（M6-010 [serious]；2026-08-22 M6.6 真跑实测，通道级）**：`watchInbox`（01-channel 的 fs.watch + 10s 轮询兜底）在 `src/adapter/` **零调用**——`grep -rn "watchInbox" src/` 仅命中注释（channel 定义 + status.ts:11）。`git log -S "watchInbox(ctx.cwd" -- src/` 为空——**从未接线过**，不是回归删除。`src/adapter/status.ts:11` 注释：「wire 的 session_start / **watchInbox** 共用同一份」——设计上 wire 应启动 watchInbox，实现没做（D-02 的精确形状：写了但没接线，且无机制抓）。后果：消息落盘 → 无任何通知 → pi agent 只在收到 user 消息时跑 → 窗口永远等不到消息，全靠人踢。**M6.6 自动成环在机制上不可能成立**，判据 1（无静默故障）不成立。为什么测试没抓到：E1 / mock-pi 全部直调驱动（emit 事件、直调 execute），唤醒是「消息落盘 → 窗口收到通知」这条真实路径，mock 完全绕过——这正是 M6.6 [human] 断言存在的理由。
  **arch 判定（2026-08-22 会话）**：实现级故障，不是架构假设错——watchInbox 在 channel 层存在且有测试（C1/C2/C3/C6），错在 adapter 层从未接线；断言二本身是好的（它抓到了 mock 抓不到的唤醒路径缺失），**断言不需要改**。修复方向（已定，派 dev）：① wire() 在 session_start 接线 `watchInbox(ctx.cwd, role, (msg) => pi.sendUserMessage(...), { onWake: 打印 poll/event/catchup 触发源 })`——onWake 日志是 C1 人工断言的观测点；② 句柄跨事件持有：`Map<root, Stop>`（keyed by root，满足 D-07 的 root 隔离判据）或挂 pi 的 session 生命周期（待查 SessionStartEvent ctx 挂载点）；③ 补测试：fakePi 触发 session_start → 投真实消息进收件箱 → 断言 sendUserMessage 被调 + 触发源日志；E1 增补「消息到达 → 窗口被唤醒」（D-25 真实落盘路径）；④ 修完重跑 M6.6，**全程不注入**观察——判据 1/3 的本意。
- **FAIL 演练依赖人注入剧本（M6-011 [medium]；2026-08-22 M6.6 真跑实测）**：M6.md 步骤 5 要求 dev 第一版「故意不含 ok」以触发 FAIL，但 arch→dev 的 task_assignment 是自动流转，arch 不会自发写「请故意犯错」。实测 dev 两次都忠于 plan 断言写了含 ok 的内容——FAIL 演练只能靠人向 arch 窗口注入剧本才触发，不是可自动执行的验证项。这不是产品缺陷，是演练方法的限制。
  **arch 判定（2026-08-22 会话）**：实现与断言均无误，问题在演练设计——「让 dev 故意写错」与「dev 忠于断言」天然冲突。建议改法（归人定，三选项）：① 改为真实缺陷触发 FAIL（不预演：把 M6.6 实测中真实出现的缺陷作为验收输入）；② 移除 M6.md 步骤 5——fix_request 通道已由 R5 在本仓库真窗口验过，M6.6 只验主链路自动成环（推荐：最省且通道验证需求已满足）；③ 接受「FAIL 演练不纳入 M6.6 验收范围」为已知边界。
- **M6 收尾定案（2026-08-23，验收通过）**：R3 escalation（M6-001/M6-003）追溯确认闭环——M6-001 已由 selfcheck.ts 挂 agent_start + A9b 钉住（P1 定案「能发现」），M6-003 已由修复一 + M6-004（routes requires 加 artifact + P2 一致性测试）钉住；M6-010 唤醒链路已闭环（6b0dc82 红 + 974ed40 绿，A9d/E1 回归防线，M6.6 第二轮重跑 PASS）；schema↔gates 一致性缺口已闭环（M6-004 P2 用例：删 FIELDS/union 字段即红）；M6-011 按选项②形态执行（重跑无 FAIL 演练、纯主链路自动成环，判据 1–4 全过），书面选项确认归人（to-human.json 已记录）。

## 未决

- P1 规约注入被后续扩展替换掉时，MARK 自检能不能真的发现 —— **已定案**：查证时点结论「当前不能」已被修复轮推翻——`src/adapter/selfcheck.ts` 挂 `agent_start` + `ctx.getSystemPrompt()`，A9b 三用例钉住行为（能发现） —— [auto] 已回 → wf/notes/p1-mark.md —— 前置：无
- P2 pi 的 `before_agent_start` 在 `--print` 模式（无 TUI）下是否照常触发 —— **已定案**：照常触发，结论被采纳（print 模式扩展照常运行、agent 事件链完整；wire 的 `ctx.mode` 守卫是对的行为，不是绕过）；解锁 P3 —— [auto] 已回 → wf/notes/p2-pi-before-agent-st.md —— 前置：无

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
