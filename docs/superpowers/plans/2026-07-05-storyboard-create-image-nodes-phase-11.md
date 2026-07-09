# Storyboard Create Image Nodes Phase 11 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let storyboard cells create downstream image-generation nodes on the canvas, so director-synced storyboards can become executable shot images.

**Architecture:** Keep `ProductionStudioShell` stateless by emitting a storyboard image-node request from the storyboard studio. `AiFlowCanvas` owns node creation through the existing `addNode` store action. The created image nodes are draft-safe, non-billable preparation nodes; actual AI generation and credit reserve/settle/refund still happen only when the user runs those image nodes through the existing backend workflow.

**Tech Stack:** TypeScript, React, `@xyflow/react`, Zustand canvas store, Vitest, Testing Library.

---

### Task 1: Studio Storyboard Image Requests

**Files:**
- Modify: `src/flowCanvas/studios/ProductionStudioShell.tsx`
- Modify: `src/flowCanvas/studios/ProductionStudioShell.test.tsx`

- [ ] **Step 1: Write failing shell tests**

Add tests for:
- clicking `生成选中镜头` emits one `image` request for the selected storyboard cell.
- clicking `生成全部镜头` emits one request per storyboard cell with a prompt.

Expected request shape:

```ts
expect(onCreateCanvasNodeFromStudio).toHaveBeenCalledWith({
  kind: 'image',
  position: { x: 420, y: 40 },
  data: expect.objectContaining({
    title: '镜头 2 · 近景',
    generationPrompt: '角色回头',
    generationMode: 'standard',
    params: expect.objectContaining({
      storyboard: expect.objectContaining({
        sourceStoryboardNodeId: 'storyboard-node',
        cellId: 'cell-2',
        shotNo: 2,
      }),
    }),
  }),
});
```

- [ ] **Step 2: Run shell tests and verify red**

Run:

```bash
npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx
```

Expected: FAIL because the storyboard buttons/request builder do not exist.

- [ ] **Step 3: Implement minimal studio requests**

Add a storyboard helper inside `ProductionStudioShell.tsx` that converts a cell to `StudioCanvasNodeRequest`. Include:
- `title`
- `generationMode: 'standard'`
- `generationPrompt`
- `params.storyboard.sourceStoryboardNodeId`
- `params.storyboard.cellId`
- `params.storyboard.shotNo`
- optional director ids and source asset ids when present

Do not write `blob:`, `data:`, base64, `File`, or `Blob`.

- [ ] **Step 4: Run shell tests and verify green**

Run:

```bash
npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx
```

Expected: PASS.

### Task 2: Canvas Store Creation

**Files:**
- Modify: `src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx`
- Existing wiring in `src/flowCanvas/canvas/AiFlowCanvas.tsx` should be reused unless tests prove a gap.

- [ ] **Step 1: Write failing canvas tests**

Open storyboard studio and assert:
- `生成选中镜头` creates one selected image node beside the storyboard node.
- `生成全部镜头` creates one image node per prompted storyboard cell with stable vertical spacing.

Expected store assertions:

```ts
expect(imageNode?.position).toEqual({ x: 500, y: 160 });
expect(imageNode?.data.generationPrompt).toBe('旧提示词');
expect(imageNode?.data.params?.storyboard).toMatchObject({
  sourceStoryboardNodeId: 'storyboard-node',
  cellId: 'cell-1',
});
```

- [ ] **Step 2: Run canvas tests and verify red**

Run:

```bash
npm test -- src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx
```

Expected: FAIL until the shell emits requests or if canvas wiring needs adjustment.

- [ ] **Step 3: Reuse canvas node creation callback**

Pass the existing `onCreateCanvasNodeFromStudio` callback into storyboard content and ensure each request uses absolute canvas coordinates derived from the storyboard node position plus offsets.

- [ ] **Step 4: Run canvas tests and verify green**

Run:

```bash
npm test -- src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx
```

Expected: PASS.

### Task 3: Project Record, Verification, And Commit

**Files:**
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Update project record**

Add a dated entry describing Phase 11: storyboard cells can create downstream image nodes, non-billable preparation behavior, draft-safe metadata, and validation.

- [ ] **Step 2: Run focused regression tests**

Run:

```bash
npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run full build**

Run:

```bash
npm run build
```

Expected: PASS, allowing existing Browserslist, dynamic-import, and chunk-size warnings.

- [ ] **Step 4: Check whitespace and commit**

Run:

```bash
git diff --check
git add docs/superpowers/plans/2026-07-05-storyboard-create-image-nodes-phase-11.md src/flowCanvas/studios/ProductionStudioShell.tsx src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx PROJECT_RECORD.md
git commit -m "feat: create image nodes from storyboard"
```

Expected: no whitespace errors and a commit on `codex/canvas-production-suite-phase-1`.
