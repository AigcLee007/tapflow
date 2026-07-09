# Director Desk Synthesize To Canvas Phase 9 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the 3D Director Desk turn a selected shot into a downstream image-generation node on the current canvas.

**Architecture:** Keep the studio shell testable by exposing an optional callback from `ProductionStudioShell` instead of importing the canvas store inside the studio. `AiFlowCanvas` owns node creation through the existing `addNode` action and writes only structured director metadata into the new image node. This action prepares a canvas node only; it does not create assets, start workflow runs, or reserve credits.

**Tech Stack:** TypeScript, React, `@xyflow/react`, Zustand canvas store, Vitest, Testing Library.

---

### Task 1: Studio Callback Contract

**Files:**
- Modify: `src/flowCanvas/studios/ProductionStudioShell.tsx`
- Modify: `src/flowCanvas/studios/ProductionStudioShell.test.tsx`

- [ ] **Step 1: Write the failing shell test**

Add a test that renders a director node with one camera and one shot, clicks `合成到画布`, and expects the callback to receive a structured image-node payload:

```ts
expect(onCreateCanvasNodeFromStudio).toHaveBeenCalledWith({
  kind: 'image',
  position: { x: 420, y: 40 },
  data: expect.objectContaining({
    title: '镜头 1 生成图',
    generationPrompt: '镜头缓慢推进',
    params: expect.objectContaining({
      director3d: expect.objectContaining({
        sourceDirectorNodeId: 'director-node',
        cameraId: 'camera-1',
        shotId: 'shot-1',
      }),
    }),
  }),
});
```

- [ ] **Step 2: Run the focused test and verify red**

Run:

```bash
npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx
```

Expected: FAIL because `合成到画布` and the callback do not exist yet.

- [ ] **Step 3: Implement the minimal shell contract**

Add:

```ts
type StudioCanvasNodeRequest = {
  kind: 'image';
  position: { x: number; y: number };
  data: Partial<FlowNodeData>;
};
```

Add `onCreateCanvasNodeFromStudio?: (request: StudioCanvasNodeRequest) => void` to `ProductionStudioShellProps`, pass it into `DirectorDeskContent`, and build the request from the selected shot or first shot fallback. Include shot/camera prompt, shot/camera ids, camera position/target/focal, motion, duration, and `sourceDirectorNodeId`. Do not include URL, blob, data URI, File, or Blob values.

- [ ] **Step 4: Run focused shell tests and verify green**

Run:

```bash
npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx
```

Expected: PASS.

### Task 2: Canvas Store Wiring

**Files:**
- Modify: `src/flowCanvas/canvas/AiFlowCanvas.tsx`
- Modify: `src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx`

- [ ] **Step 1: Write the failing canvas integration test**

Open the director studio from the canvas event, click `合成到画布`, then assert the store has a new image node beside the director node:

```ts
const imageNode = useFlowCanvasStore
  .getState()
  .nodes.find((item) => item.type === 'image' && item.data.params?.director3d);
expect(imageNode?.position).toEqual({ x: 540, y: 120 });
expect(imageNode?.data.generationPrompt).toBe('俯拍建立空间关系');
```

- [ ] **Step 2: Run the focused canvas test and verify red**

Run:

```bash
npm test -- src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx
```

Expected: FAIL because the studio does not add nodes through the canvas store yet.

- [ ] **Step 3: Implement minimal canvas wiring**

In `AiFlowCanvas`, add a callback that calls:

```ts
addNode(request.kind, request.position, request.data, { selected: true });
```

Pass it to `ProductionStudioShell`. The position is absolute canvas coordinates computed by the studio as the source director node position plus `{ x: 420, y: 40 }`.

- [ ] **Step 4: Run focused canvas tests and verify green**

Run:

```bash
npm test -- src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx
```

Expected: PASS.

### Task 3: Project Record, Verification, And Commit

**Files:**
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Update project record**

Add a dated entry describing Phase 9: director shot synthesis to a downstream image node, non-billable preparation behavior, structured metadata, and validation.

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
git add docs/superpowers/plans/2026-07-05-director-desk-synthesize-to-canvas-phase-9.md src/flowCanvas/studios/ProductionStudioShell.tsx src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx PROJECT_RECORD.md
git commit -m "feat: synthesize director shots to canvas"
```

Expected: no whitespace errors and a commit on `codex/canvas-production-suite-phase-1`.
