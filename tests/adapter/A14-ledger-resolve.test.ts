/**
 * A14 放行后勾掉该里程碑的待办（台账不留已答的问题）
 *
 * 来源（2026-08-24 wf-demo 真跑）：M1 放行完成、`state.awaitingHuman` 已消费成空串，
 * 而 `/pending` 与状态条**仍列出 M1.5**——那条问题人已经答过了。
 *
 * 根因：`milestone_passed` 只 `clearInbox(root, "human")` 清**槽位**，台账那条
 * `- [ ]` 没人动。当时的理由是 D-34「物理删除归人」——但**勾选不是删除**，
 * 它是状态推进（这条已答完）。把两者混为一谈的后果：跑十个里程碑积十条假待办，
 * D-30 的载体被噪音淹掉，而它存在的全部意义就是「不看就会漏的东西在视线里」。
 *
 * 判据：放行某里程碑后，台账里**属于该里程碑**的 `- [ ]` 变成 `- [x]`，
 * 其它里程碑的不动（放行 M1 不该影响 M2 的待办）。行文本身不改一个字——
 * 只改勾选框，历史仍在（D-34 守的是「不删内容」，这条守得住）。
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { FLOW } from "../../src/adapter/index.ts";
import { appendHumanLedger, channelPaths, humanPendingItems, writeState } from "../../src/channel/index.ts";
import { build } from "../../src/protocol/index.ts";
import { makeProject, realMilestone } from "./_fixture.ts";

const Q1 = "M1.2 文件内容读起来是句人话吗";
const Q2 = "M2.5 long 形态的单复数读起来自然吗";

/** 台账里放一条某里程碑的待判定项（走真实渲染） */
function pend(root: string, milestone: string, question: string): void {
  appendHumanLedger(
    root,
    build("verdict_pass", "tester", { milestone, artifact: `wf/test-report-${milestone}.md`, questions: [question] }),
  );
}

function ledger(root: string): string {
  return readFileSync(channelPaths(root).humanLedger, "utf-8");
}

/** 放行某里程碑（走 FLOW，与真实投递同一条路） */
function release(root: string, milestone: string): void {
  writeState(root, { milestone, round: 1, maxRounds: 3, consecutiveFails: 0, awaitingHuman: milestone });
  FLOW.milestone_passed({
    root,
    msg: build("milestone_passed", "arch", { milestone, evidence: "人原话:可以过 arch 整理:已核对 确认:Y" }),
    milestone: realMilestone("M1"),
  });
}

describe("A14 放行后勾掉待办", () => {
  it("放行 M1 → 台账里 M1 的待办变成已勾选（真跑里它一直留着）", () => {
    const p = makeProject("a14-resolve");
    try {
      pend(p.root, "M1", Q1);
      expect(humanPendingItems(p.root).lines).toHaveLength(1);

      release(p.root, "M1");

      expect(humanPendingItems(p.root).lines, "放行后那条已答的问题不该还在待办里").toHaveLength(0);
      expect(ledger(p.root)).toContain("- [x]");
      // 内容一个字不改：D-34 守的是不删内容，勾选只是状态推进
      expect(ledger(p.root)).toContain(Q1);
    } finally {
      p.cleanup();
    }
  });

  it("只勾该里程碑的：放行 M1 不动 M2 的待办", () => {
    const p = makeProject("a14-scope");
    try {
      pend(p.root, "M1", Q1);
      pend(p.root, "M2", Q2);
      expect(humanPendingItems(p.root).lines).toHaveLength(2);

      release(p.root, "M1");

      const left = humanPendingItems(p.root).lines;
      expect(left, "M2 的待办不该被 M1 的放行带走").toHaveLength(1);
      expect(left[0]).toContain("M2.5");
    } finally {
      p.cleanup();
    }
  });

  it("台账不存在时放行不崩（还没有人工关卡就直接放行的项目）", () => {
    const p = makeProject("a14-noledger");
    try {
      expect(() => release(p.root, "M1")).not.toThrow();
      expect(humanPendingItems(p.root).lines).toHaveLength(0);
    } finally {
      p.cleanup();
    }
  });

  it("已勾选的不重复勾（幂等：同一里程碑放行两次）", () => {
    const p = makeProject("a14-idempotent");
    try {
      pend(p.root, "M1", Q1);
      release(p.root, "M1");
      const once = ledger(p.root);
      release(p.root, "M1");
      expect(ledger(p.root), "第二次放行不该改动台账").toBe(once);
    } finally {
      p.cleanup();
    }
  });
});
