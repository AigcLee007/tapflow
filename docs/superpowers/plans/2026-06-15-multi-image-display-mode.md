# Multi-Image Display Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an inline multi-image display mode switch for image nodes so `2x / 3x / 4x` generations can be shown either as a combined result strip or as separate child image nodes while preserving the current parent node.

**Architecture:** Keep the backend/runtime contract unchanged and implement the new behavior entirely in the frontend canvas layer. Persist a new `multiImageDisplayMode` field on image node data, branch post-generation result handling in the v2 workflow runner, and fan out child image nodes from successful multi-image results when split mode is selected.

**Tech Stack:** React, TypeScript, Zustand store, `@xyflow/react`, Vitest

---

## File Map

- Modify: `src/flowCanvas/types.ts`
  - add the persisted image-node field for multi-image display mode
- Modify: `src/flowCanvas/nodes/FlowNodes.tsx`
  - add the inline display-mode control
  - suppress duplicate parent result-strip rendering for split-mode runs
  - add helper wiring for generated result fan-out
- Modify: `src/flowCanvas/runtime/v2WorkflowRunner.ts`
  - branch successful image-run patching by display mode
  - create child nodes on successful multi-image split-mode runs
- Modify: `src/flowCanvas/store/flowCanvasStore.ts`
  - add store helper for inserting generated child image nodes with parent edge
- Modify: `src/flowCanvas/utils/nodeFactory.ts`
  - support consistent defaults/metadata for generated child image nodes if needed
- Create or Modify tests:
  - `src/flowCanvas/runtime/v2WorkflowRunner.test.ts`
  - `src/flowCanvas/nodes/FlowNodes.test.tsx` or the nearest existing image-node test file
  - `src/flowCanvas/store/flowCanvasStore.test.ts`

---

### Task 1: Add persisted display-mode model

**Files:**
- Modify: `src/flowCanvas/types.ts`
- Test: `src/flowCanvas/runtime/v2WorkflowRunner.test.ts`

- [ ] **Step 1: Write the failing test**

Add a regression test that builds an image-node snapshot with `batchCount: 2` and verifies the node data can carry `multiImageDisplayMode: 'split_nodes'` through the workflow-run patch path without being dropped.

```ts
test('preserves multiImageDisplayMode on image nodes during workflow patching', async () => {
  // create image node with batchCount 2 and multiImageDisplayMode split_nodes
  // apply a succeeded workflow snapshot
  // expect node data.multiImageDisplayMode to remain split_nodes
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/flowCanvas/runtime/v2WorkflowRunner.test.ts -t "preserves multiImageDisplayMode"`

Expected: FAIL because `multiImageDisplayMode` is not typed or preserved yet.

- [ ] **Step 3: Write minimal implementation**

Add the new node data field:

```ts
export type FlowMultiImageDisplayMode = 'combined' | 'split_nodes';
```

```ts
multiImageDisplayMode?: FlowMultiImageDisplayMode;
```

Keep behavior backward-compatible by treating missing values as `"combined"` in runtime/UI logic.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/flowCanvas/runtime/v2WorkflowRunner.test.ts -t "preserves multiImageDisplayMode"`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/flowCanvas/types.ts src/flowCanvas/runtime/v2WorkflowRunner.test.ts
git commit -m "feat: add image multi display mode model"
```

### Task 2: Add inline prompt-bar display-mode control

**Files:**
- Modify: `src/flowCanvas/nodes/FlowNodes.tsx`
- Test: `src/flowCanvas/nodes/FlowNodes.test.tsx`

- [ ] **Step 1: Write the failing test**

Add UI tests covering:

- no display-mode control at `1x`
- display-mode control appears at `2x`
- toggle writes `multiImageDisplayMode: 'combined' | 'split_nodes'`

```tsx
test('shows multi-image display mode control only when batchCount is greater than 1', async () => {
  // render image node at 1x -> expect no mode control
  // rerender at 2x -> expect combined / split_nodes control visible
});

test('updates node display mode when the user toggles the multi-image mode control', async () => {
  // render image node at 2x
  // click split_nodes
  // expect updateNodeData called with multiImageDisplayMode: 'split_nodes'
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/flowCanvas/nodes/FlowNodes.test.tsx -t "multi-image display mode"`

