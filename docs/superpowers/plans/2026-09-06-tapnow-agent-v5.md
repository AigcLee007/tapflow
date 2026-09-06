# TapNow-style Canvas Agent V5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current mixed Agent panel with a TapNow-style right-side conversational workspace whose structured output, decisions, execution policy, capabilities, persistence, and result loop are consistent from first message through replay.

**Architecture:** Keep the existing authenticated canvas, session, workflow, billing, asset, Skill, and AI Gateway boundaries, but introduce one V5 conversation protocol and one turn orchestrator adapter above them. The V5 window becomes the only first-level Agent UI; old timeline/Composer/Plan/Skill components remain available only through compatibility or secondary debug surfaces.

**Tech Stack:** React + TypeScript + Vite, Vitest/Testing Library, Fastify API, PostgreSQL migrations/RLS, Redis/BullMQ, existing asset and billing services, `@xyflow/react` canvas.

---

## File map and migration boundary

Create the isolated V5 UI and protocol under `src/flowCanvas/agent/v5/`. Keep current API clients and runtime adapters, but route them through V5 action contracts. The main files are:

- Create `src/flowCanvas/agent/v5/agentV5Types.ts`: block, decision, phase, mode, context, capability, progress, and result contracts.
- Create `src/flowCanvas/agent/v5/agentV5State.ts`: pure reducer and execution policy gate.
- Create `src/flowCanvas/agent/v5/agentV5Blocks.ts`: safe normalization and legacy-message projection.
- Create `src/flowCanvas/agent/v5/AgentWindow.tsx`: right-side shell and one first-level information architecture.
- Create `src/flowCanvas/agent/v5/AgentHeader.tsx`, `AgentHistoryDrawer.tsx`, `AgentAttachmentMenu.tsx`, `AgentModelPicker.tsx`, `AgentModeSwitch.tsx`, `AgentComposer.tsx`.
- Create `src/flowCanvas/agent/v5/AgentConversationStream.tsx` and block renderers for text, choices, tables, Brief, Skill/App, confirmation, progress, and results.
- Create `src/flowCanvas/agent/v5/useAgentV5Session.ts`: one adapter over `useCanvasAgentSessionV2` and history replay.
- Modify `src/flowCanvas/agent/CanvasAgentPanel.tsx`: render only `AgentWindow` on the default chat path; retain legacy views behind secondary logs/history actions.
- Modify `src/flowCanvas/agent/CanvasAgentWorkspaceShell.tsx` or remove its first-level use: it must not render old toolbar/timeline/Composer together with V5.
- Modify `src/flowCanvas/agent/canvasAgentApi.ts`: typed V5 turn/decision/history/capability calls while reusing authenticated HTTP helpers.
- Modify `src/flowCanvas/flowCanvas.css`: V5 window, Composer, cards, table, drawer, responsive and reduced-motion tokens.
- Modify `apps/api/src/modules/agent/*`: normalize V5 turn responses, decisions, mode policy, context snapshots, and result groups.
- Modify `packages/db/migrations/*` only for missing durable V5 fields; every new field/table is tenant-scoped and RLS-protected.
- Update `PROJECT_RECORD.md` and staging/local runbooks after verified milestones.

### Task 1: Lock the V5 domain contracts with failing tests

**Files:**
- Create: `src/flowCanvas/agent/v5/agentV5Types.ts`
- Create: `src/flowCanvas/agent/v5/agentV5State.test.ts`
- Create: `src/flowCanvas/agent/v5/agentV5Blocks.test.ts`

- [ ] **Step 1: Write the failing type/state tests**

