# Conversational Canvas Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前 Canvas Agent 改造成 TapNow 风格的对话式共创 Agent：先澄清和提案，用户确认后才执行 Skill/App/计费任务，并把结果可追踪地写回画布。

**Architecture:** 保留现有 V2 session、event stream、审批、计费、Skill Run 和 CanvasAgentOp 底层；新增安全的结构化 ConversationBlock 协议与渲染层，将“对话协作状态”和“后台执行状态”分离。所有付费或大范围画布动作必须经过显式决策门，所有结果使用现有 assetId/远程草稿规则持久化。

**Tech Stack:** React 18、TypeScript、Vitest、React Testing Library、现有 `@xyflow/react` 画布、现有 V2 API/session/event-stream、共享 MenuSurface/menu tokens。

---

## 文件与边界

新增文件：

- `src/flowCanvas/agent/conversation/ConversationBlockTypes.ts`：结构化 block、选项、表格、Brief、能力、进度、结果的纯类型与窄化函数。
- `src/flowCanvas/agent/conversation/ConversationBlockRenderer.tsx`：按 block type 分发到安全 UI 组件。
- `src/flowCanvas/agent/conversation/ConversationQuestionCard.tsx`：单选/多选/自由回答问题。
- `src/flowCanvas/agent/conversation/ConversationChoiceGrid.tsx`：方向选择与快捷动作。
- `src/flowCanvas/agent/conversation/ConversationComparisonTable.tsx`：可响应式比较表。
- `src/flowCanvas/agent/conversation/ConversationBriefCard.tsx`：确认前的设计 Brief。
- `src/flowCanvas/agent/conversation/ConversationCapabilityCard.tsx`：Skill/App 推荐与状态。
- `src/flowCanvas/agent/conversation/ConversationConfirmationCard.tsx`：费用、风险、确认/修改操作。
- `src/flowCanvas/agent/conversation/ConversationProgressCard.tsx`：执行步骤与进度。
- `src/flowCanvas/agent/conversation/ConversationResultGroup.tsx`：结果对比、选择、定位、放置、继续编辑。
- `src/flowCanvas/agent/conversation/ConversationRenderer.test.tsx`：block renderer、交互和密度回归测试。
- `src/flowCanvas/agent/agentConversationState.ts`：会话状态、决策门和合法转换。
- `src/flowCanvas/agent/agentConversationState.test.ts`：状态转换与执行阻断测试。
- `src/flowCanvas/agent/agentContextSnapshot.ts`：节点/素材/能力/graph revision 快照构造与校验。
- `src/flowCanvas/agent/agentContextSnapshot.test.ts`：快照稳定性和 stale graph 测试。

修改文件：

- `src/flowCanvas/agent/canvasAgentTypes.ts`：加入 ConversationBlock、AgentDecision、Turn metadata 类型；保持现有 CanvasAgentOp 兼容。
- `src/flowCanvas/agent/CanvasAgentConversationView.tsx`：使用 block renderer，保留历史/回放绑定。
- `src/flowCanvas/agent/CanvasAgentComposer.tsx`：支持 pending question 的选项提交、自由文本和确认动作。
- `src/flowCanvas/agent/CanvasAgentPanel.tsx`：连接 conversation state、context snapshot、结果动作和能力卡。
- `src/flowCanvas/agent/CanvasAgentWorkspaceShell.tsx`：从多 Tab 首层改为任务标题/上下文/对话/输入结构；日志和历史降为二级入口。
- `src/flowCanvas/agent/CanvasAgentPlanCard.tsx`、`CanvasAgentResultCard.tsx`、`CanvasAgentSkillPlan.tsx`：迁移到 block renderer 的兼容适配，而不是继续各自维护一套消息样式。
- `src/flowCanvas/agent/useCanvasAgentSessionV2.ts`：将 `ask_user`、`propose_plan`、`wait_confirmation`、`execute` 映射到 durable turn 和前端状态。
- `src/flowCanvas/agent/canvasAgentApi.ts`：加入结构化 turn/answer/decision 请求的类型安全客户端方法。
- `src/flowCanvas/flowCanvas.css`：加入 Agent 面板桌面/窄屏布局和卡片状态变量，复用共享菜单密度。
- `PROJECT_RECORD.md`：每个阶段完成后记录验证和开关状态。

