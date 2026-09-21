# TapNow Agent 主链路修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Each task must follow test-first development and be reviewed before moving to the next task.

**Goal:** 修复当前 Agent 的结果展示、素材引用、会话恢复、结果操作和执行状态，使“生成首帧图片、尾帧图片和首尾帧视频提示词”的流程可以从真实 UI 完整走通，并满足已批准的 Agent 重建设计。

**Architecture:** 保留当前 canonical Agent Runtime、现有资产库、Flow draft CAS、Billing、AI Gateway、Redis 和 Worker。修复默认前端控制器与服务端 runtime 的契约，不把 V5/V6 旧状态重新变成权威数据。所有用户动作继续通过 canonical session/turn/decision API，历史和实时事件使用同一个 replay reducer。

**Tech Stack:** Vite/React/TypeScript、Fastify/Zod、PostgreSQL/RLS、Redis/BullMQ、S3 资产服务、AI Gateway、Vitest、Playwright。

---

## 执行规则与完成门槛

- 在 `codex/agent-runtime-rebuild` 分支执行，不回退用户已有改动，不删除历史 Agent、资产或账本记录。
- 每个行为修复都必须先写一个能复现当前问题的失败测试，确认测试确实因当前实现失败后，再修改生产代码。
- 每个任务完成后运行该任务的 focused tests、`git diff --check`，再做一次规格审查和代码审查。
- 任何结果只有在资产/文本交付证据完整时才允许将轮次标记为 `completed`。
- 不使用 localStorage/IndexedDB 保存权威会话或资产；URL 中可以保存当前会话 ID 作为恢复指针，真实内容必须从服务端历史读取。

## 文件职责调整

- `src/flowCanvas/agent/runtime/agentRuntimeApi.ts`：只封装 canonical session、history、events、turn、decision、mode 和 cancel API。
- `src/flowCanvas/agent/runtime/agentEventReducer.ts`：live/replay 共用的事件 reducer，处理顺序、重复、缺号和 resync。
- `src/flowCanvas/agent/runtime/useAgentRuntime.ts`：会话、提交、恢复、轮询/SSE、busy/error 和 model lock 控制器。
- `src/flowCanvas/agent/CanvasAgentPanel.tsx`：只连接控制器和 Workspace，不直接实现上传、画布 mutation 或 Worker 调用。
- `apps/api/src/modules/agent/runtime/agent-runtime.service.ts`：计划、批准、执行、结果验证和 typed result action 的服务端语义。
- `apps/api/src/modules/agent/runtime/agent-runtime.repository.ts`：持久化、幂等、租约、事件和 lineage；不增加进程内权威 Map。
- `apps/api/src/modules/agent/agent.routes.ts`、`apps/api/src/config/env.ts`、`docker-compose.staging.yml`：canonical runtime/compat flag 和错误映射。
- `apps/worker/src/workflow-runtime/agent-runtime-delivery.ts`、`apps/worker/src/main.ts`：交付证据、逐节点进度和失败退款/释放。

---

### Task 1: 修复结果协议和交付验证

**Files:**
- Modify: `src/flowCanvas/agent/v6/protocol/blockNormalizer.ts`
- Modify: `apps/api/src/modules/agent/runtime/agent-runtime.service.ts`
- Modify: `apps/api/src/modules/agent/runtime/agent-runtime.repository.ts`
- Create/modify tests: `src/flowCanvas/agent/v6/protocol/blockNormalizer.test.ts`, `apps/api/test/agent-runtime-delivery.test.ts`, `apps/api/test/agent-runtime-wire.test.ts`

- [ ] **Step 1: 写失败测试，复现空 `sourceRefs` 结果被丢弃。**

