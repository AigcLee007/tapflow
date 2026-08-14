# Template Editor And Group Prompt Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make new platform templates constructible from an empty canvas and allow group execution when a generation node receives prompt content from an in-group upstream node.

**Architecture:** The template admin page will supply an editor-specific empty state with explicit node commands instead of depending on the general canvas toolbar layering. Group preflight will determine whether a node needs an inline prompt from its configured inputs and in-scope dependency edges before rejecting it.

**Tech Stack:** React, TypeScript, Zustand, @xyflow/react, Vitest.

---

### Task 1: Template Empty Canvas Creation

**Files:**
- Modify: `src/admin/templates/TemplateAdminEditorPage.tsx`
- Modify: `src/admin/templates/TemplateAdminEditorPage.test.tsx`

- [ ] **Step 1: Write a failing UI test**

```tsx
test('adds an image node from the new template empty state', async () => {
  render(<TemplateAdminEditorPage templateId="new" />);
  fireEvent.click(await screen.findByRole('button', { name: '添加图片生成节点' }));
  expect(useFlowCanvasStore.getState().nodes).toHaveLength(1);
  expect(useFlowCanvasStore.getState().nodes[0]?.type).toBe('image');
});
```

- [ ] **Step 2: Run the focused test and verify it fails because the command is absent.**

Run: `npm run test -- src/admin/templates/TemplateAdminEditorPage.test.tsx`

- [ ] **Step 3: Implement an editor-owned empty-state overlay.**

Add image, video, and text generation node commands that call the existing canvas store `addNode` with a stable centre position. Render the overlay only for a new/empty template and keep template metadata controls unobstructed.

- [ ] **Step 4: Run the focused test and verify it passes.**

Run: `npm run test -- src/admin/templates/TemplateAdminEditorPage.test.tsx`

### Task 2: Group Prompt Preflight

**Files:**
- Modify: `src/flowCanvas/groupExecution/groupExecutionPlan.ts`
- Modify: `src/flowCanvas/groupExecution/groupExecutionPlan.test.ts`
- Modify: `apps/api/src/modules/workflow-runs/workflow-runs.service.ts`
- Modify: `apps/api/test/workflow-runs.test.ts`

- [ ] **Step 1: Write failing planner and server tests.**

```ts
test('does not require an inline prompt when an in-group text node supplies it', () => {
  expect(buildGroupExecutionPlan(graph, 'group-1').blockingIssues).toEqual([]);
});
```

- [ ] **Step 2: Run the planner test and verify it fails with `MISSING_GENERATION_PROMPT`.**

Run: `npm run test -- src/flowCanvas/groupExecution/groupExecutionPlan.test.ts`

- [ ] **Step 3: Implement dependency-aware prompt validation.**

Only require a local generation prompt where the node has no eligible in-group text-producing dependency. Preserve all route, pricing, external-input, and server-side validation.

- [ ] **Step 4: Run focused planner and API tests.**

Run: `npm run test -- src/flowCanvas/groupExecution/groupExecutionPlan.test.ts`

Run: `npm run test --workspace @aigc-flow/api -- test/workflow-runs.test.ts`

- [ ] **Step 5: Run production build checks.**

Run: `npm run build`

Run: `npm run build --workspace @aigc-flow/workflow-core`
