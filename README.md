# Retail Order & Inventory Platform — GitHub Agentic SDLC Live Demo

本仓库是配合 **《GitHub Agentic SDLC 平台端到端故事（CIO 演讲）》** 专门设计的**真实现场演示代码库（Live Demo Repository）**。

业务场景聚焦于零售电商大促核心痛点：**“用户取消订单后，如何在 30 秒内完成高并发安全、严格幂等、带自动重试与死信告警的实时库存回补”**。

---

## 仓库内置的 Agentic SDLC 架构资产

### 1. 四级版本化工程规范（4-Tier Standards-as-Code）
| 层级 | 路径 | 作用 |
| :--- | :--- | :--- |
| **Tier 1 · 全局基线** | [`.github/copilot-instructions.md`](.github/copilot-instructions.md) & [`AGENTS.md`](AGENTS.md) | 定义全仓架构契约与四大红线（幂等键、乐观锁、重试+死信、审计日志） |
| **Tier 2 · 路径级规则** | [`.github/instructions/inventory-db.instructions.md`](.github/instructions/inventory-db.instructions.md)<br/>[`.github/instructions/testing.instructions.md`](.github/instructions/testing.instructions.md) | 通过 `applyTo` 在修改库存代码或测试代码时自动注入 CAS 乐观锁与混沌测试规范 |
| **Tier 3 · 任务提示模板** | [`.github/prompts/plan-inventory-restock.prompt.md`](.github/prompts/plan-inventory-restock.prompt.md)<br/>[`.github/prompts/race-condition-fix.prompt.md`](.github/prompts/race-condition-fix.prompt.md)<br/>[`.github/prompts/sre-incident-triage.prompt.md`](.github/prompts/sre-incident-triage.prompt.md) | 对应第二幕（Plan 诊断）、第四/五幕（竞态修复）、第六幕（SRE 故障回流）的一键斜杠命令 |
| **Tier 4 · 专业智能体** | [`.github/agents/inventory-impl.agent.md`](.github/agents/inventory-impl.agent.md)<br/>[`.github/agents/chaos-qa.agent.md`](.github/agents/chaos-qa.agent.md)<br/>[`.github/agents/sre-observability.agent.md`](.github/agents/sre-observability.agent.md) | 业务实现专家（Agent A）、并发与混沌测试专家（Agent B）、可观测性与运维专家（Agent C） |
| **Agentic Workflow** | [`.github/workflows/issue-triage.md`](.github/workflows/issue-triage.md)<br/>[`.github/workflows/issue-triage.lock.yml`](.github/workflows/issue-triage.lock.yml) | 新建/更新 Issue 自动分析、不清晰追问、专业化描述重构、分类打标、受影响代码定位、跨模块父需求自动拆解挂载 Sub-issues（A/B/C），以及按风险分级（L1 UI/中小变更直接调用 Cloud Agent 生成 PR，L2 跨服务/核心交易人工指派） |

### 2. 代码中预埋的 5 大“故意缺陷”（供第二幕 Plan 诊断与第四幕 PR 拦截演示）
在 `main` 分支初始基线中，代码可正常编译并通过基础测试（`npm test`），但精准预埋了演示所需的 5 处架构断层：
1. **`[GAP #1]` 缺少事件发布（`src/order/order-service.ts`）**：`cancelOrder()` 仅修改订单状态为 `CANCELLED`，未向 `EventBus` 发布 `OrderCancelledEvent`。
2. **`[GAP #2]` 缺少重试与死信队列（`src/bus/event-bus.ts`）**：`publish()` 消费失败仅打印 `console.error`，无指数退避重试与 `inventory.restock.dlq` 死信队列。
3. **`[GAP #3]` 缺少幂等去重与乐观锁竞态保护（`src/inventory/inventory-service.ts`）**：`restockFromCancellation()` 未校验 `idempotencyKey`，且故意保留了 `await setTimeout(5ms)` 的非原子读写窗口（用于触发第四幕的**高并发竞态条件拦截**）。
4. **`[GAP #4]` 测试覆盖缺失（`tests/order-cancel.test.ts`）**：缺少重复消息重放、DB 超时注入与高并发取消竞态测试。
5. **`[GAP #5]` 监控指标与运维手册缺失（`src/observability/metrics.ts` & `docs/RUNBOOK.md`）**：缺少库存回补成功率、死信水位指标与灰度回滚手册。

---

## 快速启动与现场演示指南

```bash
# 1. 安装依赖
npm install

# 2. 运行基线测试与架构红线校验
npm test
npm run typecheck
npm run verify:guardrails

# 3. 启动可视化零售订单与库存运维看板 (http://localhost:3000)
npm start
```

👉 **完整逐幕现场演示台词与操作手册请查看：[DEMO_RUNBOOK.md](DEMO_RUNBOOK.md)**