```ts
it("保留没有输入引用的首帧、尾帧和文本结果", () => {
  const serverBlock = normalizeConversationBlocks([{
    type: "result_group",
    id: "group",
    results: [
      { id: "first", label: "首帧", kind: "image", assetId: "asset-1", sourceRefs: [] },
      { id: "last", label: "尾帧", kind: "image", assetId: "asset-2", sourceRefs: [] },
      { id: "prompt", label: "视频提示词", kind: "text", contentText: "camera moves forward", sourceRefs: [] },
    ],
  }]);
  const clientBlock = normalizeBlocks(serverBlock);
  expect(clientBlock[0]).toMatchObject({ type: "result_group", results: expect.arrayContaining([
    expect.objectContaining({ id: "first" }),
    expect.objectContaining({ id: "last" }),
    expect.objectContaining({ id: "prompt" }),
  ]) });
});
```

- [ ] **Step 2: 运行测试确认当前实现失败。**

Run: `npx vitest run src/flowCanvas/agent/v6/protocol/blockNormalizer.test.ts -t "没有输入引用"`

Expected: FAIL，因为客户端当前把空 `sourceRefs` 判为无效。

- [ ] **Step 3: 统一空引用语义。**

服务端输出结果时，`sourceRefs` 为空则省略字段；客户端只拒绝非数组、含无效 ID 的引用，不拒绝合法空数组。结果必须仍要求：图片/视频有 `assetId`，文本有非空 `contentText`。

- [ ] **Step 4: 增加交付完整性验证。**

实现 `verifyAgentDeliveryGroup(results, expectedSteps)`：每个计划步骤必须有对应结果；图片/视频必须有资产 ID；文本必须有非空内容；Workflow 非 `completed`、节点缺失或结果缺失时抛出明确错误，不得结算。

- [ ] **Step 5: 运行 focused tests 并提交。**

Run: `npx vitest run src/flowCanvas/agent/v6/protocol/blockNormalizer.test.ts apps/api/test/agent-runtime-delivery.test.ts apps/api/test/agent-runtime-wire.test.ts`

Expected: 所有测试通过。Commit: `fix: preserve canonical agent result deliveries`。

---

### Task 2: 接通引用、上传和引用角色

**Files:**
- Modify: `src/flowCanvas/agent/CanvasAgentPanel.tsx`
- Modify: `src/flowCanvas/agent/agentReferenceContext.ts`
- Modify: `src/flowCanvas/agent/v6/workspace/AgentReferenceChips.tsx`
- Modify: `src/flowCanvas/agent/v6/workspace/AgentWorkspace.tsx`, `src/flowCanvas/agent/v6/workspace/AgentComposer.tsx`
- Use existing: `src/services/referenceUploadsApi.ts`, `src/flowCanvas/agent/canvasAgentOps.ts`
- Tests: `src/flowCanvas/agent/CanvasAgentPanel.test.tsx`, `src/flowCanvas/agent/runtime/agentContextController.test.tsx`

- [ ] **Step 1: 为四种能力菜单写失败交互测试。**

测试点击“画布”后生成稳定 node/asset 引用，点击“上传”后只提交上传返回的 `assetId`，点击 Skill/App 进入对应选择器或返回明确的不可用状态；测试引用角色菜单可以设置 `subject/style/composition/layout/context`。

- [ ] **Step 2: 运行测试确认回调为空导致失败。**

Run: `npx vitest run src/flowCanvas/agent/CanvasAgentPanel.test.tsx src/flowCanvas/agent/runtime/agentContextController.test.tsx`

Expected: 能复现 capability 点击后没有新增引用、角色字段为空。

- [ ] **Step 3: 建立 ContextController。**

实现 `addCanvasRefs()`、`uploadAndAddRef(file)`、`removeRef(refId)`、`setRefRole(refId, role)`、`buildSnapshot()`。上传后只保存 `assetId`、`refId`、`label` 和角色，禁止进入 snapshot 的字段包括 base64、Blob、File、data URL、长期 signed URL。

- [ ] **Step 4: 把角色选择接入 chips。**

扩展 `AgentReferenceChip` 类型，显示当前角色并通过 `MenuSelect` 修改角色；移除选中画布节点引用和结果引用都必须生效。角色变化必须出现在下一轮 `contextSnapshot.refs`。

- [ ] **Step 5: 运行前端测试并提交。**

