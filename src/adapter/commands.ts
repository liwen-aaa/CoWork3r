/**
 * 命令注册：/status /pass /fail /role /doctor /research。
 *
 * 07-adapter 的五个命令 + 08-dist 的 /doctor /research 都在这里集中注册，
 * wire.ts 只调 `registerCommands(role, pi)`。分开的理由：wire 有 A6 行数上限
 * （≤120），命令 handler 是纯「读参数 → 调纯函数 → 发回窗口」的薄层。
 *
 * 命令不是工具：由人（或窗口使用者）在输入框触发，不走 LLM 工具调用。
 * 每条的判据在它调用的纯函数里，本文件不引入新判据（/doctor 的硬约束）。
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { inspectConfig } from "../config/index.ts";
import { parsePlan, milestone, checkMilestone, frontier } from "../plan/index.ts";
import { readState } from "../channel/index.ts";
import { briefingFor } from "./status.ts";
import { research } from "../dist/research.ts";
import { loadRoleSpec } from "../roles/index.ts";
import type { WindowRole } from "./activate.ts";

export function registerCommands(role: WindowRole, pi: ExtensionAPI): void {
  // ── /status：四行（briefingFor 是唯一拼装处，与 session_start 共用，D-03）──
  pi.registerCommand("status", {
    description: "四行状态：里程碑 / 待人工 / 未决 / 降级提示",
    handler: async (args, ctx) => {
      const text = briefingFor(ctx.cwd, role);
      if (text === null) {
        ctx.ui.notify("配置解析失败，无法生成 /status（跑 /doctor 看诊断）", "error");
        return;
      }
      ctx.ui.notify(text, "info");
    },
  });

  // ── /role：打印当前规约（补 /skill:name 的缺）──
  pi.registerCommand("role", {
    description: "打印当前角色规约",
    handler: async (_args, ctx) => {
      ctx.ui.notify(loadRoleSpec(role), "info");
    },
  });

  // ── /doctor：配置 + 规划书自查。不得引入新判据（08-dist 硬约束）──
  pi.registerCommand("doctor", {
    description: "配置与规划书自查（不开窗口也能跑）",
    handler: async (_args, ctx) => {
      const { cfg, diagnostics } = inspectConfig(ctx.cwd);
      const lines = diagnostics.map((d) => `[${d.level}] ${d.message}`);
      if (!cfg) {
        ctx.ui.notify(`配置检查：${lines.join("\n")}`, "error");
        return;
      }
      const parsed = parsePlan(ctx.cwd, cfg.plan);
      if (!parsed.ok) {
        ctx.ui.notify(`规划书解析失败：${parsed.errors.map((e) => `${e.line}:${e.message}`).join("\n")}`, "error");
        return;
      }
      const st = readState(ctx.cwd);
      const m = milestone(parsed.plan, st.milestone);
      const check = m ? checkMilestone(m) : { ok: true };
      ctx.ui.notify(
        `配置：${lines.length === 0 ? "零诊断" : lines.join("\n")}\n规划书：${parsed.ok ? "解析通过" : "失败"}\n当前里程碑：${m ? `${m.id} ${check.ok ? "可测" : check.reason}` : "（未开始）"}`,
        check.ok ? "info" : "error",
      );
    },
  });

  // ── /research：未决表 [auto] 条目派查（08-dist 状态机）──
  pi.registerCommand("research", {
    description: "未决表 [auto] 条目：/research 列出、/research P2 派查、P2 done 结论||依据 标记已回、P2 fail 原因 回退",
    handler: async (args, ctx) => {
      const { cfg } = inspectConfig(ctx.cwd);
      if (!cfg) return;
      const parsed = parsePlan(ctx.cwd, cfg.plan);
      if (!parsed.ok) return;
      const id = args?.trim();
      if (!id) {
        // 列出 toQuery（前置已清、状态 open 的 [auto]）
        const fr = frontier(parsed.plan.pending);
        const list = fr.toQuery.map((p) => `${p.id} ${p.text.slice(0, 40)}`).join("\n");
        ctx.ui.notify(list === "" ? "没有可查的 [auto] 条目" : `可查：\n${list}`, "info");
        return;
      }
      const clean = id.replace(/^--redo\s*/, "");
      // finish 子命令（A11）：查完怎么回来——done 带结论||依据，fail 带原因。
      // 曾只有 start，finish 有状态机实现而无命令层入口（/research 半个状态机）
      const m = clean.match(/^(P\d+)\s+(done|fail)\s+(.+)$/s);
      if (m) {
        const [, pid, verb, rest] = m;
        const rid = pid ?? "";
        const rrest = rest ?? "";
        const r =
          verb === "done"
            ? (() => {
                const sep = rrest.indexOf("||");
                const conclusion = (sep >= 0 ? rrest.slice(0, sep) : rrest).trim();
                const evidence = (sep >= 0 ? rrest.slice(sep + 2) : "").trim();
                return research({ root: ctx.cwd, rel: cfg.plan, id: rid, action: "finish", note: { conclusion, evidence } });
              })()
            : research({
                root: ctx.cwd,
                rel: cfg.plan,
                id: rid,
                action: "finish",
                note: { conclusion: "", evidence: "" },
                failReason: rrest.trim(),
              });
        ctx.ui.notify(r.ok ? `${pid} 已回` : r.reason, r.ok ? "info" : "error");
        return;
      }
      const r = research({ root: ctx.cwd, rel: cfg.plan, id: clean, action: "start" });
      ctx.ui.notify(r.ok ? `已派查 ${clean}（状态 → 查中）` : r.reason, r.ok ? "info" : "error");
    },
  });
}

