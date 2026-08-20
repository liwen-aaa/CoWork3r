# 模块 06：roles（角色规约）

> **职责一句话**：给每个窗口装上「你是谁、你能干什么、你不能干什么」，并保证它真的在上下文里。
> **依赖**：03-config（取 `roleNotes`）；`before_agent_start` 事件由 07-adapter 转交。
> **读者**：要改角色行为的人。
>
> 老仓库对应物：`templates/skills/_template-{architect,dev,tester}/SKILL.md`，三份共 242 行，
> 含 21 个占位符。本模块把占位符降到 0，并改变加载方式。

## 为什么不用 pi skill

pi 的 skill 机制是**渐进披露**：只有 description 常驻 system prompt，全文靠模型自己决定去 `read`。pi 文档自己写了 "models don't always do this"。

角色规约要的恰恰相反——它必须**永远在上下文里**，不能靠模型自觉去加载。这不是 skill 机制不好，是语义不匹配：skill 是「需要时查的手册」，规约是「你是谁」。

第二个理由是隔离。三份 skill 在三个窗口都可发现，dev 看得见 tester 的规约。而 D-01（生产者不能自证完成）依赖的正是两个上下文互不知情。

第三个理由是那个真实事故。老仓库的链条是：`bat 里的 --skill 路径` → `.pi/skills/<项目>-<角色>/` 目录，两处必须字符级一致。`paper-arch` vs `paper-architect` 差三个字母，扩展静默失活，排查半天还归因错了一半。如果规约由扩展自己按 `WF_ROLE` 加载，**选规约的和激活扩展的是同一个变量，结构上不可能错配**（D-03）。

## 加载方式

```
src/roles/
├── arch.md      规约本体（静态，零占位符）
├── dev.md
├── tester.md
├── inject.ts    读文件 + 拼 roleNotes + 注入 + 自检
└── index.ts
```

`inject.ts` 在 `before_agent_start` 里做三件事：

```ts
// 1. 按 WF_ROLE 读一份规约（不是三份）
// 2. 末尾追加 cfg.roleNotes（如果有）
// 3. 返回 systemPrompt: event.systemPrompt + "\n\n" + spec
```

**追加，不替换。** pi 文档明确这个钩子是链式的：`event.systemPrompt` 反映截至当前 handler 的结果，后续 handler 还能再改。

## 注入自检（D-02 的自用）

风险是别的扩展返回一个不含 `event.systemPrompt` 的全新字符串——那是替换而非追加，我们的规约就被吃掉了，而且**没有任何症状**：窗口正常、工具在、只是模型不知道自己是谁。

所以不去查「今天装的扩展会不会这么干」（查了也只对今天有效），直接按会发生设计：

```ts
// 规约末尾埋一行特征串
const MARK = "<!-- wf-role-spec:${role} -->";

// agent_start 里检查它还在不在
pi.on("agent_start", (_e, ctx) => {
  if (!ctx.getSystemPrompt().includes(MARK)) {
    ctx.ui.notify(`⛔ ${role} 规约未进入 system prompt——可能被其它扩展替换。本窗口行为不可信。`, "error");
  }
});
```

这正是 D-02 的用法：把「应该在」变成「不在就吵」。

## 规约里写什么

老仓库三份 SKILL 混了三类东西。分开：

| 类 | 例子 | 该在哪 |
|---|---|---|
| 角色行为 | 「没有测试文件 = 自动 FAIL」 | ✅ 规约 |
| 项目事实 | 「规划书在 docs/plan.md」 | ❌ config，运行时注入唤醒提示 |
| 流程说明 | 「消息怎么投递、extension 会自动唤醒对方」 | ❌ 删掉——工具 description 已经说了 |

第三类是老仓库最大的浪费：三份 SKILL 各花二三十行讲消息系统怎么工作，而模型只需要知道「调这个工具」。工具 description 全量进上下文，讲两遍是纯付费重复（D-04）。

三份规约的目标长度：**各 40 行以内。** 老仓库是 72/81/89。

### 每份规约的固定结构