Run: `npx vitest run src/flowCanvas/agent/CanvasAgentPanel.test.tsx src/flowCanvas/agent/runtime/agentContextController.test.tsx src/flowCanvas/agent/v6/V6PanelIntegration.test.tsx`

Expected: capability、上传、角色和移除测试全部通过。Commit: `feat: connect agent context and reference roles`。

---

### Task 3: 修复 Brief、多选问题和提交忙状态

**Files:**
- Modify: `src/flowCanvas/agent/CanvasAgentPanel.tsx`, `src/flowCanvas/agent/runtime/useAgentRuntime.ts`
- Modify: `src/flowCanvas/agent/v6/protocol/BlockRenderer.ts`, `src/flowCanvas/agent/v6/protocol/blockRenderers/BriefBlock.tsx`
- Modify: `apps/api/src/modules/agent/runtime/agent-runtime.schemas.ts`, `apps/api/src/modules/agent/runtime/agent-runtime.service.ts`
- Tests: `src/flowCanvas/agent/CanvasAgentPanel.test.tsx`, `apps/api/test/agent-runtime-decisions.test.ts`, `apps/api/test/agent-runtime-service.test.ts`

- [ ] **Step 1: 写两个失败测试。**

测试 `submit_brief` 将修改后的 fields 送入 canonical `edit_brief` decision；测试 multiple question 发送完整 `answers.questionId: string[]`，而不是只发送第一项。另加测试：请求发送期间禁用发送按钮，重复点击只创建一个 turn。

- [ ] **Step 2: 运行测试确认失败。**

Run: `npx vitest run src/flowCanvas/agent/CanvasAgentPanel.test.tsx apps/api/test/agent-runtime-decisions.test.ts -t "Brief|multiple|重复"`

Expected: 当前 Brief action 无分支，多选只发送首项，busy 状态没有阻止重复提交。

- [ ] **Step 3: 扩展 typed decision payload。**

将 `edit_brief` payload 定义为 `{ fields: Array<{ key: string; value: string }> }`，将 `answer_question` 支持 `string | string[]`；服务端重新校验 question ID、选项 ID和长度，再把答案/Brief 作为下一次 planner 输入，不接受浏览器传入 route、费用或执行参数。

- [ ] **Step 4: 接通 UI action。**

`submit_brief` 调用 `edit_brief`；`select_choice` 保留完整 `optionIds`；hook 增加 `isSubmitting`/`busy`，在请求完成或失败后清除。错误必须以可见的 `error_recovery` block 或可读错误状态呈现。

- [ ] **Step 5: 运行 focused tests 并提交。**

Run: `npx vitest run src/flowCanvas/agent/CanvasAgentPanel.test.tsx apps/api/test/agent-runtime-decisions.test.ts apps/api/test/agent-runtime-service.test.ts`

Expected: 全部通过。Commit: `fix: submit agent brief and multi-choice decisions`。

---

### Task 4: 重建会话恢复和统一 live/replay reducer

**Files:**
- Create/replace: `src/flowCanvas/agent/runtime/agentRuntimeApi.ts`
- Create/replace: `src/flowCanvas/agent/runtime/agentEventReducer.ts`
- Modify: `src/flowCanvas/agent/runtime/useAgentRuntime.ts`
- Modify: `src/flowCanvas/agent/v6/replay/ReplayState.ts` or remove it from default import path
- Modify: `apps/api/src/modules/agent/runtime/agent-runtime.repository.ts`, `apps/api/src/modules/agent/agent.routes.ts`
- Tests: `src/flowCanvas/agent/runtime/agentEventReducer.test.ts`, `src/flowCanvas/agent/runtime/agentRuntimeApi.test.ts`, `src/flowCanvas/agent/runtime/agent-golden-replay.test.tsx`

- [ ] **Step 1: 写失败恢复测试。**

覆盖：画布 revision 从 3 变为 4 后仍能恢复 revision 3 的历史；两轮历史同时保留；重复 seq 不改变状态；缺 seq 设置 `resyncRequired`；刷新后由 URL session ID 调用 history 恢复 blocks、pending decision、results 和 phase。

