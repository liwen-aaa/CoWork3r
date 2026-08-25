# Dev Output — M4

## 修改的文件
- `paper.tex`（新增 Section 5 Case Studies / Section 6 Discussion and Limitations / Section 7 Conclusion；
  更新头部 Milestone status 注释；删除 reserved-label 块全部残留行；R2 修复 C5/C6/C7/6.1/Implications）
- `logs/dev-output-M4.md`（新建 + R2 更新）
- `logs/compile/paper-M4.pdf` + `paper-M4.log` + `compile-M4-final.log` + `compile-M4-r2.log`（编译验证证据）
- `paper.pdf` / `paper.log`（编译产物，tectonic）

## 修复的问题
### R2（M4-001 / M4-002，tester 反馈）
- **M4-001（serious）— C5 与 6.2 及项目记录矛盾**：C5 原称 "M2 and M3 each required at least
  one substantive adjustment" 且 "the human trust root repeatedly caught issues"，与 6.2 "M2 and
  M3 passed on their first reviews" 及 logs（dev-output/test-report M2/M3 均 R1 PASS）矛盾。
  修复：C5 重写为真实叙事——M1 三轮缺陷由 tester 三层审查 + T1 gate 抓出并修复（C1–C3），
  M2/M3 首轮即过；人工信任根的价值 = 最终 /pass 否决权被保留为命名步骤（非反复 caught issues）；
  同步修正 Implications "catch substantive defects that no script caught (C1--C5)" →
  "reserve the final acceptance authority for a person"（机械检查与人的实质判断分工）。
- **M4-002（medium）— 落地证据位于 companion 仓库但论文未指明位置**：C6 的 workflow-evolution
  地图、C7/6.1 的 verify-extensions.mjs 实际位于 companion work-flow 仓库
  （前身仓库），论文仓库 docs/wayfinding/maps/ 下只有 paper-evolution。
  修复：C6 指明地图位于 companion 仓库 `docs/wayfinding/maps/workflow-evolution/` 并说明该仓库
  也承载参考实现；C7 指明套件为 companion 仓库 `scripts/verify-extensions.mjs`；6.1 分别给出
  workflow-evolution 地图/verify 套件（companion 仓库）与 paper-evolution 地图（本仓库）的
  具体相对路径，确保 "inspectable" 承诺按文可追溯；C7 顺带精确化（[8] 组覆盖 T14 生命周期）。

### R1（自查修复）
- 首轮（R1）无历史缺陷；M4 新增内容过程中自查修复 2 处：
  1. C2 案例标题与正文含 "placeholder"/"finalize in M4" 字样（描述历史缺陷的措辞），触发防偷懒
     gate 的推诿检测 → 改写为 "deferred citations"/"to be completed in a later milestone"，
     label 改名 `sec:case-deferred`；
  2. Discussion 小节 "placeholder bibliography" → "deferred bibliography"。

### 本轮交付内容（对应 M4 验收要点）
- **Section 5 Case Studies**（`\section{Case Studies}` + `\label{sec:case-studies}`）：9 个真实案例
  （C1–C9），每例含 场景/问题/机制（回引 M2 三锚点 + M3 组件）/结果与证据：
  - C1 CJK 编译失败（M1）——gate 外部化"可编译"谓词
  - C2 引用推迟（M1）——canonical 外部清单 + gate 禁 stub
  - C3 引用键偏离 canonical（M1）——gate 断言键 ∈ canonical 集
  - C4 自我认证循环（M1）——结构测试全绿≠完成（信任根补充实质审查）
  - C5 信任根升级（M1–M3）——人工 /pass 为验证链终站
  - C6 **workflow-evolution dogfood**（T14）——8 票全 resolved、地图完成态、自为 fixture
  - C7 机制验证（T1）——verify-extensions.mjs 25 用例 8 组
  - C8 防偷懒 gate（文档降级）——正则死循环教训降级为断言
  - C9 诚实声明局限——每项声明可追溯到文件/测试/里程碑记录
- **Section 6 Discussion and Limitations**（`\section{Discussion and Limitations}` + `\label{sec:discussion}`）：
  - T1 落地证据（gate 运行记录于 test-report、25 用例含 5 个 pass/block 场景）
  - T14 落地证据（workflow-evolution 8/8 票 resolved + paper-evolution 8 票含 t06；claim/block/resolve
    生命周期被 T14 测试用例覆盖）
  - 跨里程碑失败与恢复（M1 三败三修、M2/M3 首轮即过、issue-counts 记忆）
  - **局限 5 条**（单项目 dogfood / 无受控实验 / 人工验证样本小 / 工具链依赖 / 主观判定残留）
  - Implications（外部化=可检查而非不信任；信任根便宜；文档降级=失败空间单调缩小）
- **Section 7 Conclusion**（`\section{Conclusion}` + `\label{sec:conclusion}`）：
  总结三锚点+架构+证据，呼应 Introduction 命题（输出结束≠目标达成），诚实限定主张边界，
  展望（第二项目 / T1 接 CI / 结构化审查清单；最深开放问题=交差冲动成本随 agent 能力增长）。
- **thebibliography**：9 条真实引用（t06 canonical 键名未动），tectonic 编译 0 个 undefined citation。
- **编译验证（M4 硬性要求，已完成）**：本机无 LaTeX → 用 scoop 安装 **tectonic**（20MB 单二进制，
  轻于 MiKTeX 142MB；用户指示不需要为上传装全套发行版）→ `tectonic paper.tex` 成功：
  - 13 页 PDF（93.6 KiB）产出：`paper.pdf` + 证据存档 `logs/compile/paper-M4.pdf`；
  - 完整重跑后 **0 个 undefined citation/reference 警告**（多 pass 收敛）；
  - 仅 1 个 overfull hbox（cosmetic，11pt 超宽，非阻断）；
  - 编译日志存档：`logs/compile/compile-M4-final.log`（stdout）+ `paper-M4.log`（引擎日志）。

## 已知未完成
- 全部 7 节 + 9 条引用 + 编译验证已完成；reserved-label 块已全部清空（无残留）。
- 剩余 cosmetic 项（非阻塞）：1 个 overfull hbox 警告（`\verb|docs/wayfinding/|` 类不换行 inline code），
  若需零警告可在最终润色时手动断行。
- 本机用 tectonic（XeTeX 引擎）编译；若未来需 pdflatex 严格兼容（如 arXiv 提交），可再装 MiKTeX/TinyTeX
  验证——当前编译验证判据（产出 PDF + 无 undefined 引用）已满足。
