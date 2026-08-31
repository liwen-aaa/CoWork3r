# 设计共识

## 1. 单槽位是锁

- 共识：单槽位 + 原子创建 = 锁，文件名即锁，禁止覆盖
- 物化：✅ `src/channel/atomic.ts`（真实存在）

## 2. gate 装在行为发生处

- 共识：在投递时拦，当场收 reason 改
- 物化：✅ `src/adapter/wire.ts` + ✅ `src/gates/nonexistent-gate.ts`
