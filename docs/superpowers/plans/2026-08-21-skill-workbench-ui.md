# Canvas Skill Workbench UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the right-side Canvas Agent into a visible LibTV-style Skill workbench with Skill selection, plan/approval states, execution steps, and canvas-linked results.

**Architecture:** Keep `CanvasAgentPanel` and the existing V2 session/replay state as the composition boundary. Add a product-safe Skill workbench adapter and focused presentational components; use existing Skill, Agent session, Skill Run, and event APIs, never direct Workflow Run or billing calls. Render the workbench shell even when runtime flags are disabled, showing a truthful unavailable state.

**Tech Stack:** React, TypeScript, Vitest, React Testing Library, existing V2 HTTP client, existing `MenuSurface`/`MenuSelect`, Lucide icons, Vite.

---

## File Map

- Create `src/flowCanvas/agent/canvasAgentSkillTypes.ts` for product-safe picker, plan, step, and workbench state contracts.
- Create `src/flowCanvas/agent/useCanvasAgentSkillWorkbench.ts` for Skill list loading, selection, safe plan projection, and approval/cancel/retry callbacks.
- Create `src/flowCanvas/agent/CanvasAgentSkillBar.tsx` for the persistent selected-Skill header and picker trigger.
- Create `src/flowCanvas/agent/CanvasAgentSkillPlan.tsx` for plan header, estimate, approval/cancel controls, and step list composition.
- Create `src/flowCanvas/agent/CanvasAgentSkillStepRow.tsx` for stable-height step status/result rows.
- Modify `src/flowCanvas/agent/canvasAgentApi.ts` to expose safe Skill Run read/approve/cancel operations and normalized Skill preview fields.
- Modify `src/flowCanvas/agent/v2/useCanvasAgentSessionV2.ts` to restore selected Skill identity from replay metadata and expose V2 Skill approval state.
- Modify `src/flowCanvas/agent/CanvasAgentPanel.tsx` to compose the workbench zones and preserve chat/history/log tabs.
- Modify `src/flowCanvas/agent/CanvasAgentComposer.tsx` only to render/remove the selected Skill context chip and preserve existing reference chips.
- Add focused tests beside each new component and update `CanvasAgentPanel.test.tsx`, `CanvasAgentSkillIntegration.test.tsx`, and `canvasAgentApi.test.ts`.

### Task 1: Define safe Skill workbench contracts and API adapters

**Files:**
- Create: `src/flowCanvas/agent/canvasAgentSkillTypes.ts`
- Modify: `src/flowCanvas/agent/canvasAgentApi.ts`
- Test: `src/flowCanvas/agent/canvasAgentApi.test.ts`

- [ ] **Step 1: Write failing API contract tests**

Add tests that assert `listAgentSkills` maps only `id`, `version`, `name`, `summary`, `modality`, `visibility`, and safe input hints; assert the Skill Run functions call `/agent/skill-runs/:runId`, `/approve`, and `/cancel` with the current session where required; assert an API payload containing `routeKey`, `provider`, `credential`, or `baseUrl` is not returned by the adapter.

```ts
it("exposes product-safe Skill Run operations", async () => {
  await getAgentSkillRun("run-1");
  await approveAgentSkillRun("session-1", "run-1");
  await cancelAgentSkillRun("session-1", "run-1", "user cancelled");
  expect(calls.map((call) => String(call.input))).toEqual([
    "/api/v2/agent/skill-runs/run-1",
    "/api/v2/agent/sessions/session-1/approvals/run-1/stream",
    "/api/v2/agent/skill-runs/run-1/cancel",
  ]);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm run test -- --run src/flowCanvas/agent/canvasAgentApi.test.ts`

Expected: FAIL because the safe Skill Run adapter functions and workbench types do not exist.

- [ ] **Step 3: Implement the safe contracts and adapters**

Define `AgentSkillPickerItem`, `AgentSkillPlan`, `AgentSkillStep`, and `SkillWorkbenchState` exactly as specified in `docs/superpowers/specs/2026-08-21-skill-workbench-ui-design.md`. Add `getAgentSkillRun`, `approveAgentSkillRun`, and `cancelAgentSkillRun`; map responses through a whitelist function that discards all internal routing/configuration fields. Keep approval on the existing session approval stream and do not add a frontend billing call.

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `npm run test -- --run src/flowCanvas/agent/canvasAgentApi.test.ts`

