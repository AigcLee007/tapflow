# TapNow Agent V6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax and must be completed in order.

**Goal:** Replace the current V5 Agent surface with a TapNow-grade Agent V6 workspace, unified conversation protocol, server-side orchestration policy, result loop, and authenticated staging acceptance while reusing V2 infrastructure.

**Architecture:** V6 introduces clean frontend boundaries for workspace, protocol, capabilities, orchestration, results, and replay. Existing auth, projects/flows, assets, Billing, Workflow/Worker, Redis/S3, AI Gateway, and tenant/RLS boundaries remain authoritative and are accessed through typed adapters.

**Tech Stack:** React, TypeScript, Vite, `@xyflow/react`, Vitest, Testing Library, Fastify, PostgreSQL migrations/RLS, Redis/BullMQ, existing V2 HTTP clients.

---

## File map and migration boundary

Create:

- `src/flowCanvas/agent/v6/` for all V6 frontend code.
- `apps/api/src/modules/agent/v6/` for V6 protocol, orchestration, policy, and replay adapters.
- Focused V6 tests beside each unit and API tests under `apps/api/test/`.

Modify:

- `src/flowCanvas/agent/CanvasAgentPanel.tsx` to make V6 the only default Agent path.
- `src/flowCanvas/agent/CanvasAgentWorkspaceShell.tsx` only where the old shell owns sizing or portals.
- `src/flowCanvas/flowCanvas.css` to add V6 tokens and remove V5-only visual assumptions.
- Existing V2 Agent/asset/workflow/billing adapters only through typed compatibility wrappers.
- `PROJECT_RECORD.md` and staging/local runbooks after verified milestones.

Do not modify as part of this plan:

- Provider credential storage or frontend-visible provider fields.
- Asset authority, billing ledger semantics, Workflow Worker execution primitives, or AI Gateway provider adapters.
- Legacy routes as a primary product path.

### Task 1: Lock V6 contracts and state transitions

**Files:**
- Create: `src/flowCanvas/agent/v6/protocol/conversationTypes.ts`
- Create: `src/flowCanvas/agent/v6/protocol/conversationReducer.ts`
- Create: `src/flowCanvas/agent/v6/protocol/blockNormalizer.ts`
- Test: `src/flowCanvas/agent/v6/protocol/conversationReducer.test.ts`
- Test: `src/flowCanvas/agent/v6/protocol/blockNormalizer.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
it("keeps an ambiguous prompt in choice state", () => {
  const state = reduceConversation(initialConversationState(), {
    type: "turn_submitted", prompt: "设计一个儿童陪伴玩具"
  });
  expect(state.phase).toBe("understanding");
  const next = reduceConversation(state, { type: "choice_requested", id: "direction" });
  expect(next.phase).toBe("waiting_for_choice");
});

it("requires confirmation for paid canvas writes", () => {
  const state = reduceConversation(initialConversationState(), {
    type: "brief_ready", plan: { costCredits: 12, writesCanvas: true }
  });
  expect(state.phase).toBe("waiting_for_confirmation");
  expect(canExecuteDecision(state, { type: "execute" })).toBe(false);
});

it("drops provider and HTML fields from blocks", () => {
  expect(normalizeBlocks([{ type: "heading", level: 2, text: "方案", provider: "x", html: "<script/>" }]))
    .toEqual([{ type: "heading", level: 2, text: "方案" }]);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npx vitest run src/flowCanvas/agent/v6/protocol/conversationReducer.test.ts src/flowCanvas/agent/v6/protocol/blockNormalizer.test.ts`
Expected: FAIL because V6 contracts do not exist.

- [ ] **Step 3: Implement the contracts**

Define `AgentV6Phase`, `AgentExecutionMode`, `ConversationBlock`, `AgentContextSnapshot`, `AgentDecision`, `ProgressStep`, `ResultRef`, and `ConversationState`. Implement transitions `idle → understanding → waiting_for_choice → drafting_brief → waiting_for_confirmation → executing → verifying → presenting_results → refining`, with `failed` reachable from active phases. Normalize only allowlisted fields and cap text/list/table lengths.

- [ ] **Step 4: Run focused tests**

