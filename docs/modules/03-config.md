# 模块 03：config（项目事实的唯一落点）

> **职责一句话**：把「这个项目长什么样」收进一个文件，并保证配错时会吵、不配时静默。
> **依赖**：`node:fs`。不 import 其它模块。
> **读者**：接入项目的人（读字段表就够）；要加字段的人（读全文）。
>
> 老仓库对应物：`wf-config.json` + `inspectWorkflowConfig`（约 110 行）+ IF-002 契约 + 21 个 SKILL 占位符。
> 本模块把后两样吃掉。

## 为什么它是独立一层

老仓库的项目事实存在**两处**：`wf-config.json` 里一份，三个 SKILL 的占位符里另一份。IF-005 的不变量 2 承认了它们「应该一致」，但没有检查。

于是产生了两类问题。一类是分裂：SKILL 让 dev 去读 A 文件，gate 拿 B 文件校验，两侧绑的不是同一个断言源。另一类更贵——占位符要人手工替换，`paper-arch` 和 `paper-architect` 差三个字母，`--skill` 找不到目录，扩展静默失活，排查半天还归因错了一半。

根因不是「占位符太多」，是**项目事实被烤进了文本模板**。所以修法不是把 21 个占位符压到 3 个（老仓库那轮重构做的事），是让占位符数量归零：

> **规约完全静态，项目事实运行时注入。**

角色规约里一个字的项目信息都没有。dev 需要知道规划书在哪，是扩展在唤醒提示里告诉它的——扩展本来就已经在注入唤醒提示了，SKILL 里那份是重复的第二份权威（D-04）。

这一刀同时消掉：21 个占位符、IF-005 整份契约、接入生成器的替换逻辑、`--skill` 路径写错这个故障形态。

## 文件

```
<项目根>/wf.config.json
```

放项目根，不放 `.pi/messages/`。理由：它是人要编辑、要进 git 的东西，而 `.pi/messages/` 是机器水位（01-channel 的分界判据）。老仓库把配置塞进消息目录，导致那个目录既是配置又是运行时状态。

```
src/config/
├── fields.ts       字段表：名 → 类型 + 缺省 + 一句话说明
├── inspect.ts      读取 + 诊断分级
└── index.ts        出口
```

## 字段表

**必填三项**，其余全有缺省或可省。

| 字段 | 类型 | 必填 | 作用 |
|---|---|---|---|
| `plan` | string | ✅ | 规划书路径。四个读者绑的断言源 |
| `source` | string | ✅ | 生产内容目录或单文件。dev 改动它才算真产出 |
| `test` | string \| null | ✅ | 测试命令。tester 报 PASS 前真跑它。**无自动化基建时必须显式写 `null`** |
| `testTimeoutMs` | number | | 缺省 120000 |
| `testPass` | string | | 通过标记正则；不配则只看退出码 |
| `gate` | string | | 产物冷启动自检命令；PASS 前真跑 |
| `roleNotes` | string | | 追加到三份角色规约末尾的项目说明（见下） |
| `maxRounds` | number | | 缺省 5。连续失败上限 |

八个字段，老仓库是十三个。删掉的：`testDir`（从 `test` 命令推导，或者不检查）、`sBlacklist` + `buildCmd` + `buildTimeoutMs`（S 档位砍了）、`statusFile`（与 `plan` 重复，就是那个分裂点）、`conventionsFile`（约定台账机制砍了）。

### `test: null` 是有意的设计

老仓库的 `testCmd` 不配就静默降级——所有 gate 关闭，而配置者以为自己配了。D-23 要求显式降级，所以这里把「没有测试」变成一个**必须做的声明**而不是一个遗漏：

```jsonc
{ "test": null }   // 我知道这个项目没法自动测，PASS 只靠结构检查 + 人工关卡
```

写 `null` 时，启动简报里常驻一行提示「自动验证已关闭」。不写这个字段则是 fatal——不许含糊过去。

### `roleNotes`：一段，三份共用

```jsonc
{
  "roleNotes": "本仓库是 Rust + Tauri。改 Cargo.toml 的 feature 前先看 docs/build.md。\n数据库迁移文件一律不手改。"
}
```

**一段而不是按角色三段**（D-18）。分三段会诱导人往里写角色行为，而角色行为不该由项目定义——项目该说的是「关于这个 repo 你要知道什么」，那对三个角色是同一件事。

