/**
 * check-testsize.mjs — D-41 的机制落点（自检不得超过运行时）
 *
 * D-41 的落点原本写「定期人查」= 规约 = 接受它会被跳过（D-02）。而它的来源是
 * 老仓库的死因之一：自检 1995 行 > 运行时 1898 行。一条关于「膨胀」的纪律靠人
 * 定期想起来查，本身就是膨胀的温床。所以口径落成脚本。
 *
 * ── 口径 ──────────────────────────────────────────────────
 *   分子 = tests/ 下**全部** .ts（减排除），非注释非空行
 *   分母 = src/ 下全部 .ts，非注释非空行
 *   排除 = tests/fixtures/（数据不是代码）、tests/manual/（人工验证凭证不是自检）
 *   阈值 = 1.0
 *
 * 分母为什么是全量 .ts 而不是 *.test.ts：后者留了个合法漏洞——把测试逻辑挪出
 * .test.ts 就能躲红线，与 D-25 的字面量漏洞同构。而且 mock-pi、e2e harness、
 * _fixture.ts 都不是 .test.ts（今天这三个 _fixture 就是 104 行）。
 *
 * 按总量算不按模块：与来源一致（1995 vs 1898 是总量），且模块级比值会被小模块放大。
 *
 * ── 2026-08-24：降级为报告（取代「红时人审」）──────────────────
 * 审了十七次、每次结论「无仪式成分」、零行动。它不是判据，是行数比值的投影
 * （「膨胀」无法写红场景，只能测行数这个代理）。降级：数字摆眼前，红而行动由人决定；
 * 不再要求每次红都停下来写审（审记录降级为发现日志）。阈值 1.0 仍不动。
 * 被 D-53 取代落点（disciplines.md）。
 *
 * ── 2026-08-20 第一次审的结论（红线 1.71，已越过）────────────
 * 构成：src 注释占 41%，tests 占 25%。剥离注释主要砍分子——因为 D-06 要求把模块
 * 职责与边界拆进 src 的文件头，那些「文档」按行数算在运行时侧。所以本仓库任何
 * 合理口径下今天都是红的，而且 M4–M6 会更红（mock-pi + e2e harness 是纯测试代码，
 * plan/gates/adapter 的 src 是小纯函数）。
 *
 * 审的结论：**比值高的部分是结构性产物**——运行时是 735 行纯函数，而测试即规格
 * （TDD，用例名 = 断言编号，一个约束一个文件）。
 *
 * **这不是豁免。** D-41 存在的理由就是堵这种自我辩护。所以：
 *   - 阈值留在 1.0，不上调
 *   - 每次红了做**构成 diff**：这轮新增的测试在测真实行为，还是在测仪式？
 *   - 审的结论必须写下来（就写在本文件头），否则每轮都红 = 狼来了
 *
 * ── 2026-08-21 第二次审的结论（M4 收尾，红线 1.95）─────────
 * 构成 diff（对上次审 1.71 = src 735 / tests 1256）：
 *   src   735 → 1115（+380，全是 src/plan：grammar / parse / frontier / types / index）
 *   tests 1256 → 2171（+915，其中 tests/plan 849，其余来自 L10 与 L7 的补测）
 *
 * 判据是「测真实行为还是测仪式」，逐份过 tests/plan 十份：
 *   L1  最小塌缩          真实行为（D-16 的可运行下限，模板超重时它红）
 *   L2  位置编号          真实行为（M1.3 的编号规则）
 *   L3  kind 必填         真实行为（`[AUTO]` 不静默当成 auto）
 *   L4/L5 可测性判据      真实行为（gate 的核心判据，05-gates 直接消费）
 *   L6  ✅ 容忍           真实行为（arch 往标题写状态，解析器必须容忍）
 *   L7  未决表与 frontier 真实行为，且**逮到两个真 bug**：段位错位丢 owner、
 *                        以及我自己第一版写松的那条断言
 *   L8  模板进测试        真实行为（老仓库格式分裂两个月无人发现的唯一防线）
 *   L9  老仓库回归        真实行为（真实出过事的输入）
 *   L10 CRLF 归一         真实行为，且**逮到一个真 bug**（docs:progress 静默写空表）
 *   _fixture 55 行        无 it，只提供真实文件路径 + derive/verbatim 两个动作
 *
 * 仪式成分：没找到。三个真 bug 全部由这批用例逮出，其中两个（丢 owner、
 * 进度表写空）是**静默**失效，人眼过不了。
 *
 * 但有一条是这轮真正的负债，记在这里：**L7 182 行 / 12 it 明显偏大**——未决表把
 * id 规则、三段式、状态机、frontier 分组四件事挤在一个文件里，按「一个约束一个
 * 文件」本该拆成三四份。不在本轮拆（M4 已收尾，拆文件是独立改动，D-45）。
 * 下次红了先看它。
 *
 * 结构性原因未变：src 的注释按 D-06 承载文档职责，剥离后只剩纯函数；测试即规格。
 * **阈值仍留 1.0，不上调。**
 *
 * ── 2026-08-21 第四次审的结论（M6 收尾，红线 2.28）─────────
 * 构成 diff（对上次审 2.09 = src 1501 / tests 3144）：
 *   src   1501 → 1681（+180，全是 src/adapter 四个文件：wire/status/flow/index）
 *   tests 3144 → 3703（+559，其中 tests/adapter 561、tests/e2e 108、tests/plan -22）
 *
 * 逐份过 tests/adapter + tests/e2e，判据是「测真实行为还是测仪式」：
 *   A1/A2 角色激活      真实行为（WF_ROLE 尾随空格那次事故的机械拦截）
 *   A3   链分发        真实行为（wire 的 tool_call 与 runChain 等价，遍历 CHAINS）
 *   A4   flow 状态表    真实行为（9 个 type 全覆盖，缺一个就是静默停摆）
 *   A5   阈值升级      真实行为（bumpCounters 即重启语义，3 轮升 escalation）
 *   A6   行数上限      抗腐化指标（老仓库 976 行涨的全是放错层的东西）
 *   A7   /status 四行  真实行为（frontier 数字与纯函数输出一致，不手写）
 *   A8   无字面量      真实行为（to: 与 to-*.json 的 D-04 双权威防护）
 *   A9   注入缝        真实行为（pi 只以类型存在 + 同进程三份 root 隔离）
 *   E1   完整一圈      真实行为（mock-pi 驱动全链路，验接线不验 pi 行为）
 *   _fixture 126 行    无 it，只做 fakePi + 真实 fixture 装配
 *
 * 仪式成分：没找到。A8 逮到一个真实违规（实现注释里写了 to-human.json，
 * 已改）。E1 把 01–05 层接成一条能跑通的线，是 M6 的核心验收。
 *
 * 上次记的 L7 负债已还（拆成 L7-pending + L7-frontier，236 → 116+152）。
 * 结构性原因未变；阈值仍留 1.0，未动。
 *
 * ── 2026-08-21 第五次审的结论（M6 收尾后，红线 2.19）─────────
 * 构成 diff（对上次审 2.28 = src 1681 / tests 3703）：
 *   src   1681 → 1804（+123：commands 135 含注释、activate 37、selfcheck 23、
 *                      research 89、wire 净增（ctx.mode 守卫 + agent_start 自检））
 *   tests 3703 → 3845（+142：tests/dist 318 全新增，tests/plan +21，tests/adapter +27）
 *
 * 逐份过 tests/dist（D1–D7），判据是「测真实行为还是测仪式」：
 *   D1/D2 包清单与 peerDep  真实行为（pi 发现扩展 / typebox 故障类别的防护）
 *   D3/D4 launch ASCII/空格  真实行为（老仓库两次真实事故的生成物侧）
 *   D5   plan skill         真实行为（不复述模板的 D-04 判据）
 *   D6   接入路径           真实行为（老仓库从没测过的「从零接入」）
 *   D7   research 状态机     真实行为（open→querying→answered + 回退）
 *
 * 仪式成分：没找到。D4 逮到一个真实 bug（trio.ps1 的 set WF_ROLE=dev && pi
 * 空格被 cmd 吃进值 → WF_ROLE 带尾随空格 → 窗口静默不激活），修 + 补判据。
 * D7 被真实流程击穿过一次（P2 在真实文档 answered 后状态机测试前提不成立），
 * 已改为从真实行重置起点——测试适应数据演进，不是放宽判据。
 *
 * 结构性原因未变；阈值仍留 1.0，未动。
 *
 * ── 2026-08-22 第六次审的结论（M6 修复轮收尾，红线 2.22）─────────
 * 构成 diff（对 40a0a42 = src 1913 / tests 4194 = 2.19，实测核对）：
 *   src   1913 → 1917（+4：wire.ts 单 type 推导——typesFrom + 缺 type 报错分支）
 *   tests 4194 → 4259（+65：A9-injection-seam +1 用例 29、A9b-selfcheck 新增 50、
 *                      _fixture 的 fakePi 加 getSystemPrompt 17）
 *
 * 逐份过这三个增量，判据是「测真实行为还是测仪式」：
 *   A9 单 type 用例     真实行为（tester 真实流程验出的修复三：dev 按 schema 调用
 *                      （不传 type）能投递——E1 手写 type 绕过 schema 校验没逮到，
 *                      这条补的是真实调用路径）
 *   A9b 三用例         真实行为（P1 的机制落点接线：agent_start → checkInjectedSpec。
 *                      把 R5「测一个不会运行的函数」钉成「接线被验过」；三面覆盖：
 *                      正常注入不告警（无噪音）/ 整份替换告警且含角色特征串 / 角色区分）
 *   _fixture 17 行     无 it，只给 fakePi 加 getSystemPrompt 装配（默认空串 = 静默），
 *                      满足规则②（harness 不是测试逻辑）
 *
 * 仪式成分：没找到。这 65 行全是 tester 真实流程验出的三个 bug（schema 缺 artifact /
 * P1 自检未挂 / dev 单 type 投递断裂）的回归防线。另外补一句对账：上一次审（第五次）
 * 记录的 src 1804 / tests 3845 与 40a0a42 实测（1913/4194）不符，本次用实测数字起算。
 * 结构性原因未变；阈值仍留 1.0，未动。
 *
 * ── 2026-08-22 第七次审的结论（M6-004 修复轮，红线 2.21）─────────
 * 构成 diff（对第六次审 2.22 = src 1917 / tests 4259，实测核对）：
 *   src   1917 → 1941（+24：routes requires 加 artifact ×3 处、message.ts 加
 *                      artifact 类型、wire.ts 拦截链单 type 推导 + guard 改造）
 *   tests 4259 → 4287（+28：P2 一致性用例、_fixture 的 assertParamsMatchSchema、
 *                      E1/A9 的 schema 校验封装调用、protocol _fixture artifact 样本）
 *
 * 逐份过新增测试，判据是「测真实行为还是测仪式」：
 *   P2 一致性用例    真实行为（M6-004 的落点：gates 消费的 artifact/questions 必须
 *                    在 schema 里——删掉 FIELDS / union 任一字段立刻红）
 *   assertParamsMatchSchema + E1/A9 调用  真实行为（模拟 pi 的 JSON Schema 校验：
 *                    additionalProperties/required。M6-003 实测 pi 就是拒
 *                    additionalProperties——测试直调 execute 会绕过这层，schema 删
 *                    字段照样绿。把校验搬回调用路径 = D-25 闭环，不是仪式）
 *   protocol _fixture artifact 样本  真实行为（requires 加字段必须补样本，否则 D-25
 *                    的 sampleFields 抛错——这是机制本身在叫）
 *
 * 仪式成分：没找到。这 28 行全部是 M6-004（schema↔gates 脱钩，真实故障形状）的回归
 * 防线；其中 assertParamsMatchSchema 把 E1/A9 从「绕过 schema」改回「过校验」——
 * 它逮到一个真 bug（wire 拦截链对单 type 角色 type 解析缺失 → G_artifact 对 dev
 * 静默失效，E1 改真实路径后立刻红）。
 * 结构性原因未变；阈值仍留 1.0，未动。
 *
 * ── 2026-08-22 第八次审的结论（M6-007 修复轮，红线 2.22）─────────
 * 构成 diff（对第七次审 2.21 = src 1941 / tests 4287）：
 *   src   1941 → 1943（+2：resolveType 抽到 protocol/build.ts，wire.ts 两处改调用）
 *   tests 4287 → 4305（+18：A9 新用例「tool_call 拦截对无 type 的 event 走真实路径」）
 *
 * 新增 18 行测的是真实行为：M6-007 要求 tool_call 拦截器与 execute 同一份推导
 * （D-03 防双写），本用例用「必然 block 的输入（artifact 指向不存在文件）」判别——
 * 若拦截器没走 resolveType（CHAINS["dev:undefined"] 查不到链）会静默放行，断言红。
 * 仪式成分：没找到。它测的是拦截链对真实 LLM 调用（无 type）的路径，不是自证。
 * 结构性原因未变；阈值仍留 1.0，未动。
 *
 * ── 2026-08-22 第九次审的结论（A9c 修复轮，红线 2.25）─────────
 * 构成 diff（对第八次审 2.22 = src 1941 / tests 4287，实测核对）：
 *   src   1941 → 1946（+5：wire.ts agent_end 防死循环逻辑）
 *   tests 4287 → 4379（+92：A9c 五用例 + A9-injection-seam 两处 emit 形状适配，+0 用例）
 *
 * A9c 五用例钉的是真实行为（2026-08-22 真进程实测的死循环回归）：agent_end 每轮发
 * followUp 提醒，而 pi 的 sendUserMessage 总是触发新回合 → 提醒 → 新回合 → 再提醒 →
 * 三窗口全卡死。五用例分别钉五个 guard 条件：①未投递且有工作对象才提醒（正面行为）、
 * ②本轮已调过 send_task（含被 block 的尝试）不提醒、③本轮就是上一条提醒触发的回合
 * 不重复提醒（循环停止条件，删它循环必复现）、④state 无里程碑不提醒、⑤print 模式
 * 不提醒（无会话窗口）。A9-injection-seam 的两处改动只是补 `{ messages: [] }` 事件参数，
 * 适配 agent_end 事件新形状，不加用例。
 *
 * 仪式成分：没找到。五个 guard 各有一个对应用例，删任一 guard 立刻红；用例④⑤与
 * 已有 guard（state 空 / 非 tui）重合是同一约束的独立面，不是为凑数。
 * 结构性原因未变；阈值仍留 1.0，未动。
 *
 * ── 2026-08-22 第十次审的结论（A9c 数组形态修正 + M6-009 移植性，红线 2.25）────
 * 构成 diff（对第九次审 2.25 = src 1946 / tests 4379，实测核对）：
 *   src   1946 → 1945（-1：wire.ts agent_end 的 user 文本提取兼容 string 与数组两形态）
 *   tests 4379 → 4378（≈0：A9c 用例③改真实数组形态、A8/A9 的 execSync grep →
 *                      grepLines 重写、_fixture 新增 grepLines 20 行（无 it））
 *
 * 真实行为判据（逐份过增量）：
 *   A9c 用例③改数组形态   真实行为，且是**对第九次审的修正**：第一版 mock 用 string
 *                      content 是错误假设——pi 的 followUp 投递在 _queueFollowUp 构造
 *                      content=[{type:"text",text}]（agent-session.js，真进程复测实证），
 *                      string 检查在真实链路漏判、死循环继续烧。改数组形态后对旧实现红
 *                      （stash 验证：仅此用例红）——「测试绿、真实断」的 D-25 形状被修正
 *   A8/A9 grepLines     真实行为（M6-009）：A9 的 execSync grep 在 cmd 环境（系统/用户
 *                      PATH 无 Git）崩 → 验收 gate 的 npm test 红 → verdict_pass 全堵死
 *                      （tester 真进程投递被 block 实证）。node 原生递归遍历等价替换，
 *                      语义与 grep -rn | grep -v 一致；A8 同缺陷同修（同一根因）
 *   _fixture grepLines  无 it，只提供等价 grep 的文本搜索（harness 不是测试逻辑）
 *
 * 仪式成分：没找到。第十次审要点：第九次审对用例③「真实行为」的结论基于错误 mock
 * （string），被真进程复测推翻——判据是「测试与真实结构同形状」（D-25），本次修正
 * ── 2026-08-24 第十八次审的结论（A12 状态条刷新，红线 2.36）──
 * 来源不是自检，是**真跑**（wf-demo RUN1-001）：setWidget 只挂 session_start，
 * 状态条是一次性快照，人在人工关卡上找不到自己该判什么。
 *
 * 构成 diff（对第十七次审 2.33 = src 2156 / tests 5023）：
 *   src   +约 60（widget.ts 新文件 + wake/drain 的 onHandled + wire 四个刷新入口）
 *   tests +约 150（A12 五用例 + fixture 的 toolCtx）
 *
 * 真实行为判据：五条各对应一个刷新入口（投递 / 被唤醒 / 代排 / 回合边界 / print 不设），
 * 判据统一为「widget 内容 == briefingFor 当前输出」——不是「setWidget 被调过 N 次」，
 * 后者正是旧测试绿而真跑坏的原因。
 *
 * **本轮照出两个「测试与真实脱钩」的实例，都值得记：**
 *   ① fakePi 直调 execute 时手拼 ，而真实 pi 给的是完整 ExtensionContext
 *     （types.d.ts:371，带 ui.setWidget）。第一版 A12 因此误判「投递后不刷新」——
 *     实际是 ctx 里根本没有 ui。已加 fakePi.toolCtx() 统一形状。
 *   ② drain 曾把 onHandled 当成 WatchOptions 往下传给 watchInbox，而它不认这个字段
 *     → 静默丢弃。与 D-49 抓的哑弹同构，只是发生在「选项字段」这一层：
 *     有实现、有接线、有注释解释为什么这样接，而那个接法从不生效。
 *
 * 分子涨得比分母快属正常（新增一个刷新入口就要一条从公共入口验的用例）。阈值不动。
 *
 * 使两者重新对齐，不是放宽判据。结构性原因未变；阈值仍留 1.0，未动。
 * ── 2026-08-24 第十七次审的结论（roleNotes 接线 + D-52 机制，红线 2.33）──
 * 构成 diff（对第十六次审 2.30 = src 2125 / tests 4887，实测核对）：
 *   src   2125 → 2156（+31：remind.ts 从 wire 抽出（判定逻辑，含真进程实测注释）、
 *                       wire 传 roleNotes 与 maxRounds、flow 的 maxRounds 入参）
 *   tests 4887 → 5023（+136：A9i 4 用例 + A9j 3 用例 + A9c 用例③补唤醒消息）
 *
 * 真实行为判据（逐份过增量）：
 *   A9i ①②③ roleNotes 进 prompt / 位置 / 三角色  真实行为（四处声明存在而链路上没人传）
 *   A9i ④ 无 notes 不留空段                      真实行为（追加语义的边界）
 *   A9j ①②③ cfg.maxRounds 决定阈值              真实行为，**且照出 A4 的假绿**：
 *                                               A4 用 cfg.maxRounds 当上限而模板值恰好
 *                                               等于 DEFAULTS 的 5，两来源撞上永远成立
 *   A9c ③ 补唤醒消息                            **修红因不唯一**：原用例只放提醒消息，
 *                                               被 hasWork 前置先拦，停止条件根本走不到
 *                                               ——拆掉停止条件仍全绿（本轮实测发现）
 *
 * 仪式成分：没找到。但本轮有两条值得记的**机制层收获**，都不是新增测试：
 *   ① D-52（配置字段消费点）是新判据，首跑照出 maxRounds——它抓的是 D-49 的盲区
 *      （函数活着、参数死了）。判据本体按 D-51 应由人批，已在会话里摆出。
 *   ② 抽 remind.ts 时顺手验一遍防线，照出 A9c ③ 的假绿。**抽文件时验一遍被抽走的
 *      逻辑是否真被钉住**，这个动作应该固化——它比新增用例更省，且照出的是存量问题。
 *
 * 阈值仍留 1.0，未动。
 *
 *
 * ── 2026-08-24 第十六次审的结论（A9h 放行前置与锚，红线 2.30）──
 * 构成 diff（对第十五次审 2.24 = src 2098 / tests 4709，实测核对）：
 *   src   2098 → 2125（+27：state.awaitingHuman 字段 + 注释、release.ts 的 checkAwaiting、
 *                       flow 三处转换（写入/作废/消费）、G_release_chained 串两道判据）
 *   tests 4709 → 4887（+178：A9h 新文件 5 用例 ~150 行 + A4 拆出许可转换的 it +
 *                       A9f setup 改为真发 verdict_pass 建前置）
 *
 * 真实行为判据（逐份过增量）：
 *   A9h ① 无 verdict_pass 放行 → block   真实行为，**本轮的全部理由**：实测 arch 在人
 *                                       从未参与时捏满三段凭证即放行成功（D-01 的洞）
 *   A9h ② 有许可放行且被消费             真实行为（正面路径 + 许可生命周期）
 *   A9h ③ 有许可但缺段仍 block           真实行为（防「新判据顶掉老判据」——两道都要过）
 *   A9h ④ 放行后重放 → block             真实行为（单向门；许可若不消费就能重放）
 *   A9h ⑤ FAIL 后许可作废 → block        真实行为（凭已被推翻的验收放行）
 *   A4 拆出的许可转换 it                 真实行为（flow 是唯一状态机，三个转换的纯函数侧）
 *   A9f setup 改真发 verdict_pass        **修红因不唯一**：旧 setup 不建前置，三条会因
 *                                       别人的 block 而「绿」，绿的理由与标题不是一件事
 *
 * 仪式成分：没找到。但记一条负债：**A9h 与 A9f 现在共同守一道 gate 的两半**，
 * 将来若再加第三道判据，应考虑合并成一个文件（一个 gate 一个文件），而不是 A9i。
 *
 * 分子涨得比分母快（+178 vs +27），比值回到 2.30。与第十五次审的观察不冲突：
 * 那轮补的是缺失的接线（运行时缺东西），这轮补的是判据（测试本就该多）。
 * 阈值仍留 1.0，未动。
 *
 *
 * ── 2026-08-24 第十五次审的结论（A9g 人的收件箱代排，红线 2.24 —— 三轮来首次下降）──
 * 构成 diff（对第十四次审 2.32 = src 2008 / tests 4658，实测核对）：
 *   src   2008 → 2098（+90：drain.ts 新文件（arch 代排 human 槽位）+ ledger.ts 新文件
 *                       （待人工台账渲染）+ atomic.ts 的 appendTextAtomic + paths.humanLedger
 *                       + status.ts 的 briefingFor 与「待人工」改读台账）
 *   tests 4658 → 4692（+34：A9g 新文件 4 用例；本轮无既有用例改动——通道语义变了但
 *                       所有旧断言原样成立，这本身是「改动没越界」的证据）
 *
 * 真实行为判据（逐份过增量）：
 *   A9g ① arch 排空 human 槽位        真实行为（伪角色无 watcher = 锁永不释放，实测事故）
 *   A9g ② 排空后第二条能投 + stuck 不被堵
 *                                   真实行为，**这条是本轮的全部理由**：FAIL 重试路径
 *                                   与急救通道在旧实现下彻底不通，而 happy path 恰好
 *                                   走 milestone_passed 自清，所以 E1 全绿
 *   A9g ③ 排空的消息进 wf 台账        真实行为（D-30：只清不记 = 待办静默消失）
 *   A9g ④ dev/tester 不碰 human 槽位  真实行为（判定权不在它们手上，D-01）
 *
 * 仪式成分：没找到。四条各自对应一个可失败的真实路径，删掉 drain 接线则 ①②③ 全红、
 * 把代排放开给三个角色则 ④ 红。
 *
 * **本轮值得记的是分母侧**：src +90 而 tests 只 +34，比值从 2.32 降到 2.24——
 * 这是十五次审里第一次「靠写运行时代码」而不是「靠删测试」把比值压下来的。
 * 它顺带说明第十次审那个判据（「新增测试在测真实行为还是仪式」）问的方向不完整：
 * 比值高也可能是**运行时缺东西**，不只是测试太多。A9g 补的正是一条本该存在的接线
 * （human 通道的消费者），补完之后分母涨得比分子快。阈值仍留 1.0，未动。
 *
 * ── 2026-08-24 第十四次审的结论（arch 代理化方案 A，红线 2.29）──
 * 构成 diff（对第十三次审 2.26 = src 2003 / tests 4531，实测核对）：
 *   src   2003 → 2008（+5：release.ts 新文件 ~30 行含注释 + G_release_chained + flow 清
 *                       human 收件箱 + ROUTES from 改 arch + channel clearInbox，
 *                       净增少是因为删了 commands.ts 的 /pass /fail 两个空壳 handler）
 *   tests 4531 → 4605（+74：A9f 新文件 4 用例 ~80 行 + A4/E1 改 from 适配）
 *
 * 真实行为判据（逐份过增量）：
 *   A9f ① 凭证三段齐全 → 放行     真实行为（放行的正面）
 *   A9f ② 缺人原话 → block        真实行为（arch 拿不出人的话 = 自行宣布完成，D-01 的洞）
 *   A9f ③ 缺确认 → block          真实行为（人没点头 = 放行无效，单向门）
 *   A9f ④ tester 发 milestone_passed → block
 *                               真实行为（from 改 arch 后越权在类型层不可能，
 *                               旧路径「tester 不经人直接放行」被协议层关闭）
 *   A4/E1 from 适配              真实行为（milestone_passed 的 from 语义变化）
 *
 * 仪式成分：没找到。A9f 是把 D-01 的最后一米从规约级升到 gate 级的回归防线——
 * 删掉 G_release 链或证据要求，四个用例全红。这轮还删了两个空壳命令（/pass /fail），
 * 是「删哑弹同形状」的代码清理。结构性原因未变；阈值仍留 1.0，未动。
 *
 * ── 2026-08-24 第十三次审的结论（D-49 哑弹清零，红线 2.26）──
 * 构成 diff（对第十二次审 2.23 = src 2023 / tests 4511，实测核对）：
 *   src   2023 → 2003（-20：删 validate（D-49 处置=删，~50 行死代码）+
 *                       wire 接 configGate/chainFor/takeSourceBaseline + status/fields
 *                       接 commandGateStatus 与文案单点，~+30 行）
 *   tests 4511 → 4531（+20：A3 加 2 用例（configGate 不对称/chainFor 键写错）、
 *                       A9e 新文件（源码基线消费全链路）、删 P4（validate 的测试，-11 用例））
 *
 * 真实行为判据（逐份过增量）：
 *   A3 configGate  真实行为（配置坏时「拦宣布完成、放行继续开发」的不对称——
 *                   旧实现 cfg 坏整链跳过 = fail-open，自检缺陷 #2 的回归防线）
 *   A3 chainFor    真实行为（CHAINS 表外 type 不再静默放行——键写错与声明无 gate
 *                   的区分，D-49 哑弹 chainFor 的消费测试）
 *   A9e 基线消费   真实行为（**第一份「信号被消费」形状的测试**：从 wire 公共入口
 *                   验证投递→基线推进→下次投递比对全链路；旧实现基线从不写、
 *                   G_source 恒放行。T4 直调 takeSourceBaseline 测的是纯函数，
 *                   这份测的是接线——正是 61/68 测试从下层入口进这个结构缺陷的反例）
 *   P4 删除         死代码的测试。validate 零生产调用点（peek 不调它），
 *                   它的测试再完备也是测一个不运行的函数（R5 的教训）
 *
 * 仪式成分：没找到。这轮有一个结构性信号：**测试第一次净减少**（删 11 加 3）——
 * 删的是哑弹的测试（死代码），加的是消费链测试（活接线），方向正确。
 * 结构性原因未变；阈值仍留 1.0，未动。
 *
 * ── 2026-08-24 第十二次审的结论（共识 #4 单槽位升级为锁，红线 2.23）──
 * 构成 diff（对第十一次审 2.24 = src 1994 / tests 4472，实测核对）：
 *   src   1994 → 2023（+29：atomic.ts 新增 writeTextExclusive ~24 行——O_EXCL 语义
 *                      的独占写，写 .tmp → copyFileSync(COPYFILE_EXCL) → unlink tmp）
 *   tests 4472 → 4511（+39：C7 重写 3 用例（从「覆盖出声」改「禁止覆盖」，
 *                      锁的语义变化）+ C2 重写 1 用例（处理期间投递被锁拒→清空后重试））
 *
 * 真实行为判据（逐份过增量）：
 *   C7 ① 空 inbox → 投递成功       真实行为（锁的正面：文件不存在即可写）
 *   C7 ② 非空 → 拒绝且旧消息原样保留  真实行为（锁的核心：禁止覆盖，且旧消息不被吞——
 *                      这正是 consensus #4 的判据原文）
 *   C7 ③ 清空后可再投递（锁释放）    真实行为（C2 清空 = 删除文件，与锁语义对齐；
 *                      旧实现写空串文件仍在 → EEXIST，这个用例逮到了真实的语义 bug）
 *   C2 重写                  真实行为（旧场景「处理期间到达新消息」在新语义下
 *                      由锁挡住——投递被拒、处理完重试；用例验证锁 + 重试全链路）
 *
 * 仪式成分：没找到。而且这轮有一个特殊点：C7 ② 在实现过程中逮到一个真实 bug——
 * 第一版实现用命名导入 `COPYFILE_EXCL`（undefined），copy 退化成普通覆盖，
 * 用例 ② 立刻红；改成 `constants.COPYFILE_EXCL` 才绿。这个用例有判别力，不是凑绿。
 * 结构性原因未变；阈值仍留 1.0，未动。
 *
 * ── 2026-08-22 第十一次审的结论（M6-010 唤醒链路接线，红线 2.24）────
 * 构成 diff（对第十次审 2.25 = src 1945 / tests 4378，实测核对）：
 *   src   1945 → 1994（+49：wake.ts 新文件 67 行——M6-010 的生产实现。分母增加
 *                      是正确方向：生产代码稀释比值，不恶化 D-41 要防的膨胀）
 *   tests 4378 → 4472（+94：A9d 三用例 95 行、E1 断言改唤醒路径、_fixture waitFor
 *                      13 行（无 it））
 *
 * 真实行为判据（逐份过增量）：
 *   A9d ① 消息落盘→唤醒 + 触发源日志 + 收件箱清空
 *                      真实行为，M6.6-fail.md 判据 1「无静默故障」的直接判据——
 *                      「窗口永远等不到消息，全靠人踢」就是这条要防的形状
 *   A9d ② print 模式不启动唤醒
 *                      真实行为：print/rpc 无会话窗口，sendUserMessage 会与处理中
 *                      的消息冲突；且 watchInbox 的定时器会让 pi -e --print 进程
 *                      不退出（P2 已实测 print 模式扩展照常运行）
 *   A9d ③ 同 root 重复 session_start → 旧句柄被停
 *                      真实行为：窗口重开（session 重启）场景；旧句柄不关 = 双监听
 *                      泄漏，C6 的「只处理一次」在双实例下重新变竞态
 *   E1 唤醒断言        真实行为（D-25）：消息走真实 deliver 落盘、watchInbox 真实
 *                      消费（C2 清空），peek 断言改为「唤醒内容 + 收件箱清空」——
 *                      覆盖 M6-010 全链路，删掉唤醒接线 E1 即红
 *   _fixture waitFor   无 it，只提供时序等待（harness 不是测试逻辑）
 *
 * 仪式成分：没找到。唤醒是 M6.6 判 FAIL 的根因（M6-010），每条用例对应一个真实
 * 失败点或通道语义；删任一 guard 对应用例红。结构性原因未变；阈值仍留 1.0，未动。
 *
 * ── 2026-08-21 第三次审的结论（M5 收尾，红线 2.09）─────────
 * 构成 diff（对上次审 1.95 = src 1115 / tests 2171）：
 *   src   1115 → 1501（+386，全是 src/gates 七个文件）
 *   tests 2171 → 3144（+973，其中 tests/gates 951、tests/plan +22）
 *
 * 逐份过 tests/gates 十份，判据是「测真实行为还是测仪式」：
 *   T1  分发前可测        真实行为（reason 带行号，者仓库那个裸 false 的反面）
 *   T2  产出随断言数缩放  真实行为（D-22；含「小节多寡不影响判定」这条反向证据）
 *   T3  漏一条列编号    真实行为（这是本层唯一被实测验证过的杠杆：dev 4/4 vs tester 0/4）
 *   T4  快照比对        真实行为（size+mtime 已被实测否掉，改 sha256）
 *   T5  真跑命令        真实行为，且**逮到两个真文案 bug**：GBK 乱码、
 *                       以及命令找不到被报成「测试失败」（D-32 归类错）
 *   T6  test: null      真实行为（D-23：空 gate 合法、静默的不合法）
 *   T7  人工问题覆盖    真实行为（者仓库无此 gate，四个里程碑零缺陷被人工关卡抓到）
 *   T8  配置 fatal 不对称  真实行为（拦「宣布完成」、放行「继续开发」）
 *   T9  链是数据        真实行为（spy 计数验贵的真没跑；双向查 ROUTES↔CHAINS，
 *                       者仓库 ticket_result 七处声明零处工作就是这个形状）
 *   T10 者仓库四份报告  真实行为（真实出过事的输入；含防误伤那半）
 *   _fixture 126 行     无 it，只做三件事：真 Milestone / 真 Config / 从断言表推导产出
 *
 * 仪式成分：没找到。两个文案 bug 全由这批用例逐出，且它们正好是本层存在
 * 的理由本身（dev 4/4 与 tester 0/4 的差别全部来自措辞）。
 *
 * 上次记的那条负债（L7 偏大，「下次红了先看它」）：**变差了**。182 行 → 236 行，
 * 仍是 12 个 it（`6747c8e` 补的两条回归）。不在本轮拆：拆文件是独立改动（D-45），
 * 而本轮是 M5。**结论：它升级为下一个里程碑开工前的第一件事**，不再等「下次红」——
 * 这个拖字术已经证明会把负债往后推一轮（上次就是这么写的，然后它又长了 54 行）。
 * tests/gates 这轮没重蹈：十份最大的 T5 也是 250 行 / 13 it，且它真的就是一个约束
 * （真跑命令）的多个面。
 *
 * 改阈值必须先改这里的口径定义——那是两件事，不能在「审不过去」的当口顺手做。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const THRESHOLD = 1.0;
/** 数据与凭证不是自检代码。今天这两个目录里没有 .ts，写进口径是为未来 */
const EXCLUDE = ["tests/fixtures/", "tests/manual/"];

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const full = join(dir, e).replace(/\\/g, "/");
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith(".ts")) out.push(full);
  }
  return out;
}