Run the command from Step 2. Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/flowCanvas/agent/v6/protocol
git commit -m "feat: define agent v6 conversation contracts"
```

### Task 2: Build V6 block renderers

**Files:**
- Create: `src/flowCanvas/agent/v6/protocol/ConversationStream.tsx`
- Create: `src/flowCanvas/agent/v6/protocol/BlockRenderer.tsx`
- Create: `src/flowCanvas/agent/v6/protocol/blockRenderers/UnderstandingBlock.tsx`
- Create: `src/flowCanvas/agent/v6/protocol/blockRenderers/QuestionBlock.tsx`
- Create: `src/flowCanvas/agent/v6/protocol/blockRenderers/ChoiceGridBlock.tsx`
- Create: `src/flowCanvas/agent/v6/protocol/blockRenderers/ComparisonBlock.tsx`
- Create: `src/flowCanvas/agent/v6/protocol/blockRenderers/BriefBlock.tsx`
- Create: `src/flowCanvas/agent/v6/protocol/blockRenderers/ConfirmationBlock.tsx`
- Create: `src/flowCanvas/agent/v6/protocol/blockRenderers/ProgressBlock.tsx`
- Create: `src/flowCanvas/agent/v6/protocol/blockRenderers/ResultGroupBlock.tsx`
- Test: `src/flowCanvas/agent/v6/protocol/ConversationStream.test.tsx`

- [ ] **Step 1: Write renderer tests**

Test headings, ordinary paragraphs, choice selection, editable Brief, confirmation cost/range, progress status, result actions, and the rule that renderers emit callbacks but never call APIs.

- [ ] **Step 2: Run focused test and verify failure**

Run: `npx vitest run src/flowCanvas/agent/v6/protocol/ConversationStream.test.tsx`.
Expected: FAIL because V6 renderers do not exist.

- [ ] **Step 3: Implement renderers**

Keep ordinary text outside cards. Give each interactive block its own semantic class and action contract. Brief actions must be `edit_brief`, `submit_brief`, and `revise_brief`; confirmation actions must be `confirm_execution` and `revise_plan`; result actions must include `select_result`, `refine_result`, `variant_result`, `set_reference`, and `place_result`.

- [ ] **Step 4: Add visual regression assertions**

Assert no renderer uses the legacy Timeline, PlanCard, SkillBar, old Composer, raw HTML, or provider fields. Assert table overflow, keyboard focus, disabled/selected states, and accessible names.

- [ ] **Step 5: Run and commit**

Run the focused test command. Expected: PASS.

```bash
git add src/flowCanvas/agent/v6/protocol
git commit -m "feat: add agent v6 structured block renderers"
```

### Task 3: Implement the V6 workspace shell

**Files:**
- Create: `src/flowCanvas/agent/v6/workspace/AgentWorkspace.tsx`
- Create: `src/flowCanvas/agent/v6/workspace/AgentHeader.tsx`
- Create: `src/flowCanvas/agent/v6/workspace/AgentComposer.tsx`
- Create: `src/flowCanvas/agent/v6/workspace/AgentHistory.tsx`
- Create: `src/flowCanvas/agent/v6/workspace/AgentReferenceChips.tsx`
- Create: `src/flowCanvas/agent/v6/workspace/AgentCapabilityMenu.tsx`
- Modify: `src/flowCanvas/flowCanvas.css`
- Test: `src/flowCanvas/agent/v6/workspace/AgentWorkspace.test.tsx`

- [ ] **Step 1: Write shell tests**

Cover fixed right panel, new conversation, rename title, history open/close, collapse, responsive class, Composer order `+ → mode → input → model → send`, blank-send disabled, busy cancel, reference chips, and absence of legacy controls.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/flowCanvas/agent/v6/workspace/AgentWorkspace.test.tsx`.
Expected: FAIL because the V6 workspace does not exist.

- [ ] **Step 3: Implement the shell**

Keep UI state local to the shell only for popover visibility and draft text. Receive session state and callbacks from the controller. Use `MenuSurface`, `MenuSelect`, `useDismissibleLayer`, and shared menu tokens. Do not import V5 or legacy first-level components.

- [ ] **Step 4: Implement visual tokens**

