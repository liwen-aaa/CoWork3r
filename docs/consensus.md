# 设计共识(2026-08-24 grill 会话定)

> 性质:**设计意图的权威**。不是纪律(判据+落点在 `disciplines.md`),不是归档
> (为什么不用 X 在 `decisions.md`),是「为什么现在长这样」——人和后续 agent 的共同参照。
> 被拒的方案链到 decisions.md,**只链不复述**(D-04);decisions.md 尚未补的标「待补」。
>
> 物化状态:✅ 已被机制/测试/脚本钉住 ｜ ⏳ 已定,未钉 ｜ 未标 = 还在对话里,不算数。
> ⏳ 超过一个里程碑不钉 = 它在漂移,是删除候选。
>
> **机制免费,读序付费**(⑦):本文件必须短。每条三行是硬约束。

## 1. 三进程 + 磁盘文件(人在环里是主路径)

- 共识:三个真窗口给人看和介入;人参与是主路径,不是异常路径
- 拒绝:RPC 编排器/单进程编排——自动化但杀掉人工介入(decisions.md 待补,原由只有 08-21 聊天记录)
- 物化:⏳ decisions.md 补论证;⏳ launch 形态

## 2. arch = 人的代理;人是一等角色

- 共识:arch 把人话翻译成确定格式;人只做三件事——看(常驻进度)、说(人话,对 arch)、确认(仅放行)
- 拒绝:人直接进协议(`from:"human"` 保持为空,协议层零改动);放行以外的翻译也逐条确认(窗口可打断,翻译错了会被看见)
- 物化:✅ `src/roles/arch.md`(意图表 + 代理职责)+ ✅ `src/roles/human.md` + ✅ `src/gates/release.ts`(放行两道判据:前置 state.awaitingHuman + 凭证三段,挂 arch:milestone_passed 链)+ ✅ `src/protocol/routes.ts`(from→arch)+ ✅ 删 pass/fail 命令(commands.ts)+ ✅ `src/adapter/drain.ts`(arch 代排人的收件箱)+ ✅ `src/channel/ledger.ts`(待人工台账,D-30 载体)+ ✅ `tests/adapter/A9h-release-precondition.test.ts`(锚在 arch 写不到处);⏳ 打断留痕(通道 B);⏳ widget 常驻(现为 bootBriefing sendUserMessage)

## 3. 打断留痕(通道 B)

- 共识:人对任何窗口的直接干预由窗口自动留痕(appendEntry 或会话行),凭证必须能看见「这轮有外部输入」
- 拒绝:打断留在会话里、凭证只记协议内的事——那会让凭证描述的不是真实发生的事(08-24 retro 八事故的机制化)
- 物化:⏳ 窗口留痕 + gate 消费

## 4. 单槽位是锁

- 共识:单槽位 + O_EXCL 原子创建 = 锁,文件名即锁,禁止覆盖;覆盖从可能变成不可能
- 拒绝:互斥量/队列/目录+序号(触发条件未到,D-42);「检查+写」分离(跨进程有竞态窗口)
- 推论(2026-08-24 实测):**锁必须有释放者**。human 无窗口无 watcher → 槽位永不释放 → FAIL 重试与 stuck 急救通道不通(happy path 恰好自清,所以 E1 全绿而真路径断);代排见 ②
- 物化:✅ `src/channel/atomic.ts`(writeTextExclusive,O_EXCL)+ `tests/channel/C7-overwrite-warn.test.ts`(禁止覆盖三用例) + ✅ `tests/adapter/A9g-human-inbox-drain.test.ts`(锁有释放者)

## 5. gate 装在 tool_call(行为时拦截)

- 共识:gate 在 LLM 投递时拦,当场收 reason 改;装在事后位置(CI/脚本)是「产物已落盘才红」
- 拒绝:提示词拦截(D-02 判死刑);事后脚本(返工)
- 物化:✅ `src/adapter/wire.ts`(拦截链在 tool_call + configGate/chainFor/takeSourceBaseline 接线);✅ `scripts/check-wiring.mjs`(D-49,首跑照出 5 哑弹:configGate/chainFor/commandGateStatus/takeSourceBaseline/validate,2026-08-24 全部清零)

## 6. 断言二分判据升级

- 共识:二分不变(判定者=机械/人),`[auto]` 必须能回答「谁在跑它、多久一次」;执行者从内容推导,不标注
- 拒绝:第三态 `[auto-manual]`(给「合法逃避」开官方入口,D-18 形状)
- 物化:⏳ `checkAssertion` 加推导(查 package.json scripts → pretest/gate/验收);⏳ M2 那条生成物断言据此变红→修

## 7. 状态存自造 json,不加锁,不并发推进里程碑

- 共识:state.json 三窗口共享,pi session 单窗口做不到;不加锁(并发源被单槽位锁串行化;跨方向竞态在里程碑切换语义下无害)
- 拒绝:并发推进多个里程碑——无失败模式(D-40 ①)+ 人在环里只能跟一条线;CAS/分文件
- 物化:⏳ 写者归属表进 `state.ts` 文件头;⏳ decisions.md 补论证

## 8. 规约不走 skill(角色侧)

- 共识:角色规约注入 system prompt 必须常驻,且三份互不可见(D-01 隔离);人的规约(human.md)按需读,与 skill 同构,随意
- 拒绝:skill 渐进披露(模型自己去 read)与「常驻」语义不匹配;三份 skill 全窗口可发现
- 物化:✅ `src/roles/arch.md` + `src/roles/dev.md` + `src/roles/tester.md` + `src/roles/inject.ts`(decisions.md 已有论证);⏳ human.md

## 9. 共识本身:consensus.md + 物化状态 + 轻量检查

- 共识:本文件是「为什么长这样」的权威;✅ 条目必须有物化落点可 grep;⏳ 条目不许长期挂着
- 拒绝:物化状态靠自觉更新(那是落点=规约,D-02)
- 物化:⏳ `check-consensus.mjs`(只查 ✅ 落点存在,一行 grep,进 pretest);⏳ 进 AGENTS.md 读序

## 10. 生成物由脚本从代码生成

- 共识:protocol.md ← routes.ts,progress.md ← plan.md+实测;判据「重生后 diff 为空」
- 拒绝:手写生成物(第二份权威,D-04);判据落点「人手跑一次」(M2 那条红两天的形状)
- 物化:⏳ pretest 加「重生全部生成物 + diff 非空即失败」

---

## 划界

| 文件 | 记什么 | 谁读 | 什么时候 |
|---|---|---|---|
| `consensus.md` | 设计意图(为什么长这样) | 人+agent | 设计变更时;agent 每轮 |
| `disciplines.md` | 纪律(判据+落点) | agent | 动手前 |
| `decisions.md` | 归档(为什么不用 X) | 人 | 三个月后 |
| `plan.md` 断言 | 验收标准 | 人+tester | 验收时 |

## 迁移到 oh-my-pi(IDE 集成 fork,2026-08-24 评估)

- 核心层(channel/protocol/plan/gates/config/roles,~1500 行)零改动:纯函数 + node:fs,与 UI/OS 无关
- adapter(~400 行)适配:12 处 `ctx.ui.notify` → GUI 通知;`ctx.mode === "tui"` 守卫 → ide 模式;sendUserMessage 语义核对
- launch(ps1/bat)重写或弃:IDE 集成可能不需要三窗口启动脚本
- 形态重画(设计层,不是代码):① 三角色怎么呈现(面板/session);② 人看进度的 widget → GUI 状态;③ 打断在 IDE 里天然更顺