```ts
it("keeps an ambiguous first request in asking instead of executing", () => {
  const state = reduceAgentV5State(initialAgentV5State(), {
    type: "user_submitted",
    prompt: "根据这张小黄人图片设计儿童陪伴玩具",
  });
  expect(state.phase).toBe("understanding");
  const next = reduceAgentV5State(state, {
    type: "agent_asked_question",
    questionId: "direction",
  });
  expect(next.phase).toBe("waiting_for_choice");
});

it("requires confirmation before a paid or canvas-writing decision", () => {
  const state = reduceAgentV5State(initialAgentV5State(), {
    type: "brief_ready",
    plan: { costCredits: 12, writesCanvas: true, batch: false },
  });
  expect(state.phase).toBe("waiting_for_confirmation");
  expect(canExecuteAgentDecision({ type: "execute" }, state)).toBe(false);
});
```

- [ ] **Step 2: Write the failing block normalization tests**

```ts
it("normalizes structured blocks and rejects unsafe provider fields", () => {
  const blocks = normalizeAgentV5Blocks([{
    type: "heading",
    level: 2,
    text: "方案比较",
    provider: "secret-provider",
    html: "<script>bad</script>",
  }]);
  expect(blocks).toEqual([{ type: "heading", level: 2, text: "方案比较" }]);
});
```

- [ ] **Step 3: Run the focused tests and verify they fail for missing contracts**

Run: `npx vitest run src/flowCanvas/agent/v5/agentV5State.test.ts src/flowCanvas/agent/v5/agentV5Blocks.test.ts`

Expected: FAIL because the V5 contracts and reducer do not exist.

- [ ] **Step 4: Implement the minimal contracts and reducer**

Define `AgentV5Phase`, `AgentExecutionMode`, `ConversationBlock`, `AgentDecision`, `AgentV5State`, `AgentContextSnapshot`, `CapabilitySummary`, `ProgressStep`, and `ResultRef`. Define the reducer transitions `idle → understanding → waiting_for_choice → drafting_brief → waiting_for_confirmation → executing → presenting_results → refining`, with `failed` reachable from active states. Define `canExecuteAgentDecision` so paid, batch, canvas-writing, Skill, and App decisions require a confirmed state unless the mode policy explicitly permits them.

- [ ] **Step 5: Run the focused tests and commit**

Run: `npx vitest run src/flowCanvas/agent/v5/agentV5State.test.ts src/flowCanvas/agent/v5/agentV5Blocks.test.ts`

Expected: PASS with the new tests green.

```bash
git add src/flowCanvas/agent/v5/agentV5Types.ts src/flowCanvas/agent/v5/agentV5State.ts src/flowCanvas/agent/v5/agentV5State.test.ts src/flowCanvas/agent/v5/agentV5Blocks.ts src/flowCanvas/agent/v5/agentV5Blocks.test.ts
git commit -m "feat: define agent v5 conversation protocol"
```

### Task 2: Implement the structured block renderer

**Files:**
- Create: `src/flowCanvas/agent/v5/AgentConversationStream.tsx`
- Create: `src/flowCanvas/agent/v5/AgentBlockRenderer.tsx`
- Create: `src/flowCanvas/agent/v5/AgentTextBlocks.tsx`
- Create: `src/flowCanvas/agent/v5/AgentQuestionBlock.tsx`
- Create: `src/flowCanvas/agent/v5/AgentComparisonBlock.tsx`
- Create: `src/flowCanvas/agent/v5/AgentBriefBlock.tsx`
- Create: `src/flowCanvas/agent/v5/AgentCapabilityBlock.tsx`
- Create: `src/flowCanvas/agent/v5/AgentConfirmationBlock.tsx`
- Create: `src/flowCanvas/agent/v5/AgentProgressBlock.tsx`
- Create: `src/flowCanvas/agent/v5/AgentResultGroup.tsx`
- Create: `src/flowCanvas/agent/v5/AgentConversationStream.test.tsx`
- Modify: `src/flowCanvas/flowCanvas.css`

- [ ] **Step 1: Write failing renderer tests**