Add V6 layout, message, Composer, block-state, focus, reduced-motion, narrow-screen, and error-recovery styles. Remove duplicated V5 menu sizes only where they conflict with shared tokens; do not change unrelated canvas styles.

- [ ] **Step 5: Run and commit**

Run the focused test. Expected: PASS.

```bash
git add src/flowCanvas/agent/v6/workspace src/flowCanvas/flowCanvas.css
git commit -m "feat: add agent v6 workspace shell"
```

### Task 4: Add capability and reference controllers

**Files:**
- Create: `src/flowCanvas/agent/v6/capabilities/CanvasReferenceController.ts`
- Create: `src/flowCanvas/agent/v6/capabilities/AttachmentController.ts`
- Create: `src/flowCanvas/agent/v6/capabilities/SkillController.ts`
- Create: `src/flowCanvas/agent/v6/capabilities/AppController.ts`
- Create: `src/flowCanvas/agent/v6/capabilities/ModelController.ts`
- Test: `src/flowCanvas/agent/v6/capabilities/capabilities.test.ts`

- [ ] **Step 1: Write tests**

Verify selected nodes become `{ nodeId, assetId, refId, label }`, uploads return stable asset IDs, references are capped by `AGENT_REFERENCE_LIMIT`, models expose product labels only, Skill/App metadata is safe, and raw credentials/signed URLs never reach rendered state.

- [ ] **Step 2: Implement adapters**

Reuse the existing authenticated asset, Skill, AI catalog, and canvas reference clients. Return only V6-safe types. Persist no browser-local authoritative data.

- [ ] **Step 3: Run and commit**

Run: `npx vitest run src/flowCanvas/agent/v6/capabilities/capabilities.test.ts`.
Expected: PASS.

```bash
git add src/flowCanvas/agent/v6/capabilities
git commit -m "feat: connect agent v6 capabilities"
```

### Task 5: Implement session, turn, and replay controllers

**Files:**
- Create: `src/flowCanvas/agent/v6/orchestration/AgentSessionController.ts`
- Create: `src/flowCanvas/agent/v6/orchestration/AgentTurnController.ts`
- Create: `src/flowCanvas/agent/v6/replay/ReplayController.ts`
- Create: `src/flowCanvas/agent/v6/replay/ReplayState.ts`
- Create: `src/flowCanvas/agent/v6/orchestration/agentV6Api.ts`
- Test: `src/flowCanvas/agent/v6/orchestration/AgentTurnController.test.ts`
- Test: `src/flowCanvas/agent/v6/replay/ReplayController.test.ts`

- [ ] **Step 1: Write failing controller tests**

Verify submit, decision, confirmation, mode persistence, cancel, new session, open history, live event projection, and replay projection all produce identical `ConversationState`.

- [ ] **Step 2: Implement typed API adapter**

Use `v2HttpClient`. Expose `createSession`, `listSessions`, `getSession`, `submitTurn`, `submitDecision`, `confirmExecution`, `setMode`, and `cancelTurn`. Every request includes project/flow scope and current graph revision.

- [ ] **Step 3: Implement shared event projection**

Route server responses and durable events through `normalizeBlocks` and `reduceConversation`; never maintain a second replay-specific state shape.

- [ ] **Step 4: Run and commit**

Run both focused tests. Expected: PASS.

```bash
git add src/flowCanvas/agent/v6/orchestration src/flowCanvas/agent/v6/replay
git commit -m "feat: add agent v6 session and replay controllers"
```

### Task 6: Implement server V6 protocol and orchestrator

**Files:**
- Create: `apps/api/src/modules/agent/v6/agent-v6-schemas.ts`
- Create: `apps/api/src/modules/agent/v6/agent-v6-orchestrator.ts`
- Create: `apps/api/src/modules/agent/v6/agent-v6-policy.ts`
- Create: `apps/api/src/modules/agent/v6/agent-v6-replay.ts`
- Modify: `apps/api/src/modules/agent/agent.routes.ts`
- Test: `apps/api/test/agent-v6-orchestrator.test.ts`

- [ ] **Step 1: Write API tests**

