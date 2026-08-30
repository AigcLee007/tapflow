# Canvas Agent V3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Replace the overloaded Canvas Agent experience with a canvas-first Director loop that safely proposes, previews, executes, verifies, and repairs canvas production work while preserving TapFlow's existing V2 persistence, Workflow Run, Worker, billing, and asset boundaries.

**Architecture:** Implement V3 as five bounded slices: runtime truth and evaluation; server protocol and Director loop; delivery verification and recovery; command-bar/task-sheet frontend; and Skill Contract V2 plus bounded visual context. V3 is feature-flagged and mutually exclusive with the current V2 shell. Existing sessions, Skills, runs, assets, drafts, and billing remain authoritative through adapters.

**Tech Stack:** TypeScript, React, Vite, @xyflow/react, Fastify API, Zod, PostgreSQL/RLS, Redis/BullMQ, existing AI Gateway text runtime, existing Worker workflow runtime, Vitest, React Testing Library, Docker Compose v2.

---

## File Map and Boundaries

### New server modules

- apps/api/src/modules/agent/v3/agent-context-assembler.ts — bounded product-safe structured context.
- apps/api/src/modules/agent/v3/agent-visual-context.ts — capture references and budgets.
- apps/api/src/modules/agent/v3/canvas-director-loop.ts — mode-aware tool loop and suspend/resume.
- apps/api/src/modules/agent/v3/canvas-director-prompt.ts — system, tool, and repair prompts.
- apps/api/src/modules/agent/v3/canvas-tool-registry.ts — read/write/run schemas and descriptions.
- apps/api/src/modules/agent/v3/canvas-tool-policy.ts — ownership, risk, approval, and capability checks.
- apps/api/src/modules/agent/v3/canvas-operation-schema.ts — revisioned operations, preconditions, effects, inverse operations.
- apps/api/src/modules/agent/v3/canvas-operation-service.ts — idempotent revision-CAS application.
- apps/api/src/modules/agent/v3/agent-task-projector.ts — durable events to product-safe task projections.
- apps/api/src/modules/agent/v3/agent-delivery-verifier.ts — modality-specific delivery checks.
- apps/api/src/modules/agent/v3/agent-runtime-observability.ts — protected metrics and sanitized metadata.

### New frontend modules

- src/flowCanvas/agent/v3/canvasAgentV3Types.ts — client-safe task, event, operation, plan, delivery, and runtime types.
- src/flowCanvas/agent/v3/canvasAgentTaskProjection.ts — replay-safe event reducer.
- src/flowCanvas/agent/v3/useCanvasAgentTaskStream.ts — SSE and sequence-resume client.
- src/flowCanvas/agent/v3/useCanvasAgentTask.ts — task actions and command-bar state.
- src/flowCanvas/agent/v3/CanvasAgentCommandBar.tsx — bottom canvas composer.
- src/flowCanvas/agent/v3/CanvasAgentTaskSheet.tsx — task-first right sheet.
- src/flowCanvas/agent/v3/CanvasAgentGoalSection.tsx — goal and reference summary.
- src/flowCanvas/agent/v3/CanvasAgentPlanSection.tsx — plan and steps.
- src/flowCanvas/agent/v3/CanvasAgentPreviewSection.tsx — risk, estimate, and approval.
- src/flowCanvas/agent/v3/CanvasAgentRunSection.tsx — run progress and retry.
- src/flowCanvas/agent/v3/CanvasAgentDeliverySection.tsx — delivery evidence and focus actions.
- src/flowCanvas/agent/v3/CanvasAgentGhostLayer.tsx — non-authoritative preview nodes and edges.

### Existing files expected to change

- apps/api/src/config/env.ts — V3 flags and bounded loop settings.
- apps/api/src/modules/agent/agent.routes.ts and agent.schemas.ts — V3 route boundaries.
- apps/api/src/modules/agent/agent.service.ts — thin V3 adapter entry point.
- apps/api/src/modules/agent/v2/agent-turn-loop.ts — reuse compatible read/redaction helpers, no duplicate Director implementation.
- src/flowCanvas/canvas/AiFlowCanvas.tsx — compose V3 entry, ghost layer, and approved-operation callbacks.
- src/flowCanvas/FlowCanvasPage.tsx — mutually exclusive V3 shell selection.
- src/flowCanvas/flowCanvas.css — command-bar, task-sheet, ghost, and responsive styles.
- docker-compose.staging.yml, docs/STAGING_ENV_TEMPLATE.md, docs/v2-local-development.md — flags and rollout instructions.
- PROJECT_RECORD.md — meaningful slice progress.

