/**
 * 路由表 —— 谁能给谁发什么。**本文件是唯一真相源。**
 *
 * `to` 由 `type` 决定，不由调用方传。老仓库那个 bug 的形态是七处声明
 * `ticket_result` 这条通道存在、零处让它工作（消息被投进 tester 的收件箱，
 * arch 永远收不到）。在这个形状下它不可能出现：type 要么在表里（于是自动
 * 路由正确），要么不在表里（于是根本发不出去）。
 *
 * M1 只用到这张表和 message.ts 的类型。路由/schema/文档三者从表派生是 M2。
 *
 * 四处与老仓库不同，全部指向同一件事——**让方向唯一**：
 *   - 删 `ticket_result`（wayfinder 砍了；需要去查事实时走 08 的 research 命令）
 *   - PASS / FAIL 拆成两个 type（理由见 decisions.md：一个 type 两个目标地址
 *     就只能在代码里 if 分流，而那正是那个 bug 的栖息地）
 *   - `verdict_pass` 必填 `questions`：人工关卡只问 `[human]` 断言，空列表 = 发不出去
 *   - `milestone_passed` 必填 `evidence`：放行必须带人写的凭证，
 *     这条从「命令层空参拒绝」上移到了协议层必填
 */
export const ROUTES = {
  task_assignment: {
    from: "arch",
    to: "dev",
    requires: ["milestone", "body"],
    description: "分配里程碑给 dev",
  },
  verification: {
    from: "arch",
    to: "dev",
    requires: ["milestone", "body"],
    description: "要求 dev 核对/补证（不改变轮次）",
  },
  review_request: {
    from: "dev",
    to: "tester",
    requires: ["milestone", "body"],
    description: "开发完成，请求验收",
  },
  fix_request: {
    from: "tester",
    to: "dev",
    requires: ["milestone", "issues"],
    description: "验收 FAIL，发回修复",
  },
  verdict_pass: {
    from: "tester",
    to: "human",
    requires: ["milestone", "questions"],
    description: "自动验证通过，等人答 [human] 断言",
  },
  milestone_passed: {
    from: "tester",
    to: "arch",
    requires: ["milestone", "evidence"],
    description: "人工放行，通知 arch 收尾/下一里程碑",
  },
  escalation: {
    from: "tester",
    to: "arch",
    requires: ["milestone", "body"],
    description: "同问题反复或架构疑点，升级 arch",
  },
  stuck: {
    from: "tester",
    to: "human",
    requires: ["milestone", "body"],
    description: "连续失败达上限，请人介入",
  },
  report: {
    from: "arch",
    to: "human",
    requires: ["body"],
    /** 显式标出与其它 type 不同构：milestone 非必填 */
    omit: ["milestone"],
    description: "状态/收尾报告（无里程碑上下文）",
  },
} as const;
