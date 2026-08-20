# Test Report — M4 (R2)

## 判定：PASS

**判定结果：PASS**（M4-001 / M4-002 已修复并核验；三层审查全部达标；编译验证 R2 重跑 0 undefined）

## R2 修复核验

### M4-001（serious）— C5 与 6.2 矛盾 → 已修复 ✅
- C5 重写为真实叙事（`sec:case-trustroot`，标题改为 "The human trust root as a named step (M1--M3)"）：
  - ✅ 明确承认 "No milestone's defects were caught by the human trust root as such---the human never reviewed intermediate artifacts during those rounds"
  - ✅ "In M1 the tester's three-layer review and the T1 gate caught and drove fixes for three defects (C1--C3); M2 and M3 passed on their first reviews"——与 6.2 及 dev-output/test-report M2/M3 记录一致
  - ✅ 信任根价值表述："not that the human caught what scripts missed, but that the final acceptance authority was structurally reserved for a person"
- ✅ Implications 同步修正（931–935 行）："sufficient to reserve the final acceptance authority for a person---the substantive judgment the gates cannot make stays human, while the mechanical checks stay automatic (C1--C5)"

### M4-002（medium）— 证据定位未指明 → 已修复 ✅
- ✅ C6：workflow-evolution 地图明确位于 **companion work-flow 仓库** `docs/wayfinding/maps/workflow-evolution/`（该仓库同时承载参考实现）；paper-evolution 地图位于本论文仓库 `docs/wayfinding/maps/paper-evolution/`
- ✅ C7：`\verb|scripts/verify-extensions.mjs|`（25 cases in eight groups）明确位于 **companion work-flow 仓库**；并精确化 [8] 组覆盖 T14 生命周期
- ✅ 6.1：分别给出 companion 套件/地图（`docs/wayfinding/maps/workflow-evolution/`、`scripts/`）与本仓库地图（`docs/wayfinding/maps/paper-evolution/`），"inspectable" 承诺按文可追溯

## 三层审查结果

| 层 | 结果 |
|---|---|
| 结构层（Section 5/6/7、9 案例、5 局限、结论、reserved 清空、头部注释） | ✅ |
| 语法/引用层（9 canonical 键未动、无占位/推诿/CJK、\ref 全解析） | ✅ |
| 内容实质层（9 案例真实叙事、局限 5 条、结论呼应 Introduction、证据可追溯） | ✅ |
| **编译验证（M4 硬性要求）** | ✅ |

## 编译验证证据核验（R2 重跑）

| 证据 | 结果 |
|---|---|
| tectonic 重编译 | `compile-M4-r2.log`：Running TeX → Rerunning → xdvipdfmx → Writing paper.pdf 成功 |
| undefined citation/reference | `paper-M4.log` 引擎日志 **0**（grep 确认） |
| PDF 产出 | `logs/compile/paper-M4.pdf` 97114B（97.1KB）存档；`paper.pdf` 同步更新 |
| overfull hbox | 2 个（638 行 11.02pt + 822 行 30.96pt，均为 `\verb` 长路径不换行，cosmetic 非阻断） |
| 日志存档 | `compile-M4-final.log` / `compile-M4-r2.log` / `compile-M4.log` / `paper-M4.log` |

## 测试证据

| 测试 | 命令 | 退出码 |
|---|---|---|
| M1/M2/M3 回归 | `node tests/test-m{1,2,3}-structure.mjs` | 0/0/0 |
| M4 专项 | `node tests/test-m4-structure.mjs` | 0（36 项） |
| 防偷懒 gate（T1 testCmd） | `node scripts/gates/anti-laziness.mjs` | 0「总体判定：PASS」 |

## 对照规划书 M4 节

M1-M9 案例 ✅ / workflow-evolution dogfood ✅ / T1/T14 落地证据（25 用例 8 组，companion 仓库可追溯）✅ / 局限 5 条 ✅ / 结论 ✅ / thebibliography 9 条真实引用 ✅ / **编译验证（硬性要求）✅**。

## 备注（非阻塞）

1. R2 编译新增 1 个 cosmetic overfull（822 行，C7 的 `\verb|scripts/verify-extensions.mjs|` 长路径）——属修复 M4-002 引入路径说明的正常代价，非阻断；如需零警告可在最终润色手动断行（dev 已注明）。
2. Implications 中 "(C1--C5)" 为案例编号引用（验证链运作佐证），表述可辩护。
