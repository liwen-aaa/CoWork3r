# 模块 02：protocol（消息协议）

> **职责一句话**：定义「谁能给谁发什么」，并让路由、参数 schema、文档三者都从同一张表派生。
> **依赖**：无。纯数据 + 纯函数，不 import 任何模块（包括 channel）。
> **读者**：要加/改消息类型的人。外部观测工具也读本文件（它是消息格式的权威）。
>
> 老仓库对应物：无。协议散在三个 `*-agent.ts` 的 schema、`IF-003` 文档、`CONVENTIONS.md` 台账里，
> 共四份，互相不校验。

## 为什么它是独立一层

老仓库的第一个 bug 长这样：

```ts
// dev-agent.ts 的 send_task.execute
writeMessage({ from: "dev", to: "tester", ... });  // ← to 硬编码
```

而 `params.to` 支持 `"arch"`，`tool_call` 拦截链专门校验了「to:arch 必须带 ticket」，schema 里有 `ticket_result` 这个 type，ADR-0007 决定了这条通道，IF-003 文档记了它，约定台账登记了它，131 项行为验证里有两项测它。

**七处声明这条通道存在，零处让它工作。** `ticket_result` 被投进 `to-tester.json`，arch 永远收不到。

漏掉的原因很具体：所有测试断言的都是「拦截返回了什么」，没有一项断言「消息落到了哪个文件」。而声明分散在七处，没有任何一处是唯一真相源，所以「schema 说能发」和「代码真的发了」之间没有校验点。

所以本层的存在理由不是「整理文档」，是：**让路由无法与声明不一致——因为它们是同一个东西。**

## 目录

```
src/protocol/
├── routes.ts    唯一真相源：路由表（数据，非代码）
├── message.ts   Message 类型 + 构造 + 校验
├── schema.ts    从表生成工具参数 schema（typebox）
└── index.ts     出口
```

## 路由表

一条路由 = 一个 `type`，声明它的合法方向与必填字段。表以外的一切都从它派生。

```ts
export const ROUTES = {
  task_assignment:  { from: "arch",   to: "dev",    requires: ["milestone", "body"], description: "分配里程碑给 dev" },
  verification:     { from: "arch",   to: "dev",    requires: ["milestone", "body"], description: "要求 dev 核对/补证（不改变轮次）" },
  review_request:   { from: "dev",    to: "tester", requires: ["milestone", "body"], description: "开发完成，请求验收" },
  fix_request:      { from: "tester", to: "dev",    requires: ["milestone", "issues"], description: "验收 FAIL，发回修复" },
  verdict_pass:     { from: "tester", to: "human",  requires: ["milestone", "questions"], description: "自动验证通过，等人答 [human] 断言" },
  milestone_passed: { from: "tester", to: "arch",   requires: ["milestone", "evidence"], description: "人工放行，通知 arch 收尾/下一里程碑" },
  escalation:       { from: "tester", to: "arch",   requires: ["milestone", "body"], description: "同问题反复或架构疑点，升级 arch" },
  stuck:            { from: "tester", to: "human",  requires: ["milestone", "body"], description: "连续失败达上限，请人介入" },
  report:           { from: "arch",   to: "human",  requires: ["body"], omit: ["milestone"], description: "状态/收尾报告（无里程碑上下文）" },
} as const;
```

`omit: ["milestone"]` 显式标出与其它 type 不同构——`build` / schema 生成据此不把 `milestone` 当必填；`Message` 上该字段可选。

九条。老仓库是十条，差异见下。

**`to` 由 `type` 决定，不由调用方传。** 这是本层最重要的一条：`deliver()` 的目标地址从表里查，不从参数取。上面那个 bug 在这个形状下不可能出现——`ticket_result` 要么在表里（于是自动路由正确），要么不在表里（于是根本发不出去）。

### 与老仓库的差异

| 变化 | 原因 |
|---|---|
| 删 `ticket_result` | wayfinder 砍掉，票通道不存在了。需要 dev 去查事实时走 08 的 research 命令 |
| `verdict` 参数 → `verdict_pass` type | 老仓库的 PASS/FAIL 是 `send_task` 的参数，导致「同一个 type 有两个目标地址」，只能靠代码里 if 分流。拆成两个 type 后方向唯一 |
| FAIL 直接叫 `fix_request` | 同上，FAIL 本来就是发给 dev 的修复请求 |
| `verdict_pass.requires` 含 `questions` | 人工关卡只问 `[human]` 断言（D-20/D-21）。问题列表为空 = 发不出去 |
| `milestone_passed.requires` 含 `evidence` | 放行必须带人写的凭证，空参拒绝从「命令层校验」上移到「协议层必填」 |

## Message