- [ ] **Step 2: 运行测试确认现有 reducer 失败。**

Run: `npx vitest run src/flowCanvas/agent/v6/replay/ReplayController.test.ts src/flowCanvas/agent/runtime/agentEventReducer.test.ts src/flowCanvas/agent/runtime/agent-golden-replay.test.tsx`

Expected: 当前 reducer 会因当前 canvas revision 丢弃旧 response，并只保留最后一轮。

- [ ] **Step 3: 实现 neutral API。**

API 只使用 `/api/v2/agent/sessions`、`history`、`events`、`events/stream`、`turns`、`decisions`、`mode` 和 `cancel`。禁止默认 controller 调用 `/v5-turns`、`/v6-turns` 或旧流式路径。

- [ ] **Step 4: 实现统一 reducer。**

按 `sessionId -> turnId -> blockId` 合并历史，不用当前 canvas revision 过滤历史；revision 只在新提交和画布写入时校验。事件 seq 重复忽略、缺号返回 `resync-required`，resync 时重新获取服务端 snapshot/history。live polling、SSE 和 history 都调用同一个 reducer。

- [ ] **Step 5: 实现刷新恢复指针。**

打开 Agent 时读取 URL/session focus；没有有效 session 时才创建新会话。URL 只保存 session ID，不保存 blocks、资产或凭据。项目/flow 切换时清除旧 session，防止旧请求覆盖新状态。

- [ ] **Step 6: 运行测试并提交。**

Run: `npx vitest run src/flowCanvas/agent/runtime src/flowCanvas/agent/v6/replay`

Expected: live 与 replay 状态一致，刷新和旧 revision 恢复测试通过。Commit: `feat: unify agent live replay and session recovery`。

---

### Task 5: 实现结果选择、参考、编辑和变体闭环

**Files:**
- Modify: `apps/api/src/modules/agent/runtime/agent-runtime.service.ts`
- Modify: `apps/api/src/modules/agent/runtime/agent-runtime.repository.ts`
- Modify: `src/flowCanvas/agent/CanvasAgentPanel.tsx`
- Modify: `src/flowCanvas/agent/v6/protocol/blockRenderers/ResultGroupBlock.tsx`
- Tests: `apps/api/test/agent-runtime-result-actions.test.ts`, `src/flowCanvas/agent/v6/V6PanelIntegration.test.tsx`

- [ ] **Step 1: 写失败服务端 action 测试。**

验证：`select` 持久化 selected result；`reference` 将结果加入下一轮 context refs；`edit` 和 `variant` 创建新的 refining turn，携带 source asset ID、只修改内容、保留内容和 instruction，并重新进入规划/确认；`place` 只能对当前 turn 的 ready result 执行，重复放置返回已放置状态。

- [ ] **Step 2: 实现 repository 数据语义。**

使用现有 `agent_decisions`、`agent_result_refs` 和 lineage 字段保存选择、参考关系、sourceRefs、sessionId、turnId、runId、placedNodeId；不使用进程内数组。

- [ ] **Step 3: 实现服务端 typed action。**

拒绝不属于当前 session/turn 的 result ID；`edit`/`variant` 不直接生成，不绕过 quote、approval、billing；`reference` 返回更新后的 context snapshot；`select` 返回更新后的 result group。

- [ ] **Step 4: 实现前端 action 和可访问状态。**

结果卡片显示 selected/ready/placed 状态；编辑弹窗明确收集“只修改什么、保留什么、参考什么”；变体与编辑提交后进入新 turn；reference 立即显示引用 chip。

- [ ] **Step 5: 运行测试并提交。**

Run: `npx vitest run apps/api/test/agent-runtime-result-actions.test.ts src/flowCanvas/agent/v6/V6PanelIntegration.test.tsx`

Expected: 五种结果动作都有真实状态变化。Commit: `feat: complete agent result actions`。

---

### Task 6: 修复 Worker 状态、交付证据和 Billing 恢复

