# 模块 07：adapter（三个薄扩展）

> **职责一句话**：把前六层接到 pi 上——挂事件、注册工具、跑拦截链、推进状态。
> **依赖**：全部下层 + pi。**这是唯一 import pi 的一层。**
> **读者**：要改「什么时候发生什么」的人。
>
> 老仓库对应物：`extensions/{arch,dev,tester}-agent.ts`，共 976 行。业务判断和接线混在一起。

## 为什么它必须薄

老仓库三个扩展各 300 行左右，里面混着：拦截判据、消息构造、状态计算、提示文案、git 调用、里程碑 id 推断。于是「改一条判据」要在三个文件里找，而「这条判据到底是什么」没有唯一答案。

本层的约束是硬性的：**看不到任何业务判断。** 判据在 05-gates，消息在 02-protocol，状态在 01-channel。适配器只做四件事——查表、挂钩子、转交、推进。

目标行数：**三个文件各 120 行以内**（老仓库 295/283/398）。这个数字不是审美，是可验证的抗腐化指标（见验收 A6）。

## 目录

```
src/adapter/
├── wire.ts        三个角色共用的接线逻辑（差异全在数据里）
├── status.ts      /status 与启动简报（唯一「给人看」的地方）
├── flow.ts        状态流转：收到什么 → 状态怎么变 → 下一步是谁
└── index.ts

extensions/
├── arch.ts        pi 入口，各 ~20 行：读 WF_ROLE，调 wire()
├── dev.ts
└── tester.ts
```

`extensions/*.ts` 是 pi 的发现入口，薄到只有一句 `wire("arch", pi)`。真正的内容在 `src/adapter/wire.ts`，三个角色共用同一份代码，差异全部来自 02-protocol 的路由表和 05-gates 的拦截链表。

## 角色激活

```ts
const KNOWN = ["arch", "dev", "tester"] as const;
const role = process.env.WF_ROLE ?? "";

if (!KNOWN.includes(role)) {
  if (role !== "") {
    // 设了但不认识 —— 这是那个半天排查的事故
    console.warn(`⛔ WF_ROLE=${JSON.stringify(role)} 不是已知角色（${KNOWN.join("/")}）。本窗口未激活任何角色。`);
  }
  return;
}
```

`JSON.stringify` 是关键——`WF_ROLE=arch ` 带尾随空格时，打出来是 `"arch "`，空格可见。

老仓库这里是 `if (ROLE !== "arch") return;`，静默。那次事故的全部症状是「窗口开着但没有就绪通知」，排查半天，而且最后归因还错了一半（同时还有 `--skill` 路径错，两个静默故障叠在一起）。这是老仓库宪法里唯一标注「记录了但没修」的条目。

## 四个钩子

```
session_start        → 启动简报（status.ts）+ 就绪通知
before_agent_start   → 注入角色规约（06-roles）
tool_call            → 跑拦截链（05-gates）
agent_end            → 未投递提醒（双保险第二道）
```

外加 `watchInbox`（01-channel）作为唤醒入口。

### pi 只以类型存在（D-07）

`src/adapter/` 对 pi 的引用只能是 `import type { ExtensionAPI }`。值导入（常量、工厂函数）一律不行，`pi` 与 handler 拿到的 `ctx` 必须一路作为参数传进来，**不得存进模块作用域**。

理由不是可测试性这种空话：模块级可变状态一出现，三个角色同进程加载时就共享同一份，`tests/e2e` 整条路不成立。而这一条是事后补不回来的——mock-pi 需要哪几个 API 可以到 M6 再读 `wire.ts` 写出来，注入缝不行。守它的是 A9。

### tool_call：查表跑链

```ts
pi.on("tool_call", (event) => {
  if (event.toolName !== "send_task") return;
  const chain = CHAINS[`${role}:${event.input.type}`];
  const r = runChain(chain, { root, cfg, plan, milestone, input: event.input });
  if (!r.ok) return { block: true, reason: r.reason };  // r.failedGate 可进 reason 后缀
});
```

七行，没有任何 `if` 判断具体的 gate。加一道 gate 只改 `CHAINS` 表，不动这里。

### agent_end：双保险第二道

任务被唤醒处理了，但 LLM 停下来时还没投递 → 提醒它。

第一道保险是 `tool_call`（投递时产出没写就拦），第二道是这里（产出写了但忘了投递）。两道合起来覆盖「空产出」和「忘交接」。

## 状态流转

`flow.ts` 是一张表加一个函数。**这里是整套东西里唯一的状态机，而且它是确定性的——不交给 LLM 判断**（老仓库 L14：arch 闲是设计不是浪费）。

