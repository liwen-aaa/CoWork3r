/**
 * 构造与校验。
 *
 * 两个函数，一对不对称的错误处理：
 *   `build`    抛错   —— 输入来自我们自己的代码，缺字段就是编程错误，该早死
 *   `validate` 返回值 —— 输入来自磁盘（投递方写错 / 人手改过 / 旧格式残留），必须优雅处理
 *
 * `to` 由表决定：调用方传 `to` 会被静默覆盖。这不是宽容，是让「往别处投」这件事
 * 在类型层面无从表达——老仓库那个 bug 的形态正是上层硬编码了一个 `to`。
 */
import type { Message, MsgType, Role } from "./message.ts";
import { ROUTES } from "./routes.ts";

const TYPES = Object.keys(ROUTES) as MsgType[];

const isType = (t: unknown): t is MsgType => typeof t === "string" && t in ROUTES;

/** 必填字段是否已给出。空字符串、空数组算没给——占位符不是内容（IF-004 那类教训）。 */
function hasField(fields: Record<string, unknown>, key: string): boolean {
  const v = fields[key];
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/**
 * 构造一条消息。`to` 与 `at` 自动填，必填缺失即抛错。
 *
 * `from` 必须与表一致：它是调用方唯一能弄错且我们查得出来的东西
 * （`to` 查不出来——因为我们直接覆盖它）。
 */
export function build(type: MsgType, from: Role, fields: Partial<Message> = {}): Message {
  if (!isType(type)) {
    throw new Error(`未知 type "${String(type)}"。合法取值：${TYPES.join(" / ")}`);
  }

  const route = ROUTES[type];

  if (from !== route.from) {
    throw new Error(`${type} 的 from 必须是 "${route.from}"，收到 "${from}"（方向由 ROUTES 决定）`);
  }

  const given = fields as Record<string, unknown>;
  const missing = route.requires.filter((k) => !hasField(given, k));
  if (missing.length > 0) {
    throw new Error(
      `${type} 缺必填字段：${missing.join(" / ")}（ROUTES.${type}.requires 要求 ${route.requires.join(" / ")}）`,
    );
  }

  // omit 之外的 type 一律要求 milestone。它不在 requires 里是因为几乎每条都要，
  // 写九遍不如在这里判一次——但 report 没有里程碑上下文，所以要显式豁免。
  const omitted: readonly string[] = "omit" in route ? route.omit : [];
  if (!omitted.includes("milestone") && !hasField(given, "milestone")) {
    throw new Error(`${type} 缺必填字段：milestone（仅 ROUTES 里标了 omit 的 type 可省）`);
  }

  const msg: Record<string, unknown> = { ...given };
  if (omitted.includes("milestone")) delete msg.milestone;

  return {
    round: 1,
    body: "",
    ...msg,
    type,
    from: route.from,
    // 覆盖调用方传的任何 to —— 见文件头
    to: route.to,
    at: new Date().toISOString(),
  } as Message;
}

/**
 * 校验从磁盘读回来的东西是不是一条合法消息。
 *
 * reason 会进拦截提示，所以每条都要写出**期望值**——只说「不对」等于没说
 * （老仓库 dev 4/4 vs tester 0/4 的差别就在提示措辞里有没有列出该写什么）。
 */
export function validate(
  raw: unknown,
): { ok: true; msg: Message } | { ok: false; reason: string } {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: `不是消息对象（收到 ${Array.isArray(raw) ? "数组" : typeof raw}）` };
  }

  const m = raw as Record<string, unknown>;

  if (!isType(m.type)) {
    return {
      ok: false,
      reason: `未知 type "${String(m.type)}"。合法取值：${TYPES.join(" / ")}`,
    };
  }

  const route = ROUTES[m.type];

  if (m.from !== route.from) {
    return { ok: false, reason: `${m.type} 的 from 应为 "${route.from}"，实际 "${String(m.from)}"` };
  }
  if (m.to !== route.to) {
    return { ok: false, reason: `${m.type} 的 to 应为 "${route.to}"，实际 "${String(m.to)}"` };
  }

  const missing = route.requires.filter((k) => !hasField(m, k));
  if (missing.length > 0) {
    return { ok: false, reason: `${m.type} 缺必填字段：${missing.join(" / ")}` };
  }

  const omitted: readonly string[] = "omit" in route ? route.omit : [];
  if (!omitted.includes("milestone") && !hasField(m, "milestone")) {
    return { ok: false, reason: `${m.type} 缺必填字段：milestone` };
  }

  if (typeof m.at !== "string" || Number.isNaN(Date.parse(m.at))) {
    return { ok: false, reason: `at 不是合法 ISO 时间戳（实际 "${String(m.at)}"）` };
  }

  return { ok: true, msg: m as unknown as Message };
}

/**
 * C8 注入用：只查地址，不查内容。
 *
 * 与 `validate` 分开是有意的（写实现时才看清）：`deliver` 拿到的是我们刚 build 出来的
 * 对象，此刻要防的是「上层绕过 build 直接拼了个 msg 往别处投」——那是老仓库那个 bug
 * 的形状。而 `validate` 防的是「磁盘上那玩意儿能不能信」。
 * 一个函数干两件事就是下一次混淆的来源。
 */
export function checkRoute(msg: Message): { ok: true } | { ok: false; reason: string } {
  if (!isType(msg.type)) {
    return { ok: false, reason: `未知 type "${String(msg.type)}"` };
  }
  const route = ROUTES[msg.type];
  if (msg.to !== route.to) {
    return { ok: false, reason: `${msg.type} 的投递目标应为 "${route.to}"，实际 "${String(msg.to)}"` };
  }
  if (msg.from !== route.from) {
    return { ok: false, reason: `${msg.type} 的 from 应为 "${route.from}"，实际 "${String(msg.from)}"` };
  }
  return { ok: true };
}

/** 某角色能发哪些 type。schema 生成与规约渲染都从它来。 */
export function typesFrom(role: Role): MsgType[] {
  return TYPES.filter((t) => ROUTES[t].from === role);
}