Cover ambiguous prompt → `waiting_for_choice`, selected choices → Brief, unconfirmed paid write → no reserve, confirmed execution → reserve, stale revision → `409`, duplicate idempotency key → one execution, and unsafe fields absent from response.

- [ ] **Step 2: Implement schemas and routes**

Validate authenticated tenant/session/project/flow ownership. Return the V6 response shape defined in the design. Persist decisions and idempotency keys through existing DB patterns.

- [ ] **Step 3: Implement orchestrator and policy**

Implement `observe → understand → ask → brief → confirm → execute → verify → present → refine`. Delegate actual generation and billing to existing services; V6 only decides when and how they may be called.

- [ ] **Step 4: Implement replay projection**

Persist and reconstruct blocks, phase, mode, context, decisions, progress, and result groups without exposing provider internals.

- [ ] **Step 5: Run API tests/build and commit**

Run: `npm run test --workspace @aigc-flow/api -- agent-v6-orchestrator` and `npm run build --workspace @aigc-flow/api`.
Expected: focused tests PASS; any unrelated existing build failure must be recorded exactly.

```bash
git add apps/api/src/modules/agent/v6 apps/api/src/modules/agent/agent.routes.ts apps/api/test/agent-v6-orchestrator.test.ts
git commit -m "feat: add agent v6 server orchestration"
```

### Task 7: Add durable V6 fields and result persistence

**Files:**
- Create: `packages/db/migrations/000080_agent_v6_conversation.sql`
- Modify: `apps/api/src/modules/agent/agent-session.repository.ts`
- Modify: `apps/api/src/modules/agent/agent.service.ts`
- Modify: `apps/api/src/modules/agent/agent-event.service.ts`
- Create: `apps/api/test/agent-v6-persistence.test.ts`

- [ ] **Step 1: Inspect existing schema and write migration tests**

Confirm whether existing V5 columns/tables can be extended. Tests must verify tenant ID, indexes, RLS, graph revision, decision idempotency, progress, capability refs, result refs, and replay rows.

- [ ] **Step 2: Implement the smallest compatible migration**

Extend existing tenant-scoped tables where possible. Add only missing fields/tables, use idempotent SQL, preserve stable route/session IDs, and follow the existing tenant-context RLS pattern.

- [ ] **Step 3: Implement repository methods**

Add transaction-safe methods for session snapshots, decisions, progress transitions, result selection, placement records, and replay loading. Do not store base64/blob/data URLs or secrets.

- [ ] **Step 4: Run DB/API persistence tests and commit**

Run: `npm run test --workspace @aigc-flow/db -- agent-v6` and `npm run test --workspace @aigc-flow/api -- agent-v6-persistence`.
Expected: PASS when `DATABASE_URL` is available; otherwise record the exact infrastructure skip.

```bash
git add packages/db apps/api/test/agent-v6-persistence.test.ts apps/api/src/modules/agent
git commit -m "feat: persist agent v6 conversation state"
```

### Task 8: Connect execution, delivery verification, and results

**Files:**
- Create: `src/flowCanvas/agent/v6/results/ResultGroupController.ts`
- Create: `src/flowCanvas/agent/v6/results/ResultActions.ts`
- Create: `src/flowCanvas/agent/v6/results/CanvasPlacementController.ts`
- Modify: `apps/worker/src/workflow-runtime/service.ts`
- Modify: existing billing/workflow adapters only where V6 metadata is required
- Test: `src/flowCanvas/agent/v6/results/ResultGroupController.test.ts`
- Test: `apps/worker/test/agent-v6-delivery.test.ts`

- [ ] **Step 1: Write tests**

Cover result selection, preview, refine, variant, set-reference, place-on-canvas, delivery failure, cancellation, retry, asset ID-only persistence, and exactly-once settlement/refund.

- [ ] **Step 2: Implement result controller**

Use existing asset placement APIs. Attach session ID, turn ID, and graph revision to every action. Return user-safe status and placement feedback.

- [ ] **Step 3: Implement worker delivery checks**

Require real text output or asset IDs before terminal success. Synchronize progress and terminal states durably; failed delivery must trigger the existing refund/release path.

- [ ] **Step 4: Run focused tests and commit**