| 收到 | 状态变化 | 副作用 |
|---|---|---|
| `task_assignment` | `round = 1, fails = 0`，存 `assertionHash` | dev 被唤醒 |
| `verification` | 不变 | dev 被唤醒（arch 要求核对/补证，不重置轮次） |
| `review_request` | 不变 | tester 被唤醒 |
| `fix_request` | `round += 1, fails += 1` | dev 被唤醒；`fails >= maxRounds` → 转发 `stuck` 给人 |
| `verdict_pass` | 不变 | 写 `to-human.json`，`/status` 开始提示待人工 |
| `milestone_passed` | `round = 1, fails = 0` | 清 `to-human.json`；可选 git commit |
| `escalation` | 不变 | arch 被唤醒 |
| `report` | 不变 | 写 `to-human.json`（无 milestone 上下文）；`/status` 提示待读 |
| `stuck` | 不变 | 写 `to-human.json`；`/status` 提示连续失败请人介入 |

**阈值升级**：同一 issue id 累计 ≥3 轮 → 自动发 `escalation` 给 arch。计数走 01-channel 的 `bumpCounters`（落盘，重启不丢）。

判据是「实现问题反复出现 = 疑似架构假设错了」。这条完全机械，不需要谁来判断。

## escalation 的形状

这是你要的「断言整理起来交给人审批」。

arch 收到 escalation 时，判断这是不是架构问题。如果它认为**断言本身错了**（原断言蕴含了一个错误的架构假设），它不能改断言（D-15），必须走这条往返：

```
arch 产出 → 往规划书「风险与未决」追加一段 → 发 escalation 给人
```

那段的固定形状：

```markdown
### 风险与未决

- **M1.3 断言疑似有误**（R4 提出）
  - 原断言：[auto] `npm test -- channel` 全绿
  - 反复失败：M1-002 已连续 3 轮（R2/R3/R4）
  - arch 判断：断言假设了 fs.watch 可测，但 Windows 下它不可靠 —— 这是架构假设错误，不是实现问题
  - 建议改为：[auto] 禁用 fs.watch 后轮询在 10s 内触发
  - 待人裁决：改断言 / 改实现 / 拆里程碑
```

四段：原断言、失败证据、arch 的判断、建议 + 三个选项。

给人的 escalation 消息里带这段的引用（`refs`），并在 `/status` 里常驻提示。**人改完断言，arch 才能重新分发**——因为分发时 `assertionHash` 与 state 里存的不一致，说明人动过了，这是合法的（反过来 arch 自己改则不合法，这是 D-15 未来机制化的钩子）。

多一次往返，换到的是断言源不被产出链修改。

## bootBriefing（唤醒提示）

03-config 说项目事实走「唤醒提示」注入，注入点定义在这里——**不是规约，不是 SKILL**。

```ts
// status.ts
export type BootContext = {
  root: string;
  role: Role;
  cfg: Config;           // fatal 时仍可用 cfg.plan 等已知字段，或整段省略
  state: State;
  plan: Plan | null;     // 解析失败时为 null，简报只报诊断
  milestone: Milestone | null;
  diagnostics: Diagnostic[];
};

// session_start 与 watchInbox 唤醒共用。项目事实只从这里出：
// plan 路径、source 路径、当前 milestone id、断言编号列表、frontier 摘要、fatal/info 行
export function bootBriefing(ctx: BootContext): string;
```

`watchInbox` 收到消息后，在 `bootBriefing` 之上追加「你收到了什么 type、该干什么」——**断言编号清单从 `milestone.assertions` 生成**，与 G-artifact 判据同源，不写回 06-roles。

## /status 与启动简报

**这是全套唯一「给人看」的输出，所以 D-30 全落在这里。**

```
M2 R3  失败 1/5
├─ ⏳ 待你判定：M2 已报 PASS，2 个问题等你答（读 wf/test-report-M2.md）
├─ 未决 3 条：1 条你能定 / 1 条查回来了 / 1 条被前置卡着
└─ ⚠ 自动验证已关闭（config.test === null）
```

四行，每行都是「不看就会漏」的东西：

| 行 | 来源 | 为什么在这 |
|---|---|---|
| 状态 | 01-channel `readState` | 里程碑/轮次/失败计数 |
| 待人工 | `to-human.json` | D-30：人工关卡不能靠人记得 |
| 未决 | 04-plan `frontier` | **这条是 wayfinder 的平替** |
| 降级提示 | 03-config 诊断 | D-23：空 gate 必须有声 |

第三行是关键：`frontier` 算出 `actionable` / `answered` / `blocked` 的条数。你不需要记「有件事没回来」——开窗口就在眼前。

启动简报 = `bootBriefing` + `wf/handoff-<role>.md` 首行（上一个窗口留的话）+ 最近产出文件名。窗口重启是常态，这是 L0 接管。

## 五个命令

