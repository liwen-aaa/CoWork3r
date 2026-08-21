/**
 * G-artifact：产出文件的结构要求，**从断言表推导**（D-22）。
 *
 * 老仓库硬性要求固定小节：dev 产出三节、tester 报告两节。后果是改一行代码也得凑
 * 五份格式，于是长出 S 档位来豁免仪式，然后档位判定自己又需要治理——一个机制
 * 生出两个机制。这里把它换成线性缩放：**每条断言一行结论。**
 * 两条断言的里程碑，产出就是两行。S/L 档位这个概念因此不需要存在。
 *
 * reason 必须明文列出缺哪几条编号。这不是礼貌，是这一层唯一被实测验证过的杠杆：
 * 老仓库 tester 报告 0/4 写了要求的节、dev 产出 4/4 写齐了，唯一差别是 dev 的
 * 拦截文案里列了小节名。**写进拦截提示的东西会被填，没写进去的不会。**
 *
 * 判据是弱匹配（一行里出现 `M1.3` 就算覆盖），不检查那行说得对不对。强检查需要
 * 理解自然语言，做不到；弱检查的价值在于**让漏掉一条变得可见**。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { block, ok, type Result } from "./types.ts";
import type { Milestone } from "../plan/index.ts";

const NAME_DEV = "G_artifact_dev";
const NAME_REPORT = "G_artifact_report";

/** 判定行：tester 报告与 dev 产出的唯一结构差别 */
const VERDICT = /(判定|verdict)\s*[:：]?\s*(PASS|FAIL|通过|未过)|^#{0,3}\s*(PASS|FAIL)\b/im;

function read(root: string, rel: string): { text: string } | { missing: true } {
  try {
    return { text: readFileSync(join(root, rel), "utf-8") };
  } catch {
    return { missing: true };
  }
}

/**
 * 哪几条断言在文件里没被提到。
 *
 * 编号形如 `M1.3`，直接子串匹配。注意 `M1.1` 是 `M1.11` 的前缀——用边界收一下，
 * 否则十条以上断言的里程碑会把 `M1.11` 误算成覆盖了 `M1.1`。
 */
function uncovered(text: string, m: Milestone): string[] {
  return m.assertions
    .filter((a) => !new RegExp(`${a.id.replace(".", "\\.")}(?![0-9])`).test(text))
    .map((a) => a.id);
}

function checkCoverage(
  gate: string,
  root: string,
  rel: string,
  m: Milestone,
  needVerdict: boolean,
): Result {
  const r = read(root, rel);
  if ("missing" in r) {
    return block(gate, `读不到产出文件 ${rel}（应在项目根下的相对路径）`);
  }
  if (r.text.trim() === "") {
    return block(gate, `产出文件 ${rel} 是空的。要求：${m.id} 每条断言一行结论`);
  }

  if (needVerdict && !VERDICT.test(r.text)) {
    return block(
      gate,
      `报告 ${rel} 缺判定行（写「判定：PASS」或「判定：FAIL」）。这是报告与产出说明的唯一结构差别`,
    );
  }

  const miss = uncovered(r.text, m);
  if (miss.length > 0) {
    return block(
      gate,
      `${rel} 缺这几条断言的结论：${miss.join("、")}。` +
        `每条断言一行，写上编号（如 ${miss[0]} …）。不要求任何固定小节`,
    );
  }

  return ok();
}

/** dev 产出：每条断言一行结论。无判定行要求——判定不是 dev 的权力（D-01） */
export function checkDevOutput(root: string, rel: string, m: Milestone): Result {
  return checkCoverage(NAME_DEV, root, rel, m, false);
}

/** tester 报告：判定行 + 每条断言一行结论 */
export function checkTestReport(root: string, rel: string, m: Milestone): Result {
  return checkCoverage(NAME_REPORT, root, rel, m, true);
}