## Subproject 1: Runtime Truth and Evaluation Baseline

### Task 1: Add V3 flags and runtime identity

**Files:**
- Modify: apps/api/src/config/env.ts
- Modify: docker-compose.staging.yml
- Modify: docs/STAGING_ENV_TEMPLATE.md
- Modify: docs/v2-local-development.md
- Create: apps/api/test/agent-v3-config.test.ts
- Modify: PROJECT_RECORD.md

- [ ] Step 1: Write the failing config test.

~~~ts
it("defaults V3 runtime flags off and bounds director rounds", () => {
  const config = loadConfig({});
  expect(config.AGENT_V3_ENABLED).toBe(false);
  expect(config.AGENT_V3_RUNTIME_ENABLED).toBe(false);
  expect(config.AGENT_V3_MAX_TOOL_ROUNDS).toBe(8);
});
~~~

- [ ] Step 2: Run the focused test and verify it fails.

Run: npx vitest run apps/api/test/agent-v3-config.test.ts

Expected: FAIL because the V3 keys do not exist.

- [ ] Step 3: Implement the minimum config surface.

Add server defaults AGENT_V3_ENABLED=false, AGENT_V3_RUNTIME_ENABLED=false, AGENT_V3_MAX_TOOL_ROUNDS=8, AGENT_V3_MAX_CONTEXT_NODES=60, AGENT_V3_MAX_VISUAL_CAPTURES=4, and AGENT_V3_REPAIR_ATTEMPTS=1. Add VITE_AGENT_V3_ENABLED=false to the frontend build environment. Clamp tool rounds to 1..8 with the existing environment parser.

- [ ] Step 4: Add product-safe runtime identity.

Use AgentRuntimeIdentity = "v3_real" | "v2_real" | "unavailable" | "offline_demo". The capability response reports v3_real only when both server V3 flags are true. The frontend renders 真实 Agent, Agent 暂不可用, or 离线演示 and never infers a real runtime from development mode.

- [ ] Step 5: Run tests and API build.

Run: npx vitest run apps/api/test/agent-v3-config.test.ts
Run: npm run build --workspace @aigc-flow/api

Expected: PASS and a successful API build.

- [ ] Step 6: Commit.

~~~bash
git add apps/api/src/config/env.ts docker-compose.staging.yml docs/STAGING_ENV_TEMPLATE.md docs/v2-local-development.md apps/api/test/agent-v3-config.test.ts PROJECT_RECORD.md
git commit -m "feat(agent): add truthful v3 runtime flags"
~~~

### Task 2: Create the golden task fixture matrix

**Files:**
- Create: apps/api/test/fixtures/agent-v3-golden-tasks.ts
- Create: src/flowCanvas/agent/v3/agentV3GoldenTasks.test.ts
- Create: docs/superpowers/fixtures/2026-08-30-agent-v3-golden-tasks.md

- [ ] Step 1: Define the fixture contract.

~~~ts
export type AgentV3GoldenTask = {
  id: string;
  prompt: string;
  canvas: { nodes: unknown[]; edges: unknown[]; revision: number };
  expected: {
    planActions: string[];
    targetNodeKinds?: string[];
    requiresApproval: boolean;
    deliveryKind?: "text" | "image" | "video" | "graph" | "partial";
  };
};
~~~

- [ ] Step 2: Add at least twenty fixtures.

Include empty-canvas text/image/video creation, selected-node edits, multi-reference edits, prior-result continuation, graph creation, batch execution, stale revision, missing pricing, partial batch failure, provider-success/placement-failure, cancellation before and after reserve, refresh/replay, prompt injection in node content, unavailable model, failed-step retry, and canvas undo.

- [ ] Step 3: Add deterministic scoring.

Implement scoreAgentV3Task(actual, expected) with exact checks for plan actions, approval policy, target kinds, terminal delivery evidence, and duplicate paid-step prevention. Return structured booleans and a numeric score; do not compare free-form replies.

- [ ] Step 4: Run fixture tests.

Run: npx vitest run apps/api/test/fixtures/agent-v3-golden-tasks.ts src/flowCanvas/agent/v3/agentV3GoldenTasks.test.ts

Expected: PASS.

- [ ] Step 5: Commit.

