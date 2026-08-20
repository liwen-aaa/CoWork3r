# 模块 05：gates（拦截判定）

> **职责一句话**：在「宣布完成」之前跑完所有能机械判定的检查，一条不过就 `block`。
> **依赖**：`node:fs` / `node:child_process`；类型上依赖 03-config 与 04-plan 的输出。
> **读者**：要加/改 gate 的人。
>
> 老仓库对应物：`planQualityGate` / `artifactStructureGate` / `snapshotSource` / `runTestCommand` /
> `inspectConventions`，散在 922 行文件的后 500 行里。行为大部分对，判据形状要改。

## 为什么它是独立一层

D-02 是整套东西的支柱：**纪律不进拦截链就不会被遵守。** 老仓库有一组实测数据把这条钉死了：

tester 规约明文写「报告缺『文档一致性』节 = 报告不完整 = FAIL」。paper 四份报告 **0/4** 写了该节，四个里程碑全部通过，零信号。同期 dev 的产出文件三小节 **4/4** 齐全——唯一差别是 dev 的拦截提示文案里明文列了小节名。

所以本层是「所有纪律的兑现处」。不在这里的纪律，就是 `disciplines.md` 里落点写「规约」的那些——它们会被跳过，而我们对此明说。

**全是纯函数。** 签名一律 `(输入) → {ok, reason?}`，不碰 pi、不写文件（快照基线除外，走 01-channel 的原子写）。这样每个 gate 都能在普通 node 进程里单测，07-adapter 只负责把它们挂到 `tool_call` 上。

## 目录

```
src/gates/
├── plan-ready.ts      arch 分发前：里程碑可测吗
├── artifact.ts        投递前：产出文件结构（随断言数缩放）
├── source-changed.ts  投递前：生产文件真的动了吗
├── run-command.ts     PASS 前：真跑 test / gate 命令
├── human-questions.ts PASS 前：给人的问题是具体的吗
└── index.ts           出口 + 拦截链组装
```

## 五道 gate

### G-plan：arch 分发前

调 `04-plan` 的 `checkMilestone`：里程碑存在、未 passed、至少一条断言、每条断言过 `checkAssertion`。

不过 → arch 的 `send_task` 被 block，reason 带行号。堵的是「断言不可测导致 tester 中途不知道拿什么判」。

顺带存 `assertionHash` 进 state（D-15 机制化的留位，当前只存不比对）。

### G-artifact：dev 投递 / tester 报判定前

**这道 gate 的形状与老仓库不同，是 D-22 的落地处。**

老仓库硬性要求固定小节：dev 产出必须有「修改的文件 / 修复的问题 / 已知未完成」三节，tester 报告必须有「判定 / 文档一致性」两节。后果是改一行代码也得凑五份格式，于是长出 S 档位来豁免这种仪式，然后档位判定自己又需要治理。

改成：**要求由断言表推导。**

```ts
// dev 产出：每条断言一行结论
export function checkDevOutput(file: string, m: Milestone): Result;
// 判据：非空 + 对每条 assertion.id 都有一行提到它

// tester 报告：判定行 + 每条断言一行结论 + [human] 条目原样列出
export function checkTestReport(file: string, m: Milestone): Result;
```

两条断言的里程碑，产出就是两行加一个判定行。仪式量线性缩放，**S/L 档位这个概念直接不需要存在**。

reason 必须明文列出缺哪几条断言编号——这正是 dev 那 4/4 与 tester 那 0/4 的唯一差别。

### G-source：dev 投递前

快照对比：`source` 目录（或单文件）的 `{相对路径 → size + mtime}`，与上次投递点的基线 diff。无变化 → block。

堵的是「只写产出说明不写生产内容」。老仓库这里用快照而不是 git diff，理由是当时两个项目都没有 `.git`；现在有 git 了，但快照仍然更合适——它的基准是「上次投递点」，git 的基准是 commit，而修复轮之间没有 commit。

`source` 是必填（03-config），所以没有「未配则跳过」这个降级。

### G-command：tester 报 PASS 前

真跑 `test`，配了 `gate` 也跑。退出码 0 且（配了 `testPass` 则）输出匹配 → 放行。

`test: null` 时这道 gate 为空，但**启动简报常驻提示「自动验证已关闭」**（D-23）。空 gate 是合法的，静默的空 gate 不是。

三个实现细节：超时（缺省 120s）、输出只留尾部 800 字符进 reason、`catch` 里不吞异常（至少 warn）。最后一条是老仓库的教训——它自己的防偷懒 gate 因为 `catch {}` 静默失效过，而且是人审查时发现的，不是 gate 自己报的。

### G-human：tester 报 PASS 前

**这是新增的一道，老仓库没有。**

```ts
export function checkHumanQuestions(questions: string[], m: Milestone): Result;
// 判据：questions 非空，且覆盖该里程碑全部 [human] 断言
```

`verdict_pass` 消息的 `questions` 必须覆盖这个里程碑所有 `[human]` 条目（02-protocol 里它是必填字段）。

