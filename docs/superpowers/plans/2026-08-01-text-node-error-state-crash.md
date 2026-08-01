# Text Node Error-State Crash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent a failed text generation from crashing the canvas while preserving the existing inline error and retry UI.

**Architecture:** Keep the repair inside `TextNodeComponent`. Derive its generation-error presentation state from its own node data, matching the established image-node behavior without changing workflow execution, billing, or provider routing.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library

---

### Task 1: Cover and repair text-node error rendering

**Files:**
- Modify: `src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx`
- Modify: `src/flowCanvas/nodes/FlowNodes.tsx`
- Modify: `PROJECT_RECORD.md`

- [x] **Step 1: Write the failing render regression test**

Add a test that renders `TextNodeComponent` with `generationStatus: "error"`, `status: "failed"`, and `errorMessage: "Text generation failed"`, then asserts that rendering does not throw and that both the message and retry button are visible.

- [x] **Step 2: Run the focused test and verify the production failure**

Run:

```bash
npx vitest --run src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx
```

Expected: the new test fails with `ReferenceError: hasGenerationError is not defined` from `TextNodeComponent`.

- [x] **Step 3: Apply the minimal component fix**

Inside `TextNodeComponent`, alongside its other derived generation state, add:

```tsx
const hasGenerationError =
  d.generationStatus === "error" && !!d.errorMessage;
```

Do not change the workflow runner, billing flow, provider calls, or image-node behavior.

- [x] **Step 4: Verify the focused test is green**

Run:

```bash
npx vitest --run src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx
```

Expected: the full focused file passes.

- [x] **Step 5: Run production validation**

Run:

```bash
npm run build
```

Expected: Vite production build completes; existing non-blocking bundle warnings may remain.

- [x] **Step 6: Record the production-facing repair**

Append a dated `Text Node Error-State Crash Repair` entry to `PROJECT_RECORD.md` that records the root cause, minimal fix, regression coverage, and exact validation results.

- [x] **Step 7: Commit only task files**

Stage only the plan, focused test, component, and project record, then commit with:

```bash
git commit -m "fix(canvas): prevent text error state crash"
```
