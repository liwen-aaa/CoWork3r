/**
 * 读取 + 诊断分级。
 *
 * 判据一句话：**区分「主动不配」与「配错」。**
 * 前者静默降级合法（`test: null` → info），后者必须告警且阻止「宣布完成」（fatal）。
 *
 * 老仓库的 `catch { return {} }` 把这两件事当成同一件——一个逗号写错就能让整条验证链
 * 无声关闭，而配置者以为自己配了。所以 fatal 时 `cfg` 是 `null` 而不是半成品：
 * 类型层面就不给「拿到一个看起来能用的配置」这个机会。
 *
 * fatal 时**开发可以继续**，只是不能宣布通过。这个不对称在 05-gates 兑现
 * （拦 verdict_pass，放行 review_request）：配置坏了不该阻止你写代码，
 * 必须阻止你说「测过了」。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { CONFIG_FILENAME, FIELDS, LEGACY_FIELDS, TEST_NULL_NOTICE, type Config } from "./fields.ts";

export type Diagnostic = { level: "fatal" | "warn" | "info"; message: string };

export type Inspection = { cfg: Config | null; diagnostics: Diagnostic[] };

const fatal = (message: string): Diagnostic => ({ level: "fatal", message });
const warn = (message: string): Diagnostic => ({ level: "warn", message });
const info = (message: string): Diagnostic => ({ level: "info", message });

function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

export function inspectConfig(root: string): Inspection {
  const file = join(root, CONFIG_FILENAME);
  const diagnostics: Diagnostic[] = [];

  let text: string;
  try {
    text = readFileSync(file, "utf-8");
  } catch {
    // 文件不存在不是「主动不配」——三项必填拿不到，什么都做不了
    return {
      cfg: null,
      diagnostics: [fatal(`找不到 ${CONFIG_FILENAME}（应在项目根）。三项必填：plan / source / test`)],
    };
  }

  if (text.trim() === "") {
    return {
      cfg: null,
      diagnostics: [fatal(`${CONFIG_FILENAME} 是空文件。三项必填：plan / source / test`)],
    };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return {
      cfg: null,
      diagnostics: [fatal(`${CONFIG_FILENAME} JSON 语法错：${String(e)}`)],
    };
  }

  // 顶层必须是对象。数组、字符串、数字、null 全部不行——它们都能通过 JSON.parse，
  // 而后续的字段读取会全部拿到 undefined，等于所有 gate 静默关闭
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {
      cfg: null,
      diagnostics: [
        fatal(`${CONFIG_FILENAME} 顶层必须是 JSON 对象（当前是 ${Array.isArray(raw) ? "数组" : String(raw === null ? "null" : typeof raw)}）`),
      ],
    };
  }

  const obj = raw as Record<string, unknown>;
  const known = new Set(Object.keys(FIELDS));

  // 未知字段 → warn。拼错一个字段名的后果是「那项不生效」，不是「整条链关闭」，
  // 所以不是 fatal。但必须出声：老仓库这里零校验，写错 tesDir 等于那个 gate 静默不存在
  for (const key of Object.keys(obj)) {
    if (known.has(key)) continue;
    const legacy = (LEGACY_FIELDS as readonly string[]).includes(key);
    diagnostics.push(
      warn(
        legacy
          ? `字段 ${key} 是老仓库的字段，本版已删除，不生效（对应机制已取消）`
          : `未知字段 ${key}，不生效（字段表不可扩展）`,
      ),
    );
  }

  const out: Record<string, unknown> = {};
  let hasFatal = false;

  for (const [name, spec] of Object.entries(FIELDS)) {
    const present = Object.hasOwn(obj, name);
    const value = obj[name];

    if (!present) {
      if (spec.required) {
        // G5 的另一半：字段整个缺失是遗漏，不许含糊过去。
        // 与 `test: null`（一个声明）级别不同
        hasFatal = true;
        diagnostics.push(
          fatal(
            name === "test"
              ? `缺必填字段 test。没有自动化基建请显式写 "test": null（D-23：不许静默降级）`
              : `缺必填字段 ${name}`,
          ),
        );
      } else if (spec.kind === "number") {
        out[name] = spec.default;
      }
      continue;
    }

    switch (spec.kind) {
      case "string-or-null": {
        if (value === null) {
          // 主动声明「本项目没法自动测」。合法，但常驻提示——空 gate 是合法的，
          // 静默的空 gate 不是（D-23）
          out[name] = null;
          diagnostics.push(info(TEST_NULL_NOTICE));
          break;
        }
        if (typeof value !== "string" || value.trim() === "") {
          // 空串不是声明，是没写完
          hasFatal = true;
          diagnostics.push(fatal(`必填字段 ${name} 必须是非空字符串或 null（当前是空值）`));
          break;
        }
        out[name] = value;
        break;
      }

      case "string": {
        if (typeof value !== "string" || value.trim() === "") {
          if (spec.required) {
            hasFatal = true;
            diagnostics.push(fatal(`必填字段 ${name} 必须是非空字符串`));
          } else {
            diagnostics.push(warn(`字段 ${name} 类型应为 string，已忽略`));
          }
          break;
        }
        out[name] = value;
        break;
      }

      case "regex": {
        if (typeof value !== "string") {
          diagnostics.push(warn(`字段 ${name} 类型应为 string，已忽略`));
          break;
        }
        if (!isValidRegex(value)) {
          // fatal 而非 warn：05-gates 会 new RegExp 它，非法正则抛异常的时机是
          // 「tester 正要报 PASS」——最不该崩的时刻。宁可启动时就红
          hasFatal = true;
          diagnostics.push(fatal(`字段 ${name} 不是合法正则：${value}`));
          break;
        }
        out[name] = value;
        break;
      }

      case "number": {
        if (typeof value !== "number" || !Number.isFinite(value)) {
          // 回退到缺省，不带着坏值往下传
          diagnostics.push(warn(`字段 ${name} 类型应为 number，已回退到缺省值 ${spec.default}`));
          out[name] = spec.default;
          break;
        }
        out[name] = value;
        break;
      }
    }
  }

  return { cfg: hasFatal ? null : (out as unknown as Config), diagnostics };
}

/** fatal 的单行摘要，用于拦截 reason；无 fatal 返回 null */
export function fatalReason(diagnostics: Diagnostic[]): string | null {
  const fatals = diagnostics.filter((d) => d.level === "fatal");
  if (fatals.length === 0) return null;
  return `配置有 ${fatals.length} 处 fatal：${fatals.map((d) => d.message).join("；")}`;
}
