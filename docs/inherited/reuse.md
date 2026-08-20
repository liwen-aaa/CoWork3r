# 复用老仓库：逐项清单

> 来源：`前身仓库 work-flow`（留档）。**实现每个模块前先查本表，别凭记忆重写。**
>
> 判据不是「代码好不好」，是**这段逻辑的形状是不是事故换来的**。
> 是 → 照抄，连注释一起（注释里的日期和现象是它存在的唯一理由，删了下一个人就会「优化」掉它）。
> 不是 → 重写，因为老结构把判断和接线混在一起。

## 照抄（近乎逐字，只改命名与拆分位置）

| 目标 | 老仓库位置 | 为什么不重写 |
|---|---|---|
| `channel/watch.ts` 的 `check()` + 三个触发点 | `agent-lib.ts` `watchInbox` | 四个数字全是试出来的：启动补收 `setTimeout(500)`、事件后 `setTimeout(200)` 等写入完成、轮询 `setInterval(10000)`、水位 `mtime <= processed`。凭记忆重写必错一个 |
| 条件清空的五字段比对 | 同上，`now.from/type/milestone/round` | 只清不比对 → 误删并发新消息；只比对不清 → 旧消息重放。**两半都是必需的**，而且这个结论是踩了才知道的 |
| `atomic.ts` | `writeState` / `writeMessage` / `writeChangeBaseline` | `写 .tmp → rename` 三行，无可改进 |
| `plan/parse.ts` 的 CRLF 归一 | `parseTicketFrontmatter` 首行 | `content.replace(/\r\n/g,"\n").replace(/\r/g,"\n")`。Windows text-mode 写入会改行尾，`(.*)$` 不匹配 `\r` 结尾——老仓库为此坏过一次票解析 |
| `gates/run-command.ts` | `runTestCommand` | 超时 + `maxBuffer` 10MB + 输出只留尾部 800 字符 + `catch` 里合并 stdout/stderr。四件事都是被输出撑爆或被卡死之后加的 |
| `gates/source-changed.ts` | `snapshotSource` / `diffSnapshots` | `{size, mtimeMs}` 快照 + 1ms 容差。ADR-0009 里记了为什么不用 git diff |
| `launch/trio.ps1` | `templates/launch/launch-trio.ps1.template` | 纯 ASCII（PS 5.1 按 GBK 读 UTF-8 无 BOM）、`Screen::WorkingArea` 自适应、`wt --title` + `--suppressApplicationTitle`（pi TUI 会覆盖窗口标题，`FindWindow` 找不到）、≥3 个 `WF_ROLE` 进程防重。「自造窗口定位脚本」在老仓库已被明确否决 |
| 阈值升级的计数落盘 | `bumpIssueCounts` | 逻辑本身平凡，但「必须落盘」这件事是窗口重启丢计数换来的 |

## 抄判据，不抄实现

| 目标 | 老仓库位置 | 差别 |
|---|---|---|
| `config/inspect.ts` 的两级诊断 | `inspectWorkflowConfig` | **判据全对**（语法错/空文件/顶层非对象/非法正则 = fatal；未知字段/类型不符 = warn；文件不存在 = 合法降级）。改的是：fatal 时返回 `null` 而不是 `{}`，字段表 13 → 8 |
| `gates/artifact.ts` | `artifactStructureGate` | 非空检查、CRLF 容忍、reason 明文列出缺什么——这三条照抄。**判据换掉**：固定小节 → 每条断言一行结论（D-22） |
| `plan/parse.ts` 的节定位 | `planQualityGate` | 「找到里程碑节 → 切到下一个同级标题 → 在节内找子节」这个套路照抄。**可测性正则不要抄**——它想用一个正则同时判「能不能自动测」和「是不是空话」，既误伤又漏放；新设计里 `[auto]`/`[human]` 分类已经把这活干了 |
| `adapter/status.ts` | `registerStatus` + `bootBriefing` | 「待人工判定时把整行变成告警级」这个做法照抄。内容改：加未决/frontier 那一行（D-30） |

## 不要抄

| 东西 | 老仓库位置 | 为什么 |
|---|---|---|
| **模块顶层实例化** | `dev-agent.ts` L20–21：`createAgentLib(ROLE)` 在模块作用域 | 这是 e2e 做不成的根因。代价直接写在测试注释里：`import(...?v=${Date.now()})` 在绕自己的模块缓存，131 项测试全建立在这个绕法上。新设计的 A9 就是防它 |
| `createAgentLib` 返回 38 个东西 | `agent-lib.ts` 尾部 | 三个角色各取所需、无边界。改成按模块导出 |
| 消息构造散在各 agent | 三个 `*-agent.ts` 的 `writeMessage({...})` | `to` 被硬编码过（`ticket_result` 那个 bug）。新设计里 `to` 由 `ROUTES[type]` 决定 |
| `inspectConventions` | `agent-lib.ts` 562–695 | 133 行，校验「台账宣称的落点是否存在」。落点如果真存在，gate 本身就在跑它——台账是第二权威 |
| wayfinder 全套 | `agent-lib.ts` 811–922 + arch 的三个工具 | 两张地图 8+8 票全部早期一次性 resolved，「跨 session 渐进清晰」零真实数据 |
| `verify-extensions.mjs` | 1098 行 | 不是安全网，是**规格来源**：从里面读出「它断言了哪些行为」，写进新测试。它自己的形状（mock pi + cache-bust）不要继承 |
| `adopt.mjs` | 294 行 | 生成器的前提是「每项目一份定制副本」。占位符归零后前提不成立 |
| 六份契约 + `verify-contracts.mjs` + `MANIFEST.json` | `contracts/`、`scripts/` | 建它们的理由是「无 git 会丢全文」。现在有 git |

## 一件必须做的核对

`verify-extensions.mjs` 的 131 项里，有多少是在测**行为**、多少是在测**它自己那套 mock 的形状**——这个比例现在不知道。

M1 开始前值得花一次：读那 17 组的组名和断言文本，把「测行为」的那些抄进新测试的用例清单。这比我凭记忆列 C1–C8 更可靠——那 131 项里可能有我没想到的边界。

**但不要 import 它、不要跑它。** 它依赖老结构（模块顶层实例化 + cache-bust），跑不起来也不该跑起来。它是一份要读的规格，不是一个要通过的测试。