理由是老仓库自己的观察：**没有一个里程碑的缺陷是被人工关卡抓到的。** 人抓到的两件事都是 harness 缺陷（gate 缺 import、环境变量带空格），不是内容缺陷。而当时给人的是三条通用方向（「结构 / 内容实质 / 引用真实性」），等于没给。

现在人打开消息看到的是这个里程碑**具体的那几个问题**，而且是自己在澄清阶段说出来的话（D-21）。

## 拦截链组装

```ts
export const CHAINS = {
  "arch:task_assignment":   [G_plan],
  "arch:verification":      [G_plan],
  "arch:report":            [],                    // 无 gate
  "dev:review_request":     [G_artifact_dev, G_source],
  "tester:fix_request":     [G_artifact_report],
  "tester:verdict_pass":    [G_artifact_report, G_command, G_human],
  "tester:milestone_passed": [],
  "tester:escalation":      [],
  "tester:stuck":           [],
} as const;

// lookup: CHAINS[`${role}:${type}`]
```

扁平键 `role:type`，与 ROUTES 同构。tester 不再嵌套——查表写错的代价高于嵌套省下的几行。

链是数据。07-adapter 只做一件事：查表、按序跑、第一个不过就返回 `{block: true, reason, failedGate}`。

**顺序有讲究**：先跑便宜的（读文件），后跑贵的（跑命令）。结构不对就没必要跑测试。

## 配置坏了怎么办

`fatalReason(diagnostics)` 非空时，**所有「宣布完成」类动作被拦**：`verdict_pass` 拦、`milestone_passed` 拦。

但 `review_request` 不拦——配置坏了不该阻止 dev 写代码和投递，只该阻止任何人说「验证过了」。这个不对称是有意的（03-config 里同一条）。

## 对外接口

```ts
export type Result =
  | { ok: true }
  | { ok: false; reason: string; failedGate: string };  // gate 导出名，如 "G_command"

export function runChain(
  chain: Gate[],
  ctx: GateContext,   // { root, cfg, plan, milestone, input }
): Result;
```

单个 gate 也全部导出，供单测与 `check-plan` 命令复用。

## 不负责什么

- **不负责决定何时跑** —— 挂到哪个事件上是 07-adapter 的事。
- **不负责写产出文件** —— 只读、只判。
- **不负责人的判断** —— G-human 校验「问题是否具体」，不校验答案。
- **不负责约定台账** —— 老仓库的 `inspectConventions`（133 行）整个砍掉。它校验的是「台账里宣称的落点是否存在」，而落点如果真存在，本层的 gate 就已经在跑它了；台账只是一份需要维护的第二权威（D-04）。约定的登记处改为 `disciplines.md` 的「落点」列，无机制校验。

## 已知取舍

**G-artifact 用「提到断言编号」这种弱匹配。** 一行里出现 `M1.3` 就算覆盖了，不检查那行说的是不是真的。强检查做不到（那需要理解自然语言），弱检查的价值在于**它让漏掉一条断言变得可见**。这跟老仓库那 4/4 vs 0/4 是同一个机制：把编号写进拦截提示，就会被填。

**跑命令是同步阻塞的。** 一个跑 5 分钟的测试套件会让 tester 窗口卡住 5 分钟。接受它——异步化需要状态机，而阻塞的语义更清楚：gate 没跑完，你就没法宣布通过。

**没有「构建交付」gate。** 老仓库的 `buildCmd` 是 S 档位第四关，档位砍了它也就没了。真需要构建自检的项目把它写进 `gate` 字段。

## 验收

```
tests/gates/
├── T1-plan-ready.test.ts       断言不可测 → block，reason 含行号
├── T2-artifact-scale.test.ts   一条断言的里程碑 → 一行结论即通过（不要求固定小节）
├── T3-artifact-missing.test.ts 漏一条断言 → reason 明文列出缺的编号
├── T4-source-nochange.test.ts  两次投递之间无改动 → block
├── T5-command-fail.test.ts     退出码非 0 → block，reason 含输出尾部
├── T6-command-null.test.ts     test: null → gate 为空且不 block（但简报有提示）
├── T7-human-questions.test.ts  questions 未覆盖全部 [human] → block
├── T8-config-fatal.test.ts     配置 fatal → verdict_pass 被拦，review_request 放行
├── T9-chain-order.test.ts      结构不过时不执行跑命令（贵的不白跑）
└── T10-paper-regression.test.ts 老仓库四份真实 test-report + plan.minimal.md 解出的 M1 → 全部 block
```

**T10 是回归证据**：老仓库那四份报告缺「文档一致性」节，当年全部通过。新形状下它们缺的是断言编号覆盖，同样必须 block——换了判据，但那批真实输入仍然抓得住。

---

**已写模块**：01-channel（已收缩进 `src/channel/`） ｜ 02-protocol（已收缩进 `src/protocol/`） ｜ 03-config（已收缩进 `src/config/`） ｜ [04-plan](04-plan.md) ｜ 05-gates（本文）
**下一个模块**：06-roles（三份角色规约 + system prompt 注入 + 注入自检）