```tsx
it("renders headings, lists, tables, choices, Brief, confirmation, progress and results as separate blocks", () => {
  render(<AgentConversationStream blocks={fixtureBlocks} onAction={vi.fn()} />);
  expect(screen.getByRole("heading", { name: "我对你的需求理解" })).toBeTruthy();
  expect(screen.getByRole("table")).toBeTruthy();
  expect(screen.getByRole("button", { name: "陪伴与情绪安抚" })).toBeTruthy();
  expect(screen.getByText("共创 Brief")).toBeTruthy();
  expect(screen.getByText("预计消耗：12 积分")).toBeTruthy();
  expect(screen.getByText("正在执行儿童产品概念设计")).toBeTruthy();
});

it("supports choice and result actions without calling an API inside the renderer", () => {
  const onAction = vi.fn();
  render(<AgentConversationStream blocks={fixtureBlocks} onAction={onAction} />);
  fireEvent.click(screen.getByRole("button", { name: "陪伴与情绪安抚" }));
  expect(onAction).toHaveBeenCalledWith({ type: "select_choice", blockId: "direction", optionId: "comfort" });
});
```

- [ ] **Step 2: Run the tests and verify the expected missing-module failure**

Run: `npx vitest run src/flowCanvas/agent/v5/AgentConversationStream.test.tsx`

Expected: FAIL because V5 block renderers do not exist.

- [ ] **Step 3: Implement renderers with safe, deterministic layout**

Render semantic headings, lists, quoted text, comparison tables with horizontal overflow, choice cards with selected/disabled states, editable Brief fields, capability cards without secrets, confirmation cost/plan, progress steps, and result groups with action callbacks. Unknown blocks render a bounded fallback paragraph. Do not render raw HTML or provider fields.

- [ ] **Step 4: Add responsive and visual-density CSS**

Add `.agent-v5-*` styles to `src/flowCanvas/flowCanvas.css`: right drawer spacing, 12–14px body text, 18–20px card titles, rounded cards, semantic accent colors, fixed Composer dock, table overflow, drawer overlay, narrow-screen full-width layout, focus rings, and reduced-motion behavior. Reuse existing menu token values for menus and popovers.

- [ ] **Step 5: Run focused renderer tests and commit**

Run: `npx vitest run src/flowCanvas/agent/v5/AgentConversationStream.test.tsx`

Expected: PASS.

```bash
git add src/flowCanvas/agent/v5 src/flowCanvas/flowCanvas.css
git commit -m "feat: render TapNow-style agent conversation blocks"
```

### Task 3: Build the V5 right-side window shell and Composer

**Files:**
- Create: `src/flowCanvas/agent/v5/AgentWindow.tsx`
- Create: `src/flowCanvas/agent/v5/AgentHeader.tsx`
- Create: `src/flowCanvas/agent/v5/AgentHistoryDrawer.tsx`
- Create: `src/flowCanvas/agent/v5/AgentAttachmentMenu.tsx`
- Create: `src/flowCanvas/agent/v5/AgentModelPicker.tsx`
- Create: `src/flowCanvas/agent/v5/AgentModeSwitch.tsx`
- Create: `src/flowCanvas/agent/v5/AgentComposer.tsx`
- Create: `src/flowCanvas/agent/v5/AgentWindow.test.tsx`

- [ ] **Step 1: Write failing shell interaction tests**

```tsx
it("renders the TapNow window controls and fixed bottom composer", () => {
  render(<AgentWindow {...fixtureProps} />);
  expect(screen.getByRole("button", { name: "新建对话" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "聊天记录" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "收起 Agent" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "添加附件" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "语音输入" })).toBeNull();
  expect(screen.queryByText("用量统计")).toBeNull();
});

it("opens history and attachment menus from the window", () => {
  render(<AgentWindow {...fixtureProps} />);
  fireEvent.click(screen.getByRole("button", { name: "聊天记录" }));
  expect(screen.getByText("新建对话")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "添加附件" }));
  expect(screen.getByText("从画布选择")).toBeTruthy();
  expect(screen.getByText("上传附件")).toBeTruthy();
  expect(screen.getByText("Skill")).toBeTruthy();
  expect(screen.getByText("App")).toBeTruthy();
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npx vitest run src/flowCanvas/agent/v5/AgentWindow.test.tsx`

Expected: FAIL because the V5 shell does not exist.

