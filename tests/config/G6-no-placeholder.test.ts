/**
 * G6 规约零占位符 —— **本模块存在的理由**
 *
 * 这条断言的不是配置格式，是「项目事实没有第二个落点」。
 *
 * 老仓库的项目事实存在两处：wf-config.json 一份，三个 SKILL 的占位符里另一份。
 * IF-005 的不变量 2 承认它们「应该一致」，但没有检查。后果有两类：
 *   - 分裂：SKILL 让 dev 去读 A 文件，gate 拿 B 文件校验，两侧绑的不是同一个断言源
 *   - 静默失活：占位符要人手工替换，`paper-arch` 与 `paper-architect` 差三个字母，
 *     `--skill` 找不到目录，扩展被丢弃，排查半天还归因错了一半
 *
 * 根因不是「占位符太多」（老仓库两轮重构都在压数量，21 → 3），是**项目事实被烤进了
 * 文本模板**。所以修法是让它归零：规约完全静态，项目事实运行时注入。
 *
 * 占位符一旦回到规约里，那类故障就会重新长出来——所以这条要一直红着守。
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROLES_DIR = "src/roles";

/** `<PROJECT_ROOT>` 这类：大写下划线两字符以上，尖括号包着 */
const PLACEHOLDER = /<[A-Z][A-Z_]{1,}>/g;

describe("G6 规约零占位符", () => {
  it("三份规约文件存在（拆自行数断言：文件缺失与内容超标红因不同）", () => {
    const files = readdirSync(ROLES_DIR).filter((f) => f.endsWith(".md") && f !== "human.md");
    expect(files.sort()).toEqual(["arch.md", "dev.md", "tester.md"]);
  });

  it("每份规约 ≤ 40 行（老仓库三份 SKILL 是 72/81/89）", () => {
    const over: string[] = [];
    for (const f of readdirSync(ROLES_DIR).filter((n) => n.endsWith(".md") && n !== "human.md")) {
      const lines = readFileSync(join(ROLES_DIR, f), "utf-8").split(/\r?\n/).length;
      if (lines > 40) over.push(`${f}: ${lines} 行`);
    }
    // 行数上限防的是「混进流程说明与项目事实」，它比任何评审都有效
    expect(over).toEqual([]);
  });

  it("规约里不含大写占位符", () => {
    const offenders: string[] = [];
    for (const f of readdirSync(ROLES_DIR).filter((n) => n.endsWith(".md"))) {
      const found = readFileSync(join(ROLES_DIR, f), "utf-8").match(PLACEHOLDER);
      if (found) offenders.push(`${f}: ${[...new Set(found)].join(" ")}`);
    }
    expect(offenders).toEqual([]);
  });

  it("规约里不含项目路径类词（plan / source / test 的具体值只能来自 config）", () => {
    // 判据从老仓库那 21 个占位符的语义反推：项目事实包括规划书路径、源目录、
    // 测试命令、技术栈。规约里出现具体路径就是烤进去了
    const smells = [/docs\/plan\.md/, /npm test/, /wf\.config\.json/];
    const offenders: string[] = [];
    for (const f of readdirSync(ROLES_DIR).filter((n) => n.endsWith(".md"))) {
      const src = readFileSync(join(ROLES_DIR, f), "utf-8");
      const hit = smells.filter((re) => re.test(src)).map((re) => re.source);
      if (hit.length > 0) offenders.push(`${f}: ${hit.join(" ")}`);
    }
    expect(offenders).toEqual([]);
  });
});
