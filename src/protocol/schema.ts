/**
 * 从表生成 `send_task` 的参数 schema。
 *
 * 两个收益，都不是风格问题：
 *
 * 一是**越权在类型层就不可能**。老仓库靠 `tool_call` 里手写
 * `if (input.to === "arch") { block }` 拦 dev 越权；这里 dev 的 schema 里
 * 根本没有那个选项，那段拦截代码整个不需要存在。
 *
 * 二是**省 token**。工具 description 与 schema 全量进 LLM 上下文，
 * 每个角色只装自己那几条 type。
 *
 * 不 import typebox：本层零运行时依赖（M6 的 A9 会 grep）。返回的是 JSON Schema
 * 结构，07-adapter 在注册工具时把它交给 pi——typebox 的 `Type.Object(...)` 产出的
 * 也是同一形状，所以那边不需要转换。
 */
import type { MsgType, Role } from "./message.ts";
import { ROUTES } from "./routes.ts";
import { typesFrom } from "./build.ts";

type JsonSchema = Record<string, unknown>;

/** 字段名 → schema 片段。新增必填字段时**只改这里**（与 tests 的 SAMPLES 表对称）。 */
const FIELDS: Record<string, JsonSchema> = {
  milestone: { type: "string", description: "里程碑 id，如 M1（照抄规划书里的写法，不要自己拼）" },
  round: { type: "number", description: "当前轮次" },
  body: { type: "string", description: "正文" },
  refs: { type: "array", items: { type: "string" }, description: "相关文件路径" },
  /** G_artifact 读它：产出/报告文件的项目根相对路径（dev 产出或 tester 报告） */
  artifact: { type: "string", description: "产出文件的项目根相对路径（如 wf/dev-output-M1.md）。G_artifact 会读它检查断言覆盖" },
  issues: {
    type: "array",
    description: "问题列表。每条关联一个断言编号，缺了会被产出结构 gate 拦下",
    items: {
      type: "object",
      properties: {
        id: { type: "string", description: "问题编号，如 M1-001" },
        severity: { type: "string", enum: ["serious", "medium", "minor"] },
        assertion: { type: "string", description: "关联断言编号，如 M1.2" },
        description: { type: "string", description: "含定位：文件 / 行 / 现象 / 复现" },
      },
      required: ["id", "severity", "description"],
    },
  },
  questions: {
    type: "array",
    items: { type: "string" },
    description: "只有人能答的那几个问题（取自该里程碑的 [human] 断言，逐条列出）",
  },
  evidence: { type: "string", description: "人写的验证凭证：验了什么、怎么验的" },
};

/**
 * 生成某角色的 `send_task` 参数 schema。
 *
 * 三条从表推导的规则：
 * - 没有 `to` 参数 —— 投递目标由 type 决定，不给调用方选
 * - 只有一个 type 时省掉 `type` 参数 —— 唯一取值不必让模型选（dev 就是这种情况）
 * - 必填字段取该角色所有 type 的**交集**；其余进可选 —— 否则 arch 发 report 时
 *   会被要求填 milestone，而 report 明确不需要它
 */
export function sendTaskSchema(role: Role): JsonSchema {
  const types = typesFrom(role);
  if (types.length === 0) {
    // human 是伪角色：有收件箱、无窗口、不发消息
    return { type: "object", properties: {}, required: [] };
  }

  const properties: JsonSchema = {};
  const required: string[] = [];

  if (types.length > 1) {
    properties.type = {
      type: "string",
      enum: types,
      description: types.map((t) => `${t}：${ROUTES[t].description}`).join("；"),
    };
    required.push("type");
  }

  // 必填 = 该角色所有 type 的必填交集（含隐式的 milestone，omit 的 type 不参与）
  const requiredSets = types.map((t) => {
    const route = ROUTES[t];
    const omitted: readonly string[] = "omit" in route ? route.omit : [];
    const base: string[] = [...route.requires];
    if (!omitted.includes("milestone")) base.push("milestone");
    return new Set<string>(base);
  });
  const intersection = [...(requiredSets[0] ?? new Set<string>())].filter((k) =>
    requiredSets.every((s) => s.has(k)),
  );

  // 可选 = 该角色可能用到的全部字段减去必填
  const union = new Set<string>(["round", "refs", "artifact"]);
  for (const s of requiredSets) for (const k of s) union.add(k);

  for (const key of [...intersection, ...[...union].filter((k) => !intersection.includes(k))]) {
    const frag = FIELDS[key];
    if (!frag) continue; // 表里出现了未知字段名 —— P2 会抓到，这里不静默造假
    properties[key] = frag;
  }
  required.push(...intersection);

  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

/** 某角色的工具 description（一行一 type，从表的 description 列来） */
export function sendTaskDescription(role: Role): string {
  const types = typesFrom(role);
  if (types.length === 0) return "本角色不发送消息。";
  if (types.length === 1) {
    const t = types[0] as MsgType;
    return `${ROUTES[t].description}（投递给 ${ROUTES[t].to}）。`;
  }
  return types.map((t) => `- ${t}：${ROUTES[t].description}（→ ${ROUTES[t].to}）`).join("\n");
}