- [ ] **Step 3: Implement the shell without legacy children**

`AgentWindow` owns header, stream, history drawer, attachment menu, model picker, mode switch, and Composer. It receives `blocks`, `phase`, `mode`, `models`, `sessionTitle`, and callbacks; it must not import or render `CanvasAgentTimeline`, `CanvasAgentPlanCard`, `CanvasAgentSkillBar`, or the old Composer.

- [ ] **Step 4: Implement Composer order and behavior**

Use the fixed order `+ → mode → text input → model picker → send`. `+` opens a menu upward. Mode switch exposes only `Agent 自动执行` and `用户确认`. Text model picker displays product model names only. Sending a blank message is disabled; busy phases disable input while preserving history and a cancel action where supported.

- [ ] **Step 5: Run shell tests and commit**

Run: `npx vitest run src/flowCanvas/agent/v5/AgentWindow.test.tsx`

Expected: PASS.

```bash
git add src/flowCanvas/agent/v5/AgentWindow.tsx src/flowCanvas/agent/v5/AgentHeader.tsx src/flowCanvas/agent/v5/AgentHistoryDrawer.tsx src/flowCanvas/agent/v5/AgentAttachmentMenu.tsx src/flowCanvas/agent/v5/AgentModelPicker.tsx src/flowCanvas/agent/v5/AgentModeSwitch.tsx src/flowCanvas/agent/v5/AgentComposer.tsx src/flowCanvas/agent/v5/AgentWindow.test.tsx
git commit -m "feat: add TapNow-style agent window shell"
```

### Task 4: Add durable V5 session adapter and action contracts

**Files:**
- Create: `src/flowCanvas/agent/v5/agentV5Api.ts`
- Create: `src/flowCanvas/agent/v5/useAgentV5Session.ts`
- Create: `src/flowCanvas/agent/v5/useAgentV5Session.test.tsx`
- Modify: `src/flowCanvas/agent/canvasAgentApi.ts`

- [ ] **Step 1: Write failing adapter tests**

```tsx
it("maps live and replay events to the same blocks and phase", async () => {
  const { result } = renderHook(() => useAgentV5Session({ projectId: "p1", flowId: "f1" }));
  await act(() => result.current.submitText("设计儿童陪伴玩具"));
  expect(result.current.phase).toBe("waiting_for_choice");
  expect(result.current.blocks.some((block) => block.type === "choice_grid")).toBe(true);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npx vitest run src/flowCanvas/agent/v5/useAgentV5Session.test.tsx`

Expected: FAIL because V5 adapter methods are missing.

- [ ] **Step 3: Implement typed API methods**

Add `submitAgentV5Turn`, `submitAgentV5Decision`, `confirmAgentV5Plan`, `listAgentV5Sessions`, `getAgentV5Session`, and `setAgentV5Mode` using the existing authenticated `v2HttpClient`. Responses must include `{ sessionId, turnId, phase, blocks, contextSnapshot, executionState }`.

- [ ] **Step 4: Implement live/replay projection**

Adapt `useCanvasAgentSessionV2` events and durable history events through the same `normalizeAgentV5Blocks` and `reduceAgentV5State`. The adapter owns session title, mode, phase, blocks, pending decision, progress, result group, error, and reset/new-session behavior.

- [ ] **Step 5: Run adapter tests and commit**

Run: `npx vitest run src/flowCanvas/agent/v5/useAgentV5Session.test.tsx src/flowCanvas/agent/agentReplayState.test.ts`

Expected: PASS for V5 adapter and existing replay regression coverage.

```bash
git add src/flowCanvas/agent/v5/agentV5Api.ts src/flowCanvas/agent/v5/useAgentV5Session.ts src/flowCanvas/agent/v5/useAgentV5Session.test.tsx src/flowCanvas/agent/canvasAgentApi.ts
git commit -m "feat: adapt agent sessions to v5 blocks and phases"
```

### Task 5: Connect attachments, Skill, App, model and mode selection

