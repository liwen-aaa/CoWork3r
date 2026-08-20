/**
 * 字段表：名 → 类型 + 缺省 + 一句话说明。**这张表就是权威**，不发布契约、不升版本。
 * 可运行示例：`templates/wf.config.json`。
 *
 * 九个字段，老仓库是十三个。删掉的五个仍在下面登记为 legacy——写了它们说明人拿着
 * 旧文档在配，必须出声（G4），不静默兼容。
 *
 * 表不可扩展：未知字段永远是 warn，不会变成「随你」。接受自定义字段等于给漂移
 * 开一个官方入口（D-40 的第②问：那是保护本仓库的自证，还是保护用户能力？）。
 *
 * 字段位置在项目根的 `wf.config.json`，不在 `.pi/messages/`：它是人要编辑、要进 git
 * 的东西，而 `.pi/messages/` 是机器水位（同 01-channel 的分界判据）。老仓库把配置塞进
 * 消息目录，那个目录于是既是配置又是运行时状态。
 */
export type Config = {
  /** 规划书路径。四个读者（arch/dev/tester/gate）绑的同一份断言源 */
  plan: string;
  /** 生产内容目录或单文件。dev 改动它才算真产出 */
  source: string;
  /**
   * 测试命令。tester 报 PASS 前真跑它。
   *
   * `null` = 显式声明「本项目无法自动测」，写了它启动简报就常驻一行「自动验证已关闭」。
   * 字段缺失则是 fatal——不许含糊过去。两者必须区分（G5）：老仓库的 `testCmd`
   * 不配就静默降级，所有 gate 关闭而配置者以为自己配了。
   */
  test: string | null;
  testTimeoutMs: number;
  /** 通过标记正则；不配则只看退出码 */
  testPass?: string;
  /** 产物冷启动自检命令；PASS 前真跑 */
  gate?: string;
  /** gate 命令的通过标记正则 */
  gatePass?: string;
  /**
   * 追加到三份角色规约末尾的项目说明。
   *
   * **一段而不是按角色三段**（D-18）：分三段会诱导人往里写角色行为，而角色行为不该由
   * 项目定义——项目该说的是「关于这个 repo 你要知道什么」，那对三个角色是同一件事。
   *
   * **只能追加，不能覆盖**。角色规约本体承载着 D-01，如果项目能整份换掉 tester
   * 规约，它就能把 tester 换成一个橡皮图章。拼接位置与顺序在 06-roles。
   */
  roleNotes?: string;
  /** 连续失败上限 */
  maxRounds: number;
};

type Spec =
  | { kind: "string"; required: true }
  /** test 独有：string | null，两种「没有」的级别不同（G5） */
  | { kind: "string-or-null"; required: true }
  | { kind: "string"; required: false }
  /** 必须能过 new RegExp()，否则 05-gates 会在「tester 正要报 PASS」时抛未捕获异常 */
  | { kind: "regex"; required: false }
  | { kind: "number"; required: false; default: number };

export const FIELDS: Record<keyof Config, Spec> = {
  plan: { kind: "string", required: true },
  source: { kind: "string", required: true },
  test: { kind: "string-or-null", required: true },
  testTimeoutMs: { kind: "number", required: false, default: 120_000 },
  testPass: { kind: "regex", required: false },
  gate: { kind: "string", required: false },
  gatePass: { kind: "regex", required: false },
  roleNotes: { kind: "string", required: false },
  maxRounds: { kind: "number", required: false, default: 5 },
};

/**
 * 老仓库有、我们删掉的字段。不静默兼容——它们各自对应一个已消失的机制：
 * testDir（从 test 命令推导或不检查）、sBlacklist / buildCmd（S 档位砍了）、
 * statusFile（与 plan 重复，正是那个分裂点）、conventionsFile（约定台账砍了）。
 */
export const LEGACY_FIELDS = [
  "testDir",
  "sBlacklist",
  "buildCmd",
  "buildTimeoutMs",
  "statusFile",
  "conventionsFile",
  "testCmd",
  "sourceDir",
] as const;

export const CONFIG_FILENAME = "wf.config.json";
