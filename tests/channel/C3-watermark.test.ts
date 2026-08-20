/**
 * C3 水位标记（`.processed-<role>`）
 *
 * 内存里的「上次处理到哪」重启就没了，所以水位落盘（存 mtime 数字）。
 * 判定新消息 = `mtime > processed`。
 *
 * 「重启」在测试里 = Stop 掉一个 watchInbox，再建一个新的。
 * 这正是 `Stop` 存在的第二个理由（第一个是套件能自行退出）。
 *
 * 第二个用例是读侧那条（reuse.md「水位判据」行）：不属于自己的消息不认，
 * 且**不推水位**——所以它不会被吃掉，仍等着正确的角色来收。
 */
import { readFileSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { channelPaths, deliver, watchInbox } from "../../src/channel/index.ts";
import { build, checkRoute } from "../../src/protocol/index.ts";
import { makeRoot, sleep, waitFor } from "./_fixture.ts";

describe("C3 水位标记", () => {
  it("重启后不重放旧消息", async () => {
    const { root, cleanup } = makeRoot("C3-mark");
    const p = channelPaths(root);

    const first: string[] = [];
    const stop1 = watchInbox(root, "dev", (m) => void first.push(m.type), {
      watch: null,
      pollMs: 200,
    });

    try {
      deliver(root, build("task_assignment", "arch", { body: "通道层测试消息", milestone: "M1" }), checkRoute);
      await waitFor(() => first.length > 0, 5_000);
      stop1();

      // 水位必须落盘，否则「重启」等于从零开始
      const mark = Number(readFileSync(p.processed("dev"), "utf-8"));
      expect(mark).toBeGreaterThan(0);

      // 构造真正的重放场景：文件里有旧消息，且它的 mtime 不比水位新。
      // （这是进程被杀在 C2 清空之前的形态：内容还在，而水位已经推过了。
      //   不能直接 writeFileSync 了事——那会给它一个比水位新的 mtime，
      //   于是它就是一条真的新消息，被处理是对的，测不到 C3。）
      const stale = build("task_assignment", "arch", { body: "通道层测试消息", milestone: "M1" });
      writeFileSync(p.inbox("dev"), JSON.stringify(stale), "utf-8");
      const old = (mark - 5_000) / 1_000; // utimes 收秒
      utimesSync(p.inbox("dev"), old, old);
      expect(statSync(p.inbox("dev")).mtimeMs).toBeLessThan(mark);

      const second: string[] = [];
      const stop2 = watchInbox(root, "dev", (m) => void second.push(m.type), {
        watch: null,
        pollMs: 200,
      });
      try {
        // 水位从盘上读回来了，所以这条旧消息不得再被当成新任务
        await sleep(900);
        expect(second).toEqual([]);
      } finally {
        stop2();
      }
    } finally {
      cleanup();
    }
  });

  it("不属于自己的消息不处理，且不推水位（C8 的读侧）", async () => {
    const { root, cleanup } = makeRoot("C3-notmine");
    const p = channelPaths(root);

    const seen: string[] = [];
    const stop = watchInbox(root, "dev", (m) => void seen.push(m.type), {
      watch: null,
      pollMs: 200,
    });

    try {
      // 手写一条 to 错的消息进 dev 的收件箱。deliver 不可能产出它（C8 会拦），
      // 所以只能直接落盘——外部工具或手改 JSON 的真实形态。
      const wrong = { ...build("task_assignment", "arch", { body: "通道层测试消息", milestone: "M1" }), to: "tester" };
      writeFileSync(p.inbox("dev"), JSON.stringify(wrong), "utf-8");

      await sleep(800); // 三个以上轮询周期
      expect(seen).toEqual([]);

      // 水位没被推进 —— 否则这条消息就被静默吃掉了，而它可能是投递方写错了地址，
      // 保留在原地才有机会被发现
      let processed = 0;
      try {
        processed = Number(readFileSync(p.processed("dev"), "utf-8"));
      } catch {
        processed = 0; // 文件不存在也算没推进
      }
      expect(processed).toBe(0);
    } finally {
      stop();
      cleanup();
    }
  });
});
