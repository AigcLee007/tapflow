# Video Editor Clip Editing Phase 13 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `剪辑工程` timeline clips selectable and editable for start time, duration, and deletion.

**Architecture:** Keep all edits inside the existing `ProductionStudioShell` -> `onUpdateNodeData` path. `VideoEditorContent` owns only local selection state; timeline changes persist as structured `FlowVideoEditorData` patches in the canvas store. This remains non-billable timeline preparation and does not run export/generation workflows.

**Tech Stack:** TypeScript, React, `@xyflow/react`, Zustand canvas store, Vitest, Testing Library.

---

### Task 1: Studio Clip Editing

**Files:**
- Modify: `src/flowCanvas/studios/ProductionStudioShell.tsx`
- Modify: `src/flowCanvas/studios/ProductionStudioShell.test.tsx`

- [ ] **Step 1: Write failing studio tests**

Add a test that renders `剪辑工程`, selects `clip-1`, and verifies:
- `片段开始（秒）` patches `clip.startMs`.
- `片段时长（秒）` patches `clip.outMs`.
- `删除片段` removes the selected clip.
- serialized patches do not contain `blob:` or `data:`.

Expected assertions:

```ts
fireEvent.click(screen.getByRole('button', { name: '选择片段 clip-1' }));
fireEvent.change(screen.getByLabelText('片段开始（秒）'), { target: { value: '1.5' } });
expect(onUpdateNodeData).toHaveBeenCalledWith('video-node', {
  videoEditor: expect.objectContaining({
    timeline: expect.objectContaining({
      clips: expect.arrayContaining([expect.objectContaining({ id: 'clip-1', startMs: 1500 })]),
      durationMs: 4500,
    }),
  }),
});
```

- [ ] **Step 2: Run studio tests and verify red**

Run:

```bash
npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx
```

Expected: FAIL because timeline clip buttons and inspector fields do not exist yet.

- [ ] **Step 3: Implement minimal studio editing**

In `VideoEditorContent`:
- Add local `selectedClipId` state.
- Render clips as buttons with `aria-label="选择片段 <id>"`.
- Show selected clip metadata in the right inspector.
- Add numeric inputs:
  - `片段开始（秒）`
  - `片段时长（秒）`
- Add `删除片段` button.
- Patch clips immutably through `updateTimeline`.
- Recalculate timeline duration from clip ends and subtitle ends.

- [ ] **Step 4: Run studio tests and verify green**

Run:

```bash
npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx
```

Expected: PASS.

### Task 2: Canvas Persistence

**Files:**
- Modify: `src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx`

- [ ] **Step 1: Write failing canvas tests**

Open `剪辑工程` from the canvas store, select `clip-1`, and verify:
- editing `片段时长（秒）` persists into the store.
- clicking `删除片段` removes the clip from the store.

Expected store assertions:

```ts
expect(node?.data.videoEditor?.timeline.clips[0]).toMatchObject({
  id: 'clip-1',
  outMs: 4500,
});
expect(JSON.stringify(node?.data.videoEditor)).not.toMatch(/blob:|data:/);
```

- [ ] **Step 2: Run canvas tests and verify red**

Run:

```bash
npm test -- src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx
```

Expected: FAIL until the studio implements clip editing.

- [ ] **Step 3: Reuse studio patch path**

No new canvas handler should be necessary. The existing `onUpdateNodeData={updateNodeData}` must persist the `videoEditor` patch emitted by the studio.

- [ ] **Step 4: Run canvas tests and verify green**

Run:

```bash
npm test -- src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx
```

Expected: PASS.

### Task 3: Record, Verify, Commit

**Files:**
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Update project record**

Add a dated entry for Phase 13 describing selectable timeline clips, timing edits, deletion, non-billable behavior, and draft-safe metadata.

- [ ] **Step 2: Run focused tests**

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
git add docs/superpowers/plans/2026-07-05-video-editor-clip-editing-phase-13.md src/flowCanvas/studios/ProductionStudioShell.tsx src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx PROJECT_RECORD.md
git commit -m "feat: edit video timeline clips"
```

Expected: no whitespace errors and a commit on `codex/canvas-production-suite-phase-1`.
