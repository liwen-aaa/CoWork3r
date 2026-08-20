# 模块 01：channel（通道层）

> **职责一句话**：把「一个角色写下的消息」变成「另一个角色被唤醒并读到它」，且重启不丢、并发不乱。
> **依赖**：只有 `node:fs` / `node:path`。**不 import pi**，不运行时 import 本项目其它模块（类型可 `import type`；C8 需要的 `validate` 由调用方注入）。
> **读者**：要改通道的人 / agent。接入项目的使用者不需要读本文件。
>
> 老仓库对应物：`extensions/lib/agent-lib.ts` 第 1–405 行。行为对，结构是一团。
> 本层是**唯一必须逐条对测**的一层——它的每个设计点都对应一次真实事故。

## 为什么它是独立一层

通道层的每一条约束都来自事故，而且**症状全是「什么都没发生」**：窗口开着但不处理、消息被看不见的窗口吃掉、重启后计数归零、半截 JSON 被静默解析失败。

这类失败没有报错、没有日志、不影响任何 gate。所以它必须：

1. 与业务判断完全隔离（gate 逻辑变更不能碰到这里）；
2. 零 pi 依赖（可在普通 node 进程里直接测）；
3. 每条约束一个测试用例，用例名 = 约束 id。

## 目录

```
src/channel/
├── paths.ts        路径常量与派生（唯一知道文件叫什么名字的地方）
├── atomic.ts       原子写：写 .tmp + rename
├── state.ts        协作状态（里程碑 / 轮次 / 失败计数）
├── inbox.ts        单槽位收件箱：读 / 写 / 条件清空
├── watch.ts        唤醒：fs.watch + 轮询兜底 + 水位标记
├── counters.ts     跨轮计数持久化（问题出现次数等）
└── index.ts        对外出口（只导出下方「对外接口」列出的东西）
```

一文件一件事。`watch.ts` 是唯一有定时器的文件，`atomic.ts` 是唯一直接调 `fs.writeFileSync` 的文件。

## 磁盘布局

```
<项目根>/
├── .pi/messages/            机器状态：人不需要读，进 .gitignore
│   ├── to-arch.json         单槽位收件箱（下同）
│   ├── to-dev.json
│   ├── to-tester.json
│   ├── to-human.json
│   ├── state.json           协作状态
│   ├── .processed-<role>    水位标记（mtime 数字）
│   ├── counters-<role>.json 跨轮计数
│   └── source-baseline.json 生产文件快照基线（由 05-gates 写，本层只提供原子写）
└── wf/                      人要读、要进 git 的记录（见 05-gates / 06-roles）
```

两处分离的判据：**人会读的进 `wf/`，机器水位进 `.pi/messages/`**。老仓库把计数文件混在 `logs/` 里，导致「日志目录」既是产物又是资产，`.gitignore` 说不清。

## 六个设计点（每条 = 一次事故 = 一个测试）

### C1 事件不可靠，必须有轮询兜底

Windows 上 `fs.watch` 会漏事件——消息写进去了，回调不触发，整条流水线静默停住。

所以唤醒是**双通道**：`fs.watch` 给低延迟，`setInterval` 给保底。轮询比对 mtime，不读文件内容，零 token 成本。启动时另跑一次补收（窗口关闭期间到的消息）。

> 不要试图「修好」`fs.watch` 来去掉轮询。轮询的成本是零，漏事件的代价是整条流水线无声停止。

### C2 处理后条件清空

单槽位文件只在投递时被覆盖，所以已处理的消息内容会**留在原地**。重启或水位标记异常时，它会被当成新任务重放。

所以处理完要清空。但**清空前必须比对**：只有当前内容仍是刚处理的那条时才清——否则会误删处理期间刚到的新消息。

两半都是必需的：只清不比对 → 误删并发消息；只比对不清 → 旧消息重放。

### C3 水位标记（`.processed-<role>`）

内存里的「上次处理到哪」重启就没了。所以水位落盘，存 mtime 数字。判定新消息 = `mtime > processed`。

### C4 所有状态写入必须原子

并发窗口同时读写同一文件是常态。非原子写会产生半截 JSON，然后被 `catch` 静默吞掉。

