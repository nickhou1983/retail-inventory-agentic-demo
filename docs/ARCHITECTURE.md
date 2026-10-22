# 零售订单与库存服务架构说明（Architecture Overview）

## 1. 现状痛点（改造前基线）
在大促高峰期，大量用户下单锁库后在 5 分钟内取消订单。当前系统存在以下断层：
- `OrderService.cancelOrder()` 仅将订单状态更新为 `CANCELLED`，未向 `EventBus` 发送实时库存释放事件，依赖每小时跑批任务（Hourly Batch Job）回补库存。
- `EventBus.publish()` 缺少指数退避重试与死信队列（`inventory.restock.dlq`）兜底。
- `InventoryService.restockFromCancellation()` 缺少基于 `idempotencyKey` 的幂等去重与基于 `version` 的乐观锁（CAS）并发保护。

## 2. 目标架构（Agentic SDLC 改造后）
```mermaid
sequenceDiagram
    participant User as 用户 / API
    participant Order as OrderService
    participant Bus as EventBus (Retry + DLQ)
    participant Inv as InventoryService (Idempotent + CAS)
    participant Obs as Metrics & Audit Log

    User->>Order: POST /api/orders/:id/cancel
    Order->>Order: 状态置为 CANCELLED
    Order->>Bus: publish("order.cancelled", event + idempotencyKey)
    Bus->>Inv: restockFromCancellation(event)
    alt 正常回补 & 首次消费
        Inv->>Inv: 校验 idempotencyKey + 乐观锁 version CAS
        Inv->>Obs: 记录 RESTOCKED 审计日志 + 成功指标
    else 重复消息重放
        Inv->>Obs: 短路跳过 DUPLICATE_SKIPPED
    else 数据库瞬态超时
        Bus->>Inv: 自动指数退避重试 (最多 3 次)
        Bus->>Obs: 超限推入 inventory.restock.dlq 并触发告警
    end
```
