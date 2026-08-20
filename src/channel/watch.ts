/**
 * 唤醒：fs.watch + 轮询兜底 + 水位标记。**唯一有定时器的文件。**
 *
 * C1 事件不可靠：Windows 上 fs.watch 会漏事件——消息写进去了，回调不触发，
 * 整条流水线静默停住。所以唤醒是双通道：fs.watch 给低延迟，setInterval 给保底。
 * 轮询比对 mtime，不读文件内容，零 token 成本。
 *
 * 不要试图「修好」fs.watch 来去掉轮询。轮询的成本是零，漏事件的代价是整条流水线无声停止。
 *
 * 三个时机照抄老仓库（数字是试出来的）：启动补收 500ms、事件后 200ms 等写入完成、
 * 轮询 10s。但**触发器的注册方式重写了**：老仓库 fs.watch 无句柄、setInterval 不存
 * 返回值、watchInbox 无返回值——建了就关不掉，于是它的测试只能靠 process.chdir 躲开
 * 上一个用例还活着的 watcher。本文件存所有句柄并返回 Stop。
 */
import { mkdirSync, statSync, watch as fsWatch, readFileSync } from "node:fs";

import type { Message, Role } from "../protocol/message";
import { writeTextAtomic } from "./atomic";
import { clearIfSame, peek } from "./inbox";
import { channelPaths } from "./paths";

/** 关掉所有定时器与 watcher。测试里必须能停，否则进程不退出（plan.md M1 有一条断言） */
export type Stop = () => void;

export type Watcher = { close: () => void };

export type WatchOptions = {
  /**
   * 事件通道。`null` = 明确禁用，只留轮询。
   *
   * 这不是测试后门：fs.watch 在 Windows 漏事件时的表现，就是这个开关关掉的样子，
   * 而 C1 的判据正是「没有 fs.watch 也能工作」。
   */
  watch?: ((dir: string, onChange: (filename: string | null) => void) => Watcher) | null;
  /** 轮询周期，缺省 10s */
  pollMs?: number;
  /** 收到事件后等写入完成的延迟，缺省 200ms */
  eventDebounceMs?: number;
  /** 启动补收延迟，缺省 500ms */
  catchupMs?: number;
  /**
   * 异常记录口。缺省 console.warn。
   *
   * 老仓库这几处是 `try {} catch {}`：行为对（水位写失败不该让消息处理崩掉），
   * 但空吞正是 05-gates 那条教训的形状——它的防偷懒 gate 因 catch {} 静默失效过，
   * 而且是人审查时发现的，不是它自己报的。所以吞异常，但留一条可观测记录。
   */
  onWarn?: (message: string) => void;
};

const defaultWatch = (dir: string, onChange: (filename: string | null) => void): Watcher =>
  fsWatch(dir, (_event, filename) => onChange(filename));

function mtimeOf(file: string): number {
  try {
    return statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

export function watchInbox(
  root: string,
  role: Role,
  onMessage: (msg: Message) => void,
  options: WatchOptions = {},
): Stop {
  const {
    watch = defaultWatch,
    pollMs = 10_000,
    eventDebounceMs = 200,
    catchupMs = 500,
    onWarn = (m: string) => console.warn(m),
  } = options;

  const p = channelPaths(root);
  const inboxFile = p.inbox(role);
  const inboxName = `to-${role}.json`;

  /**
   * 目录必须先在：`fs.watch` 对不存在的目录会抛错。
   *
   * 少了这一句，全新项目的第一个窗口会静默退化成「只有轮询」——下面那个 catch
   * 把异常吞掉，唤醒延迟从 200ms 变成 10s，而没有任何症状。老仓库在 `watchInbox`
   * 开头调 `ensureDirs()`，是同一件事。
   */
  try {
    mkdirSync(p.msgDir, { recursive: true });
  } catch (e) {
    onWarn(`[channel] 创建 ${p.msgDir} 失败：${String(e)}`);
  }

  /**
   * C3 水位：**每次都从磁盘读**，不在内存里缓存。
   *
   * 内存缓存有两个问题。一是重启就没了（这是 C3 存在的理由）。二是同角色多实例时
   * 两个实例各持一份 0，会同时判定「有新消息」并双双处理——C6 那条事实就变成了
   * 竞态而不是确定行为。读盘 + `check()` 全同步 = 两个 check 不可能交错，
   * 后到的那个必然看到已推进的水位。
   *
   * 已知盲区：同一毫秒内两次写入可能被判为一次。实际写入间隔远大于此，
   * 且轮询会在下一周期兜住。
   */
  const readWatermark = (): number => {
    try {
      return Number(readFileSync(p.processed(role), "utf-8")) || 0;
    } catch {
      return 0;
    }
  };

  const markWatermark = (mtime: number): void => {
    try {
      writeTextAtomic(p.processed(role), String(mtime));
    } catch (e) {
      onWarn(`[channel] 水位标记写入失败（${role}，mtime=${mtime}）：${String(e)}`);
    }
  };

  /** 全同步。异步化会让 C6 的「只处理一次」重新变成竞态。 */
  const check = (): void => {
    const mtime = mtimeOf(inboxFile);
    if (mtime === 0 || mtime <= readWatermark()) return;

    const msg = peek(root, role);
    // C8 的读侧：不属于自己的消息不认，**且不推水位**——保留在原地才有机会被发现
    // （它可能是投递方写错了地址）。半截 JSON 同理：下一轮再看。
    if (!msg || msg.to !== role) return;

    markWatermark(mtime);

    try {
      onMessage(msg);
    } catch (e) {
      onWarn(`[channel] onMessage 抛错（${role}，type=${msg.type}）：${String(e)}`);
    }

    // C2：处理后条件清空。放在 onMessage 之后——处理期间到的新消息由四字段比对挡住
    try {
      clearIfSame(root, role, msg);
    } catch (e) {
      onWarn(`[channel] 清空收件箱失败（${role}）：${String(e)}`);
    }
  };

  const timers: NodeJS.Timeout[] = [];
  let watcher: Watcher | null = null;
  let stopped = false;

  const schedule = (fn: () => void, ms: number): void => {
    const t = setTimeout(() => {
      if (!stopped) fn();
    }, ms);
    timers.push(t);
  };

  // 启动补收：窗口关闭期间到的消息
  schedule(check, catchupMs);

  if (watch) {
    try {
      watcher = watch(p.msgDir, (filename) => {
        if (filename === inboxName || filename === null) schedule(check, eventDebounceMs);
      });
    } catch (e) {
      // 目录不存在或平台不支持 → 只剩轮询。这正是 C1 存在的理由，不该让窗口起不来
      onWarn(`[channel] fs.watch 注册失败，仅用轮询兜底：${String(e)}`);
      watcher = null;
    }
  }

  const interval = setInterval(check, pollMs);
  timers.push(interval);

  return () => {
    stopped = true;
    for (const t of timers) {
      clearTimeout(t);
      clearInterval(t);
    }
    timers.length = 0;
    try {
      watcher?.close();
    } catch (e) {
      onWarn(`[channel] watcher.close() 抛错：${String(e)}`);
    }
    watcher = null;
  };
}
