# Canvas Agent V4 Responses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前一次性 V3 规划器重做为服务端安全的多轮 Responses Agent，使其能从商品实拍图分析商品、规划淘宝主图/详情页套图、生成视觉圣经和逐页提示词、先出基准图再批量生成、按页修复，并把经过验证的结果写入资产库和画布。

**Architecture:** V4 复用现有 `DatabaseTextGenerationRuntime.streamText` 的规范化 tool-call 流，在 API 进程内增加持久化 Responses 会话循环和白名单 `AgentToolGateway`。模型只决定下一步工具调用；真实图片生成仍通过现有 Workflow Run、Worker、AI Gateway、服务端计费和 S3 资产链路完成。所有轮次、工具结果、生成 item、验证证据和画布 CAS 操作都落到 `agent_tasks`/`agent_task_events` 以及现有 flow/assets/billing 表，前端只消费安全事件投影。

**Tech Stack:** TypeScript, Fastify, Zod, PostgreSQL/RLS, Redis/BullMQ, `@aigc-flow/ai-gateway-core`, `@xyflow/react`, React/Vite, Vitest, Docker Compose v2。

---

## 0. 文件地图与实施边界

先按以下边界组织文件，避免把 V4 继续堆进 V3 单文件：

- API V4 核心：`apps/api/src/modules/agent/v4/`
  - `agent-v4-types.ts`：状态、轮次、工具 command、safe result、suite/visual bible/prompt set 类型。
  - `agent-v4-schemas.ts`：所有模型输入和用户动作的 Zod schema，以及 JSON Schema 工具定义转换。
  - `agent-v4-task-store.ts`：V4 task/event 的租户化持久化和幂等写入。
  - `agent-responses-session.service.ts`：多轮 `streamText` 会话、tool call 解析、上一轮引用注入。
  - `agent-tool-gateway.ts`：工具白名单、租户/flow/asset/risk/approval 校验和安全结果裁剪。
  - `agent-generation-orchestrator.ts`：基准图、批量、继续生成、取消、按 item 重试。
  - `agent-v4-delivery-verifier.ts`：资产归属、尺寸、主体一致性元数据和节点落点证据校验。
  - `agent-v4-canvas-committer.ts`：预览、revision CAS、inverse operations。
  - `agent-v4-runtime.ts`：运行时总装配和 adapter 接口。
  - `agent-v4-routes.ts`：V4 SSE、事件重放、审批、取消、重试、撤销 HTTP 入口。
- API 接线：`apps/api/src/app.ts`、`apps/api/src/fastify.d.ts`、`apps/api/src/config/env.ts`、`apps/api/src/modules/agent/agent.routes.ts`。
- 数据库：`packages/db/migrations/000078_agent_v4_responses.sql`。
- AI Gateway（仅在现有规范化协议不足时修改）：`packages/ai-gateway-core/src/text-generation-contract.ts`、`packages/ai-gateway-core/src/text-streaming-contract.ts`、对应 adapter 测试。
- 前端 V4：`src/flowCanvas/agent/v4/`，由 `canvasAgentV4Types.ts`、`useCanvasAgentV4Task.ts`、`useCanvasAgentV4TaskStream.ts`、`canvasAgentV4TaskProjection.ts`、`CanvasAgentV4TaskSheet.tsx`、`CanvasAgentV4PlanView.tsx`、`CanvasAgentV4GenerationQueue.tsx`、`CanvasAgentV4DeliveryPanel.tsx` 组成。
- 画布接线：`src/flowCanvas/FlowCanvasPage.tsx`（或当前实际导出页面）、V4 feature gate 和 V3 fallback 选择处。
- 测试：API `apps/api/test/agent-v4-*.test.ts`，AI Gateway `packages/ai-gateway-core/test/*v4*.test.ts`，前端 `src/flowCanvas/agent/v4/*.test.tsx`。
- 文档：`docs/STAGING_ENV_TEMPLATE.md`、`docs/staging-runbook.md`、`docs/CODEX_HANDOFF.md`、`PROJECT_RECORD.md`。

除本计划列出的文件外，不修改旧 legacy canvas、旧路由、无关 provider 或用户未授权的脏文件。

---

### Task 1: V4 合同、状态机、配置和数据库幂等边界