~~~bash
git add apps/api/test/fixtures/agent-v3-golden-tasks.ts src/flowCanvas/agent/v3/agentV3GoldenTasks.test.ts docs/superpowers/fixtures/2026-08-30-agent-v3-golden-tasks.md
git commit -m "test(agent): define v3 golden task matrix"
~~~

## Subproject 2: Server Protocol and Director Loop

### Task 3: Define operation and tool schemas

**Files:**
- Create: apps/api/src/modules/agent/v3/canvas-operation-schema.ts
- Create: apps/api/src/modules/agent/v3/canvas-tool-registry.ts
- Create: apps/api/src/modules/agent/v3/canvas-tool-policy.ts
- Create: apps/api/test/agent-v3-tools.test.ts
- Create: apps/api/test/agent-v3-operations.test.ts

- [ ] Step 1: Write failing schema tests.

Cover revisioned create/update/connect sets, unknown operation rejection, raw media rejection, paid/batch/destructive approval, provider-field rejection, and stale revision rejection.

- [ ] Step 2: Implement the operation envelope.

~~~ts
export const canvasOperationEnvelopeSchema = z.object({
  operationSetId: z.string().min(1).max(200),
  taskId: z.string().min(1).max(200),
  turnId: z.string().min(1).max(200),
  baseRevision: z.number().int().nonnegative(),
  summary: z.string().min(1).max(2000),
  risk: z.enum(["safe", "destructive", "paid", "batch"]),
  requiresApproval: z.boolean(),
  operations: z.array(canvasOperationSchema).min(1).max(24),
  preconditions: z.array(z.record(z.string(), z.unknown())).max(24),
  expectedEffects: z.array(z.record(z.string(), z.unknown())).max(24),
  inverseOperations: z.array(canvasOperationSchema).max(24).optional(),
}).strict();
~~~

Use operation types node.create, node.update_data, node.delete, edge.connect, edge.delete, group.create, layout.move, selection.set, and result.place. Reject base64, data URLs, blob URLs, signed URLs, File, Blob, credential, authorization, provider, and raw route fields.

- [ ] Step 3: Implement the namespaced registry.

Expose read tools, proposal tools, run tools, and control tools. Write tools return a proposed operation envelope and do not mutate the database. Run tools return an estimate or an approval-bound proposal.

- [ ] Step 4: Implement policy checks.

assertCanvasToolAllowed must verify tenant, project, flow, session, graph revision, model visibility, pricing presence, and risk approval. Reject HTTP, filesystem, shell, MCP, browser, code-execution, arbitrary URL, and secret access.

- [ ] Step 5: Run focused tests.

Run: npx vitest run apps/api/test/agent-v3-tools.test.ts apps/api/test/agent-v3-operations.test.ts

Expected: PASS.

- [ ] Step 6: Commit.

~~~bash
git add apps/api/src/modules/agent/v3/canvas-operation-schema.ts apps/api/src/modules/agent/v3/canvas-tool-registry.ts apps/api/src/modules/agent/v3/canvas-tool-policy.ts apps/api/test/agent-v3-tools.test.ts apps/api/test/agent-v3-operations.test.ts
git commit -m "feat(agent): add v3 canvas operation protocol"
~~~

### Task 4: Assemble bounded structured and visual context

**Files:**
- Create: apps/api/src/modules/agent/v3/agent-context-assembler.ts
- Create: apps/api/src/modules/agent/v3/agent-visual-context.ts
- Create: apps/api/test/agent-v3-context.test.ts
- Modify: apps/api/src/modules/agent/agent-v2-context.ts only to reuse redaction helpers

- [ ] Step 1: Write failing context tests.

Cover node budget 60, selection budget 12, recent-run budget 12, visual-capture budget 4, offscreen clustering, safe model names, redaction of provider/credential fields, and omission of media payloads and signed URLs.

- [ ] Step 2: Implement assembleCanvasDirectorContext.

~~~ts
export async function assembleCanvasDirectorContext(input: {
  tenantId: string;
  projectId: string;
  flowId: string;
  graphRevision: number;
  prompt: string;
  canvas: CanvasAgentSnapshotInput;
  selectedSkill?: { id: string; version: number };
  visual?: VisualContextInput;
}): Promise<CanvasDirectorContext>
~~~

Use existing tenant-scoped catalog, pricing, recent-run, and asset repositories. Return creator-safe display names and stable IDs only.

- [ ] Step 3: Implement visual reference validation.

