# M6 修复轮验收凭证（tester 真实流程验出）

> 方式：tester 在真三窗口流程中验收，独立复核 + 补测试 + 修真实链路 bug
> 执行者：tester ｜ 复核：人 ｜ 日期：2026-08-22
> 判定：（由人填写）

## 背景

M6.6（真开三窗口）的试运行中，tester 窗口走真实 send_task 投递路径，
验出三个 mock-pi 测不到的问题。E1 全绿而真实链路断裂——这是规划书里
明写的 mock-pi 保真度边界（「验的是接线正确，不验 pi 真实行为」），
tester 的验收正是在这个边界上工作。

## 修复一：schema 缺 artifact，真实投递断裂

**发现**（tester）：send_task 的 schema 没有 artifact 字段，但
G_artifact_report/dev 从 `input.artifact` 读产出路径。tester 发
fix_request/verdict_pass 带 artifact 被 `additionalProperties: false` 拒——
tester 无法投递。E1 直接调 execute 绕过 schema 校验，所以测试绿、真窗口炸。

**修复**（`15c4cb6`/`40a0a42`）：schema 的 FIELDS 加 artifact，union 基础集加它。

**验证**：tester schema 现含 artifact；P2 测试适应（description 示例改 dev-output，
避免 report 子串误报）。

## 修复二：P1 定案 = 自检未挂运行时，已接线

**发现**（tester 的 P1 定案）：`specPresent` 无调用点——R5 头注释承诺 M6 挂
agent_start，但 wire 只挂了四个钩子。后果：「规约被后续扩展整份替换」时窗口
正常、工具在、仅模型不知道自己是谁（inject.ts 描述的静默症状）。

**修复**（`15c4cb6`/`40a0a42`）：`src/adapter/selfcheck.ts` 挂 agent_start，
`ctx.getSystemPrompt()` 检查特征串，不在就告警。wire.ts 压回 114 行。

**补测试**（`8f413d7`）：fakePi 加 getSystemPrompt（满足 _fixture 规则②），
A9b-selfcheck 三用例：正常注入不告警 / 整份替换告警且含角色 / 角色区分。

## 修复三：dev 单 type 投递断裂（tester 独立抓出）

**发现**（tester）：dev 只有 review_request，`sendTaskSchema` 单 type 省略 type
字段（LLM 不会传），但 `deliverMsg` 的 `build(input.type)` 强制要 type——真窗口
dev 永远无法投递（build 抛「未知 type undefined」；传 type 又被
additionalProperties:false 拒）。E1 手写 type 绕过 schema 校验。

**修复**（`0aac303`）：单 type 角色从 `typesFrom(role)` 推导 type，多 type 角色
（arch/tester）schema 有枚举仍由 LLM 选；缺 type 时报错列出可发 type。

**验证**：A9 新增「LLM 按 schema 调用（不传 type）→ 能投递」用例 + 直接调用
execute 实测（tester 收件箱收到 review_request）；真进程复测投递成功。

## 未决定案（tester 的 /research 产出）

| 条目 | 结论 | 落点 |
|---|---|---|
| P1 自检能否发现替换 | 能，且已接线有测试（修复二） | 未决表已回 → wf/notes/p1-mark.md |
| P2 --print 是否照常触发 | 照常（无模式分支） | 未决表已回 → wf/notes/p2-pi-before-agent-st.md |

P2 定案同时解释了之前 wire.ts 的 `ctx.mode` 守卫（`0b95822`）：print 模式
扩展照常运行，UI 专属调用必须守卫——那是对的行为，不是绕过。

## 当前状态

- npm test 331 passed（66 文件），含 pretest 的 check:disciplines / check:testsize
- wire.ts 119 行 ≤ 120（A6），tsc 零错误，工作区干净
- 真进程复测：dev 按 schema 投递 review_request 成功（无 type 参数）

## 遗留（待你定，tester 写进风险节）

docs/plan.md 风险节：**M6 断言表没有覆盖「注入自检已接通」**。建议三条路：
① 补一条 [auto] 断言（如 grep `specPresent(` 在 src/adapter/ 有调用点）；
② 显式接受缺口，删 R5 注释里那句「M6 负责」；③ 挪后续里程碑。
不补的后果：R5 单测在测一个不会运行的函数（现在接线已做，测试已补，
缺口只是断言表还没钉住它）。

## 判定

R3 FAIL（M6-006/M6-007，tester 实测）→ R5 FAIL（M6-009 gate 环境 grep 缺失 / M6-008 A9c 未提交）
→ 修复闭环（A9c 数组形态 66943f3、grep node 原生化 01dafd2）→ R6 PASS（341 绿，无 grep 环境复测）
→ M6-010 补充修复轮（唤醒链路，6b0dc82 红 + 974ed40 绿，见 M6.6-fail.md）→ **R7 验收 PASS**：tester 独立复核重跑 44 passed / 13 files + 全量 344 / 68 同绿（test-report-M6.md）；M6.6 第二轮重跑自动成环 PASS（M6.md 断言二判据 1–4）

签字：liwen / 2026-08-23
