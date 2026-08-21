/**
 * G-human：给人的问题必须是这个里程碑具体的那几个。
 *
 * **老仓库没有这道 gate。** 它的来源是老仓库自己的一组观察：
 * **没有一个里程碑的缺陷是被人工关卡抓到的。** 人抓到的两件事都是 harness 缺陷
 * （gate 缺 import、环境变量带空格），不是内容缺陷。
 *
 * 原因不是人不认真。当时给人的是三条通用方向——「结构 / 内容实质 / 引用真实性」，
 * 那等于没给：人拿到它只能泛泛看一眼。人打开消息时该看到的是**这个里程碑的
 * 那几个 `[human]` 断言**，而且是自己在澄清阶段说出来的话（D-21）。
 *
 * `questions` 在 02-protocol 里是 `verdict_pass` 的必填字段，空列表根本发不出去。
 * 本层管的是另一件事：**非空不等于覆盖。**
 */
import { block, ok, type Result } from "./types.ts";
import type { Milestone } from "../plan/index.ts";

const NAME = "G_human";

export function checkHumanQuestions(questions: string[], m: Milestone): Result {
  const humans = m.assertions.filter((a) => a.kind === "human");

  // 没有 [human] 条目就不该硬要求人回答什么——那只会逼出「凑一个问题」，
  // 而凑出来的问题正是那三条通用方向的成因
  if (humans.length === 0) return ok();

  if (questions.length === 0) {
    return block(
      NAME,
      `${m.id} 有 ${humans.length} 条 [human] 断言要人判，questions 不能是空的：` +
        humans.map((a) => a.id).join("、"),
    );
  }

  const joined = questions.join("\n");
  const miss = humans
    .filter((a) => !new RegExp(`${a.id.replace(".", "\\.")}(?![0-9])`).test(joined))
    .map((a) => a.id);

  if (miss.length > 0) {
    return block(
      NAME,
      `questions 没覆盖这几条 [human] 断言：${miss.join("、")}。` +
        `每条一个问题，带上编号——通用方向（「结构 / 内容实质 / 引用真实性」这类）不算：` +
        `问题必须具体到这条断言，让人能直接回答是或不是`,
    );
  }

  return ok();
}
