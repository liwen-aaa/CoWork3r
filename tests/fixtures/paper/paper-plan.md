# 论文规划书（work-flow 方法论论文）

> **完成判据铁律（2026-08-17 防偷懒治理，详见 `docs/governance-anti-laziness.md`）**：
> 1. **"项目完成"的唯一定义 = 本规划书 M1–M4 验收标准全部通过**（论文编译通过 + 引用真实 + 内容实质达标）。元工作（窗口编排、约束、可视化、状态显示）**永不计入"完成"**。
> 2. **主工作未到验收点，禁止做元工作**：元工作只在主工作真正卡住（缺必要工具无法继续）时做；"做得不顺"不是卡住。
> 3. **元工作也要完成外部化**："窗口编排完成" ≠ 窗口开了，= 三窗口真实跑通一个里程碑的完整流转；"可视化完成" = 能在一个视图看到流水线卡在哪。
> 4. **信任根（人）每轮对主工作行使验证**：每轮必问——论文到哪个 section、能编译吗、引用是真的吗、内容实质立没立住。
> 5. **新机制门槛适用于元工作**：新机制必须有"被观察到的失败模式"才实现；做元工作前自问："我是被主工作卡住了，还是想躲开主工作？"

## 里程碑 M1：Introduction + Background and Related Work ✅（2026-08-18 人工验证通过，R3 tester PASS）
验收：intro 立命题（交差冲动、输出结束≠目标达成）；related work 覆盖 Superpowers/OpenSpec/PGE/AGE/wayfinder 并点出共同盲区（信任根归属缺失）

## 里程碑 M2：Design Principles ✅（2026-08-18 人工验证通过，R1 tester PASS）
验收：三锚点——①完成外部化（措辞/机制/粒度三层）②信任根（验证链两层封顶终止于人）③结构强制 vs 提示词纪律

## 里程碑 M3：System Design ✅（2026-08-18 人工验证通过，R1 tester PASS）
验收：架构（verbatim 框图）+ L/M/S 分级 + 验证链 T1 + 决策地图 T14（标注已落地）+ 文档降级 + 私域

## 里程碑 M4：Case Studies + Discussion + Conclusion + References ✅（2026-08-18 人工验证通过，R2 tester PASS，含编译验证）
验收：M1-M9 案例 + workflow-evolution dogfood + T1/T14 落地证据（verify 用例数）+ **dogfood 事故与修复案例（≥5 个真实事故闭环：现象/根因/机制缺口/修复/哪层机制救的，每条可追溯到 logs/ 或 .pi/messages/ 文件痕迹，与三锚点一一对应）** + 局限（5 条）+ 结论 + thebibliography（9 条真实引用）