| 命令 | 角色 | 作用 |
|---|---|---|
| `/status` | 全部 | 上面那四行 |
| `/pass <验证了什么>` | tester | 人工放行。空参拒绝（凭证由 02-protocol 必填保证） |
| `/fail <原因>` | tester | 人工驳回 → `fix_request` 回 dev |
| `/role` | 全部 | 打印当前规约（补 `/skill:name` 的缺，见 06-roles） |
| `/doctor` | 全部 | 配置 + 规划书自查（不开三窗口也能跑；定义见 08-dist，**不得自带判据**） |
| `/research` | 全部 | 派查未决表里的 `[auto]` 条目（规格见 08-dist） |

`/pass` 之后可选 `git commit`。非 git 仓库静默跳过——这个「静默」是合法的，因为它是主动降级不是配错（03-config 里同一条判据）。

## 不负责什么

- **不负责判定** —— 全在 05-gates。本层看不到 `{ok, reason}` 的构造。
- **不负责消息格式** —— 全在 02-protocol。本层不出现 `to:` 字面量（P5 会 grep）。
- **不负责文件路径** —— 全在 01-channel 的 `paths.ts`。
- **不负责开窗口** —— 08-dist，而且是人执行（D-33）。

## 已知取舍

**三个入口文件重复。** `extensions/{arch,dev,tester}.ts` 内容几乎一样。不合并成一个，因为 pi 按文件发现扩展，而三个角色需要三份独立的工具注册。二十行重复换来的是「一个窗口只加载自己那份」。

**`watchInbox` 的唤醒是 `sendUserMessage`。** 消息到了就往 LLM 发一段提示。如果窗口正忙，走 `deliverAs: "followUp"` 排队。这意味着**唤醒提示的文案是行为的一部分**——老仓库那些 `请：1. 读... 2. 写... 3. 调用...` 的编号清单不是装饰，它们是 dev 那 4/4 与 tester 那 0/4 的差别来源。所以文案里必须明文列出断言编号（G-artifact 的判据），不能只说「写报告」。

## 验收

```
tests/adapter/
├── A1-role-mismatch.test.ts    WF_ROLE="arch " → 告警含 JSON 表示的实际值
├── A2-role-unknown.test.ts     WF_ROLE=foo → 告警；WF_ROLE="" → 静默（未配是合法的）
├── A3-chain-dispatch.test.ts   各角色各 type 命中正确的链（遍历 CHAINS）
├── A4-flow.test.ts             遍历状态表：收到 X → 状态变成 Y
├── A5-threshold.test.ts        同一 issue 第 3 轮 → 自动发 escalation（跨「重启」）
├── A6-thin.test.ts             三个 extensions/*.ts 各 ≤ 30 行；wire.ts ≤ 120 行
├── A7-status-lines.test.ts     四行都在；未决数与 frontier 一致
├── A8-no-literals.test.ts      grep：adapter 下无 to: "<role>" 与 "to-*.json" 字面量
└── A9-injection-seam.test.ts   pi 在 src/ 里只以类型存在（grep 非 import type 的值导入）；
                               同进程 wire() 三次各传 fake pi → 三份 channelPaths 的 root 互不相同，
                               且 A 的 fake pi 上没收到过 B 注册的工具

tests/e2e/
└── E1-full-circle.test.ts      临时目录 fixture 项目跑完整一圈：分发 → 产出 → FAIL → 修 → PASS
                               → /pass → 回 arch，逐步断言消息落点与状态变化
```

**E1 验的是接线，不是 pi 的真实行为。** 它用同进程 mock-pi 驱动三个适配器，事件时序、
`sendUserMessage` 语义、系统提示注入链都不在其射程内——那是 M6 那条 `[human]`（真开三个窗口）
存在的理由，不能用 E1 顶掉。mock-pi 需要哪几个 API 到 M6 再读 `wire.ts` 写，不提前猜（算不准就是猜）。

**A6 是抗腐化的。** 老仓库这三个文件从简短涨到 976 行，涨的全是本该在下层的判断。行数上限比评审有效——超了就说明有东西放错了层。

**A9 是 e2e 的前提，不是洁癖。** 它两半分工：grep 那半水位线很低（只拦值导入，`import type` 合法），
同进程那半才是真判据：root 互不相同验状态隔离，工具注册不串验注册隔离。两半全绿才能说 M6 的 e2e 能写。

---

**已写模块**：01-channel（已收缩进 `src/channel/`） ｜ 02-protocol（已收缩进 `src/protocol/`） ｜ 03-config（已收缩进 `src/config/`） ｜ [04-plan](04-plan.md) ｜ [05-gates](05-gates.md) ｜ 06-roles（已收缩进 `src/roles/`） ｜ 07-adapter（本文）
**下一个模块**：08-dist（pi package、launch 脚本、澄清入口、research 命令、单实例防重）
