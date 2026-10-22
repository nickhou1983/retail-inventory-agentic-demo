# GitHub Agentic SDLC 端到端现场演示手册（Live Demo Runbook）

本手册配套演示仓库 `retail-inventory-agentic-demo` 与 CIO 演讲胶片（`github-agentic-sdlc-cio-deck.html`），帮助演讲者在 **15–20 分钟** 内完整呈现从“大促库存回补痛点”到“多路专业 Agent 并行研发、机器发现高并发竞态、自动修复上线及 SRE 闭环”的真实工程全流程。

---

## 0. 演示前环境准备（Pre-Demo Checklist）

1. **打开三个浏览器标签页**：
   - **Tab 1（演讲胶片）**：`github-agentic-sdlc-cio-deck.html`（按 `F` 键进入全屏播放）
   - **Tab 2（GitHub 仓库主页与 Issues）**：`https://github.com/nickhou1983/retail-inventory-agentic-demo/issues`
   - **Tab 3（本地业务监控看板）**：在终端执行 `npm start` 后打开 `http://localhost:3000`
2. **打开本地开发入口（三选一或组合展示）**：
   - **VS Code** 或 **GitHub Copilot App**（打开 `/Users/qifenghou/github/retail-inventory-agentic-demo`）
   - **终端（Copilot CLI）**

---

## 第一幕：结构化需求入口与工程上下文底座（约 3 分钟）
> **对应胶片**：Slide 04（能力 2.1 上下文）、Slide 06（能力 2.3 四级指令）、Slide 11（第一幕）

### 现场操作步骤
1. **先看业务痛点（Tab 3 `http://localhost:3000`）**：
   - 点击右上角 **`+ 模拟大促下单 (锁库存 2 件)`**，看到 `iPhone 16 Pro` 可用库存从 `10` 变为 `8`，预占锁定变为 `2`。
   - 点击订单列表中的 **`取消订单`**，订单状态变为 `CANCELLED`，但**可用库存依然是 `8`，预占库存仍锁着 `2` 件**！
2. **切到 GitHub Issues（Tab 2）展示“契约式入口”**：
   - 打开 **Issue #1：`[Feature] 订单取消后实时库存回补与幂等重试改造`**。
   - 向观众展示：Issue 中不是模糊的一句话，而是定义了 **6 条可验证的验收标准（Acceptance Criteria）**，并且已经通过 **Sub-issues** 拆解为 **#2（业务实现）、#3（并发与混沌测试）、#4（可观测性与运维手册）** 三个子任务。
3. **展示 `.github/` 四级工程规范（Standards-as-Code）**：
   - 点开 `.github/copilot-instructions.md` 与 `.github/instructions/inventory-db.instructions.md`（展示 `applyTo: "src/inventory/**"`）。

### 演讲台词要点（Talking Points）
> “在企业级 Agentic SDLC 中，研发的起点不是在聊天框里随手敲一句模糊的 Prompt，而是一张包含明确边界条件和 6 条可验证标准的 GitHub Issue。同时，我们把企业架构师最关心的幂等键规范、乐观锁 CAS 要求写进了 `.github/instructions/`。这样无论是人类还是任何 Agent 接手，都共享同一套工程红线。”

---

## 第二幕：Plan 角色跨服务诊断与方案对齐（约 3 分钟）
> **对应胶片**：Slide 05（Ask/Plan/Agent 演进）、Slide 11（第二幕）

### 现场操作步骤
1. 在 **VS Code / Copilot App** 中打开 Chat 面板，将角色切换为 **`Plan`**（或直接输入斜杠命令 `/plan-inventory-restock`）。
2. 发送以下提示词（也可直接调用 `.github/prompts/plan-inventory-restock.prompt.md`）：
   ```text
   /plan-inventory-restock 请结合 Issue #1 的验收标准与 .github/copilot-instructions.md，跨服务分析当前代码库为何取消订单后库存未实时回补，列出架构缺口并给出多路 Agent 并行改造计划（暂不修改代码）。
   ```
3. **展示 Agent 的输出**：
   - Agent 会自动读取 `order-service.ts`、`event-bus.ts`、`inventory-service.ts`、`metrics.ts` 和 `order-cancel.test.ts`，精准指出我们在代码中预埋的 **5 大架构缺口**（未发事件、无重试/DLQ、缺少 `idempotencyKey` 与乐观锁、缺少异常测试、缺少回补指标）。
   - 同时输出清晰的三路并行实施计划（Plan）。

### 演讲台词要点（Talking Points）
> “大家注意，Agent 没有一上来就盲目改代码，而是先用 **Plan 角色** 跨文件扫描了订单服务、消息总线和库存服务，把 5 个隐藏的架构断层全部找了出来。人类架构师在这一步花 1 分钟审查并点击 Approve，就从源头避免了 AI 在错误的方向上生成几千行废代码。”

---

## 第三幕：三端入口 × 多路专业 Agent 并行研发（约 4 分钟）
> **对应胶片**：Slide 05（IDE / Copilot App / CLI × Local / Background / Cloud）、Slide 12（第三幕）

