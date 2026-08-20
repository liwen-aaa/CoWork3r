/**
 * 字段表：名 → 类型 + 缺省 + 一句话说明。**这张表就是权威**，不发布契约、不升版本。
 *
 * 九个字段，老仓库是十三个。删掉的五个仍在下面登记为 legacy——写了它们说明人拿着
 * 旧文档在配，必须出声（G4），不静默兼容。
 *
 * 表不可扩展：未知字段永远是 warn，不会变成「随你」。接受自定义字段等于给漂移
 * 开一个官方入口（D-40 的第②问：那是保护本仓库的自证，还是保护用户能力？）。
 */
export type Config = {
  /** 规划书路径。四个读者（arch/dev/tester/gate）绑的同一份断言源 */
  plan: string;
  /** 生产内容目录或单文件。dev 改动它才算真产出 */
  source: string;
  /** 测试命令。tester 报 PASS 前真跑它。null = 显式声明「本项目无法自动测」 */
  test: string | null;
  testTimeoutMs: number;
  /** 通过标记正则；不配则只看退出码 */
  testPass?: string;
  /** 产物冷启动自检命令；PASS 前真跑 */
  gate?: string;
  /** gate 命令的通过标记正则 */
  gatePass?: string;
  /** 追加到三份角色规约末尾的项目说明。一段，三份共用（D-18：只能追加） */
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