Run: `npx vitest run src/flowCanvas/agent/v6/results/ResultGroupController.test.ts apps/worker/test/agent-v6-delivery.test.ts`.
Expected: PASS.

```bash
git add src/flowCanvas/agent/v6/results apps/worker/src/workflow-runtime/service.ts
git commit -m "feat: close agent v6 result and delivery loop"
```

### Task 9: Make V6 the only default Agent entry

**Files:**
- Modify: `src/flowCanvas/agent/CanvasAgentPanel.tsx`
- Modify: `src/flowCanvas/agent/CanvasAgentWorkspaceShell.tsx`
- Create: `src/flowCanvas/agent/v6/V6PanelIntegration.test.tsx`

- [ ] **Step 1: Write integration test**

Assert default chat renders `AgentWorkspace`, and querying for legacy timeline, legacy Composer, PlanCard, SkillBar, usage statistics, and V5 window returns null.

- [ ] **Step 2: Replace the default branch**

Wire V6 controllers into `AgentWorkspace`. Retain old components only behind explicit logs/debug compatibility routes. Preserve close, session focus, server draft applied, canvas placement, and project/flow scope.

- [ ] **Step 3: Run focused integration tests and commit**

Run: `npx vitest run src/flowCanvas/agent/v6/V6PanelIntegration.test.tsx src/flowCanvas/agent/CanvasAgentPanel.test.tsx`.
Expected: PASS.

```bash
git add src/flowCanvas/agent/CanvasAgentPanel.tsx src/flowCanvas/agent/CanvasAgentWorkspaceShell.tsx src/flowCanvas/agent/v6/V6PanelIntegration.test.tsx
git commit -m "feat: make agent v6 the default canvas agent"
```

### Task 10: Full validation, staging acceptance, and documentation

**Files:**
- Modify: `PROJECT_RECORD.md`
- Modify: `docs/v2-local-development.md`
- Modify: `docs/staging-runbook.md`
- Modify: `docs/PRODUCTION_RUNBOOK.md`
- Modify: `docs/STAGING_ENV_TEMPLATE.md` only if a V6 flag is introduced

- [ ] **Step 1: Run focused validation**

```bash
npx vitest run src/flowCanvas/agent/v6 src/flowCanvas/agent/agentReplayState.test.ts
npm run test --workspace @aigc-flow/api -- agent-v6
npm run test --workspace @aigc-flow/worker -- workflow-runtime
npm run test --workspace @aigc-flow/db
```

Expected: V6-focused tests pass; known unrelated failures are recorded with exact output.

- [ ] **Step 2: Run package build**

Run: `npm run build`.
Expected: PASS, or document the exact pre-existing failure without claiming success.

- [ ] **Step 3: Run authenticated staging browser acceptance**

Execute the complete flow: new session, node selection, upload, Skill/App, model, mode, ambiguous prompt, choices, comparison, editable Brief, confirmation, progress, result actions, history, refresh replay, stale revision, failure refund, and cancellation.

- [ ] **Step 4: Verify deployment safety**

Keep V6 runtime disabled outside staging. Use Docker Compose v2 migration order from `AGENTS.md`: pull, build, stop worker, run `node packages/db/dist/cli.js`, start Redis/API/Worker/frontend, inspect status/logs.

- [ ] **Step 5: Update project record and commit documentation**

Record test counts, staging environment, acceptance result, remaining warnings, flag name, and rollback procedure in `PROJECT_RECORD.md` and the runbooks.

```bash
git add PROJECT_RECORD.md docs/v2-local-development.md docs/staging-runbook.md docs/PRODUCTION_RUNBOOK.md docs/STAGING_ENV_TEMPLATE.md
git commit -m "docs: record agent v6 rollout validation"
```

## Definition of done

- V6 is the only default Agent UI path.
- The complete TapNow-style conversation and result loop works in an authenticated browser.
- All paid, batch, Skill/App, and canvas-writing actions obey server-side confirmation policy.
- Live and replay state are identical.
- Assets, billing, graph revisions, and secrets retain their existing safety boundaries.
- `npm run build` and relevant tests pass or have exact documented infrastructure/pre-existing failures.
- Staging acceptance passes before any non-staging V6 rollout.
