# Workflow SSE Reconnect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep an in-progress canvas generation synchronized when its workflow SSE connection closes before the provider finishes.

**Architecture:** Keep reconnection state inside `v2WorkflowRunner`: remember the latest processed event sequence, reconcile one server snapshot after a transport close, and reconnect only when that snapshot is nonterminal. Use capped exponential retry delays and cancel both active streams and pending retries during explicit disposal.

**Tech Stack:** TypeScript, React canvas runtime, Vitest fake timers, existing v2 workflow SSE API.

---

### Task 1: Reproduce the disconnect regression

**Files:**
- Test: `src/flowCanvas/runtime/v2WorkflowRunner.test.ts`

- [x] Add a test that launches a target-node run, receives an event sequence, closes while the snapshot remains `waiting_provider`, advances the retry timer, and verifies a second stream starts with `afterSequence` before a terminal event hydrates the generated asset.
- [x] Add a test that explicitly disposes an active stream and verifies its close callback cannot schedule a reconnect.
- [x] Run `npx vitest --run src/flowCanvas/runtime/v2WorkflowRunner.test.ts` and confirm the reconnect test fails because only one stream is opened.

### Task 2: Implement lifecycle-safe reconnection

**Files:**
- Modify: `src/flowCanvas/runtime/v2WorkflowRunner.ts`

- [x] Track active stream identities, latest event sequences, reconnect attempts, and pending reconnect timers per workflow run.
- [x] On transport close, remove only the matching active stream and reconcile the latest run snapshot.
- [x] Apply and clean up terminal snapshots; schedule a capped exponential reconnect for nonterminal snapshots or temporary snapshot-fetch failures.
- [x] Pass `afterSequence` on reconnect and ignore already-processed positive event sequences.
- [x] Ensure explicit disposal and terminal cleanup cancel both active streams and pending retries without surfacing a workflow failure for a recoverable transport error.
- [x] Run the focused runner test until all assertions pass.

### Task 3: Record and verify the fix

**Files:**
- Modify: `PROJECT_RECORD.md`

- [x] Record the frontend SSE recovery behavior and focused validation evidence.
- [x] Run `npx vitest --run src/flowCanvas/runtime/v2WorkflowRunner.test.ts`.
- [x] Run `npm run build`.
- [x] Inspect `git diff --check` and `git status --short`, preserving unrelated workspace changes.

### Task 4: Harden recovery disposal after review

**Files:**
- Modify: `src/flowCanvas/runtime/v2WorkflowRunner.ts`
- Test: `src/flowCanvas/runtime/v2WorkflowRunner.test.ts`

- [x] Add a failing test where run recovery is still waiting for the list response when the canvas is disposed.
- [x] Invalidate in-flight recovery generations on disposal and guard asynchronous snapshot application before store writes.
- [x] Add a failing test where disconnect reconciliation is hydrating a terminal asset when the canvas is disposed.
- [x] Apply the lifecycle guard to disconnect reconciliation so stale terminal snapshots cannot write or reconnect.
- [x] Run the focused runner test and confirm all 42 tests pass.
