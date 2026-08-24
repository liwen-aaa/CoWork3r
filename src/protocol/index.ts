/**
 * 协议层出口。
 *
 * 职责：定义「谁能给谁发什么」，并让路由、参数 schema、文档三者都从同一张表派生。
 *
 * ── 为什么它是独立一层 ────────────────────────────────────
 * 老仓库那个 bug：`ticket_result` 通道有七处声明（schema、tool_call 拦截、ADR、
 * 契约文档、约定台账、两项行为验证），零处让它工作——消息被投进 tester 的收件箱，
 * arch 永远收不到。七处全都正确，而它们没有一处是唯一真相源。
 *
 * 所以本层的存在理由不是「整理文档」，是**让路由无法与声明不一致——因为它们是同一个东西**。
 * `ROUTES` 里加一条 type 而忘了实现，它就发不出去；忘了加，就根本不存在。
 *
 * ── 一表四处派生 ──────────────────────────────────────────
 *   路由      deliver 查 ROUTES[type].to        → 不可能发错地址
 *   schema    sendTaskSchema(role)              → 不可能声明未实现的通道
 *   文档      npm run docs:protocol             → 文档不可能与代码不一致
 *   工具描述  sendTaskDescription(role)         → 每个角色只装自己那几条
 *
 * ── 依赖 ──────────────────────────────────────────────────
 * 无。纯数据 + 纯函数，不 import 任何模块（包括 channel）。
 * 01-channel 从本层 `import type` 取 Message / Role，并在 deliver 时调注入的
 * checkRoute——两边都不运行时 import 对方。
 *
 * 不负责：
 * - **投递** —— 写文件是 01-channel 的事。本层只说「该写给谁」
 * - **状态机** —— 「PASS 之后该干什么」是 07-adapter 的事。本层只管单条消息的合法性
 * - **业务判定** —— 任何 {ok, reason} 形式的验收判断在 05-gates
 * - **消息历史** —— 不追加、不审计
 *
 * 已知取舍：表是硬编码常量，不可配置。有人会想「让接入项目自定义角色和消息类型」——
 * 不做：零失败模式驱动（D-40），且角色集合改变意味着 D-01（生产者不能自证完成）
 * 的形状变了，那不是配置项，那是另一个工作流。
 */
export { build, checkRoute, resolveType, typesFrom } from "./build.ts";
export type { Issue, Message, MsgType, Role } from "./message.ts";
export { ROUTES } from "./routes.ts";
export { sendTaskDescription, sendTaskSchema } from "./schema.ts";
