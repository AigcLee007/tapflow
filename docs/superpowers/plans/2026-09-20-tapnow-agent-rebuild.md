# TapFlow Agent Workspace Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox ([ ] syntax) for tracking.

**Goal:** Replace the V5/V6 shell with a server-authoritative Agent-first workspace that clarifies a goal, shows a typed plan and approval gate, runs real capabilities, persists assets/results, places selected results on the canvas, and recovers after refresh.

**Architecture:** Keep V2 auth, tenant/RLS, flow draft/revision, assets/S3, billing reserve/settle/refund, Redis, Worker, and AI Gateway. Add stable AgentWorkspace, AgentRuntime, AgentTurn, AgentDecision, AgentResult, and replay contracts. The canonical API/runtime is authoritative; the mounted legacy-shaped client adapters translate into it only while the UI migration completes, and V5/V6 persistence is never authoritative.

**Approved acceptance scenario:** the first end-to-end scenario is the user request for a first-frame image, last-frame image, and first/last-frame video prompt. It must clarify only missing creative inputs, show a server-priced plan, wait for approval, generate the two images plus prompt, persist assets/results, and defer video generation to a separate explicit approval. The same planner must handle ordinary image, poster, text, and video tasks without hardcoded domain questions.

**Tech Stack:** Vite/React/TypeScript, Fastify/Zod, PostgreSQL migrations/RLS, Redis/BullMQ, existing S3 and billing services, AI Gateway, Vitest, Playwright.

---

## File map

Create:
- src/flowCanvas/agent/runtime/agentProtocol.ts
- src/flowCanvas/agent/runtime/agentEventReducer.ts
- src/flowCanvas/agent/runtime/agentRuntimeApi.ts
- src/flowCanvas/agent/runtime/useAgentRuntime.ts
- src/flowCanvas/agent/runtime/AgentWorkspace.tsx
- src/flowCanvas/agent/runtime/ConversationRenderer.tsx
- src/flowCanvas/agent/runtime/ContextController.ts
- src/flowCanvas/agent/runtime/agentProtocol.test.ts
- src/flowCanvas/agent/runtime/agentEventReducer.test.ts
- src/flowCanvas/agent/runtime/agentRuntimeApi.test.ts
- src/flowCanvas/agent/runtime/AgentWorkspace.test.tsx
- src/flowCanvas/agent/runtime/agent-golden-flow.test.tsx
- apps/api/src/modules/agent/runtime/agent-protocol.ts
- apps/api/src/modules/agent/runtime/agent-runtime.repository.ts
- apps/api/src/modules/agent/runtime/agent-runtime.policy.ts
- apps/api/src/modules/agent/runtime/agent-runtime.service.ts
- apps/api/src/modules/agent/runtime/agent-runtime.routes.ts
- apps/api/src/modules/agent/runtime/agent-runtime.repository.test.ts
- apps/api/src/modules/agent/runtime/agent-runtime.policy.test.ts
- apps/api/src/modules/agent/runtime/agent-runtime.service.test.ts
- apps/api/src/modules/agent/runtime/agent-runtime.routes.test.ts
- apps/api/src/modules/agent/runtime/agent-runtime.e2e.test.ts
- apps/worker/src/workflow-runtime/agent-runtime-delivery.ts
- apps/worker/src/workflow-runtime/agent-runtime-delivery.test.ts
- packages/db/migrations/000084_agent_runtime_rebuild.sql

Modify:
- apps/api/src/modules/agent/agent.routes.ts
- apps/api/src/modules/agent/agent.schemas.ts
- apps/api/src/modules/agent/agent.service.ts
- apps/api/src/modules/agent/agent-session.repository.ts
- apps/api/src/config/env.ts
- docker-compose.staging.yml
- src/flowCanvas/agent/CanvasAgentPanel.tsx
- src/flowCanvas/agent/canvasAgentApi.ts
- src/flowCanvas/agent/agentContextSnapshot.ts
- src/flowCanvas/agent/agentReferenceContext.ts
- src/flowCanvas/agent/CanvasAgentButton.tsx
- src/flowCanvas/canvas/AiFlowCanvas.tsx
- apps/worker/src/main.ts
- docs/STAGING_ENV_TEMPLATE.md
- docs/staging-runbook.md
- PROJECT_RECORD.md
- docs/CODEX_HANDOFF.md