### 现场操作步骤（展示按角色并行派单）
1. **第一路（Cloud Agent · 云端沙箱异步交付）**：
   - 在 GitHub 网页端打开 **Sub-issue #2（`[Sub-issue A] 业务实现：事件发布、幂等回补与重试死信`）**，在右侧 `Assignees` 中直接选择 **`Copilot`**（或选择 `inventory-impl` 自定义 Agent）。
   - Cloud Agent 立即在 GitHub Actions 云端隔离沙箱中拉起分支开始编码。
2. **第二路（Copilot App · Background Worktree Agent 本地并发）**：
   - 在 **Copilot App** 中新建一个基于隔离 **Git Worktree** 的后台会话，选用 `.github/agents/chaos-qa.agent.md` 角色，粘贴以下指令：
     ```text
     请作为 @chaos-qa 完成 Sub-issue #3：在 tests/order-cancel.test.ts 中补充：
     1. 重复投递相同 idempotencyKey 的 OrderCancelledEvent 3 次，验证库存仅增加 1 次；
     2. 调用 injectTransientDbTimeouts(2) 验证自动重试成功，以及超限后进入 Dead-Letter Queue；
     3. 并发取消测试。
     ```
3. **第三路（IDE / Copilot CLI · Local Agent 实时交互）**：
   - 在 IDE 或终端 **Copilot CLI** 中选用 `sre-observability` 角色，快速更新 `src/observability/metrics.ts` 与 `docs/RUNBOOK.md`。

### 演讲台词要点（Talking Points）
> “过去一个开发人员串行做完这些，往往只来得及把主流程代码写完，测试和运维手册全靠后面补。现在通过 **IDE、Copilot App 和 Copilot CLI 三大入口**，我们同时驱动 **Cloud、Background Worktree 和 Local** 三类运行目标：业务代码、高并发混沌测试、监控指标和回滚手册在同一迭代同步产出。”

---

## 第四幕 & 第五幕：机器初审拦截高并发竞态 + 人机闭环修复（约 3 分钟）
> **对应胶片**：Slide 08（能力 2.5 四道门禁）、Slide 13（第四幕 & 第五幕）

### 现场操作步骤
1. **演示“看似能跑通、实则有高并发竞态”的风险拦截**：
   - 打开 `src/inventory/inventory-service.ts` 第 77–85 行，向观众展示代码中预留的典型陷阱：
     ```ts
     const snapshotAvailable = item.availableQty;
     await new Promise((resolve) => setTimeout(resolve, 5));
     item.availableQty = snapshotAvailable + event.quantity;
     ```
   - 当提交 PR 或发起 **Copilot Code Review** 时，由于我们在 `.github/instructions/inventory-db.instructions.md` 中声明了**禁止非原子读写、必须校验乐观锁 `version`**，Copilot Code Review 会直接在该行下留评警告：**`[High Risk] Concurrent Race Condition: Non-atomic read-modify-write across async boundary without version CAS check`**。
2. **第五幕：一键调用 Prompt 模板完成修复与验证**：
   - 在 PR 评论区直接回复 `@copilot 请按照乐观锁规范修复此并发竞态并补充 20 并发回归测试`，或在本地执行 `/race-condition-fix`。
   - 运行 `npm test` 与 `npm run typecheck`，展示全部测试毫秒级绿灯通过！
   - 刷新 **Tab 3（`http://localhost:3000` 监控台）**：再次点击下单并取消订单，可以看到**可用库存立即从 8 自动回补到 10，审计日志与监控指标实时更新**！

### 演讲台词要点（Talking Points）
> “如果只靠人工肉眼看 Diff，这种跨异步边界的库存读写竞态很容易漏掉，一旦上了双十一大促就是超卖事故。GitHub 的 **Copilot Code Review + Path-Scoped Instructions** 在人类介入前先把这类高并发隐患拦住，而人类架构师只需拍板方案并让 Agent 补齐乐观锁与 20 并发压测。”

---

## 第六幕：生产灰度与 SRE 异常自愈闭环（约 2 分钟）
> **对应胶片**：Slide 09（能力 2.6 运维反哺）、Slide 14（第六幕）

### 现场操作步骤
1. 在 Chat 中输入斜杠命令 `/sre-incident-triage`（对应 `.github/prompts/sre-incident-triage.prompt.md`）。
2. Agent 根据生产 10% 灰度的死信告警与连接池竞争日志，自动生成一份包含**“根因定位 + Full Jitter 退避优化 + 热点 SKU 压测要求”**的结构化 Issue 草案（或直接在 GitHub New Issue 页面选择我们预置的 **`SRE Production Incident Feedback (Act VI Loop)`** 模板创建 Issue）。
3. 将新生成的 Issue 再次指派给 `Copilot`，展示**“生产运行数据反哺下一轮研发迭代”**的完整闭环。

### 演讲收尾金句
> “从一张结构化 Issue 出发，经过 Plan 架构对齐、多路专业 Agent 并行研发、AI 安全与代码门禁初审、人类架构师终审合并，再到生产 SRE 告警自动回流生成新 Issue——这就是 GitHub 交付给企业的**可自治、可编排、可审计、可持续进化的 Agentic SDLC 平台**。”