buildVisualContextRefs verifies flow ownership and expiry, caps four references, and returns id/kind/width/height/expiresAt. It never accepts or writes image bytes into flow_drafts.graph_json.

- [ ] Step 4: Run focused tests and build.

Run: npx vitest run apps/api/test/agent-v3-context.test.ts
Run: npm run build --workspace @aigc-flow/api

Expected: PASS and a successful API build.

- [ ] Step 5: Commit.

~~~bash
git add apps/api/src/modules/agent/v3/agent-context-assembler.ts apps/api/src/modules/agent/v3/agent-visual-context.ts apps/api/test/agent-v3-context.test.ts apps/api/src/modules/agent/agent-v2-context.ts
git commit -m "feat(agent): assemble bounded v3 canvas context"
~~~

### Task 5: Implement the mode-aware Director loop

**Files:**
- Create: apps/api/src/modules/agent/v3/canvas-director-prompt.ts
- Create: apps/api/src/modules/agent/v3/canvas-director-loop.ts
- Create: apps/api/test/agent-v3-director-loop.test.ts
- Modify: apps/api/src/modules/agent/agent.routes.ts
- Modify: apps/api/src/modules/agent/agent.schemas.ts

- [ ] Step 1: Write failing loop tests.

Cover observe-only reads, plan persistence, preview suspension, approval suspension, asynchronous run suspension, verification before finish, one repair attempt, max eight rounds, invalid tool-call repair, and terminal replay.

- [ ] Step 2: Implement modes and task statuses.

~~~ts
type CanvasDirectorMode = "observe" | "plan" | "preview" | "execute" | "verify" | "repair";
type CanvasAgentTaskStatus =
  | "draft" | "observing" | "planning" | "preview_ready"
  | "waiting_for_input" | "waiting_for_approval"
  | "applying_canvas_ops" | "running" | "verifying" | "repairing"
  | "needs_review" | "succeeded" | "partial_success" | "failed" | "cancelled";
~~~

Persist every transition. Never infer terminal success from assistant text.

- [ ] Step 3: Implement CanvasDirectorLoop.run.

The loop assembles context, exposes mode-allowed tools, emits task/plan/preview/tool events, suspends without losing task identity for approval/input/workflow results, resumes from sequence and revision, calls delivery verification before finish, and returns AGENT_REPAIR_LIMIT_EXCEEDED after one failed repair.

- [ ] Step 4: Add authenticated V3 route boundaries.

~~~text
POST /api/v2/agent/v3/sessions/:sessionId/turns/stream
GET  /api/v2/agent/v3/tasks/:taskId/events?after=<sequence>
POST /api/v2/agent/v3/tasks/:taskId/approve
POST /api/v2/agent/v3/tasks/:taskId/cancel
POST /api/v2/agent/v3/tasks/:taskId/retry-step
POST /api/v2/agent/v3/tasks/:taskId/undo-canvas
~~~

Each route checks session, turn, project, flow, and tenant ownership. The frontend never calls billing or raw Workflow Run endpoints.

- [ ] Step 5: Run focused tests.

Run: npx vitest run apps/api/test/agent-v3-director-loop.test.ts apps/api/test/agent-v3-routes.test.ts

Expected: PASS with approval, cancel, replay, stale revision, and round-limit coverage.

- [ ] Step 6: Commit.

~~~bash
git add apps/api/src/modules/agent/v3/canvas-director-prompt.ts apps/api/src/modules/agent/v3/canvas-director-loop.ts apps/api/test/agent-v3-director-loop.test.ts apps/api/test/agent-v3-routes.test.ts apps/api/src/modules/agent/agent.routes.ts apps/api/src/modules/agent/agent.schemas.ts
git commit -m "feat(agent): add v3 director loop"
~~~

## Subproject 3: Operations, Delivery Verification, and Recovery

### Task 6: Implement idempotent operation application and inverse patches

**Files:**
- Create: apps/api/src/modules/agent/v3/canvas-operation-service.ts
- Create: apps/api/test/agent-v3-operation-service.test.ts
- Modify: apps/api/src/modules/flows/flows.service.ts through existing draft CAS helpers

- [ ] Step 1: Write failing service tests.

Cover create/update/connect/delete, client-reference resolution, duplicate opId, stale revision 409, failed preconditions, inverse patch generation, asset ownership, and graph JSON media rejection.

- [ ] Step 2: Implement applyApprovedOperationSet.

