/**
 * 解析结果的数据结构。类型独立成文件，供 05-gates / 07-adapter `import type`。
 */

export type Assertion = {
  /** `M1.3` = 里程碑 id + 本节内序号（S4：位置编号，插入会重编） */
  id: string;
  kind: "auto" | "human";
  text: string;
  /** 1-indexed，报错要能跳到那一行 */
  line: number;
};

export type Milestone = {
  /** `M1` / `P0` / `v2-1`。从标题取，**代码不合成** */
  id: string;
  title: string;
  /** 标题含 ✅ → 已验收 → 冻结（D-14）。机器不读它，01-channel 的 state 才是权威 */
  passed: boolean;
  assertions: Assertion[];
  involves: string[];
  dependsOn: string[];
  risks: string[];
  /** [起, 止] 行号，1-indexed 闭区间。供 assertionHash 与报错定位 */
  sourceRange: [number, number];
};

export type PendingStatus = "open" | "querying" | "answered";

export type Pending = {
  /** 稳定 id `P1`…。有前缀则从文本读，**删行不回收**（见未决 P8） */
  id: string;
  text: string;
  kind: "auto" | "human";
  /** `[human] 归我` 的那个「我」 */
  owner?: string;
  status: PendingStatus;
  /** answered → `wf/notes/<slug>.md` */
  answerRef?: string;
  /** `前置：P2` 解出的 id 列表；写口语则为空 */
  blockedBy: string[];
  line: number;
};

export type Plan = {
  goal: string;
  milestones: Milestone[];
  pending: Pending[];
  /** 「说不清的」——还不能精确陈述的东西（D-10） */
  fog: string[];
  outOfScope: string[];
};

export type PlanError = {
  /** 1-indexed。0 表示「整份文件」级别的错误（如文件读不到） */
  line: number;
  message: string;
};

export type ParseResult =
  | { ok: true; plan: Plan; warnings: string[] }
  /** 失败时**不返回半成品 plan**——与 03-config 的 `cfg === null` 同一条判据 */
  | { ok: false; errors: PlanError[] };

export type Frontier = {
  /** `[human]` + 前置已清 → 推到人眼前 */
  actionable: Pending[];
  /** `[auto]` open + 前置已清 → 该派出去查 */
  toQuery: Pending[];
  /** `[auto]` answered → 有新事实回来了 */
  answered: Pending[];
  /** 前置未清 */
  blocked: Pending[];
};
