# Storyboard Sync Video Editor Phase 12 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let storyboard cells that already reference saved assets become timeline image clips in a video editor node.

**Architecture:** Keep the storyboard studio as a request emitter and let `AiFlowCanvas` own canvas mutation. A new draft-safe utility converts storyboard `assetId` cells into `FlowVideoEditorData.timeline.clips`, preserving existing non-storyboard clips and replacing previous clips synced from the same storyboard so repeated syncs stay idempotent. This is non-billable preparation only; real video export remains a later backend workflow with server-side billing.

**Tech Stack:** TypeScript, React, `@xyflow/react`, Zustand canvas store, Vitest, Testing Library.

---

### Task 1: Storyboard To Video Timeline Utility

**Files:**
- Create: `src/flowCanvas/utils/storyboardVideoSync.ts`
- Create: `src/flowCanvas/utils/storyboardVideoSync.test.ts`
- Modify: `src/flowCanvas/types.ts`

- [ ] **Step 1: Write failing utility tests**

Add tests that call `buildVideoEditorFromStoryboardAssets` with a storyboard containing saved `assetId` cells.

Expected behavior:

```ts
const next = buildVideoEditorFromStoryboardAssets({
  sourceStoryboardNodeId: 'storyboard-node',
  storyboard,
  videoEditor,
});

expect(next.timeline.clips).toEqual([
  expect.objectContaining({ id: 'clip-existing', assetId: 'asset-video-1', kind: 'video' }),
  expect.objectContaining({
    id: 'storyboard-storyboard-node-cell-1',
    assetId: 'asset-image-1',
    kind: 'image',
    sourceStoryboardNodeId: 'storyboard-node',
    storyboardCellId: 'cell-1',
    storyboardShotNo: 1,
    startMs: 3000,
    inMs: 0,
    outMs: 3000,
    speed: 1,
  }),
]);
```

Also test that repeated syncs replace previous clips from the same storyboard instead of duplicating them, and that serialized output never contains `blob:` or `data:`.

- [ ] **Step 2: Run utility tests and verify red**

Run:

```bash
npm test -- src/flowCanvas/utils/storyboardVideoSync.test.ts
```

Expected: FAIL until the utility exists and produces storyboard-backed clips.

- [ ] **Step 3: Implement minimal utility**

Create:

```ts
export function buildVideoEditorFromStoryboardAssets(input: {
  sourceStoryboardNodeId: string;
  storyboard: FlowStoryboardData;
  videoEditor?: FlowVideoEditorData;
}): FlowVideoEditorData
```

Implementation rules:
- Normalize storyboard cells with `normalizeStoryboardData`.
- Use only `assetId` values; do not copy URLs, blobs, or raw media data.
- Preserve existing non-storyboard clips, audio, subtitles, aspect, resolution, and exported asset id.
- Remove clips whose `sourceStoryboardNodeId` matches the syncing storyboard before adding the latest storyboard clips.
- Append synced image clips after the preserved clips.
- Use 3000 ms per storyboard image clip.
- Set duration to at least the end of clips/subtitles and existing duration.

- [ ] **Step 4: Run utility tests and verify green**

Run:

```bash
npm test -- src/flowCanvas/utils/storyboardVideoSync.test.ts
```

Expected: PASS.

### Task 2: Studio Sync Request

**Files:**
- Modify: `src/flowCanvas/studios/ProductionStudioShell.tsx`
- Modify: `src/flowCanvas/studios/ProductionStudioShell.test.tsx`

- [ ] **Step 1: Write failing studio test**

Render a storyboard studio with at least one `assetId` cell and click `同步到剪辑工程`.

Expected callback:

```ts
expect(onSyncStoryboardToVideoEditor).toHaveBeenCalledWith({
  sourceStoryboardNodeId: 'storyboard-node',
  sourceStoryboardNodePosition: { x: 0, y: 0 },
  storyboard: expect.objectContaining({
    cells: expect.arrayContaining([expect.objectContaining({ id: 'cell-1', assetId: 'asset-1' })]),
  }),
});
```

- [ ] **Step 2: Run studio tests and verify red**

Run:

```bash
npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx
```

Expected: FAIL because the storyboard studio action does not exist yet.

- [ ] **Step 3: Implement minimal studio action**

Add:
- `StudioStoryboardVideoSyncRequest` type.
- `onSyncStoryboardToVideoEditor` prop.
- A storyboard button labeled `同步到剪辑工程`.
- Disabled state when no normalized storyboard cell has `assetId`.

Do not perform canvas mutation in the studio shell.

- [ ] **Step 4: Run studio tests and verify green**

Run:

```bash
npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx
```

Expected: PASS.

### Task 3: Canvas Mutation

**Files:**
- Modify: `src/flowCanvas/canvas/AiFlowCanvas.tsx`
- Modify: `src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx`

- [ ] **Step 1: Write failing canvas tests**

Add two tests:
- With an existing `video_editor` node, clicking `同步到剪辑工程` updates that node's timeline.
- Without a `video_editor` node, clicking `同步到剪辑工程` creates a selected `video_editor` node next to the storyboard.

Expected store assertions:

```ts
expect(videoNode?.data.videoEditor?.timeline.clips[0]).toMatchObject({
  assetId: 'asset-story-1',
  kind: 'image',
  sourceStoryboardNodeId: 'storyboard-node',
  storyboardCellId: 'cell-1',
});
expect(JSON.stringify(videoNode?.data.videoEditor)).not.toMatch(/blob:|data:/);
```

- [ ] **Step 2: Run canvas tests and verify red**

Run:

```bash
npm test -- src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx
```

Expected: FAIL until canvas wiring handles the sync request.

- [ ] **Step 3: Implement canvas handler**

In `AiFlowCanvas.tsx`, add a callback that:
- Finds the first `video_editor` node in the current store.
- Builds next `videoEditor` data with `buildVideoEditorFromStoryboardAssets`.
- Updates the existing node when present.
- Creates a new `video_editor` node at `{ x: storyboard.x + 420, y: storyboard.y + 40 }` when absent.
- Selects the created node.

- [ ] **Step 4: Run canvas tests and verify green**

Run:

```bash
npm test -- src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx
```

Expected: PASS.

### Task 4: Record, Verify, Commit

**Files:**
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Update project record**

Add a dated entry for Phase 12 describing storyboard asset cells syncing into video-editor timeline clips, non-billable preparation behavior, draft-safe `assetId` metadata, and validation.

- [ ] **Step 2: Run focused tests**

Run:

```bash
npm test -- src/flowCanvas/utils/storyboardVideoSync.test.ts src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx
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
git add docs/superpowers/plans/2026-07-05-storyboard-sync-video-editor-phase-12.md src/flowCanvas/types.ts src/flowCanvas/utils/storyboardVideoSync.ts src/flowCanvas/utils/storyboardVideoSync.test.ts src/flowCanvas/studios/ProductionStudioShell.tsx src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx PROJECT_RECORD.md
git commit -m "feat: sync storyboard assets to video editor"
```

Expected: no whitespace errors and a commit on `codex/canvas-production-suite-phase-1`.