~~~ts
export async function applyApprovedOperationSet(input: {
  tenantId: string;
  projectId: string;
  flowId: string;
  taskId: string;
  operationSet: CanvasOperationEnvelope;
}): Promise<{
  revision: number;
  createdNodeIds: string[];
  inverseOperations: CanvasOperation[];
}>
~~~

Use one transaction, strict base-revision CAS, stable operation idempotency, and existing server draft persistence. Return 409 for stale writes and never silently rebase.

- [ ] Step 3: Run focused tests.

Run: npx vitest run apps/api/test/agent-v3-operation-service.test.ts

Expected: PASS with no duplicate nodes or edges on repeated requests.

- [ ] Step 4: Commit.

~~~bash
git add apps/api/src/modules/agent/v3/canvas-operation-service.ts apps/api/test/agent-v3-operation-service.test.ts apps/api/src/modules/flows/flows.service.ts
git commit -m "feat(agent): apply revisioned reversible canvas operations"
~~~

### Task 7: Add delivery verification and failed-step retry

**Files:**
- Create: apps/api/src/modules/agent/v3/agent-delivery-verifier.ts
- Create: apps/api/src/modules/agent/v3/agent-runtime-observability.ts
- Create: apps/api/test/agent-v3-delivery.test.ts
- Modify: apps/worker/src/workflow-runtime/service.ts
- Modify: apps/api/src/modules/agent/agent-skill-run.service.ts for shared terminal delivery metadata

- [ ] Step 1: Write failing delivery tests.

Cover text output, asset-backed image/video output, batch partial success, provider-success/placement-failure, missing asset, non-terminal run, lineage mismatch, and duplicate verification events.

- [ ] Step 2: Implement modality-specific checks.

~~~ts
export type DeliveryCheckResult = {
  status: "verified" | "partial" | "failed" | "waiting";
  items: Array<{ id: string; kind: string; status: string; nodeId?: string; assetId?: string; reason?: string }>;
};

export async function verifyTaskDelivery(input: {
  tenantId: string;
  taskId: string;
  flowId: string;
  expected: AgentSkillOutputSchema[];
}): Promise<DeliveryCheckResult>
~~~

A provider response, Workflow Run success, or assistant message alone never satisfies delivery.

- [ ] Step 3: Implement retry selection.

retryFailedSteps creates a new attempt linked to each failed step, preserves successful outputs, and uses a new idempotency key. Successful paid steps are not rerun unless delivery verification marks their output invalidated.

- [ ] Step 4: Add protected observability.

Persist first-event latency, context size, tool rounds, repair count, delivery duration, terminal status, and billing totals. Provider and credential fields stay admin-only.

- [ ] Step 5: Run tests and Worker build.

Run: npx vitest run apps/api/test/agent-v3-delivery.test.ts
Run: npm run test --workspace @aigc-flow/worker
Run: npm run build --workspace @aigc-flow/worker

Expected: delivery tests pass; Worker tests/build pass or list documented infrastructure skips.

- [ ] Step 6: Commit.

~~~bash
git add apps/api/src/modules/agent/v3/agent-delivery-verifier.ts apps/api/src/modules/agent/v3/agent-runtime-observability.ts apps/api/test/agent-v3-delivery.test.ts apps/worker/src/workflow-runtime/service.ts apps/api/src/modules/agent/agent-skill-run.service.ts
git commit -m "feat(agent): verify v3 delivery and retry failed steps"
~~~

## Subproject 4: Frontend Command Bar, Task Sheet, and Ghost Preview

### Task 8: Add frontend V3 types, reducer, and replay stream

**Files:**
- Create: src/flowCanvas/agent/v3/canvasAgentV3Types.ts
- Create: src/flowCanvas/agent/v3/canvasAgentTaskProjection.ts
- Create: src/flowCanvas/agent/v3/useCanvasAgentTaskStream.ts
- Create: src/flowCanvas/agent/v3/useCanvasAgentTaskStream.test.ts
- Create: src/flowCanvas/agent/v3/canvasAgentTaskProjection.test.ts

- [ ] Step 1: Write failing reducer tests.

Test ordered transitions, duplicate sequence suppression, terminal-state protection, approval state, partial success, reconnect after after=<sequence>, and product-safe redaction.

- [ ] Step 2: Implement client-safe types.

Define CanvasAgentV3Task, CanvasAgentV3Event, CanvasAgentV3OperationPreview, CanvasAgentV3Delivery, and CanvasAgentV3RuntimeIdentity with no provider, credential, upstream-model, signed-URL, or raw-route fields.