**Files:**
- Modify: `apps/api/src/modules/agent/runtime/agent-runtime.service.ts`
- Modify: `apps/worker/src/workflow-runtime/agent-runtime-delivery.ts`, `apps/worker/src/main.ts`
- Modify: `apps/api/src/modules/workflow-runs/workflow-runs.service.ts` only where existing status/lineage ports require it
- Tests: `apps/worker/test/agent-runtime-delivery.test.ts`, `apps/api/test/agent-runtime-execution.test.ts`

- [ ] **Step 1: 写失败状态测试。**

覆盖 running 节点更新 progress block；workflow `failed`/`cancelled` 进入 recoverable error；一个计划步骤缺资产或文本为空时不能 completed；失败/取消只 refund/release 一次；成功后才 settle。

- [ ] **Step 2: 运行测试确认当前实现失败。**

Run: `npx vitest run apps/worker/test/agent-runtime-delivery.test.ts apps/api/test/agent-runtime-execution.test.ts`

Expected: 当前 `refreshExecution` 只对 succeeded 且有节点的情况建立结果，失败和部分交付没有终态处理。

- [ ] **Step 3: 增加状态映射和幂等恢复。**

将 Worker nodeRuns 映射为 pending/running/completed/failed；保存每次 progress snapshot。workflow 失败/取消时调用现有 refund/release 端口并用 `runId` 幂等；租约过期后允许恢复；失败后 retry 必须能重新 claim。

- [ ] **Step 4: 把交付验证放在结算前。**

只有 `verifyAgentDeliveryGroup` 成功后才写 `presenting_results/completed` 和 settle；交付不完整时保留 `recoverable_error`，不结算、不显示成功结果。

- [ ] **Step 5: 运行 Worker/API 测试并提交。**

Run: `npm run test --workspace @aigc-flow/worker -- agent-runtime-delivery.test.ts && npm run test --workspace @aigc-flow/api -- agent-runtime-execution.test.ts`

Expected: 状态、进度、重试、退款/释放测试通过。Commit: `fix: verify agent delivery and recover workflow states`。

---

### Task 7: 固化首尾帧任务契约并修复模式/模型/错误显示

**Files:**
- Modify: `apps/api/src/modules/agent/runtime/agent-requirement-planner.ts`
- Modify: `apps/api/src/modules/agent/runtime/agent-runtime.service.ts`, `apps/api/src/modules/agent/runtime/agent-runtime.schemas.ts`
- Modify: `apps/api/src/modules/agent/agent.routes.ts`, `apps/api/src/modules/agent/agent-run-settings.service.ts`
- Modify: `src/flowCanvas/agent/CanvasAgentPanel.tsx`, `src/flowCanvas/agent/runtime/useAgentRuntime.ts`, `src/flowCanvas/agent/v6/workspace/AgentWorkspace.tsx`
- Tests: `apps/api/test/agent-runtime-golden.test.ts`, `src/flowCanvas/agent/runtime/agent-golden-flow.test.tsx`

- [ ] **Step 1: 写黄金任务失败测试。**

输入原始请求后必须先返回最多四个问题；回答主体、变化、比例、时长后，计划必须包含两个 image steps 和一个非空 text deliverable；首轮计划不能包含 video step；计划必须有真实模型、数量、报价和写入范围，并要求确认。

- [ ] **Step 2: 运行测试确认当前缺少确定性约束。**

Run: `npx vitest run apps/api/test/agent-runtime-golden.test.ts src/flowCanvas/agent/runtime/agent-golden-flow.test.tsx`

Expected: 当前没有跨层黄金测试，且 planner 输出没有服务端交付形态校验。

- [ ] **Step 3: 扩展安全 planner contract。**

在 planner 输出中加入经过 schema 校验的 `intent`：`videoPromptOnly` 与 `generateVideo`。当用户只要求视频提示词时，服务端拒绝 video capability；只有用户另起明确的“生成视频”请求并重新确认，才允许 video step。对首尾帧任务增加通用 deliverable contract 校验，不硬编码儿童玩具或固定视觉主题。

