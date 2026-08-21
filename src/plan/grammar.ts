/**
 * 语法常量：节名、标记、编号规则。**唯一定义处。**
 *
 * 模板（`templates/plan.md`）与 gate（05-gates）都从这里派生——老仓库最核心的失效
 * 就是它们各自定义了一份：模板产出行内「验收：」，gate 认 `### 验收断言方向` 小节，
 * 两种格式从来没对齐过而且没人发现。所以节名只在本文件出现一次。
 *
 * 下面的 S1–S7 就是全部语法，没有第二份。两套编号规则故意相反（S4 位置 /
 * S5 稳定），理由各自写在那两条上。
 */

/** S1：`## 里程碑 <id> <标题>`。id = 第一个空白分隔的 token，可以是任意非空白串 */
export const MILESTONE_HEADING = /^##\s+里程碑\s+(\S+)\s*(.*)$/;

/** S2：标题里出现它 → passed。arch 会往标题写状态，解析器必须容忍它与括注、日期 */
export const PASSED_MARK = "✅";

/** 二级节名。S7 最小合法规划书 = 一个里程碑 + 一条断言；`## 目标` 与 `## 未决` 均可省 */
export const SECTIONS = {
  goal: "## 目标",
  pending: "## 未决",
  fog: "## 说不清的",
  outOfScope: "## 不做",
} as const;

/** 三级节名。全部可省，省了就是空数组而不是错误（S6，D-16 能塌缩） */
export const SUBSECTIONS = {
  assertions: "### 断言",
  involves: "### 涉及",
  dependsOn: "### 依赖",
  risks: "### 风险与未决",
} as const;

/**
 * S3：断言项必须以 `[auto]` 或 `[human]` 开头。大小写敏感——`[AUTO]` 是错的。
 *
 * S4 编号：从**位置**来。`M1` 的第 3 条 = `M1.3`。往中间插一条会让后面重编——
 * 这正是为什么只能改未验收的里程碑（D-14 自然重合，不需额外规则）。
 */
export const ASSERTION_ITEM = /^-\s+\[(auto|human)\]\s*(.*)$/;

/** 任意列表项（用于「这一行本该是断言但没标 kind」的判定） */
export const LIST_ITEM = /^-\s+(.*)$/;

/**
 * S5：未决表三段式。`- <是什么> —— <标记 + 归属/状态> —— 前置：<无 | P\<n\>>`。
 *
 * id 前缀可省：真实 plan.md 写 `- P1 文本 —— ...`，而模板写 `- <决策问题> —— ...`。
 * 有前缀就用它（**这是「删行不回收」唯一能成立的形态**），没有则按位置补一个。
 * 与断言（S4）正好相反，因为两者的生命周期相反：断言只追加不删，位置编号成立；
 * 未决定了就删行、位置会漂，而 `/research P2` 必须始终指向同一条。
 */
/**
 * S5：未决表三段式的分隔符。
 *
 * `——`（中文破折号）或 `--`，但 **`--` 两侧必须有空白**：否则 `--print`
 * 这类命令行开关会把一条未决切开（真实发生过：P2 的文本含 `--print`，
 * 第一版正则把它切成了两段，kind 跟着错成 human）。
 *
 * **段数不固定。** 正文自己可以带破折号（P8 就带），所以标记段不能取
 * `parts[1]`，必须按内容定位。按位置数的后果是静默错位：`kind` 跌回默认值
 * 而 `owner` 消失，而两者都不报错。TRAILING_SEP 用于切掉正文尾部那个分隔符。
 */
export const PENDING_ID = /^P(\d+)$/;
export const PENDING_SEP = /\s*——\s*|\s+--\s+/;
export const TRAILING_SEP = /(?:\s*——\s*|\s+--\s+)$/;

/** 未决表第二段的三种 `[auto]` 状态与一种 `[human]` 归属 */
export const PENDING_MARK = /\[(auto|human)\]/;
export const PENDING_OWNER = /归(\S+)/;
export const PENDING_ANSWERED = /已回\s*(?:→|->)\s*(\S+)/;
export const PENDING_QUERYING = "查中";

/** S5b：`前置：P2`。写口语（「上面某条」）→ blockedBy 为空，只影响排序 */
export const PENDING_BLOCKED_BY = /前置\s*[:：]\s*(.*)$/;

/** HTML 注释整行 —— 模板里全是它，不该被当成内容 */
export const COMMENT_LINE = /^\s*<!--.*-->\s*$/;

/**
 * `[auto]` 的可测性信号：反引号里的东西，或裸路径。
 *
 * 判据比老仓库那个大正则窄得多，因为分类已经把大部分工作做完了——老仓库要用
 * 一个正则同时判「能不能自动测」和「是不是空话」，于是既误伤（`需人工验证`
 * 得特判）又漏放（`完成三个模块` 含数字就过）。
 */
export const HAS_BACKTICK = /`[^`]+`/;
export const HAS_PATH = /(?:^|[\s（(])[\w.@-]+\/[\w./*{},@-]+/;
