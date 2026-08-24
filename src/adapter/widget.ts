/**
 * 常驻状态条的刷新（A12 的机制落点）。
 *
 * ── 来源事故（2026-08-24 wf-demo 真跑，RUN1-001）────────────
 * `setWidget` 原来只挂在 `session_start`，于是状态条是**一次性快照**：
 * arch 分发完、tester 报完 verdict_pass 之后，它仍显示「（未开始） R1 失败 0/5」。
 * 而「待你判定：1 条（见 wf/human-pending.md）」这行指路信息一直在生成
 * （`/status` 敲出来是对的，两者共用 `briefingFor`）——只是从未进过状态条。
 * 后果不是显示美观：**人在人工关卡上不知道自己该判什么、该去哪看**，
 * 而那正是 D-30 要消除的依赖（需要人主动去问才看得见的待办 = 无效载体）。
 *
 * ── 为什么不是 /reload ────────────────────────────────────
 * 真跑现场里人 `/reload` 之后状态条更新了，所以「每次收到消息就 /reload」
 * 是个自然的念头。但 `/reload` 重跑整个会话生命周期——重注册工具、重启唤醒
 * watcher、重设代排句柄。为刷新一行显示付这个代价不对，而且重启 watcher 会
 * 让水位与句柄重新初始化（C6 的「同角色多实例各持一份水位」正是这个形状）。
 * 刷新就只该是刷新：同一个 `briefingFor`，多几个调用点。
 *
 * ── 四个入口 ──────────────────────────────────────────────
 *   session_start   窗口起来（首次）
 *   投递成功后      本窗口改了状态（deliverMsg）
 *   被唤醒后        别的窗口投来消息（wake 的 onMessage / drain 的代排）
 *   agent_end       兜外部改动（另一个窗口投递而本窗口这轮没被唤醒、人手改文件）
 *
 * 前三个精确挂钩，第四个是回合边界的兜底——**不能只靠它**：一轮 LLM 可能跑几分钟，
 * 那几分钟里状态条是旧的，而人正盯着它等「待你判定」。
 *
 * ctx 一路作参数传，不存模块作用域（D-07）；`ui` 可能不存在（print/rpc 无会话窗口）。
 */
import { briefingFor } from "./status.ts";
import type { BootContext } from "./status.ts";

/** 状态条的名字。pi 按名字覆盖同名 widget，所以刷新 = 用同名再设一次 */
const NAME = "wf";

/** 刷新需要的 ctx 形状（pi 只以类型存在，这里连类型都不需要——只要这两个字段） */
export type WidgetContext = {
  cwd: string;
  mode?: string;
  ui?: { setWidget?: (name: string, lines: string[]) => void };
};

/**
 * 把当前真实状态写进状态条。
 *
 * 三个静默条件（都不该报错）：非 TUI（无会话窗口）、宿主没给 `setWidget`、
 * 配置不可用（`briefingFor` 返回 null——此时 `/doctor` 负责报诊断，状态条留旧值
 * 比清空更有用：清空会让人以为窗口坏了）。
 */
export function refreshWidget(ctx: WidgetContext, role: BootContext["role"]): void {
  if (ctx.mode !== "tui") return;
  const set = ctx.ui?.setWidget;
  if (typeof set !== "function") return;
  const brief = briefingFor(ctx.cwd, role);
  if (brief === null) return;
  set(NAME, brief.split("\n"));
}