Expected: all API adapter tests pass.

- [ ] **Step 5: Commit the contract boundary**

```bash
git add src/flowCanvas/agent/canvasAgentSkillTypes.ts src/flowCanvas/agent/canvasAgentApi.ts src/flowCanvas/agent/canvasAgentApi.test.ts
git commit -m "feat(agent-ui): add safe skill workbench contracts"
```

### Task 2: Build the visible Skill bar and picker states

**Files:**
- Create: `src/flowCanvas/agent/CanvasAgentSkillBar.tsx`
- Modify: `src/flowCanvas/agent/CanvasAgentSkillPicker.tsx`
- Modify: `src/flowCanvas/agent/CanvasAgentPanel.tsx`
- Test: `src/flowCanvas/agent/CanvasAgentSkillPicker.test.tsx`
- Test: `src/flowCanvas/agent/CanvasAgentPanel.test.tsx`

- [ ] **Step 1: Write failing UI tests for the always-visible workbench entry**

Add tests that render the panel with capabilities disabled and assert `选择一个创作 Skill` is visible with a `Skill 暂不可用` state after opening; render safe available Skills and assert the picker groups Text/Image/Video and selecting one updates the Skill bar without calling `sendPrompt`.

```tsx
it("keeps the Skill workbench entry visible while runtime is disabled", async () => {
  renderPanel({ capabilities: { skillsEnabled: false, skillRuntimeEnabled: false } });
  expect(await screen.findByText("选择一个创作 Skill")).toBeTruthy();
  expect(screen.getByText("Skill 暂不可用")).toBeTruthy();
  expect(mockSendPrompt).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the UI tests and verify they fail**

Run: `npm run test -- --run src/flowCanvas/agent/CanvasAgentSkillPicker.test.tsx src/flowCanvas/agent/CanvasAgentPanel.test.tsx`

Expected: FAIL because the current panel hides the entire Skill area when `skillUiEnabled` is false and has no persistent Skill bar.

- [ ] **Step 3: Implement the Skill bar and picker states**

Create a fixed-height `CanvasAgentSkillBar` with a Sparkles icon, selected Skill name/modality/version, remove/change buttons, and a disabled/unavailable treatment. Refactor `CanvasAgentSkillPicker` to use shared menu density, modality sections, loading/error/empty states, retry, and keyboard Escape dismissal. In `CanvasAgentPanel`, render the bar above the work area regardless of flags; only enable list selection when both server and client capabilities allow it. Keep authoring/detail views behind their existing flags.

- [ ] **Step 4: Run focused UI tests and verify they pass**

Run: `npm run test -- --run src/flowCanvas/agent/CanvasAgentSkillPicker.test.tsx src/flowCanvas/agent/CanvasAgentPanel.test.tsx`

Expected: picker and panel tests pass, including no-runtime/unavailable behavior and no-Skill legacy chat behavior.

- [ ] **Step 5: Commit the visible entry**

```bash
git add src/flowCanvas/agent/CanvasAgentSkillBar.tsx src/flowCanvas/agent/CanvasAgentSkillPicker.tsx src/flowCanvas/agent/CanvasAgentPanel.tsx src/flowCanvas/agent/CanvasAgentSkillPicker.test.tsx src/flowCanvas/agent/CanvasAgentPanel.test.tsx
git commit -m "feat(agent-ui): add visible skill workbench picker"
```

### Task 3: Add the plan and step workspace

**Files:**
- Create: `src/flowCanvas/agent/CanvasAgentSkillPlan.tsx`
- Create: `src/flowCanvas/agent/CanvasAgentSkillStepRow.tsx`
- Create: `src/flowCanvas/agent/useCanvasAgentSkillWorkbench.ts`
- Modify: `src/flowCanvas/agent/CanvasAgentPanel.tsx`
- Test: `src/flowCanvas/agent/CanvasAgentSkillPlan.test.tsx`
- Test: `src/flowCanvas/agent/useCanvasAgentSkillWorkbench.test.tsx`

- [ ] **Step 1: Write failing plan/step tests**

Cover: ordered text/image/video rows; safe estimate rendering; `批准执行` only for `waiting_for_approval`; cancel action; retry action only for failed steps; terminal rows cannot return to running when an older event arrives; result actions expose only node/asset IDs.

```tsx
it("shows approval only for a waiting Skill plan", () => {
  render(<CanvasAgentSkillPlan plan={waitingPlan} onApprove={onApprove} onCancel={onCancel} onRetry={onRetry} />);
  expect(screen.getByRole("button", { name: "批准执行" })).toBeTruthy();
  expect(screen.getByText("生成图片")).toBeTruthy();
  expect(screen.getByText("预计 8 积分")).toBeTruthy();
});
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npm run test -- --run src/flowCanvas/agent/CanvasAgentSkillPlan.test.tsx src/flowCanvas/agent/useCanvasAgentSkillWorkbench.test.tsx`

Expected: FAIL because the plan components, workbench hook, and plan projection do not exist.

- [ ] **Step 3: Implement the state adapter and components**

`useCanvasAgentSkillWorkbench` must derive plans from `sessionActions.pendingApproval`, V2 activity/tool timeline, and safe Skill Run responses; it must expose `selectSkill`, `clearSkill`, `approvePlan`, `cancelPlan`, `retryFailedStep`, and `refreshPlan`. `CanvasAgentSkillPlan` must use stable rows, existing menu tokens, Lucide icons, and explicit loading/disabled states. Approval and cancel call the API adapter and then refresh/rely on durable events; no local optimistic terminal success is allowed.

- [ ] **Step 4: Run focused tests and verify they pass**

Run: `npm run test -- --run src/flowCanvas/agent/CanvasAgentSkillPlan.test.tsx src/flowCanvas/agent/useCanvasAgentSkillWorkbench.test.tsx`

Expected: all plan/step state tests pass.

- [ ] **Step 5: Commit the work area**

```bash
git add src/flowCanvas/agent/CanvasAgentSkillPlan.tsx src/flowCanvas/agent/CanvasAgentSkillStepRow.tsx src/flowCanvas/agent/useCanvasAgentSkillWorkbench.ts src/flowCanvas/agent/CanvasAgentPanel.tsx src/flowCanvas/agent/CanvasAgentSkillPlan.test.tsx src/flowCanvas/agent/useCanvasAgentSkillWorkbench.test.tsx
git commit -m "feat(agent-ui): show skill plans and execution steps"
```

### Task 4: Wire selected Skill identity, replay, and composer context

**Files:**
- Modify: `src/flowCanvas/agent/v2/useCanvasAgentSessionV2.ts`
- Modify: `src/flowCanvas/agent/agentReplayState.ts`
- Modify: `src/flowCanvas/agent/CanvasAgentComposer.tsx`
- Modify: `src/flowCanvas/agent/CanvasAgentPanel.tsx`
- Test: `src/flowCanvas/agent/agentReplayState.test.ts`
- Test: `src/flowCanvas/agent/useCanvasAgentSession.test.tsx`
- Test: `src/flowCanvas/agent/CanvasAgentComposer.test.tsx`

- [ ] **Step 1: Write failing replay and composer tests**

Assert a replayed event with `selectedSkillId` and `selectedSkillVersion` restores the selected Skill; assert sending a prompt includes those fields; assert the composer renders a removable Skill context chip while preserving reference chips; assert removing the chip does not clear canvas references.

```ts
it("restores the selected Skill from replay metadata", () => {
  const state = buildV2AgentSessionStateFromEvents([{ eventType: "turn_started", eventJson: { selectedSkillId: "skill-1", selectedSkillVersion: 3 } } as never]);
  expect(state.selectedSkill).toEqual({ id: "skill-1", version: 3 });
});
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npm run test -- --run src/flowCanvas/agent/agentReplayState.test.ts src/flowCanvas/agent/useCanvasAgentSession.test.tsx src/flowCanvas/agent/CanvasAgentComposer.test.tsx`

Expected: FAIL because replay state and composer do not expose the selected Skill as durable UI context.

- [ ] **Step 3: Implement replay-safe selected Skill state**

Extend the V2 replay state with a safe selected Skill identity only. In `useCanvasAgentSessionV2`, synchronize selection with replay and send `selectedSkillId`/`selectedSkillVersion` on every selected-Skill turn. Add a removable composer chip that contains no normalized Skill source or route fields. Reset selection only on explicit removal, version-not-found, or new-chat reset.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run: `npm run test -- --run src/flowCanvas/agent/agentReplayState.test.ts src/flowCanvas/agent/useCanvasAgentSession.test.tsx src/flowCanvas/agent/CanvasAgentComposer.test.tsx`

Expected: replay, request payload, and composer chip tests pass.

- [ ] **Step 5: Commit replay and composer integration**

```bash
git add src/flowCanvas/agent/v2/useCanvasAgentSessionV2.ts src/flowCanvas/agent/agentReplayState.ts src/flowCanvas/agent/CanvasAgentComposer.tsx src/flowCanvas/agent/CanvasAgentPanel.tsx src/flowCanvas/agent/agentReplayState.test.ts src/flowCanvas/agent/useCanvasAgentSession.test.tsx src/flowCanvas/agent/CanvasAgentComposer.test.tsx
git commit -m "feat(agent-ui): persist selected skill context across turns"
```

### Task 5: Integrate result actions and run visual regression coverage

**Files:**
- Modify: `src/flowCanvas/agent/CanvasAgentSkillStepRow.tsx`
- Modify: `src/flowCanvas/agent/CanvasAgentPanel.tsx`
- Test: `src/flowCanvas/agent/CanvasAgentIntegration.test.tsx`
- Test: `src/flowCanvas/agent/CanvasAgentWorkspaceShell.test.tsx`

- [ ] **Step 1: Write failing end-to-end component tests**

Assert the full UI flow: open panel, see Skill bar, choose a fixture Skill, send a prompt, see the plan, click `批准执行`, see a running step, then see a text/image/video result action tied to a node or asset. Also assert the no-runtime state leaves the normal composer usable and the existing chat/history/log tabs remain reachable.

- [ ] **Step 2: Run the integration tests and verify they fail**

Run: `npm run test -- --run src/flowCanvas/agent/CanvasAgentIntegration.test.tsx src/flowCanvas/agent/CanvasAgentWorkspaceShell.test.tsx`

Expected: FAIL until the panel composes the Skill bar, plan, and result step zones.

- [ ] **Step 3: Wire the panel and result focus actions**

Place the Skill bar above the chat/work area, render the Skill plan when a plan/run exists, keep the composer at the bottom, and keep chat/history/log tabs unchanged. Implement `定位到画布` through the existing canvas store focus/selection path; result cards may use asset IDs but never signed URLs. Keep rows and composer geometry stable at the current panel width and use responsive overflow for smaller widths.

- [ ] **Step 4: Run frontend focused validation**

Run:

```bash
npm run test -- --run src/flowCanvas/agent/CanvasAgentIntegration.test.tsx src/flowCanvas/agent/CanvasAgentPanel.test.tsx src/flowCanvas/agent/CanvasAgentSkillPicker.test.tsx src/flowCanvas/agent/CanvasAgentSkillPlan.test.tsx src/flowCanvas/agent/agentReplayState.test.ts
npm run build
```

Expected: all listed tests pass and the production frontend build exits 0. Existing non-blocking Vite warnings may remain, but there must be no TypeScript or test failures.

- [ ] **Step 5: Perform browser visual QA**

Start the local frontend with the existing project command and inspect the Agent panel at desktop and narrow widths. Verify the Skill bar is visible, picker rows do not overlap, approval controls remain inside the panel, and the canvas remains the primary workspace. Capture screenshots only after the page is nonblank and the panel has no overflow regressions.

- [ ] **Step 6: Update product records and commit**

Update `PROJECT_RECORD.md` and `docs/CODEX_HANDOFF.md` with the UI slice, validation commands, and the fact that runtime flags remain disabled. Then commit:

```bash
git add src/flowCanvas/agent PROJECT_RECORD.md docs/CODEX_HANDOFF.md
git commit -m "feat(agent-ui): deliver canvas skill workbench slice"
```

## Verification Checklist

- [ ] Skill workbench entry is visible when runtime is disabled and accurately explains unavailability.
- [ ] Official Skill picker uses server data and product-safe fields only.
- [ ] Selected Skill identity/version is included in turns and restored by replay.
- [ ] Plan steps, estimates, approval, cancellation, retry, and result actions are visible and state-safe.
- [ ] No-Skill Agent flow, chat, history, logs, and reference chips still work.
- [ ] Focused frontend tests pass.
- [ ] `npm run build` passes.
- [ ] `git diff --check` passes.
- [ ] Runtime flags remain disabled until staging acceptance.
