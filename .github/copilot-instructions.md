# Retail Order & Inventory Platform — Global Engineering Instructions

本仓库是零售电商核心交易链路的**订单取消与实时库存回补系统（Order Cancellation & Real-Time Inventory Restock）**。所有人类工程师与 AI 智能体（Local / Background / Cloud Agents）在规划、编码与评审时必须严格遵守以下架构红线：

## 1. 架构契约与核心链路
- **服务边界**：
  - `src/order/order-service.ts`：负责订单状态机流转（`CONFIRMED` -> `CANCELLED`），订单取消后必须通过 `EventBus` 异步发布 `OrderCancelledEvent`。
  - `src/bus/event-bus.ts`：负责事件投递、指数退避重试（Exponential Backoff）以及超阈值后的死信队列（`inventory.restock.dlq`）路由。
  - `src/inventory/inventory-service.ts`：负责消费 `OrderCancelledEvent` 并执行实时库存回补、幂等校验、乐观锁控制与审计日志记录。
  - `src/observability/metrics.ts`：负责暴露库存回补耗时、成功率、重试次数与死信告警指标。

## 2. 四大强制工程红线（Non-Negotiable Guardrails）
1. **严格幂等控制（Idempotency）**：
   - 任何库存变更操作必须校验 `idempotencyKey`（格式：`cancel:${orderId}:${sku}`）。
   - 重复投递的 `OrderCancelledEvent` 必须安全短路返回 `{ applied: false, reason: 'DUPLICATE_EVENT' }`，**严禁重复累加库存**。
2. **并发安全与乐观锁（Optimistic Locking / CAS）**：
   - 严禁“先读取库存再无条件覆盖写回”的非原子操作。
   - 更新库存时必须校验库存记录的 `version` 版本号（Compare-And-Swap），防止高频取消与正常下单扣减发生并发竞态（Race Condition）。
3. **失败重试与死信队列（Retry & DLQ）**：
   - 当库存服务偶发超时或抛出瞬态异常时，`EventBus` 必须执行最多 `maxRetries`（默认 3 次）重试；
   - 超过重试次数仍失败的事件，必须推入死信队列 `inventory.restock.dlq` 并触发 `inventory_restock_dlq_alerts_total` 告警指标，严禁静默吞掉异常。
4. **完整审计与可观测性（Audit & Telemetry）**：
   - 每次库存回补（含成功、幂等跳过、重试失败入 DLQ）均需写入结构化审计日志 `RestockAuditEntry`。
   - 原有下单与取消主链路响应耗时不得因回补逻辑劣化，正常取消接口返回保持毫秒级。