- [ ] **Step 4: 修复模式和模型来源。**

创建 session 时持久化并返回 mode；Workspace 始终使用 runtime.mode。增加 text model catalog/settings 查询，Composer 显示产品模型名和 thinking level，首轮提交后锁定 modelKey，仅允许调整 thinking level。服务端重新验证 mode、模型、route 和 pricing。

- [ ] **Step 5: 修复错误与重命名。**

hook 返回可读 `error` 和 `errorCode`；网络/409/权限错误转为 error recovery block。重命名调用 session PATCH 并刷新 history，不再绑定空函数。

- [ ] **Step 6: 运行黄金测试并提交。**

Run: `npx vitest run apps/api/test/agent-runtime-golden.test.ts src/flowCanvas/agent/runtime/agent-golden-flow.test.tsx src/flowCanvas/agent/CanvasAgentPanel.test.tsx`

Expected: 首尾帧计划和视频二次确认语义通过。Commit: `feat: enforce first-last-frame agent contract`。

---

### Task 8: 增加 runtime/compat flags，统一 canonical events 和错误状态码

**Files:**
- Modify: `apps/api/src/config/env.ts`
- Modify: `apps/api/src/app.ts`, `apps/api/src/modules/agent/agent.routes.ts`
- Modify: `docker-compose.staging.yml`, `docs/STAGING_ENV_TEMPLATE.md`, `docs/staging-runbook.md`
- Modify: `src/flowCanvas/agent/runtime/agentRuntimeApi.ts`
- Tests: `apps/api/test/agent-runtime-flags.test.ts`, `apps/api/test/agent-runtime-routes.test.ts`

- [ ] **Step 1: 写失败 flag 测试。**

当 `AGENT_RUNTIME_ENABLED=false` 时 canonical runtime 返回明确的 `503 AGENT_RUNTIME_DISABLED`；当 `AGENT_RUNTIME_COMPAT_ENABLED=false` 时 V5/V6/versioned stream routes 不注册或返回 disabled；canonical events endpoint 返回 `{events,lastSeq,replayCursor,resyncRequired}`。

- [ ] **Step 2: 增加两个服务端变量并写入 Compose。**

解析 `AGENT_RUNTIME_ENABLED` 和 `AGENT_RUNTIME_COMPAT_ENABLED`，默认均为 `false`；加入 `x-tapflow-env`、staging env template 和 rollback 文档。生产默认关闭，staging 只有完成真实验收后才允许开启。

- [ ] **Step 3: 按 flag 注册 routes。**

`registerAgentRoutes` 接收 runtime/compat 状态；canonical routes 受 runtime flag 控制，旧 V5/V6/legacy stream 受 compat flag 控制。关闭时不调用旧 Agent service 作为隐式 fallback。

- [ ] **Step 4: 统一 events stream。**

canonical `events`/`events/stream` 读取 `AgentRuntimeRepository.listEvents`，不再转发 legacy `agentService` event stream。事件缺号时返回 resync required，客户端重新取 history。

- [ ] **Step 5: 统一错误映射。**

将 `AGENT_GRAPH_REVISION_CONFLICT`、`AGENT_PENDING_DECISION_CONFLICT`、`AGENT_RUNTIME_DISABLED` 等 runtime 错误映射为稳定 HTTP 状态码（409/503），避免 generic `Error` 变成 500。

- [ ] **Step 6: 运行 routes/build 并提交。**

Run: `npx vitest run apps/api/test/agent-runtime-flags.test.ts apps/api/test/agent-runtime-routes.test.ts && npm run build --workspace @aigc-flow/api`

Expected: flag、canonical event 和 409/503 tests 通过。Commit: `feat: gate canonical agent runtime and compatibility routes`。

---

### Task 9: 跨层黄金 E2E、真实浏览器验收和文档收口

**Files:**
- Create: `apps/api/test/agent-runtime.e2e.test.ts`
- Create: `src/flowCanvas/agent/runtime/agent-golden-flow.test.tsx`
- Create/modify: `scripts/smoke-agent-runtime.ts`, `docs/AGENT_RUNTIME_STAGING_ACCEPTANCE.md`
- Modify: `PROJECT_RECORD.md`, `docs/CODEX_HANDOFF.md`

