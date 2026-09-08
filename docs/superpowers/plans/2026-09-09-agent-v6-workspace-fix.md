# Agent V6 Workspace Fix Implementation Plan

> **For agentic workers:** Execute this plan inline with focused checkpoints.

**Goal:** Make Agent V6 workspace layers dismissible and mutually exclusive, and make history date grouping deterministic.

**Architecture:** Keep all workspace overlay ownership in `AgentWorkspace` with one active-layer state. Use the shared `useDismissibleLayer` for history and preserve `MenuSelect` dismissal for mode/model menus. Extract date labeling as a pure function accepting an injected `now` value.

**Tech Stack:** React, TypeScript, Testing Library, Vitest, shared menu dismissal utilities.

---

### Task 1: Add focused regression coverage

**Files:**
- Modify: `src/flowCanvas/agent/v6/workspace/AgentWorkspace.test.tsx`
- Create: `src/flowCanvas/agent/v6/workspace/AgentHistory.test.tsx`

- [ ] Add tests for history Escape/outside dismissal, history date grouping with `now: 2026-09-09`, and workspace mutual exclusion between history/mode/model.
- [ ] Run the focused tests and confirm they fail for the missing behavior.

### Task 2: Implement deterministic history and layer coordination

**Files:**
- Modify: `src/flowCanvas/agent/v6/workspace/AgentHistory.tsx`
- Modify: `src/flowCanvas/agent/v6/workspace/AgentWorkspace.tsx`
- Modify: `src/flowCanvas/agent/v6/workspace/AgentComposer.tsx`
- Modify: `src/components/menu/MenuSelect.tsx` only if needed to support workspace coordination without changing shared behavior unnecessarily.

- [ ] Inject a stable `now`/clock into date labeling and use the shared dismissible layer for history.
- [ ] Coordinate the workspace overlays through one active-layer state and pass an explicit close signal to composer controls.
- [ ] Run focused workspace and V6 protocol tests.

### Task 3: Verify and commit

- [ ] Run workspace tests, V6 protocol tests, `npm run build`, and a tracked diff check.
- [ ] Stage only files changed for this task and commit with a task-specific message.