所以一律 `写 .tmp → rename`。这条对 `state.json`、`counters-*.json`、`source-baseline.json`、收件箱全部适用。**只有 `atomic.ts` 能直接调 `writeFileSync`**，其余文件都走它——这样「有没有漏一处」是可以用 grep 检查的。

### C5 跨轮计数必须落盘

「同一问题连续出现 3 轮 → 升级」这类判断依赖跨轮累计。窗口重启是常态不是异常，计数在内存里就等于阈值永远达不到。

### C8 写盘前二次校验地址

`deliver` 写盘前跑一次地址校验：`msg.to` 必须等于 `ROUTES[msg.type].to`，不等则**不写**。

理由不是「防自己写错」，是防腻化：老仓库那个 bug 的形态正是上层代码绕过声明直写错地址，
而七处声明全部正确。让唯一的落盘口自己把一道，上层就没有绕路。

**校验函数由调用方注入，不是 import 进来的：**

```ts
export type Validate = (msg: Message) => { ok: true } | { ok: false; reason: string };
export function deliver(root: string, msg: Message, validate: Validate): DeliverResult;
```

不写 `import { validate } from "../protocol"` 的理由：那是值导入，本层就不再零依赖，
而「可在普通 node 进程里直接测」是本层存在的理由之一。注入后 C8 的测试可以传一个
只认几条路由的 fake，不必等 M2。它与 D-07（pi 只能作为参数进来）是同一个形状。

这不算「通道开始理解消息」：它不知道 `review_request` 是什么意思，只调一个别人给的函数。

### C6 同角色单实例

同一角色开两个窗口 → 两个都在监听同一收件箱 → 消息被你看不见的那个窗口先处理并清空 → 你盯的窗口永远没反应。**这个故障没有任何可见症状。**

本层不解决它（进程管理不是通道的事），但要**知道它存在**：启动脚本负责防重（08-分发），本层的责任是在测试里固定「两个监听者会争抢」这一事实，防止有人以为多实例是安全的。

### C7 覆盖前必须出声

单槽位设计接受「新消息覆盖旧消息」，但**不接受静默覆盖**。`deliver` 写入前若目标收件箱非空（上一条尚未被处理并清空），仍写入（不阻塞），但返回 `overwritten: true`。07-adapter 据此告警——把「可能丢消息」从无声变成可见信号，且覆盖所有同向并发场景，无需在 protocol 层列举哪些 type 互斥。

## 对外接口

只导出这些。其它一律私有。

```ts
// 路径
export function channelPaths(root: string): {
  msgDir: string; wfDir: string;
  inbox(role: Role): string;
  state: string; processed(role: Role): string;
  counters(role: Role): string; sourceBaseline: string;
};

// 原子写（其它模块要落盘 JSON 也走这里）
export function writeJsonAtomic(file: string, data: unknown): void;
export function writeTextAtomic(file: string, text: string): void;

// 状态
export function readState(root: string): State;
export function writeState(root: string, patch: Partial<State>): State;

// 收件箱
export type Validate = (msg: Message) => { ok: true } | { ok: false; reason: string };
// C8：校验函数由调用方注入（实际传 02-protocol 的 validate）。本层不 import 它。
export function deliver(root: string, msg: Message, validate: Validate): DeliverResult;
export function peek(root: string, role: Role): Message | null; // 读不消费
export function clearIfSame(root: string, role: Role, msg: Message): boolean;

type DeliverResult =
  | { ok: true; overwritten: boolean }              // overwritten=true 见 C7
  | { ok: false; reason: string };                 // C8：validate 不过，**未写盘**

// 唤醒
export function watchInbox(root: string, role: Role, onMessage: (m: Message) => void): Stop;

// 计数
export function bumpCounters(root: string, role: Role, ids: string[], threshold: number): string[];
```

`Message` 与 `Role` 的类型定义在 **02-protocol**，本层 `import type` 取用（见 `modules/00-index.md` 类型依赖说明）。只搬运不解释——通道不关心消息是什么意思。`Validate` 同理：本层定义它的**形状**，不知道它的**内容**。

`watchInbox` 返回 `Stop`（一个关掉定时器和 watcher 的函数）：测试里必须能停，否则进程不退出。老仓库没有这个，测试靠进程结束兜底。

## 状态字段

