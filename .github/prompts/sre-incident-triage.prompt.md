---
mode: "agent"
description: "第六幕：根据生产灰度死信告警与数据库连接池延迟突增日志，生成根因诊断与修复 Issue 草案"
---
生产灰度发布至 10% 流量期间，SRE 监控发现以下异常遥测数据：
- `inventory_restock_retry_total` 在大促整点峰值突增 420%
- `inventory_restock_dlq_depth` 出现 3 条死信告警，错误栈显示 `InventoryLockTimeoutError: DB connection pool exhausted after 150ms`

请结合 `src/bus/event-bus.ts` 与 `src/inventory/inventory-service.ts` 分析根因，并输出一份可直接提交到 GitHub Issues 的结构化故障修复工单（包含：故障现象、根因定位、带抖动 Jitter 的退避优化方案、批量回补合并策略以及验收测试要求）。