**Files:**
- Modify: `src/flowCanvas/agent/v5/AgentAttachmentMenu.tsx`
- Modify: `src/flowCanvas/agent/v5/AgentModelPicker.tsx`
- Modify: `src/flowCanvas/agent/v5/AgentModeSwitch.tsx`
- Modify: `src/flowCanvas/agent/v5/useAgentV5Session.ts`
- Create: `src/flowCanvas/agent/v5/AgentCapabilities.test.tsx`
- Modify: `src/flowCanvas/agent/agentReferenceContext.ts`
- Reuse: `src/flowCanvas/agent/CanvasAgentSkillPicker.tsx`, Skill API and asset upload API through typed wrappers

- [ ] **Step 1: Write failing capability tests**

```tsx
it("adds selected canvas nodes and uploaded asset ids to the next turn context", async () => {
  const onSubmit = vi.fn();
  render(<AgentWindow {...fixtureProps} onSubmit={onSubmit} />);
  fireEvent.click(screen.getByRole("button", { name: "添加附件" }));
  fireEvent.click(screen.getByText("从画布选择"));
  fireEvent.click(screen.getByRole("button", { name: "确认选择画布节点" }));
  expect(onSubmit.mock.calls[0][0].context.assetRefs).toEqual(expect.any(Array));
});
```

- [ ] **Step 2: Run test and verify failure**

Run: `npx vitest run src/flowCanvas/agent/v5/AgentCapabilities.test.tsx`

Expected: FAIL because V5 capability wiring is not connected.

- [ ] **Step 3: Implement canvas/upload reference projection**

Project selected nodes to `{ nodeId, assetId, refId, label }`, upload files through the existing asset API, and pass only stable refs plus current graph revision to the turn. Cap the references with `AGENT_REFERENCE_LIMIT` and show removable chips inside Composer.

- [ ] **Step 4: Implement Skill/App/model/mode context**

Use existing Skill listing/authoring/upload APIs behind V5 capability cards. Add an App capability client that returns safe display metadata. Model picker consumes active server catalog and maps to product display names. Mode changes call the V5 session API and persist server-side.

- [ ] **Step 5: Run capability tests and commit**

Run: `npx vitest run src/flowCanvas/agent/v5/AgentCapabilities.test.tsx src/flowCanvas/agent/CanvasAgentSkillIntegration.test.tsx src/flowCanvas/agent/agentReferenceContext.test.ts`

Expected: PASS with no provider credentials or signed URLs in rendered output.

```bash
git add src/flowCanvas/agent/v5 src/flowCanvas/agent/agentReferenceContext.ts
git commit -m "feat: connect agent v5 capabilities and references"
```

### Task 6: Persist V5 turns, decisions, context and result groups in the API

**Files:**
- Modify: `apps/api/src/modules/agent/agent.schemas.ts`
- Modify: `apps/api/src/modules/agent/agent.routes.ts`
- Modify: `apps/api/src/modules/agent/agent.service.ts`
- Modify: `apps/api/src/modules/agent/v2/agent-turn-loop.ts`
- Create or modify: `packages/db/migrations/0000xx_agent_v5_conversation.sql`
- Create: `apps/api/test/agent-v5-conversation.test.ts`

- [ ] **Step 1: Write failing API contract tests**

```ts
it("returns structured blocks and a pending decision for an ambiguous prompt", async () => {
  const response = await request(app).post("/api/v2/agent/sessions/s1/turns").send({
    prompt: "设计儿童陪伴玩具",
    mode: "manual_confirmation",
    contextSnapshot: { graphRevision: 4, assetRefs: [] },
  });
  expect(response.status).toBe(200);
  expect(response.body.phase).toBe("waiting_for_choice");
  expect(response.body.blocks.some((block: any) => block.type === "choice_grid")).toBe(true);
});

it("rejects execution with a stale graph revision", async () => {
  const response = await request(app).post("/api/v2/agent/sessions/s1/decisions").send({
    decision: { type: "execute" },
    graphRevision: 3,
  });
  expect(response.status).toBe(409);
});
```

