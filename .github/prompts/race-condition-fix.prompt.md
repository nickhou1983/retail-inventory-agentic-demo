---
mode: "agent"
description: "第四/五幕：修复高并发订单取消场景下的库存竞态条件（乐观锁 CAS 与原子幂等校验）"
---
在 PR 评审中，Copilot Code Review 与架构师指出 `src/inventory/inventory-service.ts` 在高并发取消场景下存在竞态条件风险（Race Condition）。

请按照 `.github/instructions/inventory-db.instructions.md` 的要求完成以下修复：
1. 在 `src/inventory/inventory-service.ts` 中引入基于 `version` 的乐观锁（Compare-And-Swap）校验与单键互斥锁，确保高并发下 `idempotencyKey` 判重与 `availableQty` 累加的原子性。
2. 在 `tests/` 中补充并发竞态回归测试（同时发起 20 个相同/不同订单的并发取消与扣减请求），验证库存守恒且无重复回补。
3. 运行 `npm test` 与 `npm run typecheck`，确保所有门禁 100% 通过。
