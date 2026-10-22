---
applyTo: "tests/**"
---
# Chaos & Concurrency Testing Standards

在 `tests/` 目录下编写或修改测试时，必须覆盖以下四类高风险边界场景：

1. **正常回补时效测试**：订单取消后，预占库存必须在规定窗口（SLA < 30s，单测环境 < 500ms）内准确回补至 `availableQty`。
2. **重复消息幂等测试（Duplicate Event Replay）**：同一 `OrderCancelledEvent`（相同 `idempotencyKey`）连续投递 3 次以上，库存只允许增加 1 次，且后续投递返回 `DUPLICATE_SKIPPED`。
3. **故障注入与死信测试（Fault Injection & DLQ）**：模拟库存存储层连续超时（`simulateDbTimeout`），验证 `EventBus` 自动重试 N 次后将事件推入 `inventory.restock.dlq`，并触发告警计数递增。
4. **高并发竞态测试（Concurrent Race Condition）**：使用 `Promise.all` 模拟多个取消事件与正常库存扣减并发执行，验证最终库存总量严格守恒（无超卖、无丢账）。