- [ ] Step 3: Implement reduceCanvasAgentV3Event.

Ignore sequence duplicates and transitions out of terminal task/step states. Ignore unknown event types without throwing.

- [ ] Step 4: Implement useCanvasAgentTaskStream.

Open the V3 SSE stream, store the last accepted sequence, reconnect with after, replay durable task events after disconnect, and expose sendPrompt, approve, cancel, retryStep, and undoCanvas.

- [ ] Step 5: Run focused tests.

Run: npx vitest run src/flowCanvas/agent/v3/canvasAgentTaskProjection.test.ts src/flowCanvas/agent/v3/useCanvasAgentTaskStream.test.ts

Expected: PASS.

- [ ] Step 6: Commit.

~~~bash
git add src/flowCanvas/agent/v3/canvasAgentV3Types.ts src/flowCanvas/agent/v3/canvasAgentTaskProjection.ts src/flowCanvas/agent/v3/useCanvasAgentTaskStream.ts src/flowCanvas/agent/v3/canvasAgentTaskProjection.test.ts src/flowCanvas/agent/v3/useCanvasAgentTaskStream.test.ts
git commit -m "feat(agent-ui): add v3 task projection and replay stream"
~~~

### Task 9: Implement the command bar and task sheet

**Files:**
- Create: src/flowCanvas/agent/v3/CanvasAgentCommandBar.tsx
- Create: src/flowCanvas/agent/v3/CanvasAgentTaskSheet.tsx
- Create: src/flowCanvas/agent/v3/CanvasAgentGoalSection.tsx
- Create: src/flowCanvas/agent/v3/CanvasAgentPlanSection.tsx
- Create: src/flowCanvas/agent/v3/CanvasAgentPreviewSection.tsx
- Create: src/flowCanvas/agent/v3/CanvasAgentRunSection.tsx
- Create: src/flowCanvas/agent/v3/CanvasAgentDeliverySection.tsx
- Create: src/flowCanvas/agent/v3/CanvasAgentCommandBar.test.tsx
- Create: src/flowCanvas/agent/v3/CanvasAgentTaskSheet.test.tsx
- Modify: src/flowCanvas/flowCanvas.css

- [ ] Step 1: Write failing UI tests.

Cover prompt submission, selected-node/reference chips, Skill chip removal, runtime identity, risk and cost preview, approval, cancel, retry, delivery focus, and absence of direct billing calls.

- [ ] Step 2: Implement the command bar.

Use MenuSurface, MenuSelect, dismissal hooks, Lucide icons, and shared menu density. The bar remains visible with the task sheet closed and disables submit only for active states that cannot accept a new prompt.

- [ ] Step 3: Implement the task sheet sections.

Render Goal, Plan, Preview, Run, and Delivery from the projected task. History, logs, and connections are secondary drawers. Approval controls show product-safe cost and risk labels.

- [ ] Step 4: Add responsive styles.

Desktop: command bar centered over the canvas and task sheet at 420px max width. Mobile: command bar as a bottom dock and task sheet as a full-height sheet. Use existing z-index and menu tokens; do not add native selects or oversized menu rows.

- [ ] Step 5: Run focused UI tests.

Run: npx vitest run src/flowCanvas/agent/v3/CanvasAgentCommandBar.test.tsx src/flowCanvas/agent/v3/CanvasAgentTaskSheet.test.tsx

Expected: PASS.

- [ ] Step 6: Commit.

~~~bash
git add src/flowCanvas/agent/v3 src/flowCanvas/flowCanvas.css
git commit -m "feat(agent-ui): add v3 command bar and task sheet"
~~~

### Task 10: Add ghost preview and compose V3 into the canvas

**Files:**
- Create: src/flowCanvas/agent/v3/CanvasAgentGhostLayer.tsx
- Create: src/flowCanvas/agent/v3/CanvasAgentGhostLayer.test.tsx
- Modify: src/flowCanvas/canvas/AiFlowCanvas.tsx
- Modify: src/flowCanvas/FlowCanvasPage.tsx
- Modify: src/flowCanvas/FlowCanvasPage.test.tsx

- [ ] Step 1: Write failing ghost-layer tests.

Assert ghost nodes/edges render from preview operations, never enter the Zustand node list, disappear on approval/cancel, and do not write flow_drafts.

- [ ] Step 2: Implement the ghost layer.

Use a dedicated React Flow overlay with pointerEvents none for visuals and explicit controls outside the overlay. Distinguish create, update, delete, connect, and move previews.