Expected: FAIL because the control does not exist yet.

- [ ] **Step 3: Write minimal implementation**

In `FlowNodes.tsx`:

- derive `const multiImageDisplayMode = d.multiImageDisplayMode === 'split_nodes' ? 'split_nodes' : 'combined'`
- show a compact segmented control only when `(d.batchCount || 1) > 1`
- place it adjacent to the existing batch selector
- update node data on click

Implementation shape:

```tsx
{(d.batchCount || 1) > 1 && (
  <div style={multiImageModeWrap}>
    <button
      type="button"
      onClick={() => updateNodeData(id, { multiImageDisplayMode: 'combined' })}
    >
      合并显示
    </button>
    <button
      type="button"
      onClick={() => updateNodeData(id, { multiImageDisplayMode: 'split_nodes' })}
    >
      多节点显示
    </button>
  </div>
)}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/flowCanvas/nodes/FlowNodes.test.tsx -t "multi-image display mode"`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/flowCanvas/nodes/FlowNodes.tsx src/flowCanvas/nodes/FlowNodes.test.tsx
git commit -m "feat: add image multi display mode control"
```

### Task 3: Add store helper for generated child image node fan-out

**Files:**
- Modify: `src/flowCanvas/store/flowCanvasStore.ts`
- Test: `src/flowCanvas/store/flowCanvasStore.test.ts`

- [ ] **Step 1: Write the failing test**

Add a store-level test that:

- starts with one parent image node
- calls a new helper to insert 2 generated child image nodes
- asserts:
  - 2 new image nodes created
  - each child connected from the parent
  - each child gets one image asset + one thumbnail

```ts
test('adds one generated child image node per split-mode result', () => {
  // seed parent node
  // call addGeneratedImageChildren(...)
  // expect node count +2 and edge count +2
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/flowCanvas/store/flowCanvasStore.test.ts -t "generated child image node"`

Expected: FAIL because the helper does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Add a new store action, for example:

```ts
addGeneratedImageChildren: (
  parentNodeId: string,
  items: Array<{
    assetId: string;
    downloadUrl: string;
    mimeType: string;
    width?: number | null;
    height?: number | null;
    title: string;
  }>
) => string[];
```

Behavior:

- create one image node per item
- position nodes to the right of the parent in a vertical stack
- connect each child from parent `out` to child `in`
- return created child node ids

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/flowCanvas/store/flowCanvasStore.test.ts -t "generated child image node"`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/flowCanvas/store/flowCanvasStore.ts src/flowCanvas/store/flowCanvasStore.test.ts
git commit -m "feat: add generated image child node fan-out helper"
```

### Task 4: Branch workflow success handling by display mode

**Files:**
- Modify: `src/flowCanvas/runtime/v2WorkflowRunner.ts`
- Test: `src/flowCanvas/runtime/v2WorkflowRunner.test.ts`

- [ ] **Step 1: Write the failing test**

Add two workflow-runner tests:

1. `combined` mode keeps current parent node result-strip fields
2. `split_nodes` mode creates child nodes and does not leave the same batch visible as a duplicate parent result strip

```ts
test('combined mode keeps generated results attached to the parent image node', async () => {
  // succeeded image run with 2 assets
  // expect generatedResults on parent node
});

test('split_nodes mode creates child image nodes and suppresses duplicate parent filmstrip results', async () => {
  // succeeded image run with 2 assets and parent mode split_nodes
  // expect child nodes added
  // expect parent generatedResults cleared or suppressed for this batch
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/flowCanvas/runtime/v2WorkflowRunner.test.ts -t "split_nodes mode"`

Expected: FAIL because the runner currently always patches combined results onto the parent node.

- [ ] **Step 3: Write minimal implementation**

In `v2WorkflowRunner.ts`:

- detect parent node `multiImageDisplayMode`
- after successful multi-image asset resolution:
  - if mode is `combined`, use existing `buildGeneratedAssetNodePatch`
  - if mode is `split_nodes` and output asset count > 1`:
    - call the new store helper
    - patch parent node with stable success state, current primary thumbnail, and no duplicate generated result strip for that batch

Recommended branch:

```ts
if (isImageNode && assetRefs.length > 1 && currentData.multiImageDisplayMode === 'split_nodes') {
  // create child nodes from assetRefs
  // patch parent as success without generatedResults duplication
} else {
  // existing combined behavior
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/flowCanvas/runtime/v2WorkflowRunner.test.ts -t "split_nodes mode"`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/flowCanvas/runtime/v2WorkflowRunner.ts src/flowCanvas/runtime/v2WorkflowRunner.test.ts
git commit -m "feat: branch multi-image workflow output by display mode"
```

### Task 5: Suppress duplicate parent result-strip rendering in split mode

**Files:**
- Modify: `src/flowCanvas/nodes/FlowNodes.tsx`
- Test: `src/flowCanvas/nodes/FlowNodes.test.tsx`

- [ ] **Step 1: Write the failing test**

Add a rendering regression test:

- given an image node in `split_nodes` mode
- with one current primary asset and historical child fan-out marker for the latest batch
- assert that the result-count badge / expandable strip for the latest batch is not shown

```tsx
test('does not show duplicate parent result strip when the latest multi-image batch was split into child nodes', () => {
  // render parent node in split mode after succeeded multi-image run
  // expect no result-count badge for duplicate batch strip
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/flowCanvas/nodes/FlowNodes.test.tsx -t "duplicate parent result strip"`

Expected: FAIL because the result strip is still derived directly from runtime/generated results.

- [ ] **Step 3: Write minimal implementation**

Add a small suppression rule in `FlowNodes.tsx`, for example:

- introduce a parent-node marker such as `latestMultiImageDelivery: 'combined' | 'split_nodes'`
- if latest delivery is `split_nodes`, do not derive `resultItems` from the latest runtime batch for filmstrip UI

Keep fallback single-thumbnail behavior intact.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/flowCanvas/nodes/FlowNodes.test.tsx -t "duplicate parent result strip"`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/flowCanvas/nodes/FlowNodes.tsx src/flowCanvas/nodes/FlowNodes.test.tsx
git commit -m "feat: suppress duplicate split-mode parent result strip"
```

### Task 6: Update docs, run full verification, and push

**Files:**
- Modify: `PROJECT_RECORD.md`
- Modify: `docs/superpowers/specs/2026-06-15-multi-image-display-mode-design.md` if wording cleanup is needed

- [ ] **Step 1: Update project record**

Document:

- new image-node `multiImageDisplayMode`
- inline `2x+` display-mode control
- split-mode child-node fan-out behavior

- [ ] **Step 2: Run focused test suite**

Run:

```bash
npm test -- src/flowCanvas/runtime/v2WorkflowRunner.test.ts src/flowCanvas/store/flowCanvasStore.test.ts src/flowCanvas/nodes/FlowNodes.test.tsx
```

Expected: PASS

- [ ] **Step 3: Run build verification**

Run:

```bash
npm run build
```

Expected: PASS

- [ ] **Step 4: Commit final changes**

```bash
git add PROJECT_RECORD.md docs/superpowers/specs/2026-06-15-multi-image-display-mode-design.md docs/superpowers/plans/2026-06-15-multi-image-display-mode.md src/flowCanvas/types.ts src/flowCanvas/nodes/FlowNodes.tsx src/flowCanvas/runtime/v2WorkflowRunner.ts src/flowCanvas/store/flowCanvasStore.ts src/flowCanvas/utils/nodeFactory.ts src/flowCanvas/runtime/v2WorkflowRunner.test.ts src/flowCanvas/store/flowCanvasStore.test.ts src/flowCanvas/nodes/FlowNodes.test.tsx
git commit -m "feat: add multi-image display mode for image nodes"
```

- [ ] **Step 5: Push**

```bash
git push origin HEAD:main
```
