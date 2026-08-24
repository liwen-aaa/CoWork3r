/**
 * 拦截层出口 + 拦截链组装。
 *
 * 职责：在「宣布完成」之前跑完所有能机械判定的检查，一条不过就 block。
 *
 * ── 为什么它是独立一层 ────────────────────────────────────
 * D-02 是整套东西的支柱：**纪律不进拦截链就不会被遵守。** 老仓库有一组实测把这条
 * 钉死了——tester 规约明文写「报告缺『文档一致性』节 = FAIL」，四份报告 0/4 写了
 * 该节，四个里程碑全部通过、零信号。同期 dev 的产出三小节 4/4 齐全，唯一差别是
 * dev 的拦截提示文案里明文列了小节名。
 *
 * 所以本层是所有纪律的兑现处。不在这里的纪律，就是 `disciplines.md` 里落点写
 * 「规约」的那些——它们会被跳过，而我们对此明说。
 *
 * ── 全是纯函数 ────────────────────────────────────────────
 * 签名一律 `(输入) → {ok, reason?}`，不碰 pi，只写一个文件（快照基线，走 01-channel
 * 的原子写）。这样每道 gate 都能在普通 node 进程里单测，07-adapter 只负责查表、
 * 按序跑、把第一个不过的结果报出去。
 *
 * ── 链是数据 ──────────────────────────────────────────────
 * `CHAINS` 是一张表，键是 `role:type`（与 ROUTES 同构的扁平键）。「某条通道没有
 * gate」必须是表里写着的空数组，不是查不到键——老仓库 `ticket_result` 的形状就是
 * 七处声明这条通道存在、零处让它工作。T9 双向查这件事。
 *
 * 顺序有讲究：**便宜的先跑，贵的后跑。** 结构不对就没必要跑测试套件——那不只是
 * 省时间，是别把「你的产出不完整」这条反馈延迟五分钟。
 *
 * 不负责：
 * - **不负责决定何时跑** —— 挂到哪个事件上是 07-adapter 的事
 * - **不负责写产出文件** —— 只读、只判
 * - **不负责人的判断** —— G-human 校验「问题是否具体」，不校验答案
 * - **不负责约定台账** —— 老仓库的 `inspectConventions`（133 行）整个砍掉：
 *   它校验「台账里宣称的落点是否存在」，而落点如果真存在，本层的 gate 就已经在
 *   跑它了；台账只是一份需要维护的第二权威（D-04）
 */
import { fatalReason } from "../config/index.ts";
import { checkDevOutput, checkTestReport } from "./artifact.ts";
import { checkHumanQuestions } from "./human-questions.ts";
import { checkRelease } from "./release.ts";
import { G_plan } from "./plan-ready.ts";
import { G_command, commandGateStatus } from "./run-command.ts";
import { G_source, takeSourceBaseline } from "./source-changed.ts";
import { block, ok, type Gate, type GateContext, type Result } from "./types.ts";
import type { Diagnostic } from "../config/index.ts";

export { checkDevOutput, checkTestReport } from "./artifact.ts";
export { checkHumanQuestions } from "./human-questions.ts";
export { checkRelease } from "./release.ts";
export { G_plan } from "./plan-ready.ts";
export { G_command, commandGateStatus } from "./run-command.ts";
export { G_source, takeSourceBaseline } from "./source-changed.ts";
export type { Gate, GateContext, Result } from "./types.ts";

/**
 * 配置坏了怎么办：**拦「宣布完成」，放行「继续开发」。**
 *
 * 这个不对称是有意的（03-config 文件头写着同一条）：配置坏了不该阻止你写代码和
 * 投递，必须阻止任何人说「验证过了」。求助类（stuck / escalation）同样放行——
 * 配置问题不该把求救通道也堵死。
 */
const DECLARES_DONE = new Set(["verdict_pass", "milestone_passed"]);

export function configGate(diagnostics: Diagnostic[], type: string): Result {
  if (!DECLARES_DONE.has(type)) return ok();
  const reason = fatalReason(diagnostics);
  if (reason === null) return ok();
  return block(
    "G_config",
    `${reason}\n配置坏了不阻止开发，但不能宣布通过——先修 wf.config.json`,
  );
}

