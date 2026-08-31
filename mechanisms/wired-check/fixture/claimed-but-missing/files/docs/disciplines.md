# 纪律

| id | 纪律 | 判据 | 落点 |
|---|---|---|---|
| D-47 | 只增不改有机制 | 某条在某次提交里消失 = 违反 | `npm run check:disciplines` |
| D-49 | 导出必须有生产调用点 | 零生产调用点 = 违反 | `npm run check:wiring`（已串 pretest） |