Do not change auth, tenant context, flow draft CAS semantics, existing asset/billing ledger semantics, or historical V5/V6 rows.

---

### Task 1: Canonical protocol and safe normalization

Files: the new client/server protocol files and protocol tests, plus agentContextSnapshot.ts and agentReferenceContext.ts.

- [ ] Write failing tests proving stable Context Snapshot fields only: projectId, flowId, graphRevision, refs, skillIds, appIds, modelKey. Reject data:, blob:, signed HTTP URLs, provider, credential, Authorization, base64, File, Blob, unknown keys, and ref roles outside subject/style/composition/layout/context. Limit blocks to 64, questions to 4, results to 24, and text to 4000 characters.
- [ ] Run npm test -- --run src/flowCanvas/agent/runtime/agentProtocol.test.ts. Expect FAIL.
- [ ] Implement matching client types and strict server Zod schemas:

    type AgentPhase = "idle" | "understanding" | "waiting_for_input" | "planning" |
      "waiting_for_confirmation" | "executing" | "verifying" | "presenting_results" |
      "refining" | "failed" | "cancelled";

    type AgentContextSnapshot = {
      projectId: string | null; flowId: string | null; graphRevision: number;
      refs: Array<{ refId: string; source: "canvas" | "asset" | "upload";
        nodeId?: string; assetId?: string;
        role?: "subject" | "style" | "composition" | "layout" | "context"; label: string }>;
      skillIds: string[]; appIds: string[]; modelKey: string | null;
    };

    type AgentDecisionType = "answer_question" | "edit_brief" | "approve_plan" |
      "revise_plan" | "result_action" | "cancel_execution" | "retry_execution";

  Add whitelist ConversationBlock variants: understanding, question_set, plan, brief, confirmation, progress, result_group, error_recovery. Normalize all LLM output before storage/response and return AGENT_CONTEXT_UNSAFE or AGENT_BLOCK_INVALID for rejected fields.
- [ ] Run focused protocol/policy tests. Expect PASS.
- [ ] Commit: feat: define canonical agent protocol.

---

### Task 2: Durable neutral persistence, idempotency, CAS, and RLS

Files: 000084_agent_runtime_rebuild.sql, agent-runtime.repository.ts/test.ts, agent-session.repository.ts.

- [ ] Write failing tests for tenant/session/project/flow ownership, duplicate idempotency keys, stale graph revision, pending decision recovery, event sequence, cross-tenant 404, and a fresh repository instance returning the same turn.
- [ ] Run npm test -- --run apps/api/src/modules/agent/runtime/agent-runtime.repository.test.ts. Expect FAIL.
- [ ] Extend existing 000024/000081/000082/000083 structures rather than creating agent_v7 tables. Add runtime_version, mode, phase, graph_revision to agent_sessions; runtime_version, prompt, pending_decision_json, execution_state to agent_turns. Add agent_decisions, agent_capability_refs, agent_result_groups, agent_result_refs, and agent_events with tenant_id, foreign keys, timestamps, replay seq, idempotency, source_refs, run_id, placed_node_id, and lineage.
- [ ] Use this SQL shape for the new decision/event constraints:

    CREATE UNIQUE INDEX idx_agent_decisions_tenant_idempotency
      ON agent_decisions(tenant_id, idempotency_key);
    CREATE UNIQUE INDEX idx_agent_turns_runtime_idempotency
      ON agent_turns(tenant_id, idempotency_key)
      WHERE runtime_version = 'runtime' AND idempotency_key IS NOT NULL;
    CREATE UNIQUE INDEX idx_agent_events_tenant_seq
      ON agent_events(tenant_id, session_id, seq);

  Enable and force RLS on every new table and add tenant select/insert/update/delete policies using app.current_tenant_id(). Preserve all legacy records.
