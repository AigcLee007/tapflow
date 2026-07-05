# Director Desk Sync Storyboard Phase 10 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the 3D Director Desk sync a selected shot into a storyboard cell so camera blocking, prompt writing, image generation, and storyboard planning connect on the same canvas.

**Architecture:** Add a small storyboard sync utility that converts director shot/camera metadata into a draft-safe storyboard patch. `ProductionStudioShell` exposes a callback request for storyboard sync; `AiFlowCanvas` owns the actual canvas mutation by updating the nearest existing storyboard node or creating one beside the director node. This remains non-billable preparation work and stores only structured metadata plus asset ids when already available.

**Tech Stack:** TypeScript, React, `@xyflow/react`, Zustand canvas store, Vitest, Testing Library.

---

### Task 1: Storyboard Sync Utility

**Files:**
- Create: `src/flowCanvas/utils/storyboardDirectorSync.ts`
- Create: `src/flowCanvas/utils/storyboardDirectorSync.test.ts`

- [ ] **Step 1: Write the failing utility test**

Add tests that prove a director shot patches the targeted storyboard cell and falls back to the first empty cell when no target is stored:

```ts
const result = buildStoryboardPatchFromDirectorShot({
  storyboard,
  sourceDirectorNodeId: 'director-node',
  shot,
  shotIndex: 0,
  camera,
});
expect(result.selectedIndex).toBe(1);
expect(result.cells[1]).toMatchObject({
  title: '镜头 1 · 主镜头',
  prompt: '镜头缓慢推进',
  directorCameraId: 'camera-1',
  directorShotId: 'shot-1',
  sourceNodeId: 'director-node',
});
```

- [ ] **Step 2: Run utility test and verify red**

Run:

```bash
npm test -- src/flowCanvas/utils/storyboardDirectorSync.test.ts
```

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement minimal helper**

Export:

```ts
buildStoryboardPatchFromDirectorShot(input): FlowStoryboardData
```

The helper must normalize the storyboard first, use `shot.targetStoryboardCellId` when it matches a cell id, otherwise use the first cell without prompt/asset/directorShotId, then patch title, prompt, `sourceNodeId`, `directorCameraId`, `directorShotId`, and aspect. It must not write transient media URLs.

- [ ] **Step 4: Run utility test and verify green**

Run:

```bash
npm test -- src/flowCanvas/utils/storyboardDirectorSync.test.ts
```

Expected: PASS.

### Task 2: Studio Sync Request

**Files:**
- Modify: `src/flowCanvas/studios/ProductionStudioShell.tsx`
- Modify: `src/flowCanvas/studios/ProductionStudioShell.test.tsx`

- [ ] **Step 1: Write the failing shell test**

Add a test that selects a director shot, clicks `同步到故事板`, and expects:

```ts
expect(onSyncDirectorShotToStoryboard).toHaveBeenCalledWith({
  sourceDirectorNodeId: 'director-node',
  sourceDirectorNodePosition: { x: 0, y: 0 },
  shotIndex: 0,
  shot: expect.objectContaining({ id: 'shot-1' }),
  camera: expect.objectContaining({ id: 'camera-1' }),
});
```

- [ ] **Step 2: Run shell tests and verify red**

Run:

```bash
npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx
```

Expected: FAIL because the callback/button does not exist.

- [ ] **Step 3: Implement minimal studio request**

Add `StudioStoryboardSyncRequest` and `onSyncDirectorShotToStoryboard?: (request) => void`. Add a `同步到故事板` button next to `合成到画布`, disabled when no shot/camera is available. The request carries only normalized shot/camera objects, index, source node id, and source node position.

- [ ] **Step 4: Run shell tests and verify green**

Run:

```bash
npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx
```

Expected: PASS.

### Task 3: Canvas Storyboard Mutation

**Files:**
- Modify: `src/flowCanvas/canvas/AiFlowCanvas.tsx`
- Modify: `src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx`

- [ ] **Step 1: Write failing canvas tests**

Cover two flows:
- existing storyboard node is patched when present.
- a storyboard node is created near the director node when absent.

Expected store assertion:

```ts
expect(storyboardNode?.data.storyboard?.cells[0]).toMatchObject({
  prompt: '俯拍建立空间关系',
  directorCameraId: 'camera-1',
  directorShotId: 'shot-1',
  sourceNodeId: 'director-node',
});
```

- [ ] **Step 2: Run canvas tests and verify red**

Run:

```bash
npm test -- src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx
```

Expected: FAIL because the canvas does not respond to storyboard sync requests yet.

- [ ] **Step 3: Implement canvas wiring**

Use `nodes.find((node) => node.type === 'storyboard')` for the first slice. If one exists, call `updateNodeData(storyboard.id, { storyboard: buildStoryboardPatchFromDirectorShot(...) })`. If none exists, call `addNode('storyboard', { x: source.x + 420, y: source.y + 340 }, { title: '导演分镜板', storyboard: patch }, { selected: true })`.

- [ ] **Step 4: Run canvas tests and verify green**

Run:

```bash
npm test -- src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx
```

Expected: PASS.

### Task 4: Project Record, Verification, And Commit

**Files:**
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Update project record**

Add a dated entry describing Phase 10: director shot to storyboard sync, non-billable behavior, draft-safe metadata, and validation.

- [ ] **Step 2: Run focused regression tests**

Run:

```bash
npm test -- src/flowCanvas/utils/storyboardDirectorSync.test.ts src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx
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
git add docs/superpowers/plans/2026-07-05-director-desk-sync-storyboard-phase-10.md src/flowCanvas/utils/storyboardDirectorSync.ts src/flowCanvas/utils/storyboardDirectorSync.test.ts src/flowCanvas/studios/ProductionStudioShell.tsx src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx PROJECT_RECORD.md
git commit -m "feat: sync director shots to storyboard"
```

Expected: no whitespace errors and a commit on `codex/canvas-production-suite-phase-1`.