- [ ] Step 3: Compose V3 behind a mutually exclusive flag.

FlowCanvasPage selects V3 only when VITE_AGENT_V3_ENABLED is true and server capability is v3_real. Existing V2 remains the disabled-path shell; no third silent planner path is introduced.

- [ ] Step 4: Wire approved callbacks.

Approved operations call the V3 task action, then refresh the remote draft and canvas revision. The frontend never invokes billing, provider, or raw Workflow Run endpoints.

- [ ] Step 5: Run focused tests and production build.

Run: npx vitest run src/flowCanvas/agent/v3/CanvasAgentGhostLayer.test.tsx src/flowCanvas/FlowCanvasPage.test.tsx
Run: npm run build

Expected: PASS and a successful production build.

- [ ] Step 6: Commit.

~~~bash
git add src/flowCanvas/agent/v3/CanvasAgentGhostLayer.tsx src/flowCanvas/agent/v3/CanvasAgentGhostLayer.test.tsx src/flowCanvas/canvas/AiFlowCanvas.tsx src/flowCanvas/FlowCanvasPage.tsx src/flowCanvas/FlowCanvasPage.test.tsx
git commit -m "feat(agent-ui): preview v3 canvas operations on the board"
~~~

## Subproject 5: Skill Contract V2 and Visual Context

### Task 11: Define and validate Skill Contract V2

**Files:**
- Modify: apps/api/src/modules/agent/skill-schemas.ts
- Modify: apps/api/src/modules/agent/skill-normalizer.ts
- Modify: apps/api/src/modules/agent/skill-service.ts
- Create: apps/api/src/modules/agent/v3/skill-contract-v2.ts
- Create: apps/api/test/agent-v3-skills.test.ts
- Modify: src/flowCanvas/agent/canvasAgentSkillTypes.ts
- Modify: src/flowCanvas/agent/canvasAgentApi.ts

- [ ] Step 1: Write failing Skill tests.

Cover typed inputs/outputs, allowlisted tools, approval/pricing/retry policies, delivery checks, graph-template validation, immutable published versions, and V1 readable-but-unavailable behavior when delivery checks are missing.

- [ ] Step 2: Implement the V2 manifest.

Top-level fields are schemaVersion, id, version, name, summary, modality, intent, inputs, outputs, allowedTools, steps, approvalPolicy, pricingPolicy, retryPolicy, deliveryChecks, optional uiSchema, and optional graphTemplate.

- [ ] Step 3: Add projectSkillV1ToV2.

Preserve Skill IDs and versions, map normalized actions to V3 tools, convert input hints, and mark a Skill unavailable for production if no delivery check can be inferred.

- [ ] Step 4: Gate publishing and runtime.

Published V2 Skills require schema, graph, tool, policy, and fixture validation. Private drafts may be saved but cannot execute until a passing fixture exists. Reject provider and credential fields.

- [ ] Step 5: Run focused tests and API build.

Run: npx vitest run apps/api/test/agent-v3-skills.test.ts
Run: npm run build --workspace @aigc-flow/api

Expected: PASS and a successful API build.

- [ ] Step 6: Commit.

~~~bash
git add apps/api/src/modules/agent/skill-schemas.ts apps/api/src/modules/agent/skill-normalizer.ts apps/api/src/modules/agent/skill-service.ts apps/api/src/modules/agent/v3/skill-contract-v2.ts apps/api/test/agent-v3-skills.test.ts src/flowCanvas/agent/canvasAgentSkillTypes.ts src/flowCanvas/agent/canvasAgentApi.ts
git commit -m "feat(agent): define skill contract v2"
~~~

### Task 12: Connect bounded visual context to V3 turns

**Files:**
- Modify: src/flowCanvas/agent/v3/useCanvasAgentTask.ts
- Modify: src/flowCanvas/canvas/AiFlowCanvas.tsx
- Modify: apps/api/src/modules/agent/v3/agent-visual-context.ts
- Create: src/flowCanvas/agent/v3/visualContextCapture.test.ts
- Create: apps/api/test/agent-v3-visual-context.test.ts

- [ ] Step 1: Write failing capture tests.

Cover viewport, selected-node bounds, explicit region, four-capture cap, vision capability, expiry, flow ownership, and structured-only continuation when capture fails.

- [ ] Step 2: Implement client capture metadata.

