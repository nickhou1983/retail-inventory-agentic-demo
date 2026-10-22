---
applyTo: "src/inventory/**"
---
# Inventory Service & Concurrency Guardrails

在修改 `src/inventory/` 下的任何代码时，必须遵守以下金融/库存级并发与数据一致性规范：

1. **禁止非原子读写（No Unchecked Read-Modify-Write）**：
   - 严禁直接执行 `item.availableQty += event.quantity` 而不检查并发版本冲突。
   - 必须通过乐观锁版本号 `version` 进行校验（每次变更 `version += 1`），若版本不匹配则触发安全重试。
2. **幂等键持久化校验（Idempotency Ledger）**：
   - 在执行库存回补前，必须先检查 `processedIdempotencyKeys.has(event.idempotencyKey)`。
   - 幂等键登记与库存数量递增必须在同一次原子操作中完成。
3. **结构化审计记录（Audit Trail）**：
   - 每次调用 `restockFromCancellation` 必须记录包含 `orderId`、`sku`、`quantity`、`idempotencyKey`、`beforeQty`、`afterQty`、`status`（`RESTOCKED` | `DUPLICATE_SKIPPED` | `FAILED`）和 `timestamp` 的审计日志。