```ts
type Role = "arch" | "dev" | "tester" | "human";
type MsgType = keyof typeof ROUTES;

type Message = {
  type: MsgType;
  from: Role;          // 必须等于 ROUTES[type].from
  to: Role;            // 必须等于 ROUTES[type].to
  milestone?: string;  // 里程碑 id；report 省略（ROUTES[type].omit 含 "milestone"）
  round: number;
  body: string;
  refs?: string[];     // 相关文件路径
  issues?: Issue[];    // fix_request
  questions?: string[]; // verdict_pass：只有人能答的那几个问题
  evidence?: string;   // milestone_passed：人写的验证凭证
  at: string;          // ISO 时间戳
};

type Issue = {
  id: string;                                  // 如 "M1-001"
  severity: "serious" | "medium" | "minor";
  assertion?: string;                          // 关联断言编号，如 "M1.2"
  description: string;                         // 含定位：文件/行/现象/复现
};
```

`Issue.assertion` 是新增的。它让「问题 ↔ 断言」的映射变成结构化数据，这正是老仓库 ADR-0003 卡在「映射表格式未定义」的那件事——格式定不下来是因为它当时想做成一份独立文档，做成消息字段就没有格式问题了。

## 三个纯函数

```ts
// 构造：自动填 to / at，校验必填。缺字段 → 抛错（不返回 null，构造失败是编程错误）
export function build(type: MsgType, from: Role, fields: Partial<Message>): Message;

// 校验：读到的消息是否合法（外部可能手写 JSON）
export function validate(raw: unknown): { ok: true; msg: Message } | { ok: false; reason: string };

// 查询：某角色能发哪些 type（给 schema 生成和规约渲染用）
export function typesFrom(role: Role): MsgType[];
```

`build` 抛错、`validate` 返回结果，这个不对称是有意的：前者的输入来自我们自己的代码，错了就是 bug；后者的输入来自磁盘，可能被人手动改坏，必须优雅处理。

## schema 生成

`send_task` 工具的参数 schema 由 `typesFrom(role)` 生成。所以：

- arch 窗口的 `send_task` 只看得见 `task_assignment` / `verification` / `report`；
- dev 窗口只看得见 `review_request`；
- tester 窗口只看得见 `fix_request` / `verdict_pass` / `milestone_passed` / `escalation` / `stuck`。

两个收益。一是**越权在 schema 层就不可能**——老仓库靠 `tool_call` 里手写 `if (input.to === "arch")` 拦截 dev 越权，那段代码可以整个删掉，因为 dev 的 schema 里没有那个选项。二是**省 token**：工具 description 与 schema 全量进 LLM 上下文，每个角色只装自己那几条。

dev 只有一个 type 时，`type` 参数可以整个省掉（唯一取值不必让模型选）。这是从表推导的，不是特例。

## 一表四处派生

| 派生物 | 从表得到 | 保证 |
|---|---|---|
| 路由 | `deliver` 查 `ROUTES[type].to` | 不可能发错地址 |
| schema | `typesFrom(role)` + `omit` | 不可能声明未实现的通道；report 不要求 milestone |
| 工具文案 | `ROUTES[type].description` | send_task 各 type 的说明与表同步 |
| 文档 | `npm run docs:protocol` 渲染成表格 | 文档不可能与代码不一致 |
| 状态图 | 同上，渲染 mermaid | 流转图不可能过期 |

老仓库那份 `IF-003` 手写了同样的表格，然后靠人记得同步。这里是生成的——所以**协议文档不进 `docs/`，进 `README` 的一个生成块**，改表就重新生成。

## 不负责什么

- **不负责投递** —— 写文件是 01-channel 的事。本层只说「该写给谁」。
- **不负责状态机** —— 「PASS 之后该干什么」是 07-adapter 的事。本层只管单条消息的合法性。
- **不负责业务判定** —— 任何 `{ok, reason}` 在 05-gates。
- **不负责消息历史** —— 不追加、不审计。

## 已知取舍

**表是硬编码的常量，不可配置。** 有人会想「让接入项目自定义角色和消息类型」。不做，理由是 D-40 第①问：零失败模式驱动。而且角色集合改变意味着 D-01（生产者不能自证完成）的形状变了，那不是配置项，那是另一个工作流。

**`human` 是一个伪角色。** 它有收件箱但没有窗口、没有扩展。`to-human.json` 的作用是让 `/status` 和启动简报能显示「有事等你」（D-30：载体必须在视线路径上）。人不「处理」消息，人通过命令回应。

## 验收

```
tests/protocol/
├── P1-route-target.test.ts      每个 type 的投递落点 == ROUTES[type].to（遍历全表）
├── P2-schema-isolation.test.ts  各角色 schema 只含 typesFrom(role) 的 type
├── P3-required.test.ts          缺必填字段 → build 抛错
├── P4-validate.test.ts          手写坏 JSON → validate 给出可读 reason
└── P5-no-hardcoded-to.test.ts   grep：src/ 下除 routes.ts 外不出现 to: "<role>" 字面量
```

**P1 是本模块存在的理由。** 它遍历全表、逐条断言消息真的落在了目标角色的收件箱里。老仓库缺的就是这一项。

**P5 是防回归的结构性检查。** 那个 bug 的形态是「代码里写了个 to 字面量」，所以就去 grep 它。这类检查很便宜，而且抓的是真实发生过的形状。

---

**已写模块**：01-channel（已收缩进 `src/channel/`） ｜ 02-protocol（本文）
**下一个模块**：03-config（项目事实的唯一落点：字段表、诊断分级、SKILL 去占位符化）
