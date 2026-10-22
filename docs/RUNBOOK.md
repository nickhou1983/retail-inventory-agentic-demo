# 生产发布与应急回滚手册（Operations Runbook）

> **[GAP #5 - 待 `sre-observability` Agent C 补全]**：
> 当前文档仅包含基础占位说明。需要在改造中补充：
> 1. 10% -> 50% -> 100% 灰度放量观测指标清单（`inventory_restock_success_total`、`inventory_restock_dlq_total`）
> 2. 死信队列（`inventory.restock.dlq`）消息排障与安全重放步骤
> 3. 紧急回滚预案（Feature Flag 降级回准实时跑批）