后端需要在 Phase 2 才修改：

- `apps/api/src/modules/agent/*` 对应 session/turn route、schema、service：持久化 blocks、pending question、context snapshot 和 decision gate。
- `packages/db/migrations/*`：只在现有 agent turns/session schema 不足时增加 tenant-scoped 字段，并补 RLS/index。

---

### Task 1: 建立结构化 ConversationBlock 契约

**Files:**
- Create: `src/flowCanvas/agent/conversation/ConversationBlockTypes.ts`
- Modify: `src/flowCanvas/agent/canvasAgentTypes.ts`
- Test: `src/flowCanvas/agent/conversation/ConversationBlockTypes.test.ts`

- [ ] **Step 1: Write failing type/normalization tests**

测试 `normalizeConversationBlocks` 只保留白名单字段、拒绝未知 block、截断过长文本，并能把普通 legacy reply 转为 paragraph block。

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npx vitest run src/flowCanvas/agent/conversation/ConversationBlockTypes.test.ts`

Expected: FAIL because the new types and normalizer do not exist。

- [ ] **Step 3: Implement the minimal protocol**

定义 `ConversationBlock` union、`AgentOption`、`BriefField`、`CapabilitySummary`、`ProgressStep`、`ResultRef` 和 `normalizeConversationBlocks(input: unknown): ConversationBlock[]`。所有数组限制为 1-12 项；字符串限制为产品安全长度；不把 HTML 或原始 provider/config 字段带入结果。

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `npx vitest run src/flowCanvas/agent/conversation/ConversationBlockTypes.test.ts`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/flowCanvas/agent/conversation/ConversationBlockTypes.ts src/flowCanvas/agent/conversation/ConversationBlockTypes.test.ts src/flowCanvas/agent/canvasAgentTypes.ts
git commit -m "feat: add structured agent conversation blocks"
```

### Task 2: 实现对话状态机与决策门

**Files:**
- Create: `src/flowCanvas/agent/agentConversationState.ts`
- Test: `src/flowCanvas/agent/agentConversationState.test.ts`
- Modify: `src/flowCanvas/agent/canvasAgentTypes.ts`

- [ ] **Step 1: Write failing state transition tests**

覆盖：信息不足只能进入 `asking`；有多个方向进入 `waiting_for_choice`；付费/批量操作进入 `waiting_for_confirmation`；未确认不能进入 `executing`；执行完成进入 `presenting_results`；失败可重试或返回 `refining`。

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/flowCanvas/agent/agentConversationState.test.ts`

Expected: FAIL because `reduceConversationState` and `canExecuteDecision` do not exist。

- [ ] **Step 3: Implement reducer and gate**

实现 `AgentConversationState`、`AgentExecutionState`、`AgentDecision`、`ConversationEvent`，并导出：

```ts
reduceConversationState(state, event): AgentConversationState
canExecuteDecision(decision, state): boolean
requiresExplicitConfirmation(plan): boolean
```

`requiresExplicitConfirmation` 对 `run_node`、批量生成、删除/大范围更新和任何有费用的能力返回 true。

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/flowCanvas/agent/agentConversationState.test.ts`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/flowCanvas/agent/agentConversationState.ts src/flowCanvas/agent/agentConversationState.test.ts src/flowCanvas/agent/canvasAgentTypes.ts
git commit -m "feat: gate agent execution behind conversation decisions"
```

### Task 3: 添加上下文快照与 stale graph 防护

**Files:**
- Create: `src/flowCanvas/agent/agentContextSnapshot.ts`
- Test: `src/flowCanvas/agent/agentContextSnapshot.test.ts`
- Modify: `src/flowCanvas/agent/CanvasAgentPanel.tsx`

- [ ] **Step 1: Write failing snapshot tests**

验证快照只包含 selected node IDs、asset IDs、skill/app IDs 和 graph revision；验证节点顺序稳定、敏感字段不进入快照、revision 变化时 `isSnapshotCurrent` 返回 false。

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/flowCanvas/agent/agentContextSnapshot.test.ts`