**Files:**
- Create: `apps/api/src/modules/agent/v4/agent-v4-types.ts`
- Create: `apps/api/src/modules/agent/v4/agent-v4-schemas.ts`
- Create: `apps/api/test/agent-v4-contracts.test.ts`
- Modify: `apps/api/src/config/env.ts:12-35, 198-215, 390-420`
- Modify: `docker-compose.staging.yml:38-70, 128-155`
- Modify: `docs/STAGING_ENV_TEMPLATE.md:290-345`
- Create: `packages/db/migrations/000078_agent_v4_responses.sql`
- Test: `apps/api/test/agent-v4-config.test.ts`

- [ ] **Step 1: 写状态机和工具合同失败测试**

在 `apps/api/test/agent-v4-contracts.test.ts` 固定这些断言：

```ts
expect(nextV4Status("planning", "preview_ready")).toBe("preview_ready");
expect(() => nextV4Status("planning", "succeeded")).toThrow("AGENT_V4_INVALID_TRANSITION");
expect(parseV4ToolCall({ name: "image.generate_batch", arguments: JSON.stringify({ items: [] }) })).toThrow();
expect(safeToolResult({ assetId: "a", signedUrl: "https://secret" })).toEqual({ assetId: "a" });
```

运行：`npm test -- apps/api/test/agent-v4-contracts.test.ts`。预期：失败，因为 V4 类型和函数尚未存在。

- [ ] **Step 2: 实现最小类型和 schema**

在 `agent-v4-types.ts` 定义以下稳定合同：

```ts
export const V4_TERMINAL_STATUSES = ["succeeded", "partial_success", "needs_review", "failed", "cancelled"] as const;
export type AgentV4Status = "draft" | "observing" | "planning" | "preview_ready" | "waiting_for_approval" | "generating_base" | "generating_batch" | "waiting_for_continuation" | "verifying" | "repairing" | typeof V4_TERMINAL_STATUSES[number];
export type AgentV4ToolName = "canvas.observe" | "reference.inspect" | "product.analyze" | "suite.plan" | "visual_bible.create" | "prompt_set.create" | "image.generate_base" | "image.generate_batch" | "generation.continue" | "canvas.preview_operations" | "canvas.commit_operations";
export type AgentV4GenerationItem = { itemId: string; pageKey: string; prompt: string; referenceAssetIds: string[]; status: "queued" | "running" | "succeeded" | "failed"; assetId?: string; nodeId?: string; errorCode?: string };
export type AgentV4SafeToolResult = { ok: boolean; status?: AgentV4Status; taskId?: string; itemIds?: string[]; assetIds?: string[]; revision?: number; errorCode?: string; summary?: string };
```

`agent-v4-schemas.ts` 中的 `image.generate_batch` 必须是 `items` 长度 2-12、每个 item 有唯一 `itemId`/`pageKey`/完整 `prompt`，`referenceAssetIds` 最多 16；`canvas.commit_operations` 必须携带 `expectedRevision`。工具 JSON Schema 使用 `additionalProperties: false`。

- [ ] **Step 3: 增加状态转换和安全裁剪实现**

实现严格转换表和字段白名单：任何未知状态、未知工具、`provider`/`credential`/`authorization`/`url`/`base64`/`blob` 字段都拒绝或裁剪；裁剪后的结果只返回 `assetId`、item 状态、nodeId、错误码和摘要。

- [ ] **Step 4: 增加 V4 环境变量并保持默认关闭**

在 `env.ts` 增加：

```ts
agentV4Enabled = parseBooleanEnv("AGENT_V4_ENABLED", process.env.AGENT_V4_ENABLED, false);
agentV4RuntimeEnabled = parseBooleanEnv("AGENT_V4_RUNTIME_ENABLED", process.env.AGENT_V4_RUNTIME_ENABLED, false);
agentV4MaxRounds = parseClampedIntegerEnv("AGENT_V4_MAX_ROUNDS", process.env.AGENT_V4_MAX_ROUNDS, 12, 1, 20);
agentV4MaxItems = parseClampedIntegerEnv("AGENT_V4_MAX_ITEMS", process.env.AGENT_V4_MAX_ITEMS, 12, 1, 24);
agentV4MaxReferences = parseClampedIntegerEnv("AGENT_V4_MAX_REFERENCES", process.env.AGENT_V4_MAX_REFERENCES, 16, 1, 16);
agentV4RepairAttempts = parseClampedIntegerEnv("AGENT_V4_REPAIR_ATTEMPTS", process.env.AGENT_V4_REPAIR_ATTEMPTS, 1, 0, 3);
```

在 Compose 的 `x-tapflow-env` 和前端 `build.args`/运行时环境加入对应 API/Vite 变量，默认均为 `false`；前端只在 API 返回 `v4_real` 且 `VITE_AGENT_V4_ENABLED=true` 时显示 V4。