- [ ] Implement createSession, getSession, listSessions, createTurnIdempotent, getTurn, saveTurnStateCAS, createDecisionIdempotent, getPendingDecision, appendEvent, listEvents, saveResultGroup, saveResultRef, and markResultPlacedCAS using withTenantTransaction. saveTurnStateCAS must use WHERE graph_revision = expectedGraphRevision and throw AGENT_GRAPH_REVISION_CONFLICT when no row updates.
- [ ] Run npm run build --workspace @aigc-flow/db and the repository tests. Expect PASS.
- [ ] Commit: feat: persist canonical agent runtime state.

---

### Task 3: Runtime understanding, questions, plan, and approval policy

Files: agent-runtime.service.ts, agent-runtime.policy.ts, their tests, and agent.service.ts ports.

- [ ] Write failing tests proving a normal prompt never enters the fixed child-toy flow. The golden prompt must return understanding and at most four questions for subject, first/last-frame change, ratio, and duration:

    const first = await runtime.submitTurn(ctx, sessionId, {
      prompt: "我要生成两张图，用来测试一个首尾帧视频的生成，需要一个首帧图片和一个尾帧图片，同时需要首尾帧视频的提示词",
      contextSnapshot: emptySnapshot, idempotencyKey: "golden-1"
    });
    expect(first.phase).toBe("waiting_for_input");
    expect(first.blocks.some((b) => b.type === "question_set")).toBe(true);

  Answer tests must produce two image deliverables plus one text prompt, model, quantity, credits, and write scope. Ask mode must create durable approval for paid/batch/canvas-write/skill/app actions. Missing pricing, model/route, permissions, or revision must fail closed without reserve/enqueue.
- [ ] Run service/policy tests. Expect FAIL.
- [ ] Define ports:

    type AgentRuntimeDependencies = {
      repository: AgentRuntimeRepository;
      planner: { understand(input: PlannerInput): Promise<PlannerOutput> };
      capabilityRegistry: CapabilityRegistry;
      pricing: { estimate(input: EstimateInput): Promise<PricingEstimate | null> };
      permissions: { can(ctx: AgentContext, permission: string): Promise<boolean> };
      execution: { reserveAndEnqueue(input: ExecutionInput): Promise<{ runId: string }> };
      context: { loadAuthoritativeSnapshot(ctx: AgentContext, input: AgentContextSnapshot): Promise<AgentContextSnapshot> };
    };

  evaluateApprovalPolicy must verify tenant/session/project/flow ownership, mode, model/route, active pricing, capability permissions, write scope, and graph revision before execution.
- [ ] Implement idle → understanding → waiting_for_input → planning → waiting_for_confirmation → executing → verifying → presenting_results/refining. The first/last-frame task runs two image capabilities in parallel, creates assets and one non-empty video prompt text result, and presents a video draft requiring a second approval. It never enqueues video on the first approval.
- [ ] Run focused tests. Expect PASS.
- [ ] Commit: feat: orchestrate canonical agent runtime.

---

### Task 4: Canonical routes and feature flags

Files: agent-runtime.routes.ts/test.ts, agent.routes.ts, agent.schemas.ts, env.ts, docker-compose.staging.yml.

- [ ] Write Fastify inject tests for POST /api/v2/agent/sessions, GET sessions/history/events, POST sessions/:sessionId/turns, POST sessions/:sessionId/turns/:turnId/decisions, PATCH sessions/:sessionId/mode, and POST sessions/:sessionId/cancel. Assert unauthenticated 401, cross-tenant 404, stale revision 409, and disabled behavior.
- [ ] Run the route tests. Expect FAIL.
- [ ] Register canonical paths. Reads use flow:read; execution decisions use flow:run; canvas placement uses flow:update. Recheck tenant, session, project, flow, turn, block, pending decision, permission, and revision inside Runtime.
- [ ] Add AGENT_RUNTIME_ENABLED and AGENT_RUNTIME_COMPAT_ENABLED. V5/V6 paths (/v5-turns, /v6-turns, /v5-mode and old streams) register only when compatibility is enabled. New sessions and new UI never call these paths. Strict bodies accept only stable nodeId, assetId, refId, skillId, appId, modelKey, graphRevision, answer, and typed result actions.
- [ ] Run route tests and npm run build --workspace @aigc-flow/api. Expect PASS.
- [ ] Commit: feat: expose canonical agent api.

