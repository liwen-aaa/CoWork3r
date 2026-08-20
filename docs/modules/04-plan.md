# 模块 04：plan（规划书解析）

> **职责一句话**：把一份人写的 markdown 变成结构化断言，让四个读者（arch / dev / tester / gate）绑同一份东西。
> **依赖**：`node:fs`。不 import 其它模块。
> **读者**：要改断言语法的人。写规划书的人读 [`templates/plan.md`](../../templates/plan.md) 就够。
>
> 老仓库对应物：`planQualityGate`（约 45 行正则）+ grill-with-docs SKILL 里的模板 + 各角色 SKILL 里的引用。
> 三处格式互不校验，实测结果见下。

## 为什么它是独立一层

老仓库有一件事，我在留档仓库里实测确认过：

```
planQualityGate('前身仓库 work-flow-paper', 'docs/plan.md', 'M1') → { ok: false }
M2 / M3 / M4 同样 false
```

paper 那四个里程碑全部通不过 gate，但它们**全都真的通过了人工验收**。原因是模板产出的是行内 `验收：...`，而 gate 认的是 `### 验收断言方向` 小节。两种格式，从来没对齐过，而且**没人发现**——因为没人真跑过 arch 分发那条路径。

这是这套东西里最核心的失效：断言源是四个读者的公约，但它没有解析器。人读散文、gate 读正则，两边理解不一致时没有任何信号。

所以本层的存在理由是：**语法只定义一次，模板和 gate 都从它派生。** 模板是解析器的可运行示例，gate 调解析器的输出，不自己写正则。

## 目录

```
src/plan/
├── grammar.ts     语法常量：节名、标记、编号规则（唯一定义处）
├── parse.ts       markdown → Plan 结构
├── frontier.ts    未决表 → 现在能动的是哪几条（纯函数，20 行）
└── index.ts       出口
```

## 数据结构

```ts
type Plan = {
  goal: string;
  milestones: Milestone[];
  pending: Pending[];      // 未决表
  fog: string[];           // 「说不清的」
  outOfScope: string[];    // 「不做」
};

type Milestone = {
  id: string;              // "M1" / "P0" / "v2-1"，从标题取，不合成
  title: string;
  passed: boolean;         // 标题含 ✅ → 已验收 → 冻结
  assertions: Assertion[];
  involves: string[];
  dependsOn: string[];
  risks: string[];
  sourceRange: [number, number];  // 行号范围，供 hash 与定位用
};

type Assertion = {
  id: string;              // "M1.3"，= 里程碑 id + 本节内序号
  kind: "auto" | "human";
  text: string;
  line: number;
};

type Pending = {
  id: string;              // 稳定 id：P1, P2… 解析时按出现顺序分配，删行不回收
  text: string;
  kind: "auto" | "human";
  owner?: string;          // [human] 归谁
  status: "open" | "querying" | "answered";  // [auto] 的三态
  answerRef?: string;      // 已回 → wf/notes/<slug>.md
  blockedBy: string[];     // 前置：引用其它 pending 的 id（如 P1）
  line: number;
};
```

## 语法（七条）

**S1 里程碑标题**：`## 里程碑 <id> <标题>`。id 是第一个空格分隔的 token，可以是任意非空白串。

**S2 已验收标记**：标题里出现 `✅` → `passed: true`。解析器**必须容忍**标题里的 ✅、括注、日期——arch 会往这里写状态，机器不读它（01-channel 里 state 才是权威）。

**S3 断言节**：`### 断言`，其下的 `- ` 列表项。每项必须以 `[auto]` 或 `[human]` 开头，否则该行报错。

**S4 编号**：从位置来。里程碑 `M1` 的第 3 条断言 = `M1.3`。所以往中间插一条会导致后面重编——这正是为什么只能改未验收的里程碑（D-14 自然重合，不需要额外规则）。

**S5 未决表三段式**：`- <是什么> —— <标记 + 归属/状态> —— 前置：<无 | P<n>>`。分隔符是 `——`（中文破折号）或 `--`。每行解析时分配稳定 id `P1`, `P2`…（按出现顺序，**删行不回收 id**）。未决定了就删行，位置会漂，所以**不能用位置编号**——与断言相反：断言只追加不删，位置编号成立（S4）。

**S5b 前置引用**：`前置：P2` 引用 pending id。写口语（「上面某条」）→ `blockedBy` 为空，只影响排序，不影响正确性。

**S6 可省节**：`### 涉及` / `### 依赖` / `### 风险与未决` 全部可省。省了就是空数组，**不是错误**（D-16：能塌缩）。

**S7 最小合法规划书**：一个里程碑 + 一条断言。`## 目标` 可省，`## 未决` 可省。

## 断言可测性判定

这是 gate 的核心判据，但它只对 `[auto]` 发问：

```ts
// [auto] 必须含至少一样：可执行命令、或可检查存在性的路径
// [human] 必须有非空说明文本
export function checkAssertion(a: Assertion): { ok: boolean; reason?: string };
```

判据比老仓库那个大正则窄得多，因为**分类已经把大部分工作做完了**。老仓库要用一个正则同时判断「这条能不能自动测」和「这条是不是空话」，于是既误伤（`需人工验证` 得特判）又漏放（`完成三个模块` 含数字就过）。