- [ ] **Step 1: 写跨层 API/Worker golden test。**

验证完整顺序：创建 session → 首轮提问 → 逐题回答 → 返回真实 model/quantity/credits/writes → approve → 两个 image steps 并行执行 → 两个 asset refs 和一个非空 text ref → result group → 不启动 video → 只有再次明确生成视频并确认后才创建 video run。

- [ ] **Step 2: 写刷新、CAS 和 replay 测试。**

验证重新创建 repository/API 实例仍能恢复 pending decision、idempotency、progress、result refs；旧 revision 放置返回 409；事件缺号触发 resync；放置结果写入 sourceRefs/sessionId/turnId/runId/placedNodeId。

- [ ] **Step 3: 写真实浏览器验收。**

在已认证 staging 环境使用 Playwright 验证 1440×900 和 390×844：上传两张图片、设置角色、回答问题、确认报价、看到真实进度、看到两张图片和提示词、选择/参考/放置、刷新恢复、失败重试。截图不得包含 secret、credential 或长期 signed URL。

- [ ] **Step 4: 执行完整验证矩阵。**

```bash
npm run build
npm test
npm run test --workspace @aigc-flow/api
npm run test --workspace @aigc-flow/worker
npm run test --workspace @aigc-flow/db
npm run test --workspace @aigc-flow/ai-gateway-core
npx playwright test --config playwright.agent.config.ts
git diff --check
```

记录每条命令的通过数、已知 legacy 失败、数据库跳过原因和真实 staging 运行 ID/资产 ID/graph revision。

- [ ] **Step 5: 更新运行记录和回滚文档。**

在 `PROJECT_RECORD.md` 和 `docs/CODEX_HANDOFF.md` 记录：迁移版本、两个 flags 的值、canonical/compat routes、测试结果、浏览器验收结果、未解决风险和 Docker Compose v2 回滚步骤。只有 Task 9 全部通过后才允许打开 runtime flag。

- [ ] **Step 6: 最终代码审查。**

检查默认 import graph 不再依赖 V5/V6 状态作为权威；检查前端没有保存媒体二进制；检查 provider/route/credential/signed URL 没有进入 Agent response、draft、日志或截图；检查所有新数据库查询带 tenant/session/project/flow ownership。

---

## 阶段门

### Gate A：首尾帧 UI 主链路

Task 1–3 完成后，必须能在 mock API 中看到三个结果、上传引用、设置角色、提交 Brief 和多选答案。任何一个失败都不能进入真实 Worker 验收。

### Gate B：持久化与执行恢复

Task 4–6 完成后，刷新、重启 API、失败重试、取消、部分交付和放置 CAS 必须有自动化测试证据。没有数据库环境时只能标记为未验证，不能标记通过。

### Gate C：发布条件

Task 7–9 完成后才允许 staging 打开 `AGENT_RUNTIME_ENABLED=true`。生产部署必须遵循 `docker-compose.staging.yml`：构建、停 worker、执行 `node packages/db/dist/cli.js` migration、启动 Redis/API/worker/frontend、检查状态和日志。

## 最终验收标准

- 首尾帧输入不会进入固定儿童玩具或其他硬编码流程。
- Agent 先澄清缺失信息，再显示真实模型、数量、费用和写入范围。
- 首次批准只生成两张图片和非空视频提示词，不生成视频本体。
- 图片和文本结果都可预览、选择、设为参考、编辑/变体或放入画布。
- 刷新、重启和历史恢复后 blocks、决策、进度、结果和 lineage 一致。
- 失败、取消、重试、退款/释放和 stale revision 都有可观察结果。
- canonical runtime 和 legacy compatibility 都由 flag 控制，默认安全关闭。
- 所有 focused tests、API/Worker/DB/Gateway tests、production build 和真实 authenticated browser acceptance 均有记录。