- [ ] **Step 2: Run API tests and verify failure**

Run: `npm run test --workspace @aigc-flow/api -- agent-v5-conversation`

Expected: FAIL because V5 fields, routes, blocks and stale-revision checks are missing.

- [ ] **Step 3: Add tenant-scoped schema and RLS**

Extend or create tables for `phase`, `mode`, `blocks_json`, `context_snapshot_json`, `requires_confirmation`, `confirmed_at`, `execution_state`, `graph_revision`, decision records, capability refs and result groups. Add tenant indexes and RLS using the existing tenant-context pattern. Keep migration idempotent and compatible with existing agent sessions.

- [ ] **Step 4: Implement authenticated routes and service methods**

Validate tenant/session/project/flow ownership, normalize blocks before persistence, persist every decision, enforce mode and graph revision policy, and return a product-safe response. Use idempotency keys for confirmations and execution decisions.

- [ ] **Step 5: Run API tests/build and commit**

Run: `npm run test --workspace @aigc-flow/api -- agent-v5-conversation`
Run: `npm run build --workspace @aigc-flow/api`

Expected: focused tests pass; build passes or records an existing unrelated failure with its exact output.

```bash
git add apps/api/src/modules/agent packages/db/migrations apps/api/test/agent-v5-conversation.test.ts
git commit -m "feat: persist agent v5 decisions and structured turns"
```

### Task 7: Implement the unified turn orchestrator and execution gate

**Files:**
- Create: `apps/api/src/modules/agent/v5/agent-v5-orchestrator.ts`
- Create: `apps/api/src/modules/agent/v5/agent-v5-policy.ts`
- Create: `apps/api/test/agent-v5-orchestrator.test.ts`
- Modify: `apps/api/src/modules/agent/v2/agent-turn-loop.ts`
- Modify: `apps/worker/src/workflow-runtime/service.ts`

- [ ] **Step 1: Write failing orchestration tests**

```ts
it("asks before generation when direction and audience are missing", async () => {
  const result = await orchestrator.receiveTurn(fixtureTurn("设计儿童陪伴玩具"));
  expect(result.phase).toBe("waiting_for_choice");
  expect(provider.generateImage).not.toHaveBeenCalled();
});

it("reserves credits only after an explicit confirmation", async () => {
  await orchestrator.receiveTurn(fixtureBriefTurn({ confirmed: false, costCredits: 12 }));
  expect(wallet.reserve).not.toHaveBeenCalled();
  await orchestrator.receiveDecision(fixtureExecuteDecision({ confirmed: true }));
  expect(wallet.reserve).toHaveBeenCalledWith(expect.objectContaining({ credits: 12 }));
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm run test --workspace @aigc-flow/api -- agent-v5-orchestrator`

Expected: FAIL because V5 orchestration and policy are missing.

- [ ] **Step 3: Implement intent/context/ask/brief orchestration**

Create one service that builds a bounded context snapshot, decides whether to ask, emits structured blocks, stores decisions, builds Brief, recommends capabilities, and enters `waiting_for_confirmation` before paid or write actions.

- [ ] **Step 4: Implement policy gate and runtime adapters**

Route confirmed decisions to the existing text/image/video/Skill/App/workflow adapters. Enforce reserve → execute → settle/refund, stale graph revision CAS, idempotency, cancellation, and safe error blocks. Do not expose provider internals.

- [ ] **Step 5: Run API/worker tests and commit**

Run: `npm run test --workspace @aigc-flow/api -- agent-v5-orchestrator`
Run: `npm run test --workspace @aigc-flow/worker -- workflow-runtime`

Expected: focused orchestration and worker suites pass.

```bash
git add apps/api/src/modules/agent/v5 apps/api/src/modules/agent/v2/agent-turn-loop.ts apps/worker/src/workflow-runtime/service.ts apps/api/test/agent-v5-orchestrator.test.ts
git commit -m "feat: enforce agent v5 conversational execution gate"
```