Expected: FAIL because snapshot helpers do not exist。

- [ ] **Step 3: Implement helpers**

实现：

```ts
buildAgentContextSnapshot(input): AgentContextSnapshot
isSnapshotCurrent(snapshot, current): boolean
```

在 Panel 每次 turn/confirmation/execute 前创建快照，不改变现有 canvas graph JSON 和 asset persistence。

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/flowCanvas/agent/agentContextSnapshot.test.ts`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/flowCanvas/agent/agentContextSnapshot.ts src/flowCanvas/agent/agentContextSnapshot.test.ts src/flowCanvas/agent/CanvasAgentPanel.tsx
git commit -m "feat: snapshot agent context before decisions"
```

### Task 4: 构建结构化 Block Renderer

**Files:**
- Create: `src/flowCanvas/agent/conversation/ConversationBlockRenderer.tsx`
- Create: `src/flowCanvas/agent/conversation/ConversationQuestionCard.tsx`
- Create: `src/flowCanvas/agent/conversation/ConversationChoiceGrid.tsx`
- Create: `src/flowCanvas/agent/conversation/ConversationComparisonTable.tsx`
- Create: `src/flowCanvas/agent/conversation/ConversationBriefCard.tsx`
- Create: `src/flowCanvas/agent/conversation/ConversationCapabilityCard.tsx`
- Create: `src/flowCanvas/agent/conversation/ConversationConfirmationCard.tsx`
- Create: `src/flowCanvas/agent/conversation/ConversationProgressCard.tsx`
- Create: `src/flowCanvas/agent/conversation/ConversationResultGroup.tsx`
- Create: `src/flowCanvas/agent/conversation/ConversationRenderer.test.tsx`
- Modify: `src/flowCanvas/flowCanvas.css`

- [ ] **Step 1: Write failing renderer tests**

测试每种 block 渲染正确标题层级、选项可点击、表格在窄宽可滚动、确认卡显示费用、结果卡触发 `onAction`，未知 block 不崩溃。

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/flowCanvas/agent/conversation/ConversationRenderer.test.tsx`

Expected: FAIL because components do not exist。

- [ ] **Step 3: Implement components**

所有组件使用 React props 回传动作，不在组件内直接调用 API。使用现有 `MenuSurface`/menu tokens；遵守 38px menu row、12px primary label、共享 radius/shadow；使用 lucide 图标和语义颜色。结果媒体只接收 `assetId`/安全 preview resolver。

- [ ] **Step 4: Run focused UI tests**

Run: `npx vitest run src/flowCanvas/agent/conversation/ConversationRenderer.test.tsx`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/flowCanvas/agent/conversation src/flowCanvas/flowCanvas.css
git commit -m "feat: render structured agent conversation blocks"
```

### Task 5: 将现有 ConversationView/Composer 接入 Block 流

**Files:**
- Modify: `src/flowCanvas/agent/CanvasAgentConversationView.tsx`
- Modify: `src/flowCanvas/agent/CanvasAgentComposer.tsx`
- Modify: `src/flowCanvas/agent/CanvasAgentPanel.tsx`
- Modify: `src/flowCanvas/agent/useCanvasAgentSessionV2.ts`
- Modify: `src/flowCanvas/agent/canvasAgentApi.ts`
- Test: `src/flowCanvas/agent/CanvasAgentConversationView.test.tsx`
- Test: `src/flowCanvas/agent/CanvasAgentComposer.test.tsx`

