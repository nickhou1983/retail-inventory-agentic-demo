---
mode: "plan"
description: "第二幕：跨服务诊断订单取消未实时回补库存的根因，并输出三路 Sub-issues 并行实施计划"
---
请结合仓库中的 `.github/copilot-instructions.md`、`src/order/order-service.ts`、`src/bus/event-bus.ts`、`src/inventory/inventory-service.ts`、`src/observability/metrics.ts` 和 `tests/order-cancel.test.ts`，执行跨服务架构诊断（暂不修改代码）：

1. **现状与根因诊断（列出 5 大架构缺口）**：
   - 订单服务（`order-service.ts`）取消订单时为何没有触发库存回补？
   - 消息总线（`event-bus.ts`）在消费失败时缺少什么机制？
   - 库存服务（`inventory-service.ts`）在幂等控制、并发安全（乐观锁）和审计日志上存在哪些漏洞？
   - 现有测试（`tests/`）与运维指标（`metrics.ts`）缺少哪些覆盖？
2. **制定多路专业 Agent 并行实施计划（Sub-issues 拆分建议）**：
   - **Sub-issue 1（指派 `inventory-impl` Agent）**：业务实现（事件发布、幂等去重、乐观锁、重试与死信队列、审计日志）
   - **Sub-issue 2（指派 `chaos-qa` Agent）**：测试与验证（重复消息幂等、DB 超时重试与 DLQ、并发取消竞态测试）
   - **Sub-issue 3（指派 `sre-observability` Agent）**：可观测性与运维文档（回补成功率/失败告警指标、Dashboard 面板更新、发布与回滚手册）
3. **列出需要人类架构师在编码前确认的关键决策点**。