---

### Task 5: Neutral frontend controller, replay reducer, and V5 removal

Files: new runtime reducer/API/hook/tests; CanvasAgentPanel.tsx, canvasAgentApi.ts, agentContextSnapshot.ts, V6 integration tests.

- [ ] Write failing tests asserting the default panel has no import/use of useAgentV5Session, listAgentV5Sessions, /v5-turns, /v6-turns, /v5-mode, or V5 decisions. Mock the canonical controller and assert capability, model, reference removal, rename, and decision callbacks are invoked. Assert live and replay produce identical state, duplicate seq is ignored, gaps set resyncRequired, and 409 becomes refresh-context.
- [ ] Run focused tests. Expect FAIL.
- [ ] Implement agentRuntimeApi.ts with only canonical paths. Implement useAgentRuntime.ts for create/load, history, SSE reconnect from replay cursor, turn/decision/mode/cancel. Context sends assetId/nodeId/refId only.
- [ ] Implement agentEventReducer.ts for session_created, turn_started, blocks_updated, decision_pending, progress_updated, result_group_ready, turn_completed, turn_failed, and graph_revision_conflict. Use the same reducer for live and replay.
- [ ] Replace the default CanvasAgentPanel V6 shell with AgentWorkspace/useAgentRuntime. Keep v6/workspace behind compatibility flag; the default import graph must contain no v5 API calls.
- [ ] Run frontend focused tests. Expect PASS.
- [ ] Commit: feat: make canonical runtime the default agent path.

---

### Task 6: AgentWorkspace UI, references, menus, and responsive layout

Files: AgentWorkspace.tsx, ConversationRenderer.tsx, ContextController.ts, tests, AiFlowCanvas.tsx, CanvasAgentButton.tsx, CanvasAgentComposer.tsx.

- [ ] Write UI tests for 1440x900 desktop width 460–520px, 390x844 full-screen drawer, fixed composer order (+, mode, input, model/thinking, send), no legacy Timeline/PlanCard/SkillBar/debug log, and real button callbacks.
- [ ] Implement Header, independent conversation scroll, fixed Composer, mobile drawer, and stage labels 理解中/等待补充/等待确认/执行中/校验中/展示结果/需要处理.
- [ ] Render only typed blocks. Ordinary text remains a message stream; question_set, plan, brief, confirmation, progress, result_group, and error_recovery render accessible controls. Use MenuSurface, MenuSelect, useDismissibleLayer, and shared 38px/12px/9px/30px menu tokens. Outside click, Escape, and mutually exclusive opening close menus.
- [ ] ContextController reads canvas store/revision and asset API, stores only assetId after upload, supports ref roles and @refId mentions, removes references from the submitted snapshot, and locks text model after first turn.
- [ ] Mount AgentWorkspace from AiFlowCanvas; UI never calls Worker, Billing, or graph mutation directly.
- [ ] Run AgentWorkspace, CanvasAgentPanel, and composer tests. Expect PASS.
- [ ] Commit: feat: build agent workspace interface.

---

### Task 7: Asset-first delivery, billing, and canvas lineage

Files: agent-runtime-delivery.ts/test.ts, runtime service, worker main, ConversationRenderer, AiFlowCanvas, canvasAgentOps.

- [ ] Write failing tests rejecting image/video without assetId, empty text, and incomplete workflow; refund/release exactly once; settle never on missing evidence; placement only after asset exists; lineage stores sourceRefs, sessionId, turnId, runId, placedNodeId.
- [ ] Implement and test:

    export function verifyAgentDelivery(result: {
      kind: "image" | "video" | "text"; assetId?: string | null;
      contentText?: string | null; workflowStatus?: string | null
    }) {
      if ((result.kind === "image" || result.kind === "video") && !result.assetId)
        throw new Error("AGENT_DELIVERY_ASSET_REQUIRED");
      if (result.kind === "text" && !result.contentText?.trim())
        throw new Error("AGENT_DELIVERY_TEXT_REQUIRED");
      if (result.workflowStatus && result.workflowStatus !== "completed")
        throw new Error("AGENT_DELIVERY_INCOMPLETE");
      return true;
    }