- [ ] **Step 1: Write failing integration tests**

覆盖：收到 question block 后 Composer 显示选项；点击选项提交 answer；confirmation block 禁用执行按钮直到确认；legacy text reply 仍能显示；stream/replay 使用同一个 blocks reducer。

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/flowCanvas/agent/CanvasAgentConversationView.test.tsx src/flowCanvas/agent/CanvasAgentComposer.test.tsx`

Expected: FAIL because current view only understands legacy timeline/message shapes。

- [ ] **Step 3: Implement API/session adaptation**

在 `canvasAgentApi.ts` 增加类型安全方法：

```ts
submitAgentAnswer(sessionId: string, turnId: string, answer: AgentAnswer): Promise<AgentTurn>
confirmAgentPlan(sessionId: string, turnId: string, planId: string): Promise<AgentTurn>
```

在 `useCanvasAgentSessionV2` 中将服务端事件归一为 `{turnId, blocks, conversationState, executionState}`，并用同一 reducer 处理 live/replay。

- [ ] **Step 4: Implement UI wiring**

`CanvasAgentConversationView` 只负责 block 流和空状态；`CanvasAgentComposer` 负责文字、答案和确认动作；`CanvasAgentPanel` 负责 session/context/asset callbacks。

- [ ] **Step 5: Run focused tests**

Run: `npx vitest run src/flowCanvas/agent/CanvasAgentConversationView.test.tsx src/flowCanvas/agent/CanvasAgentComposer.test.tsx`

Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add src/flowCanvas/agent/CanvasAgentConversationView.tsx src/flowCanvas/agent/CanvasAgentComposer.tsx src/flowCanvas/agent/CanvasAgentPanel.tsx src/flowCanvas/agent/useCanvasAgentSessionV2.ts src/flowCanvas/agent/canvasAgentApi.ts src/flowCanvas/agent/CanvasAgentConversationView.test.tsx src/flowCanvas/agent/CanvasAgentComposer.test.tsx
git commit -m "feat: connect agent composer to structured turns"
```

### Task 6: 将 Panel/Shell 改为任务工作台布局

**Files:**
- Modify: `src/flowCanvas/agent/CanvasAgentWorkspaceShell.tsx`
- Modify: `src/flowCanvas/agent/CanvasAgentPanel.tsx`
- Modify: `src/flowCanvas/agent/CanvasAgentTimeline.tsx`
- Modify: `src/flowCanvas/agent/CanvasAgentPlanCard.tsx`
- Modify: `src/flowCanvas/agent/CanvasAgentResultCard.tsx`
- Modify: `src/flowCanvas/agent/CanvasAgentSkillPlan.tsx`
- Test: `src/flowCanvas/agent/CanvasAgentWorkspaceShell.test.tsx`
- Test: `src/flowCanvas/agent/CanvasAgentPanel.test.tsx`

- [ ] **Step 1: Write failing layout/behavior tests**