**只能追加，不能覆盖**。角色规约本体承载着 D-01（生产者不能自证完成）这条形状，如果项目能整份换掉 tester 规约，它就能把 tester 换成一个橡皮图章。追加安全，替换不安全。

## 诊断分级

老仓库这套是对的，照搬：

| 情况 | 级别 | 后果 |
|---|---|---|
| 文件不存在 | fatal | 无法工作（三项必填拿不到） |
| JSON 语法错 / 空文件 / 顶层非对象 | **fatal** | 告警 + 拦截「宣布完成」类动作 |
| 必填项缺失 | **fatal** | 同上 |
| `testPass` / `gatePass` 不是合法正则 | **fatal** | 同上（否则验证时抛未捕获异常） |
| 未知字段 | warn | 该项不生效，其余照常 |
| 字段类型不符 | warn | 行为未定义 |
| `test: null` | info | 常驻提示：自动验证已关闭 |

判据是一句话：**区分「主动不配」与「配错」。** 前者静默降级合法，后者必须告警且阻止「宣布完成」——因为此时所有 gate 已关闭，PASS 没有任何验证依据。

老仓库的 `catch { return {} }` 把这两件事当成了同一件，一个逗号写错就能让整条验证链无声关闭。

fatal 时**开发可以继续**，只是不能宣布通过。这个不对称是有意的：配置坏了不该阻止你写代码，但必须阻止你说「测过了」。

## 对外接口

```ts
export type Config = {
  plan: string;
  source: string;
  test: string | null;
  testTimeoutMs: number;
  testPass?: string;
  gate?: string;
  roleNotes?: string;
  maxRounds: number;
};

export type Diagnostic = { level: "fatal" | "warn" | "info"; message: string };

// 读取 + 诊断。cfg 在 fatal 时为 null（不返回半成品配置）
export function inspectConfig(root: string): { cfg: Config | null; diagnostics: Diagnostic[] };

// fatal 的单行摘要，用于拦截 reason；无 fatal 返回 null
export function fatalReason(diagnostics: Diagnostic[]): string | null;
```

`cfg` 在 fatal 时是 `null` 而不是 `{}`。老仓库返回空对象，导致下游代码「拿到了一个看起来能用的配置」，所有可选字段都是 undefined，于是每个 gate 都静默跳过。类型上就不给这个机会。

## 不负责什么

- **不负责跑命令** —— `test` / `gate` 的执行在 05-gates。
- **不负责校验路径存在** —— `plan` 指向不存在的文件，是 04-plan 解析时报错。这里只管字段类型，不管语义。
- **不负责注入** —— `roleNotes` 拼进 system prompt 是 06-roles 的事。
- **不负责版本化** —— 字段表就是权威，不发布契约、不升版本。真出现「第二个接入项目需要钉住旧字段集」时再谈（D-42）。

## 已知取舍

**没有 `sourceDir` 未配就跳过快照校验这个降级。** `source` 是必填，所以那个降级不存在。老仓库因为它可选，导致 paper 全程没配、快照校验从未生效、零改动投递靠人手查 mtime 才发现（这正是 D-23 的来源事故）。

**字段表不可扩展。** 未知字段报 warn 而不是接受。有人会想「让项目加自定义字段」，不做——那等于给漂移开一个官方入口。

## 验收

```
tests/config/
├── G1-required.test.ts       缺任一必填 → fatal
├── G2-syntax.test.ts         逗号写错 / 空文件 / 顶层是数组 → fatal 且 cfg === null
├── G3-regex.test.ts          testPass 非法正则 → fatal
├── G4-unknown.test.ts        未知字段 → warn，其余字段仍生效
├── G5-null-test.test.ts      test: null → info；字段整个缺失 → fatal（两者必须区分）
└── G6-no-placeholder.test.ts grep：src/roles/*.md 里不含 < 大写占位符 >（规约必须完全静态）
```

**G6 是本模块存在的理由。** 它断言的不是配置格式，而是「项目事实没有第二个落点」。占位符一旦回到规约里，`paper-arch` 那类故障就会重新长出来。

---

**已写模块**：01-channel（已收缩进 `src/channel/`） ｜ [02-protocol](02-protocol.md) ｜ 03-config（本文）
**下一个模块**：04-plan（规划书解析：`[auto]`/`[human]` 断言语法、编号规则、冻结判定、未决表与 frontier）