/** 非注释非空行。块注释与行注释都算注释，`*` 开头的续行也算 */
function codeLines(file) {
  let n = 0;
  let inBlock = false;
  for (const raw of readFileSync(file, "utf-8").split("\n")) {
    const t = raw.trim();
    if (t === "") continue;
    if (inBlock) {
      if (t.includes("*/")) inBlock = false;
      continue;
    }
    if (t.startsWith("/*")) {
      if (!t.includes("*/")) inBlock = true;
      continue;
    }
    if (t.startsWith("//") || t.startsWith("*")) continue;
    n++;
  }
  return n;
}

const srcFiles = walk("src");
const testFiles = walk("tests").filter((f) => !EXCLUDE.some((p) => f.startsWith(p)));

const sum = (fs) => fs.reduce((a, f) => a + codeLines(f), 0);
const src = sum(srcFiles);
const tests = sum(testFiles);
const ratio = tests / src;

/** 按目录分组，看构成落在哪一层 */
function byGroup(files) {
  const g = new Map();
  for (const f of files) {
    const key = f.split("/").slice(0, 2).join("/");
    g.set(key, (g.get(key) ?? 0) + codeLines(f));
  }
  return [...g].sort((a, b) => b[1] - a[1]);
}

console.log("D-41 自检不得超过运行时（口径见本脚本文件头）\n");
console.log(`  运行时 src    ${String(src).padStart(5)} 行  (${srcFiles.length} 文件)`);
console.log(`  自检   tests  ${String(tests).padStart(5)} 行  (${testFiles.length} 文件，已排除 ${EXCLUDE.join(" ")})`);
console.log(`  比值          ${ratio.toFixed(2)}  阈值 ${THRESHOLD.toFixed(2)}\n`);

console.log("  构成（非注释非空行）：");
for (const [k, v] of byGroup(srcFiles)) console.log(`    ${k.padEnd(16)} ${String(v).padStart(5)}`);
for (const [k, v] of byGroup(testFiles)) console.log(`    ${k.padEnd(16)} ${String(v).padStart(5)}`);

if (ratio > THRESHOLD) {
  console.log(
    `\n⚠ 越线（${ratio.toFixed(2)} > ${THRESHOLD.toFixed(2)}）。D-41 报告（2026-08-24 降级，见文件头「降级」段）：` +
      `\n  比值 ${ratio.toFixed(2)} 摆在这里。红而行动与否由人决定——` +
      `\n  审了十七次、零行动之后，它不再假装是闸门，只是数字。`,
  );
  // 不 exit(1)：降级为报告后更不该硬失败——它摆数字，不拦人。
  // 改数字仍是这条纪律要防的事，所以阈值不动；但它不再要求「每次红都写审」。
}