- [ ] Connect estimate → reserve → enqueue → observe → verify → settle/refund through existing ports and idempotency. Persist assets before result refs and use draft CAS for placement.
- [ ] Render preview, select, continue edit, variant, reference, and place actions. The first/last-frame result group has two image assets and one prompt text result; video requires a second confirmation.
- [ ] Run worker delivery tests and npm run build --workspace @aigc-flow/worker. Expect PASS.
- [ ] Commit: feat: close asset and canvas result loop.

---

### Task 8: Compatibility, restart recovery, deployment notes, and rollback

Files: agent routes/repository, CanvasAgentPanel/canvasAgentApi, env/compose, staging docs.

- [ ] Write tests for safe projection of old V5/V6 sessions, new sessions never calling old paths, fresh API instance recovering pending decisions/idempotency from PostgreSQL, missing event sequence returning resync-required, and flags preserving assets and ledger.
- [ ] Implement compatibility as read/projection layers. Remove AgentV6Orchestrator turnResults, decisionResults, and pendingByTurn Maps as authority; repository state decides duplicate turns, pending decisions, approval, execution, and replay.
- [ ] Add flags to x-tapflow-env and docs. Document Compose v2 rollback: stop worker, restore commit/image, run node packages/db/dist/cli.js, start Redis/API/worker/frontend, inspect ps/logs.
- [ ] Run compatibility, route, persistence, and integration tests. Expect PASS.
- [ ] Commit: feat: gate legacy agent adapters.

---

### Task 9: Golden E2E, full verification, browser acceptance, and records

Files: agent-golden-flow.test.tsx, agent-runtime.e2e.test.ts, PROJECT_RECORD.md, docs/CODEX_HANDOFF.md.

- [ ] Write the cross-layer golden test: prompt for first/last-frame images and video prompt; receive bounded questions; answer subject/change/ratio/duration; see model/quantity/cost/writes; approve; run two images in parallel; persist two assets and non-empty prompt text; show result group; do not run video.
- [ ] Assert exactly three new nodes are placed only after result actions and carry sessionId, turnId, runId, sourceRefs, and placedNodeId. A later “生成视频” action creates a second confirmation; without confirmation no reserve/enqueue occurs.
- [ ] Assert refresh/reopen restores blocks, phase, pending decision, progress, results, and canvas lineage. Assert stale revision 409 and replay gap resync.
- [ ] Run npm test -- --run src/flowCanvas/agent/runtime/agent-golden-flow.test.tsx apps/api/src/modules/agent/runtime/agent-runtime.e2e.test.ts.
- [ ] Run npm run build; npm test; npm run test --workspace @aigc-flow/api; npm run test --workspace @aigc-flow/worker; npm run test --workspace @aigc-flow/db; npm run test --workspace @aigc-flow/ai-gateway-core. Record independent legacy failures exactly.
- [ ] Perform real authenticated browser acceptance with Postgres, Redis, S3, Billing, AI route, Worker, and real login at 1440x900 and 390x844. Record screenshots, statuses, runIds, assetIds, revisions, recovery, and rollback flag without secrets or signed URLs.
- [ ] Update PROJECT_RECORD.md and docs/CODEX_HANDOFF.md with migration, routes, flags, tests, staging date, warnings, and rollback. Commit: docs: record agent workspace rebuild verification.

---

## Self-review

Spec coverage: Tasks 1/5 cover protocol, blocks, context, and replay; Tasks 2/8 cover tenant/RLS, persistence, idempotency, CAS, restart, and compatibility; Tasks 3/7 cover state machine, capability policy, pricing fail-closed, worker, billing, delivery, and lineage; Tasks 4/6 cover canonical routes, UI, menus, responsive layout, and permissions; Task 9 covers the golden flow, browser acceptance, and project record.

Placeholder scan: no TBD, TODO, later, fill in, appropriate, or unassigned step is used.

Type consistency: client and server share AgentPhase, AgentContextSnapshot, ConversationBlock, and AgentDecisionType semantics; repository methods used by Runtime are createTurnIdempotent, saveTurnStateCAS, createDecisionIdempotent, appendEvent, listEvents, saveResultRef, and markResultPlacedCAS.
