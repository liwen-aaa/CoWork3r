/**
 * 配置层出口。
 *
 * 职责：把「这个项目长什么样」收进一个文件（项目根的 `wf.config.json`），
 * 并保证配错时会吵、主动不配时静默。
 *
 * ── 为什么它是独立一层 ────────────────────────────────────
 * 老仓库的项目事实存在**两处**：wf-config.json 一份，三个 SKILL 的占位符里另一份。
 * IF-005 承认它们「应该一致」，但没有检查。两类后果：
 *   分裂     —— SKILL 让 dev 读 A 文件，gate 拿 B 文件校验，两侧绑的不是同一个断言源
 *   静默失活 —— 占位符要人手工替换，`paper-arch` 与 `paper-architect` 差三个字母，
 *               `--skill` 找不到目录，扩展被丢弃，排查半天还归因错了一半
 *
 * 根因不是「占位符太多」（老仓库两轮重构都在压数量，21 → 3），
 * 是**项目事实被烤进了文本模板**。所以修法是让它归零：
 *
 *     规约完全静态，项目事实运行时注入。
 *
 * 这一刀同时消掉：21 个占位符、IF-005 整份契约、接入生成器的替换逻辑、
 * `--skill` 路径写错这个故障形态。守它的是 G6。
 *
 * ── 文件位置 ──────────────────────────────────────────────
 * 项目根，不放 `.pi/messages/`。它是人要编辑、要进 git 的东西，
 * 而 `.pi/messages/` 是机器水位（01-channel 的分界判据）。老仓库把配置塞进消息目录，
 * 那个目录于是既是配置又是运行时状态。
 *
 * 不负责：
 * - **跑命令** —— `test` / `gate` 的执行在 05-gates
 * - **校验路径存在** —— `plan` 指向不存在的文件是 04-plan 解析时报错。
 *   本层只管字段类型，不管语义
 * - **注入** —— `roleNotes` 拼进 system prompt 是 06-roles 的事
 * - **版本化** —— 字段表就是权威。真出现「第二个接入项目需要钉住旧字段集」时再谈（D-42）
 *
 * 已知取舍：没有「`source` 未配就跳过快照校验」这个降级——`source` 是必填。
 * 老仓库因为它可选，paper 全程没配、快照校验从未生效、M1-R3 的零改动投递
 * 靠 tester 手查 mtime 才发现。那正是 D-23 的来源事故。
 */
export { CONFIG_FILENAME, FIELDS, LEGACY_FIELDS, TEST_NULL_NOTICE } from "./fields.ts";
export type { Config } from "./fields.ts";
export { fatalReason, inspectConfig } from "./inspect.ts";
export type { Diagnostic, Inspection } from "./inspect.ts";
