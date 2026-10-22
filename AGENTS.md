# AGENTS.md — Multi-Agent Collaboration & Harness Guide

本仓库遵循开放 `AGENTS.md` 规范，支持 GitHub Copilot（IDE / Copilot App / Copilot CLI / Cloud Agent）及其他兼容智能体协同工作。

## 常用开发与验证命令
- **安装依赖**：`npm install`
- **运行全部测试（单测 + 并发 + E2E 契约）**：`npm test`
- **类型与静态检查**：`npm run typecheck`
- **启动本地可视化订单与库存运维看板**：`npm start`（默认监听 `http://localhost:3000`）

## 专业 Agent 角色分工（`.github/agents/*.agent.md`）
在拆分父 Issue 为多个 Sub-issues 并行执行时，推荐使用以下三个专业智能体：
1. **`inventory-impl`（Agent A · 业务实现专家）**：负责 `src/order/`、`src/bus/` 与 `src/inventory/` 的事件发布、幂等去重、乐观锁 CAS、重试队列与审计日志实现。
2. **`chaos-qa`（Agent B · 并发与混沌测试专家）**：负责 `tests/` 下重复消息重放、数据库超时注入、并发取消竞态与端到端回补时效验证。
3. **`sre-observability`（Agent C · 可观测性与运维专家）**：负责 `src/observability/`、`public/dashboard.html` 与 `docs/RUNBOOK.md` 的监控指标、告警规则及回滚预案。