现在的逻辑是：你自己标了 `[auto]`，那我只问你命令在哪；你标了 `[human]`，我只问你说清了没有。**「这条该谁验」这个判断交给人，机器不猜。**

写不出命令怎么办？那它就是 `[human]`。这不是妥协，这是让分类承载信息。

## frontier（未决表 → 现在能动什么）

二十行纯函数：

```ts
export function frontier(pending: Pending[]): {
  actionable: Pending[];   // [human] + 前置已清 → 推到人眼前
  toQuery: Pending[];       // [auto] status=open + 前置已清 → 该派出去查
  answered: Pending[];      // [auto] status=answered → 有新事实回来了
  blocked: Pending[];       // 前置未清
};
```

这个函数的输出直接喂给 `/status` 和启动简报（D-30：载体必须在视线路径上）。人不需要记「有件事没回来」——开窗口就在眼前。

它同时是 wayfinder 的平替。原版五件事里，这个形态吃掉四件：

| 原版 | 这里 |
|---|---|
| fog of war（看不清就别画） | 「说不清的」节 + D-10 判据 |
| 一次一票 | 前置排序自然产生顺序 |
| HITL / AFK | `[human]` / `[auto]` |
| plan-don't-do | D-11 |
| frontier 在 tracker UI 可视化 | **平替**：`/status` + 启动简报 |

最后一条是真的降级，接受它：单人项目的视线路径就是那三个窗口。升级路径见 D-42——未决表在 `plan.md` 里放不下、或需要多会话并发认领时，用 GitHub issues，不自造票格式。

## 对外接口

```ts
export function parsePlan(root: string, relPath: string):
  | { ok: true; plan: Plan; warnings: string[] }
  | { ok: false; errors: PlanError[] };

export function milestone(plan: Plan, id: string): Milestone | null;

export function checkMilestone(m: Milestone): { ok: boolean; reason?: string };
// arch 分发前调它：至少一条断言 + 每条 checkAssertion 通过 + 未 passed

export function frontier(pending: Pending[]): Frontier;

export function assertionHash(m: Milestone): string;
// SHA-256(断言节原始文本，UTF-8，不含标题行 `### 断言`)。
// 输入 = sourceRange 内该节全部 `- ` 列表行的 join("\n")。D-15 机制化时各处必须一致。
```

`PlanError` 带行号。规划书是人写的，报错必须能直接跳到那一行——「格式不对」这种提示会让人放弃修。

## 不负责什么

- **不负责写** —— 解析器只读。规划书由人写（澄清会话辅助），arch 只改状态标记和未决/风险节。
- **不负责判定里程碑通过** —— 那是 05-gates 跑测试 + 07-adapter 走流程。本层只说断言是什么。
- **不负责回答未决** —— frontier 只说「哪几条能动了」，谁去动是 07/08 的事。
- **不负责冻结** —— 本层只报告 `passed: true`，拦住修改是规约 + 未来的 hash 比对（D-14/D-15）。

## 已知取舍

**编号靠位置，所以插入会重编。** 这看起来像缺陷，实际是把 D-14 编码进了数据结构：想插断言就得动已有编号，动了就露馅。给断言配显式 id 反而会让「悄悄改一条断言的内容」变得无痕。

**解析器不校验语义。** `[auto] npm test` 里那个命令能不能跑、`涉及` 里的路径存不存在，都不查。查了会误伤（路径可能是本里程碑要新建的），而且真跑不动会在 05-gates 里暴露。

## 验收

```
tests/plan/
├── L1-minimal.test.ts        输入 = `templates/plan.minimal.md`（不是字面量）→ ok，可省节全部缺失
├── L2-numbering.test.ts      第 3 条断言 id === "M1.3"
├── L3-kind-required.test.ts  断言未标 [auto]/[human] → 报错含行号
├── L4-auto-needs-cmd.test.ts [auto] 无命令无路径 → checkAssertion 失败
├── L5-human-needs-text.test.ts [human] 空说明 → 失败
├── L6-passed-tolerant.test.ts 标题含 ✅ 与日期括注 → 仍能解析出 id，passed=true
├── L7-frontier.test.ts       前置 P1 未清 → P2 不在 actionable；P1 删了也不回收 id
├── L8-template-parses.test.ts templates/plan.md 本身能被解析（模板 = 语法的可运行示例）
└── L9-paper-regression.test.ts 老仓库 paper 那份 plan.md → 报错且指出缺断言节的行号
```

**L8 是防漂移的关键。** 模板和解析器同源的保证方式就是让模板进测试——老仓库那两份格式分裂两个月没人发现，是因为模板从来没被解析过一次。

**测试输入不得是字符串字面量。** L1 读 `templates/plan.minimal.md`，L8 读 `templates/plan.md`，L9 读真实 fixture。
在测试里内联一段 markdown 字面量，等于给语法建了第二份定义（D-04）：
改了解析器而忘了改模板，字面量那边仍然绿着，而真实使用路径已经断了。

**L9 是回归证据。** 拿真实出过事的输入当测试用例：老仓库那份规划书应该报错，而且报错要说清缺什么、在哪一行。它当年静默通不过 gate，现在必须有声。

---

**已写模块**：[01-channel](01-channel.md) ｜ [02-protocol](02-protocol.md) ｜ [03-config](03-config.md) ｜ 04-plan（本文）
**下一个模块**：05-gates（纯函数判定：断言可测、产出结构随断言数缩放、生产文件快照、真跑测试）