```markdown
你是<角色>。

## 你判什么 / 你不判什么
<这个角色的判定权边界。arch：里程碑边界；dev：实现；tester：验收>

## 你的产出
<必须写什么文件、必须调什么工具>

## 铁律
<不可越界的几条>

## 禁止
<明确不做的>

<!-- wf-role-spec:<role> -->
```

`roleNotes` 追加在特征串**之前**。

## 三份规约的要点

### arch

- **判定权**：里程碑边界。启动、收尾、异常升级。
- **不判**：dev↔tester 循环里的任何东西（那是确定性逻辑，不交给 LLM——老仓库 L14）。
- **不能改断言**（D-15）。认为断言错了 → 往规划书「风险与未决」写清该怎么改 + `escalation` 升级给人。
- **可以改**：里程碑状态标记、未决表、风险节。
- 收到 escalation 时的产出形状定义在 07-adapter。

### dev

- **判定权**：实现方式。改哪些文件、怎么写。
- **不判**：完成与否（D-01）。
- **铁律**：只做与任务直接相关的改动；修 bug 时相关性由根因定义；大重构先说方案；环境即边界（D-32）。
- **产出**：每条断言一行结论（G-artifact 会查编号覆盖）。

### tester

- **判定权**：验收。
- **最高规则**：没写测试 = FAIL。
- **报 PASS 时必须给出这个里程碑全部 `[human]` 断言作为给人的问题**（G-human 会查覆盖）。
- **不改生产代码**——只写测试。
- **不判**：`[human]` 断言的答案（那是人的事）。

## 单窗口降级

只开 dev、人扮演 arch 与 tester 时，规约文件仍然是三份可读的 markdown。人可以直接打开 `src/roles/tester.md` 照着做。

这是不用 pi skill 的代价里唯一真实的一项（跨 harness 可移植性），补法就是**保持它们是标准 markdown**，不引入任何私有语法。想给 Claude Code 用，加个 frontmatter 就是合法 SKILL.md。

## 不负责什么

- **不负责项目事实** —— 一个字都不写，全走 03-config。
- **不负责工具说明** —— 工具怎么用看 description。
- **不负责纪律兑现** —— 规约里写的东西如果没有对应 gate，它就会被跳过（D-02）。所以规约里每条铁律都应该在 `disciplines.md` 里有一行，落点写清是 gate 还是「规约」。

## 已知取舍

**每轮都注入。** `before_agent_start` 每轮触发，所以规约每轮拼一次。system prompt 本来每次请求都发全量，不累积、不额外花钱。但想改成「只第一轮注入」做不到——`session_start` 没有 systemPrompt 口。接受。

**放弃 `/skill:name` 强制加载。** 补法是注册一个 `/role` 命令打印当前规约，一行代码。

**放弃 `pi config` 里单独禁用规约。** 用户想禁用就禁用整个扩展。这个粒度损失是可接受的——规约和扩展本来就该同生共死。

## 验收

```
tests/roles/
├── R1-static.test.ts        三份规约不含 < 大写占位符 >（与 G6 同判据，两处都测）
├── R2-role-isolation.test.ts WF_ROLE=dev 时只读 dev.md，不读另两份
├── R3-append.test.ts        返回值以 event.systemPrompt 开头（是追加不是替换）
├── R4-notes.test.ts         roleNotes 出现在特征串之前
├── R5-mark-check.test.ts    模拟 systemPrompt 被替换 → notify error
└── R6-length.test.ts        每份 ≤ 40 行（超了说明混进了非角色行为的东西）
```

**R6 是防膨胀的。** 老仓库三份 SKILL 从最初的简短版本涨到 242 行，涨的全是流程说明和项目事实。一个行数上限比任何评审都有效。

---

**已写模块**：01-channel（已收缩进 `src/channel/`） ｜ 02-protocol（已收缩进 `src/protocol/`） ｜ [03-config](03-config.md) ｜ [04-plan](04-plan.md) ｜ [05-gates](05-gates.md) ｜ 06-roles（本文）
**下一个模块**：07-adapter（三个薄扩展：接线、状态流转、escalation 形状、`/status` 与启动简报）