// ── 把各 gate 适配成统一签名（链里的元素必须同型）────────────

/** 产出文件的相对路径从 input 里来；没给就是协议层漏了必填字段 */
function artifactRel(ctx: GateContext): string {
  const v = ctx.input.artifact;
  return typeof v === "string" ? v : "";
}

export const G_artifact_dev: Gate = (ctx) =>
  checkDevOutput(ctx.root, artifactRel(ctx), ctx.milestone);

export const G_artifact_report: Gate = (ctx) =>
  checkTestReport(ctx.root, artifactRel(ctx), ctx.milestone);

const G_plan_chained: Gate = (ctx) => G_plan({ root: ctx.root, milestone: ctx.milestone });
Object.defineProperty(G_plan_chained, "name", { value: "G_plan" });

const G_source_chained: Gate = (ctx) => G_source({ root: ctx.root, source: ctx.cfg.source });
Object.defineProperty(G_source_chained, "name", { value: "G_source" });

/**
 * `test` 与 `gate` 两条命令都在这一道里跑（先 test 后 gate）。
 * `test: null` 时整道为空——合法，但简报常驻提示（`commandGateStatus`）。
 */
const G_command_chained: Gate = (ctx) => {
  const { cfg } = ctx;
  if (cfg.test !== null) {
    const r = G_command({
      root: ctx.root,
      command: cfg.test,
      timeoutMs: cfg.testTimeoutMs,
      ...(cfg.testPass === undefined ? {} : { passPattern: cfg.testPass }),
      label: "测试",
    });
    if (!r.ok) return r;
  }
  if (cfg.gate !== undefined) {
    const r = G_command({
      root: ctx.root,
      command: cfg.gate,
      timeoutMs: cfg.testTimeoutMs,
      ...(cfg.gatePass === undefined ? {} : { passPattern: cfg.gatePass }),
      label: "冷启动自检",
    });
    if (!r.ok) return r;
  }
  return ok();
};
Object.defineProperty(G_command_chained, "name", { value: "G_command" });

const G_human_chained: Gate = (ctx) => {
  const qs = ctx.input.questions;
  return checkHumanQuestions(Array.isArray(qs) ? qs.map(String) : [], ctx.milestone);
};
Object.defineProperty(G_human_chained, "name", { value: "G_human" });

/** G_release 适配成统一签名：evidence 从 input 里取 */
const G_release_chained: Gate = (ctx) => {
  const ev = typeof ctx.input.evidence === "string" ? ctx.input.evidence : "";
  return checkRelease(ev);
};
Object.defineProperty(G_release_chained, "name", { value: "G_release" });

export { G_command_chained, G_human_chained, G_plan_chained, G_release_chained, G_source_chained };

/**
 * 键是 `role:type`，与 ROUTES 同构。tester 不嵌套——查表写错的代价高于嵌套省下的几行。
 *
 * 空数组是**声明**，不是遗漏：arch:report 是纯通报，escalation / stuck 的
 * 把关在别处（协议层必填字段 + configGate）。milestone_passed 由 arch 代发
 * （共识 ② 方案 A），链上挂 G_release——D-01 的最后一米是 gate 不是规约。
 */
export const CHAINS: Record<string, readonly Gate[]> = {
  "arch:task_assignment": [G_plan_chained],
  "arch:verification": [G_plan_chained],
  "arch:report": [],
  "arch:milestone_passed": [G_release_chained],
  "dev:review_request": [G_artifact_dev, G_source_chained],
  "tester:fix_request": [G_artifact_report],
  "tester:verdict_pass": [G_artifact_report, G_command_chained, G_human_chained],
  "tester:escalation": [],
  "tester:stuck": [],
};

/** 查表、按序跑、第一个不过就返回它。07-adapter 只做这一件事 */
export function runChain(chain: readonly Gate[], ctx: GateContext): Result {
  for (const gate of chain) {
    const r = gate(ctx);
    if (!r.ok) return r;
  }
  return ok();
}

/** `role:type` → 链。查不到返回 null（而不是空数组）：区分「声明无 gate」与「键写错了」 */
export function chainFor(role: string, type: string): readonly Gate[] | null {
  const key = `${role}:${type}`;
  return Object.hasOwn(CHAINS, key) ? CHAINS[key]! : null;
}