测试默认首层显示任务标题、上下文、对话、输入；日志/历史不是首层主导航；面板宽度默认 480-560px；collapse/new task 行为不变；busy 状态不会允许不合法 execute。

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/flowCanvas/agent/CanvasAgentWorkspaceShell.test.tsx src/flowCanvas/agent/CanvasAgentPanel.test.tsx`

Expected: FAIL because current shell exposes five equal toolbar actions and uses fixed 420px defaults。

- [ ] **Step 3: Implement shell migration**

将日志、历史、Skill 浏览移入二级层；保留可访问的 aria-label 和现有 event hooks；默认 width 520，窄屏由 CSS 转换为全屏抽屉。旧 plan/result/skill 组件改为生成 blocks 或作为兼容 renderer，不保留第二套视觉规范。

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/flowCanvas/agent/CanvasAgentWorkspaceShell.test.tsx src/flowCanvas/agent/CanvasAgentPanel.test.tsx`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/flowCanvas/agent/CanvasAgentWorkspaceShell.tsx src/flowCanvas/agent/CanvasAgentPanel.tsx src/flowCanvas/agent/CanvasAgentTimeline.tsx src/flowCanvas/agent/CanvasAgentPlanCard.tsx src/flowCanvas/agent/CanvasAgentResultCard.tsx src/flowCanvas/agent/CanvasAgentSkillPlan.tsx src/flowCanvas/agent/CanvasAgentWorkspaceShell.test.tsx src/flowCanvas/agent/CanvasAgentPanel.test.tsx
git commit -m "feat: make canvas agent a task workspace"
```

### Task 7: 加入后端 turn blocks 与 confirmation gate

**Files:**
- Modify: `apps/api/src/modules/agent/*` 对应现有 turn/session schemas, routes, service
- Create: `packages/db/migrations/0000xx_agent_conversation_blocks.sql`（仅当现有字段不足时）
- Test: 对应 API agent route/service test files

- [ ] **Step 1: Write failing API tests**

覆盖：turn 返回 blocks/pending question/context snapshot；answer 只能作用于同 tenant/session/turn；未确认的 paid/batch plan 不创建 workflow run；重复 confirmation 使用幂等键；graph revision 过期返回冲突而不覆盖。

- [ ] **Step 2: Run API tests to verify failure**

Run: `npm run test --workspace @aigc-flow/api -- agent`

Expected: 新增测试失败，现有 legacy turn response 不包含结构化字段或 gate。

- [ ] **Step 3: Implement schema and service changes**

优先复用现有 tenant-scoped agent turn/session 表；新增 JSONB blocks、pending_question、context_snapshot、conversation_state、execution_state、confirmed_at 时必须有 tenant_id、索引和 RLS。route/service 校验 session、project、flow、turn ownership；调用现有 billing reserve/workflow creation 之前执行 `canExecuteDecision` 和 graph revision CAS。

- [ ] **Step 4: Run API focused tests and build**

Run: `npm run test --workspace @aigc-flow/api -- agent`  
Run: `npm run build --workspace @aigc-flow/api`

Expected: PASS；若数据库环境缺失，明确记录 skipped，而不是把跳过报告为通过。

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/agent packages/db/migrations
git commit -m "feat: persist conversational turns and enforce confirmation gate"
```

### Task 8: Skill/App 能力卡与结果组画布联动

**Files:**
- Modify: `src/flowCanvas/agent/conversation/ConversationCapabilityCard.tsx`
- Modify: `src/flowCanvas/agent/conversation/ConversationResultGroup.tsx`
- Modify: `src/flowCanvas/agent/CanvasAgentPanel.tsx`
- Modify: `src/flowCanvas/agent/canvasAgentApi.ts`
- Test: `src/flowCanvas/agent/CanvasAgentSkillIntegration.test.tsx`
- Test: `src/flowCanvas/agent/CanvasAgentResultCard.test.tsx`

- [ ] **Step 1: Write failing behavior tests**

覆盖：能力卡隐藏 provider/route/credential；用户可接受/替换 Skill；结果组可选择、定位节点、设置为参考、放到画布、继续编辑和生成变体；动作带上 snapshot turn/graph revision。

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/flowCanvas/agent/CanvasAgentSkillIntegration.test.tsx src/flowCanvas/agent/CanvasAgentResultCard.test.tsx`

Expected: FAIL because current Skill/result UI does not share block action protocol。

- [ ] **Step 3: Implement callbacks and safe capability projection**

复用现有 `listAgentSkills`、Skill Run approval/cancel 和 asset resolver；将内部字段投影为 `CapabilitySummary`。结果动作调用现有 CanvasAgentOp/asset placement API，不在客户端写 base64/blob/data URL。

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run src/flowCanvas/agent/CanvasAgentSkillIntegration.test.tsx src/flowCanvas/agent/CanvasAgentResultCard.test.tsx`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/flowCanvas/agent/conversation/ConversationCapabilityCard.tsx src/flowCanvas/agent/conversation/ConversationResultGroup.tsx src/flowCanvas/agent/CanvasAgentPanel.tsx src/flowCanvas/agent/canvasAgentApi.ts src/flowCanvas/agent/CanvasAgentSkillIntegration.test.tsx src/flowCanvas/agent/CanvasAgentResultCard.test.tsx
git commit -m "feat: connect skills apps and result groups to canvas"
```

### Task 9: 端到端验证、开关与文档

**Files:**
- Modify: `docs/v2-local-development.md`
- Modify: `docs/staging-runbook.md`
- Modify: `docs/PRODUCTION_RUNBOOK.md`
- Modify: `docs/STAGING_ENV_TEMPLATE.md`
- Modify: `PROJECT_RECORD.md`
- Test/QA: existing Agent suites and authenticated browser flow

- [ ] **Step 1: Run focused frontend suites**

Run: `npx vitest run src/flowCanvas/agent/conversation src/flowCanvas/agent/CanvasAgentConversationView.test.tsx src/flowCanvas/agent/CanvasAgentComposer.test.tsx src/flowCanvas/agent/CanvasAgentPanel.test.tsx src/flowCanvas/agent/CanvasAgentWorkspaceShell.test.tsx`

Expected: PASS。

- [ ] **Step 2: Run builds and relevant package tests**

Run: `npm run build`  
Run: `npm run test --workspace @aigc-flow/api`  
Run: `npm run test --workspace @aigc-flow/worker`  
Run: `npm run test --workspace @aigc-flow/ai-gateway-core`  
Run: `npm run test --workspace @aigc-flow/db`

Expected: builds pass；基础设施缺失导致的 skips/failures 记录具体原因，不能宣称全部通过。

- [ ] **Step 3: Run authenticated browser acceptance**

验证：登录 -> 打开项目 -> 提交模糊需求 -> Agent 提问 -> 点击选项 -> 看到比较表和 Brief -> 未确认前无生成任务 -> 确认后出现进度 -> 结果组选择 -> 放到画布 -> 刷新/历史回放仍完整。

- [ ] **Step 4: Keep rollout flags disabled until staging gate**

维持 `VITE_AGENT_V2_ENABLED`、`AGENT_V2_RUNTIME_ENABLED`、`AGENT_SKILL_RUNTIME_ENABLED` 关闭，直到真实 PostgreSQL、Redis、S3、计费和 provider route 的 staging acceptance 完成。将回滚顺序记录为先关闭 V2 runtime，再关闭 Skill runtime/catalog。

- [ ] **Step 5: Update project record and commit documentation**

```bash
git add docs/v2-local-development.md docs/staging-runbook.md docs/PRODUCTION_RUNBOOK.md docs/STAGING_ENV_TEMPLATE.md PROJECT_RECORD.md
git commit -m "docs: record conversational agent rollout and validation"
```

## 自检清单

- Spec coverage: 结构化 block（Task 1/4）、状态机和决策门（Task 2/7）、快照（Task 3/7）、Skill/App（Task 8）、结果与画布（Task 8）、视觉密度（Task 4/6）、持久化/replay（Task 5/7）、验收/发布（Task 9）均有对应任务。
- Placeholder scan: 本计划不使用 TODO/TBD/“以后补充”等未定义步骤；所有命令、文件和验收边界已给出。
- Type consistency: `ConversationBlock`、`AgentConversationState`、`AgentExecutionState`、`AgentDecision`、`AgentContextSnapshot` 在前置任务定义，后续任务复用同名类型。
- Scope: 先完成前端结构化协议与决策门，再接后端持久化和真实执行；不同时重写 AI Gateway、Worker 或旧入口。