### Task 8: Make V5 the only default Agent UI path

**Files:**
- Modify: `src/flowCanvas/agent/CanvasAgentPanel.tsx`
- Modify: `src/flowCanvas/agent/CanvasAgentWorkspaceShell.tsx`
- Modify: `src/flowCanvas/canvas/AiFlowCanvas.tsx` only if sizing/portal ownership is required
- Create: `src/flowCanvas/agent/v5/AgentPanelIntegration.test.tsx`

- [ ] **Step 1: Write failing integration tests**

```tsx
it("shows only the V5 window on the default chat path", () => {
  render(<CanvasAgentPanel open {...fixturePanelProps} />);
  expect(screen.getByTestId("agent-v5-window")).toBeTruthy();
  expect(screen.queryByTestId("agent-composer-dock")).toBeNull();
  expect(screen.queryByTestId("agent-timeline")).toBeNull();
  expect(screen.queryByText("用量统计")).toBeNull();
});
```

- [ ] **Step 2: Run test and verify the existing mixed UI fails**

Run: `npx vitest run src/flowCanvas/agent/v5/AgentPanelIntegration.test.tsx`

Expected: FAIL because the current Panel still renders legacy surfaces in the main path.

- [ ] **Step 3: Replace the chat branch with `AgentWindow`**

Wire `useAgentV5Session` to the V5 window. Keep history/log actions as explicit secondary views. Remove the nested V4 wrapper and do not pass legacy Composer/Timeline children into V5. Preserve close, session focus, server draft applied, canvas placement, and existing project/flow scope.

- [ ] **Step 4: Keep compatibility views out of first-level rendering**

Retain old components only for migration tests or an explicit debug/log route. Do not show old timeline, PlanCard, SkillBar, or Composer when `activeTab === "chat"`.

- [ ] **Step 5: Run integration tests and commit**

Run: `npx vitest run src/flowCanvas/agent/v5/AgentPanelIntegration.test.tsx src/flowCanvas/agent/CanvasAgentPanel.test.tsx`

Expected: V5 integration tests pass; old tests that assert the removed first-screen contract must be updated to assert V5 behavior rather than reintroducing old UI.

```bash
git add src/flowCanvas/agent/CanvasAgentPanel.tsx src/flowCanvas/agent/CanvasAgentWorkspaceShell.tsx src/flowCanvas/canvas/AiFlowCanvas.tsx src/flowCanvas/agent/v5/AgentPanelIntegration.test.tsx
git commit -m "feat: make agent v5 the default canvas workspace"
```

### Task 9: Add result-group canvas actions and replay coverage

**Files:**
- Modify: `src/flowCanvas/agent/v5/AgentResultGroup.tsx`
- Modify: `src/flowCanvas/agent/v5/useAgentV5Session.ts`
- Modify: `src/flowCanvas/agent/canvasAgentOps.ts`
- Create: `src/flowCanvas/agent/v5/AgentResultGroup.test.tsx`
- Create: `src/flowCanvas/agent/v5/AgentReplay.test.tsx`

- [ ] **Step 1: Write failing result/replay tests**

```tsx
it("supports selecting, refining, making a variant and placing an asset", () => {
  const onAction = vi.fn();
  render(<AgentResultGroup results={fixtureResults} onAction={onAction} />);
  fireEvent.click(screen.getByRole("button", { name: "继续编辑 结果 1" }));
  expect(onAction).toHaveBeenCalledWith({ type: "refine_result", resultId: "result-1" });
  fireEvent.click(screen.getByRole("button", { name: "放入画布 结果 1" }));
  expect(onAction).toHaveBeenCalledWith({ type: "place_result", resultId: "result-1" });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npx vitest run src/flowCanvas/agent/v5/AgentResultGroup.test.tsx src/flowCanvas/agent/v5/AgentReplay.test.tsx`

Expected: FAIL because V5 result actions and replay fixtures are missing.

- [ ] **Step 3: Implement result actions**