- [ ] **Step 5: 写 V4 数据库迁移和配置测试**

`000078_agent_v4_responses.sql` 只新增 V4 条件幂等索引和必要检查，不删除历史数据：

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_tasks_v4_idempotency
  ON agent_tasks(tenant_id, idempotency_key)
  WHERE agent_version = 'v4' AND idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_task_events_v4_idempotency
  ON agent_task_events(tenant_id, idempotency_key)
  WHERE agent_version = 'v4' AND idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_tasks_v4_status
  ON agent_tasks(tenant_id, status, created_at DESC)
  WHERE agent_version = 'v4';
```

运行：`npm test -- apps/api/test/agent-v4-contracts.test.ts apps/api/test/agent-v4-config.test.ts`。预期：PASS。

- [ ] **Step 6: 提交合同边界**

```bash
git add apps/api/src/modules/agent/v4 apps/api/src/config/env.ts apps/api/test/agent-v4-contracts.test.ts apps/api/test/agent-v4-config.test.ts docker-compose.staging.yml docs/STAGING_ENV_TEMPLATE.md packages/db/migrations/000078_agent_v4_responses.sql
git commit -m "feat(agent): define v4 responses contracts and flags"
```

---

### Task 2: V4 Task Store、事件重放和 Responses 多轮会话

**Files:**
- Create: `apps/api/src/modules/agent/v4/agent-v4-task-store.ts`
- Create: `apps/api/src/modules/agent/v4/agent-responses-session.service.ts`
- Create: `apps/api/test/agent-v4-task-store.test.ts`
- Create: `apps/api/test/agent-responses-session.test.ts`
- Modify: `packages/ai-gateway-core/src/text-streaming-contract.ts` only if a normalized event is missing
- Test: `packages/ai-gateway-core/test/agent-responses-stream.test.ts`

- [ ] **Step 1: 写 task/event 幂等和断点重放测试**

使用内存 repository mock 固定：同一 `(tenantId,idempotencyKey)` 返回同一个 task；同一 event key 不产生第二个 seq；`listEvents({ afterSeq: 3 })` 只返回 `seq > 3`；跨 tenant 的 task 查询返回空。

- [ ] **Step 2: 定义 repository 接口和 SQL 实现**

`AgentV4TaskRepository` 提供 `createTask`、`getTask`、`updateTask`、`appendEvent`、`getEvents`、`findGenerationItem`、`updateGenerationItem`。SQL 必须沿用 `withTenantTransaction`，所有查询带 `tenant_id` 和 `agent_version='v4'`，写入 `agent_version='v4'`，禁止将模型原始响应写入 `event_json`。

- [ ] **Step 3: 写多轮会话失败测试**

让 fake `streamText` 依次返回：`tool_call canvas.observe`、`tool_call suite.plan`、`tool_call image.generate_base`；断言服务按轮次保存 `model_output` 的安全摘要、执行工具、将上一轮 `assetId` 作为 `<ref id="round-1-image-1" assetId="..."/>` 的服务端引用元数据注入下一轮，并在达到 `maxRounds` 时发出 `AGENT_V4_ROUND_LIMIT_EXCEEDED`。

- [ ] **Step 4: 实现 Responses 会话循环**

复用 `DatabaseTextGenerationRuntime.streamText`：

```ts
for (let round = 0; round < limits.maxRounds; round += 1) {
  const stream = textRuntime.streamText(context, {
    messages: buildMessages(systemPrompt, history, safeContext),
    routeKey,
    tools: v4ToolDefinitions(),
    toolChoice: "auto",
    maxTokens: 3000,
    signal,
  });
  const turn = await consumeNormalizedStream(stream);
  await store.appendEvent(task, { type: "model_turn", status: "planning", payload: turn.safeSummary, idempotencyKey: `v4:${task.id}:turn:${round}` });
  if (!turn.toolCall) return finishTextTurn(task, turn.text);
  const result = await gateway.execute({ task, call: parseV4ToolCall(turn.toolCall) });
  await store.appendEvent(task, { type: "tool_result", status: result.status ?? "planning", payload: result, idempotencyKey: `v4:${task.id}:tool:${turn.toolCall.callId}` });
  if (result.status === "waiting_for_approval" || result.status === "waiting_for_continuation") return result;
  history = appendSafeToolResult(history, turn.toolCall.name, result);
}
throw new AgentV4Error("AGENT_V4_ROUND_LIMIT_EXCEEDED");
```

只把规范化 `text_delta`、`tool_call`、`usage`、`done` 转成事件；不向前端转发 provider 原始帧。工具调用参数先 JSON parse 再 Zod parse。

- [ ] **Step 5: 完成 AI Gateway Responses 能力测试**

如果现有 `OpenAiCompatibleTextAdapter`/`AittcoTextRelayAdapter` 已能把 `apiMode=responses` 转为规范化 `tool_call`，只补测试；否则只补缺失的 event mapping，保证 `response.output_item.added`、function call arguments delta 和 completed 都映射到 `TextStreamEvent`，并验证未声明 `supportsToolCalling` 的 route fail closed。

- [ ] **Step 6: 运行并提交**

运行：`npm test -- apps/api/test/agent-v4-task-store.test.ts apps/api/test/agent-responses-session.test.ts packages/ai-gateway-core/test/agent-responses-stream.test.ts`。预期：PASS。

```bash
git add apps/api/src/modules/agent/v4 packages/ai-gateway-core/src packages/ai-gateway-core/test apps/api/test
git commit -m "feat(agent): add durable v4 responses session loop"
```

---

### Task 3: Agent Tool Gateway、商品分析、套图规划和提示词上下文

**Files:**
- Create: `apps/api/src/modules/agent/v4/agent-tool-gateway.ts`
- Create: `apps/api/src/modules/agent/v4/agent-v4-context-builder.ts`
- Create: `apps/api/src/modules/agent/v4/agent-v4-prompts.ts`
- Create: `apps/api/test/agent-v4-tool-gateway.test.ts`
- Create: `apps/api/test/agent-v4-golden-plan.test.ts`
- Modify: `apps/api/src/modules/agent/agent-reference-context.ts` only to reuse safe asset lookup helpers

- [ ] **Step 1: 写租户和注入防护失败测试**

断言未知工具、跨租户 asset、超过 16 个参考图、节点文本中的“忽略系统规则”、缺少 `flowId`、缺失 image route/pricing 都返回明确错误码且不创建 workflow/billing 记录。

- [ ] **Step 2: 实现 bounded context builder**

`buildV4Context` 读取当前 flow draft、选中节点、最多 60 个节点摘要、最多 16 个用户授权参考 `assetId` 元数据，并把视觉视口 capture 限制为配置的最多 4 次。所有节点文本、技能内容和用户提示都包裹为不可信数据，使用现有 redaction；只输出 assetId、mime、尺寸、标签、节点位置摘要，不输出 URL/二进制。

- [ ] **Step 3: 实现工具 registry 和 gateway**

每个工具绑定 `inputSchema`、`permission`、`requiresApproval` 和 executor。`canvas.observe`/`reference.inspect`/`product.analyze` 为只读；`suite.plan`/`visual_bible.create`/`prompt_set.create` 只写 task output；`image.generate_*` 需要审批和 billing preflight；`canvas.commit_operations` 需要 `flow:update` 和 revision CAS。gateway 在 executor 前统一调用 `assertTenantFlow`、`assertAssetOwnership`、`assertRouteCapability`、`assertPricing`。

- [ ] **Step 4: 写淘宝套图系统提示和输出约束**

系统提示固定要求：先分析实拍图，再输出 suite plan、visual bible、prompt set；基准图只能通过 `image.generate_base`；2 个或以上无依赖页面必须使用 `image.generate_batch`；依赖上一轮结果必须使用 `generation.continue`；每页一个 item，禁止把多页拼成一张图；失败 item 使用 `task.retry_item`，不得重复成功 item；商品形状、颜色、材质和品牌标识不得臆造。

- [ ] **Step 5: 完成 Golden Plan 测试**

输入一张 `assetId=photo-1` 的商品实拍图和“生成淘宝电脑端主图及详情页”提示，断言安全计划包含 5 张主图、8 页详情页的可编辑默认值、依赖图、共享视觉圣经 checksum、每页自包含 prompt、文字安全区和禁止改动规则；用户可传自定义数量时覆盖默认值但不突破 12 item/16 refs 限制。

- [ ] **Step 6: 运行并提交**

运行：`npm test -- apps/api/test/agent-v4-tool-gateway.test.ts apps/api/test/agent-v4-golden-plan.test.ts`。预期：PASS。

```bash
git add apps/api/src/modules/agent/v4 apps/api/test/agent-v4-tool-gateway.test.ts apps/api/test/agent-v4-golden-plan.test.ts apps/api/src/modules/agent/agent-reference-context.ts
git commit -m "feat(agent): add v4 safe planning and tool gateway"
```

---

### Task 4: 生成编排、批量并发、继续生成和按页重试

**Files:**
- Create: `apps/api/src/modules/agent/v4/agent-generation-orchestrator.ts`
- Create: `apps/api/test/agent-v4-generation-orchestrator.test.ts`
- Modify: `apps/api/src/modules/agent/agent-workflow-launcher.ts` to expose a safe non-blocking launch/poll contract when current synchronous helper cannot stream progress
- Modify: `apps/api/src/modules/workflow-runs/workflow-runs.service.ts` only for an idempotent child-run query if required
- Test: `apps/worker/src/workflow-runtime/*` existing image generation tests, without changing provider secrets or payload exposure

- [ ] **Step 1: 写编排失败测试**

使用 fake Workflow Run/Billing/Asset services断言：基准图只 reserve 一次；batch 的 5 个 item 并发但各自有 `v4:{taskId}:{itemId}` 幂等 key；一项失败只 refund 该项；`generation.continue` 没有成功基准图时拒绝；重复 tool call 返回原结果，不重复扣费。

- [ ] **Step 2: 实现基准图路径**

`generateBase` 执行顺序为 `estimate → reserve → createWorkflowRun(targetNodeId 或内部临时目标) → await worker → persist assetId → settle/refund → append event`。workflow input 只能携带已校验 prompt、参考 assetIds、route/model display fields；provider secret、签名 URL和原始响应留在现有服务端边界。

- [ ] **Step 3: 实现批量路径**

将 item 先写成 `queued`，使用 `Promise.allSettled` 启动每个 item，单 item 状态独立更新；并发上限使用 `Math.min(4, configuredLimit)`；每个 item 绑定稳定 `itemId`、billing idempotency key、workflowRunId 和 assetId。任何单项失败都不得把其他成功项改成失败。

- [ ] **Step 4: 实现继续生成上下文**

`continueGeneration` 只接受 task 已成功的 base/batch assetIds，构造下一轮安全引用元数据并返回 `waiting_for_continuation` 或下一轮 session input；不把长期签名 URL写进 task output 或 canvas draft。

- [ ] **Step 5: 实现取消和按 item 重试**

取消前检查 task 状态；队列前标记 cancelled，队列后调用 workflow cancellation，依据实际终态 settle/refund。重试只允许 `failed`/`needs_review` item，并递增 item retry count；成功 item 不重新生成。

- [ ] **Step 6: 运行并提交**

运行：`npm test -- apps/api/test/agent-v4-generation-orchestrator.test.ts`; `npm test -- apps/api/test/agent-v3-delivery.test.ts`。预期：V4 新测试和既有交付测试均 PASS。

```bash
git add apps/api/src/modules/agent/v4/agent-generation-orchestrator.ts apps/api/src/modules/agent/agent-workflow-launcher.ts apps/api/test/agent-v4-generation-orchestrator.test.ts apps/api/src/modules/workflow-runs/workflow-runs.service.ts
git commit -m "feat(agent): orchestrate v4 base and batch generation"
```

---

### Task 5: 交付验证、画布预览/CAS 提交和运行时总装配

**Files:**
- Create: `apps/api/src/modules/agent/v4/agent-v4-delivery-verifier.ts`
- Create: `apps/api/src/modules/agent/v4/agent-v4-canvas-committer.ts`
- Create: `apps/api/src/modules/agent/v4/agent-v4-runtime.ts`
- Create: `apps/api/test/agent-v4-delivery.test.ts`
- Create: `apps/api/test/agent-v4-canvas-committer.test.ts`
- Create: `apps/api/test/agent-v4-runtime.test.ts`
- Modify: `apps/api/src/app.ts:300-380`
- Modify: `apps/api/src/fastify.d.ts:30-45`

- [ ] **Step 1: 写交付和 CAS 失败测试**

固定这些场景：asset tenant/flow 不一致返回 `ASSET_LINEAGE_INVALID`；worker succeeded 但无 assetId 为 `needs_review`；尺寸不符为 `partial_success`；draft revision 不一致返回 HTTP 409；重复 operationSetId 返回原 revision；undo 使用保存的 inverse operations，过期 revision 仍 409。

- [ ] **Step 2: 实现交付 verifier**

验证 workflow run 状态、asset 存在、`asset.tenant_id`、`asset.flow_id`/目标项目 lineage、目标 node 类型、尺寸和 item/pageKey 映射；一致性检查只消费 worker 生成的受限 metadata/checksum，不把“Provider 成功”当作交付成功。输出每页 `verified|failed|waiting` 和证据码。

- [ ] **Step 3: 实现 canvas committer**

先构造 `preview_operations`，不写 draft；审批后调用现有 `CanvasOperationService.applyApprovedOperationSet`，`operationSetId=v4:{taskId}:{revision}:{kind}`，传入 `expectedRevision`，保存返回 revision 和 inverse operations。只在验证通过后提交 `assetId` 节点引用。

- [ ] **Step 4: 实现 V4 runtime adapter**

`AgentV4RuntimeService` 对外提供 `startTurn`、`replayEvents`、`approve`、`cancel`、`retryItem`、`undoCanvas`，在 `AGENT_V4_ENABLED && AGENT_V4_RUNTIME_ENABLED` 之外统一抛 `503 AGENT_V4_UNAVAILABLE`。通过依赖注入组合 task store、Responses session、gateway、orchestrator、verifier、committer，不复制 V3 planner adapter。

- [ ] **Step 5: 在 app 中接线**

构造 V4 repository/runtime 并 `app.decorate("agentV4Runtime", runtime)`；在 `fastify.d.ts` 增加类型。启动日志只打印 `v4_real|unavailable` 和数值限制，不打印 route credential 或 provider response。

- [ ] **Step 6: 运行并提交**

运行：`npm test -- apps/api/test/agent-v4-delivery.test.ts apps/api/test/agent-v4-canvas-committer.test.ts apps/api/test/agent-v4-runtime.test.ts`; `npm run build --workspace @aigc-flow/api`。预期：PASS 和 API build 成功。

```bash
git add apps/api/src/modules/agent/v4 apps/api/src/app.ts apps/api/src/fastify.d.ts apps/api/test/agent-v4-*.test.ts
git commit -m "feat(agent): wire v4 delivery and canvas runtime"
```

---

### Task 6: V4 API 路由、事件 SSE 和权限/错误协议

**Files:**
- Create: `apps/api/src/modules/agent/v4/agent-v4-routes.ts`
- Create: `apps/api/test/agent-v4-routes.test.ts`
- Modify: `apps/api/src/modules/agent/agent.routes.ts:510-590` to register V4 routes through the runtime decorator
- Modify: `apps/api/src/modules/agent/agent.schemas.ts` only if shared auth/session schemas need a V4-safe extension

- [ ] **Step 1: 写路由失败测试**

覆盖未登录 401、无 `flow:read` 403、跨 tenant task 404、V4 disabled 503、无效 JSON 400、revision conflict 409；SSE 每个 event 包含 `taskId`, `sequence`, `type`, `status`，不包含 provider/credential/raw URL。

- [ ] **Step 2: 实现路由合同**

使用以下路径，保持 `/api/v2` 前缀：

```text
POST /api/v2/agent/v4/sessions/:sessionId/turns/stream
GET  /api/v2/agent/v4/tasks/:taskId/events?after=<seq>
POST /api/v2/agent/v4/tasks/:taskId/approve
POST /api/v2/agent/v4/tasks/:taskId/cancel
POST /api/v2/agent/v4/tasks/:taskId/retry-item
POST /api/v2/agent/v4/tasks/:taskId/undo-canvas
```

turn 需要 `prompt`, `snapshot`, 可选 `referenceContext`, `idempotencyKey`, `expectedGraphRevision`；retry 需要 `itemId`；undo 需要 `expectedRevision`。复用现有 `authHandlers`/`requirePermission`，读操作用 `flow:read`，执行用 `flow:run`，画布提交用 `flow:update`。

- [ ] **Step 3: 实现 SSE 安全投影**

采用现有 `formatStreamEvent` 和 `readAgentSseStream` 兼容格式；事件重放按 `after` 增量返回，先鉴权再查 tenant task。断线不会取消服务端任务，前端可重连继续 replay。

- [ ] **Step 4: 运行并提交**

运行：`npm test -- apps/api/test/agent-v4-routes.test.ts`; `npm run build --workspace @aigc-flow/api`。预期：PASS。

```bash
git add apps/api/src/modules/agent/v4/agent-v4-routes.ts apps/api/src/modules/agent/agent.routes.ts apps/api/src/modules/agent/agent.schemas.ts apps/api/test/agent-v4-routes.test.ts
git commit -m "feat(agent): expose v4 responses task routes"
```

---

### Task 7: 前端 V4 会话任务面板、队列、预览和画布交付

**Files:**
- Create: `src/flowCanvas/agent/v4/canvasAgentV4Types.ts`
- Create: `src/flowCanvas/agent/v4/canvasAgentV4TaskProjection.ts`
- Create: `src/flowCanvas/agent/v4/useCanvasAgentV4TaskStream.ts`
- Create: `src/flowCanvas/agent/v4/useCanvasAgentV4Task.ts`
- Create: `src/flowCanvas/agent/v4/CanvasAgentV4TaskSheet.tsx`
- Create: `src/flowCanvas/agent/v4/CanvasAgentV4PlanView.tsx`
- Create: `src/flowCanvas/agent/v4/CanvasAgentV4GenerationQueue.tsx`
- Create: `src/flowCanvas/agent/v4/CanvasAgentV4DeliveryPanel.tsx`
- Create: `src/flowCanvas/agent/v4/*.test.tsx`
- Modify: `src/flowCanvas/FlowCanvasPage.tsx` at current agent panel import/gating site

- [ ] **Step 1: 写 reducer 和 SSE 重连测试**

断言乱序/重复 seq 不重复渲染；刷新后用 `afterSeq` 接上；`waiting_for_approval` 显示批准按钮；`generating_batch` 显示独立 item 进度；`partial_success` 只显示失败 item 的重试入口；禁止把原始 provider error 渲染出来。

- [ ] **Step 2: 实现 V4 hooks**

复制 V3 stream hook 的鉴权和指数退避结构但使用 `/agent/v4` 路径；`sendPrompt`, `approve`, `cancel`, `retryItem`, `undoCanvas` 都通过服务端 API；task state 只来自事件 projection，不以助手普通文本推断状态。

- [ ] **Step 3: 实现计划视图**

显示商品分析摘要、主图/详情页数量、依赖图、视觉圣经 checksum、每页 prompt 折叠区、预估点数和风险；编辑数量只修改待审批 task input，不直接调用 provider。

- [ ] **Step 4: 实现生成队列和交付区**

基准图单独显示；batch item 使用 stable `itemId`；成功项显示 asset 缩略图（URL 由现有资产读取 API 临时生成），失败项显示安全错误码；交付区显示验证证据、目标 nodeId、单页重试、撤销。

- [ ] **Step 5: 接入 FlowCanvasPage feature gate**

只有 API runtime identity 为 `v4_real`、前端 `VITE_AGENT_V4_ENABLED=true` 且当前 flow/project 绑定成功时挂载 V4 面板；否则继续显示明确 unavailable/旧 V3 fallback，不自动切换到离线 planner。Ghost preview 只展示未提交 operation，提交后从 ghost state 移除。

- [ ] **Step 6: 运行并提交**

运行：`npm test -- src/flowCanvas/agent/v4`; `npm run build`。预期：所有 V4 前端测试 PASS、生产构建成功。

```bash
git add src/flowCanvas/agent/v4 src/flowCanvas/FlowCanvasPage.tsx
git commit -m "feat(agent-ui): add v4 conversation and generation workspace"
```

---

### Task 8: 端到端 Golden Tasks、回归验证和灰度发布门槛

**Files:**
- Create: `apps/api/test/agent-v4-golden-tasks.test.ts`
- Create: `src/flowCanvas/agent/v4/agentV4GoldenTasks.ts`
- Create: `docs/superpowers/fixtures/2026-08-31-agent-v4-golden-tasks.md`
- Modify: `docs/staging-runbook.md`
- Modify: `docs/STAGING_ENV_TEMPLATE.md`
- Modify: `docs/CODEX_HANDOFF.md`
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: 写端到端 fake-runtime Golden Tasks**

至少包含：

1. 一张实拍图 → 商品分析 → 5 主图/8 详情页计划。
2. 基准图成功 → 5 个独立页面并发 → 所有 item assetId 唯一。
3. `continue_generation` 引用上一轮 base asset。
4. batch 一项失败 → 只重试失败 item。
5. Provider succeeded 但 asset 写入失败 → `needs_review`。
6. 断线/刷新 → `afterSeq` replay 后状态与服务端一致。
7. 无价格、无凭证、余额不足、用户取消均 fail closed。
8. 恶意节点文本不会改变系统规则或扩大工具权限。

- [ ] **Step 2: 运行完整验证矩阵**

按顺序运行：

```bash
npm test -- apps/api/test/agent-v4-*.test.ts
npm test -- apps/api/test/agent-v3-*.test.ts
npm test -- apps/api/test
npm test --workspace @aigc-flow/worker
npm test --workspace @aigc-flow/ai-gateway-core
npm test --workspace @aigc-flow/db
npm run build
npm run build --workspace @aigc-flow/api
npm run build --workspace @aigc-flow/worker
git diff --check
```

记录每条命令实际输出，不以“本地没有数据库”为成功；缺失基础设施时明确列为 staging blocker。

- [ ] **Step 3: 完成 staging 灰度 runbook**

记录独立开关和回滚顺序：

```text
AGENT_V4_ENABLED=false
AGENT_V4_RUNTIME_ENABLED=false
VITE_AGENT_V4_ENABLED=false
```

部署时使用 `docker-compose.staging.yml`：拉取 main、build、停 worker、运行 `node packages/db/dist/cli.js`、启动 redis/api/worker/frontend、检查 `ps`/health/logs；先只对测试租户开启三个 V4 flags。关闭 flags 只停止新入口，不删除 v4 tasks/events/assets/drafts/ledger。

- [ ] **Step 4: 真实 staging 验收**

用已认证测试账号上传一张真实商品图，完成完整淘宝套图流程，核对：登录/租户、参考图读取、文本 Responses tool call、image route、reserve/settle/refund、Worker、S3 asset、逐页验证、画布 CAS、刷新 replay、单项重试、撤销和日志脱敏。任何一项失败时保持 V4 flags 关闭并记录错误码、traceId 和回滚 commit。

- [ ] **Step 5: 更新项目记录并提交发布证据**

在 `PROJECT_RECORD.md` 写入本次 commit、测试命令、staging 账号范围、实际 flags、健康检查和未完成项；在 `docs/CODEX_HANDOFF.md` 写入 V4 当前状态和下一步。提交：

```bash
git add apps/api/test/agent-v4-golden-tasks.test.ts src/flowCanvas/agent/v4/agentV4GoldenTasks.ts docs/superpowers/fixtures/2026-08-31-agent-v4-golden-tasks.md docs/staging-runbook.md docs/STAGING_ENV_TEMPLATE.md docs/CODEX_HANDOFF.md PROJECT_RECORD.md
git commit -m "test(agent): add v4 golden tasks and staging gate"
```

---

## 依赖顺序与检查点

1. Task 1 完成后才能创建 V4 task/event；数据库迁移和 flags 默认关闭。
2. Task 2 完成后才能让模型多轮调用工具；若 Responses route 不支持规范化 tool call，停在 AI Gateway 适配层，不接真实生成。
3. Task 3 完成后才能允许商品套图计划和 prompt set；工具 gateway 通过后才进入生成。
4. Task 4 完成后才能产生真实 asset/billing/workflow；每个 item 的幂等和 refund 测试必须先通过。
5. Task 5/6 完成后 API 才可被前端调用；V3 路由保持不变。
6. Task 7 完成后才开启 UI V4 flag；没有真实 staging 证据不替换默认入口。
7. Task 8 完成后才能宣布 V4 可用；`AGENT_V4_*` 和 `VITE_AGENT_V4_ENABLED` 任一关闭都必须 fail closed。

每个 Task 都先写失败测试，再做最小实现，再运行指定测试，最后单独提交；每个提交都应可回滚且不混入无关格式化。

## 自检结果

### 规格覆盖

- 规格第 2 节的参考项目经验和 TapFlow 安全边界：Task 2、3、4、8。
- 规格第 3 节状态机和事件重放：Task 1、2、6、7。
- 规格第 4 节工具协议和 safe result：Task 1、3、5、6。
- 规格第 5 节淘宝 Golden Flow：Task 3、4、5、8。
- 规格第 6 节服务端模块边界：Task 2-5。
- 规格第 7 节持久化/RLS/assetId：Task 1、2、5。
- 规格第 8 节审批、计费、错误：Task 3、4、5、6。
- 规格第 9 节前端交互：Task 7。
- 规格第 10 节验收与发布门槛：Task 8。
- 规格第 11 节四阶段实施：Task 1-8 和依赖顺序。

### 未完成项扫描

计划没有使用模糊的未完成标记作为实施步骤；每项都有明确文件、函数边界、测试命令和预期结果。

### 类型一致性

统一使用 `AgentV4Status`、`AgentV4ToolName`、`AgentV4GenerationItem`、`AgentV4SafeToolResult`；前端投影只消费这些安全字段。`retryItem` 在 runtime、路由和 hook 中统一使用 `itemId`，`undoCanvas` 统一使用 `expectedRevision`，事件统一使用 `sequence`/`afterSeq`。
