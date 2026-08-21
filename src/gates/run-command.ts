/**
 * G-command：真跑命令。
 *
 * 这道 gate 是「AI 谎报完成」最直接的堵法：不问它测过了没有，自己跑一遍看退出码。
 *
 * 三个细节各有来源：
 *
 * **超时可注入。** 缺省从 `cfg.testTimeoutMs`（120s）来，但参数能覆盖。不可注入的
 * 超时会让「测超时路径」的用例得真等两分钟，而那种用例最后一定会被调短或跳过——
 * 然后超时这条路就再没人测过。
 *
 * **输出只留尾部。** 失败信息几乎总在末尾（栈、失败列表、退出提示）。头部是安装
 * 与编译噪声。塞一万行进 reason 等于没有 reason。
 *
 * **异常不吞。** 老仓库自己的防偷懒 gate 因为 `catch {}` 静默失效过，而且是人审查
 * 时发现的，不是 gate 自己报的。D-32 说环境即边界：命令跑不起来是**报告**，
 * 不是重试也不是当成通过。
 *
 * 同步阻塞是有意的（已知取舍）：一个跑 5 分钟的套件会让 tester 窗口卡 5 分钟。
 * 异步化需要状态机，而阻塞的语义更清楚——gate 没跑完，你就没法宣布通过。
 */
import { spawnSync } from "node:child_process";

import { block, ok, type Result } from "./types.ts";
import type { Config } from "../config/index.ts";

const NAME = "G_command";

/** reason 里留多少字符的命令输出。800 够看清失败列表，又不会淹掉前面那句话 */
const TAIL = 800;

/**
 * 命令输出解码：先严格 UTF-8，不合法则回退 GBK。
 *
 * Windows 的 cmd.exe 在中文系统上用 GBK（代码页 936）写 stderr，而 `encoding: "utf-8"`
 * 会把它解成一串替换字符。实测 `wf-no-such-command` 的报错：
 *   UTF-8 → `'wf-no-such-command' �����在…`
 *   GBK   → `'wf-no-such-command' 不是内部或外部命令，也不是可运行的程序`
 *
 * 这不是美观问题。本层存在的理由就是「拦住之后那句话要告诉人下一步干什么」
 * （dev 4/4 与 tester 0/4 的差别全部来自措辞），一堆乱码的 reason 等于没有 reason。
 *
 * 顺序是 UTF-8 优先：真实项目的测试输出绝大多数是 UTF-8，只有 shell 自己的报错走
 * 系统代码页。反过来不行——GBK 能解任意字节、几乎不报错，所以只能拿严格 UTF-8 当判据。
 */
function decode(buf: Buffer | null): string {
  if (buf === null || buf.length === 0) return "";
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    try {
      return new TextDecoder("gbk").decode(buf);
    } catch {
      // ICU 裁剪版没有 gbk：宽松 UTF-8 至少能读出 ASCII 那部分（命令名、路径）
      return buf.toString("utf-8");
    }
  }
}

function tail(text: string): string {
  const t = text.trimEnd();
  return t.length <= TAIL ? t : `…（前略）\n${t.slice(-TAIL)}`;
}

export function G_command(ctx: {
  root: string;
  command: string;
  timeoutMs: number;
  passPattern?: string;
  /** 出现在 reason 里的名字，如 "test" / "gate"。缺省按命令本身称呼 */
  label?: string;
}): Result {
  const label = ctx.label ?? "命令";

  const r = spawnSync(ctx.command, {
    shell: true,
    cwd: ctx.root, // 在项目根跑，不在本仓库根跑
    timeout: ctx.timeoutMs,
    // 拿 buffer 而不是让 spawnSync 直接解成 utf-8：系统代码页的 stderr 需要回退
    encoding: "buffer",
    maxBuffer: 32 * 1024 * 1024,
  });

  const out = `${decode(r.stdout)}${decode(r.stderr)}`;

  // 超时：spawnSync 给 error.code === "ETIMEDOUT"，status 为 null、signal 为 SIGTERM
  if (r.error && (r.error as NodeJS.ErrnoException).code === "ETIMEDOUT") {
    return block(
      NAME,
      `${label}超时（${ctx.timeoutMs}ms 未结束）：${ctx.command}\n` +
        `要么它真的慢（调大 wf.config.json 的 testTimeoutMs），要么它卡住了\n${tail(out)}`,
    );
  }

  // 其它 spawn 层错误（shell 起不来这类）。D-32：报告，不重试
  if (r.error) {
    return block(NAME, `${label}没跑起来：${ctx.command}\n${String(r.error)}\n${tail(out)}`);
  }

  if (r.status !== 0) {
    return block(
      NAME,
      `${label}失败（退出码 ${r.status}）：${ctx.command}\n${tail(out)}`,
    );
  }

  if (ctx.passPattern !== undefined && ctx.passPattern !== "") {
    // 配置层已经校验过它是合法正则（03-config 的 regex 分级是 fatal，
    // 理由就是这里 new RegExp 的时机是「tester 正要报 PASS」）
    if (!new RegExp(ctx.passPattern).test(out)) {
      return block(
        NAME,
        `${label}退出码是 0，但输出里找不到通过标记 /${ctx.passPattern}/：${ctx.command}\n${tail(out)}`,
      );
    }
  }

  return ok();
}

/**
 * 这道 gate 现在是不是空的，以及那句常驻提示。
 *
 * D-23：空 gate 合法，**静默的**空 gate 不合法。`test: null` 是人主动声明
 * 「本项目没法自动测」，那句提示要进启动简报与 `/status`（D-30 视线路径）。
 */
export function commandGateStatus(cfg: Config): { empty: boolean; notice?: string } {
  if (cfg.test === null) {
    return {
      empty: true,
      notice: "自动验证已关闭（test: null）：PASS 只靠结构检查 + 人工关卡",
    };
  }
  return { empty: false };
}