Capture only bounded metadata and a server-authorized reference. Do not place image bytes, base64, data URLs, blob URLs, or signed URLs in nodes, drafts, or task messages.

- [ ] Step 3: Implement server validation.

Verify capture ownership, expiry, flow binding, maximum dimensions, and modality support. When visual input is unavailable, return a product-safe warning and continue only when structured context is sufficient.

- [ ] Step 4: Run focused tests.

Run: npx vitest run src/flowCanvas/agent/v3/visualContextCapture.test.ts apps/api/test/agent-v3-visual-context.test.ts

Expected: PASS.

- [ ] Step 5: Commit.

~~~bash
git add src/flowCanvas/agent/v3/useCanvasAgentTask.ts src/flowCanvas/canvas/AiFlowCanvas.tsx apps/api/src/modules/agent/v3/agent-visual-context.ts src/flowCanvas/agent/v3/visualContextCapture.test.ts apps/api/test/agent-v3-visual-context.test.ts
git commit -m "feat(agent): add bounded visual context to v3 turns"
~~~

## Release, Staging, and Rollback

### Task 13: Run cross-package validation and staging acceptance

**Files:**
- Modify: docs/staging-runbook.md
- Modify: docs/PRODUCTION_RUNBOOK.md
- Modify: PROJECT_RECORD.md

- [ ] Step 1: Run focused suites.

~~~bash
npx vitest run src/flowCanvas/agent/v3 apps/api/test/agent-v3-context.test.ts apps/api/test/agent-v3-tools.test.ts apps/api/test/agent-v3-operations.test.ts apps/api/test/agent-v3-director-loop.test.ts apps/api/test/agent-v3-delivery.test.ts apps/api/test/agent-v3-skills.test.ts
npm run test --workspace @aigc-flow/worker
npm run test --workspace @aigc-flow/ai-gateway-core
npm run test --workspace @aigc-flow/db
~~~

Expected: V3 focused tests pass. Infrastructure-dependent skips must be recorded with the exact reason.

- [ ] Step 2: Run builds and diff checks.

~~~bash
npm run build
npm run build --workspace @aigc-flow/api
npm run build --workspace @aigc-flow/worker
git diff --check
~~~

Expected: all builds and git diff --check pass.

- [ ] Step 3: Run authenticated staging acceptance.

Use Docker Compose v2 with PostgreSQL, Redis/BullMQ, S3-compatible storage, real priced provider routes, and browser authentication. Validate login, binding, draft hydration, command bar, plan preview, approval, reserve/settle/refund, Worker execution, asset placement, delivery verification, refresh/replay, partial retry, undo, and flag rollback.

- [ ] Step 4: Document rollback.

~~~bash
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml stop tapflow-worker
~~~

Set AGENT_V3_ENABLED=false, AGENT_V3_RUNTIME_ENABLED=false, and VITE_AGENT_V3_ENABLED=false, then redeploy. Do not delete tasks, events, Skills, runs, assets, drafts, or billing records.

- [ ] Step 5: Commit release documentation.

~~~bash
git add docs/staging-runbook.md docs/PRODUCTION_RUNBOOK.md PROJECT_RECORD.md
git commit -m "docs(agent): add v3 staging acceptance and rollback"
~~~

## Plan Self-Review

### Spec coverage

- Product goal and canvas-first IA: Tasks 8-10.
- Runtime truth and no silent fallback: Task 1.
- Structured and visual context: Tasks 4 and 12.
- Read/write/run tools and operation contracts: Task 3.
- Director modes, approval, suspend/resume, replay: Tasks 5 and 8.
- Revision CAS, idempotency, inverse operations: Task 6.
- Delivery verification and failed-step retry: Task 7.
- Skill Contract V2 and V1 adapter: Task 11.
- Billing and existing Workflow Run boundaries: Tasks 3, 5, 7, and 13.
- Security/redaction/RLS: Tasks 3, 4, 5, 6, 7, and 11.
- Testing, rollout, and rollback: Tasks 2 and 13.

### Placeholder scan

The plan contains no TBD, TODO, FIXME, or unspecified “appropriate handling” steps. Every implementation task names files, interfaces, test commands, expected outcomes, and a commit boundary.

### Type consistency

CanvasOperationEnvelope, CanvasDirectorContext, CanvasDirectorMode, CanvasAgentTaskStatus, DeliveryCheckResult, and AgentSkillManifestV2 are introduced once and reused by later tasks. Frontend projections contain only product-safe fields and never reuse server credential/provider types.