```ts
type State = {
  milestone: string;        // 里程碑 id，如 "M1"。字符串，不是数字
  round: number;            // 当前轮次
  maxRounds: number;        // 上限，缺省 5
  consecutiveFails: number; // 连续失败计数
};
```

一处与老仓库不同：**`milestone` 是字符串，不是数字 + 前缀**。老仓库存数字 `current_milestone: 1` 再靠环境变量 `WF_MILESTONE_PREFIX` 拼回 `"M1"`，于是代码需要「猜」当前里程碑叫什么，猜错就产生 `dev-output-M0.md` 指向 `P0` 这类错位。

**里程碑 id 只从消息或规划书里来，代码不合成。** 因此 `WF_MILESTONE_PREFIX` 这个环境变量整个消失。

## 不负责什么

写清楚这一节，因为误期望都长在这里：

- **不负责定义消息合法性** —— type 枚举与方向表属于 02-protocol。本层只在写盘前调它的 `validate`（C8）。
- **不负责业务判断** —— 任何 `{ok, reason}` 形式的判定都在 05-gates。
- **不负责进程管理** —— 开窗口、防重、单实例检测在 08-分发。
- **不负责队列语义** —— 单槽位就是单槽位：处理慢时新消息会覆盖旧消息，但 C7 会告警（详见「已知取舍」）。
- **不负责历史审计** —— 消息不追加历史。想要审计另开一层，不要往本层塞。

## 已知取舍

**单槽位会丢消息。** 角色 A 连发两条给 B，B 还没处理，第二条覆盖第一条。

接受它，因为实际流转里每个方向同一时刻只有一条在飞（dev↔tester 是严格交替的）。它换来的是：零基础设施、状态一眼可见（`cat to-dev.json` 就是全部）、无需队列/锁/清理。覆盖不再静默——C7 把可能丢消息变成可见信号；真需要排队时见 D-42 升级路径。

**升级触发条件**（对应 D-42）：出现并行里程碑，或同一方向真的需要排队。届时的正确做法是把 `to-<role>.json` 换成目录 + 序号文件，而不是引入消息队列中间件。

**mtime 水位有理论盲区**：同一毫秒内两次写入可能被判为一次。实际写入间隔远大于此，且轮询会在下一周期兜住。

## 验收（测试用例名 = 约束 id）

```
tests/channel/
├── C1-poll-fallback.test.ts     禁用 fs.watch → 轮询仍在 10s 内触发处理
├── C1-startup-catchup.test.ts   启动前已存在消息 → 启动后被处理一次
├── C2-clear-after.test.ts       处理后 inbox 为空
├── C2-clear-conditional.test.ts 处理期间投递新消息 → 新消息不被误清，且恰好处理一次
├── C3-watermark.test.ts         重启后不重放旧消息
├── C4-atomic.test.ts            并发写入不产生半截 JSON；grep 断言只有 atomic.ts 调 writeFileSync
├── C5-counters.test.ts          跨「重启」累计到阈值
├── C6-two-listeners.test.ts     两个监听者 → 消息只被其中一个处理（固定事实，非期望行为）
└── C7-overwrite-warn.test.ts    inbox 非空时 deliver → overwritten=true；空 inbox → false
└── C8-deliver-validate.test.ts  注入的 validate 返回 ok:false → deliver 也 ok:false 且文件**未被写**
```

每个用例在 `mkdtemp` 临时目录里跑，**不得在仓库根写文件**——老仓库早期测试的 `ensureDirs()` 副作用曾污染模板库。

## 与其它模块的边界

| 谁 | 用本层什么 | 不该做什么 |
|---|---|---|
| 02-protocol | 本层 `import type` 它的类型；它的 `validate` 由上层注入进 `deliver`（C8） | 两边都不运行时 import 对方 |
| 05-gates | `writeJsonAtomic` 存基线 | 不直接读写 inbox |
| 07-adapter | `watchInbox` / `deliver` / `readState` | 不自己拼路径、不自己 `writeFileSync` |

**唯一允许知道文件名的地方是 `paths.ts`。** 任何其它文件里出现字符串 `"to-dev.json"` 即为违反——这条可以用 grep 检查，也应该有一个测试去 grep。

---

**下一个模块**：02-protocol（消息协议：`type × from × to` 表作为唯一真相源，路由与 schema 从表生成）。