Use existing asset placement APIs and stable `assetId` refs. Add result selection, preview, refine, variant, set-reference, and place-on-canvas actions. Attach session ID, turn ID and graph revision to each action.

- [ ] **Step 4: Implement replay assertions**

Replay the same durable events through the V5 reducer and verify blocks, phase, pending confirmation, progress and result selection are identical to the live projection.

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run src/flowCanvas/agent/v5/AgentResultGroup.test.tsx src/flowCanvas/agent/v5/AgentReplay.test.tsx src/flowCanvas/agent/agentReplayState.test.ts`

Expected: PASS.

```bash
git add src/flowCanvas/agent/v5 src/flowCanvas/agent/canvasAgentOps.ts
git commit -m "feat: complete agent v5 result and replay loop"
```

### Task 10: Staging rollout, browser acceptance and documentation

**Files:**
- Modify: `PROJECT_RECORD.md`
- Modify: `docs/v2-local-development.md`
- Modify: `docs/staging-runbook.md`
- Modify: `docs/PRODUCTION_RUNBOOK.md`
- Modify: `docs/STAGING_ENV_TEMPLATE.md` only if a new V5 flag or variable is required
- Test: all V5 frontend/API/worker suites and authenticated browser flow

- [ ] **Step 1: Run focused frontend validation**

Run: `npx vitest run src/flowCanvas/agent/v5 src/flowCanvas/agent/agentReplayState.test.ts src/flowCanvas/agent/agentReferenceContext.test.ts`

Expected: all V5 renderer, shell, adapter, capability, result and replay tests pass.

- [ ] **Step 2: Run package validation**

Run: `npm run build`
Run: `npm run test --workspace @aigc-flow/api -- agent-v5`
Run: `npm run test --workspace @aigc-flow/worker -- workflow-runtime`
Run: `npm run test --workspace @aigc-flow/db`

Expected: builds and focused suites pass; any infrastructure or historical unrelated failure is recorded with the exact command/output and is not reported as passing.

- [ ] **Step 3: Run authenticated staging acceptance**

Verify in a real browser: open Agent → new conversation → choose canvas nodes → upload attachment → select Skill/App → choose model → switch mode → submit ambiguous prompt → receive structured question → choose options → inspect comparison/Brief → confirm → watch progress → inspect result group → refine/place result → reopen history → restore the same blocks and state after refresh.

- [ ] **Step 4: Keep rollout fail-closed until acceptance**

Keep V5 runtime and Skill/App execution flags disabled outside staging. Enable only after PostgreSQL, Redis, S3, billing, model route, and worker acceptance passes. Roll back by disabling V5 runtime before changing durable data.

- [ ] **Step 5: Update project record and commit documentation**

Record the verified commit, test counts, staging URL/flow, remaining warnings, and rollback switch in `PROJECT_RECORD.md` and the staging runbook.

```bash
git add PROJECT_RECORD.md docs/v2-local-development.md docs/staging-runbook.md docs/PRODUCTION_RUNBOOK.md docs/STAGING_ENV_TEMPLATE.md
git commit -m "docs: record agent v5 rollout and staging acceptance"
```

## Self-review checklist

- Spec coverage: window/header/history/composer is covered by Tasks 3 and 8; structured text and visual blocks by Task 2; state machine and modes by Tasks 1 and 7; attachments/Skill/App/model by Task 5; persistence/RLS by Task 6; execution, billing and graph revision by Task 7; results/replay by Task 9; staging and docs by Task 10.
- Placeholder scan: no TODO, TBD, “later”, or unspecified implementation step is used in the plan.
- Type consistency: `ConversationBlock`, `AgentV5Phase`, `AgentContextSnapshot`, `AgentDecision`, `CapabilitySummary`, `ProgressStep`, and `ResultRef` are introduced in Task 1 and reused by later tasks.
- Migration boundary: the main UI is replaced once in Task 8; no V4 nested wrapper or legacy first-level surface remains.
- Safety boundary: user-visible output is normalized blocks; secrets and signed URLs are excluded; billing and canvas actions remain server-gated.
