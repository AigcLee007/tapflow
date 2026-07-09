# Video Editor Studio Editing Phase 5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the canvas-native video editor studio create and persist basic timeline clips, subtitles, and duration edits inside `videoEditor` node data.

**Architecture:** Keep the video editor as the same `ProductionStudioShell` overlay used by storyboard and director editing. The shell receives `onUpdateNodeData(nodeId, patch)` and writes only structured `videoEditor` timeline fields back to the selected node. This slice is draft editing only; no server export, asset creation, generation, or billing mutation is introduced.

**Tech Stack:** React, TypeScript, Zustand canvas store, Testing Library, Vitest.

---

## Scope

- Add actions in the `剪辑工程` studio for `添加图片片段`, `添加视频片段`, and `添加字幕`.
- Add a duration input labelled `工程时长（秒）`.
- Persist edits through the existing `updateNodeData` callback.
- Keep timeline values asset-id based and structured JSON only.
- Keep editing free and non-billable; server-side export remains outside this slice.

## File Map

- Modify: `src/flowCanvas/studios/ProductionStudioShell.tsx`
- Modify: `src/flowCanvas/studios/ProductionStudioShell.test.tsx`
- Modify: `src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx`
- Modify: `PROJECT_RECORD.md`

## Task 1: Video Editor Shell Timeline Editing

- [ ] **Step 1: Write failing shell tests**

Add tests to `src/flowCanvas/studios/ProductionStudioShell.test.tsx` proving the video editor shell emits structured patches:

```tsx
const onUpdateNodeData = vi.fn();
render(
  <ProductionStudioShell
    studio="video_editor"
    node={videoNode as any}
    onClose={vi.fn()}
    onUpdateNodeData={onUpdateNodeData}
  />,
);

fireEvent.click(screen.getByRole('button', { name: '添加图片片段' }));
expect(onUpdateNodeData).toHaveBeenCalledWith('video-node', {
  videoEditor: expect.objectContaining({
    timeline: expect.objectContaining({
      clips: expect.arrayContaining([
        expect.objectContaining({ id: 'clip-2', assetId: 'placeholder-image-2', kind: 'image' }),
      ]),
    }),
  }),
});

fireEvent.click(screen.getByRole('button', { name: '添加视频片段' }));
expect(onUpdateNodeData).toHaveBeenCalledWith('video-node', {
  videoEditor: expect.objectContaining({
    timeline: expect.objectContaining({
      clips: expect.arrayContaining([
        expect.objectContaining({ id: 'clip-2', assetId: 'placeholder-video-2', kind: 'video' }),
      ]),
    }),
  }),
});

fireEvent.click(screen.getByRole('button', { name: '添加字幕' }));
expect(onUpdateNodeData).toHaveBeenCalledWith('video-node', {
  videoEditor: expect.objectContaining({
    timeline: expect.objectContaining({
      subtitles: expect.arrayContaining([
        expect.objectContaining({ id: 'subtitle-2', text: '字幕 2' }),
      ]),
    }),
  }),
});

fireEvent.change(screen.getByLabelText('工程时长（秒）'), { target: { value: '12.5' } });
expect(onUpdateNodeData).toHaveBeenCalledWith('video-node', {
  videoEditor: expect.objectContaining({
    timeline: expect.objectContaining({ durationMs: 12500 }),
  }),
});

expect(JSON.stringify(onUpdateNodeData.mock.calls.at(-1)?.[1])).not.toMatch(/blob:|data:/);
```

- [ ] **Step 2: Run shell tests to verify red**

Run:

```bash
npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx
```

Expected: fail because the video editor shell currently renders a read-only timeline and has no timeline edit actions.

- [ ] **Step 3: Implement video editor patching**

Update `ProductionStudioShell.tsx`:

- Pass `node.id` and `onUpdateNodeData` into `VideoEditorContent`.
- Add `normalizeVideoEditorData(data)` returning default version, aspect, resolution, clips, audio, subtitles, and duration.
- Add `buildVideoClip(kind, clips)` and `buildVideoSubtitle(subtitles)` helpers.
- Render action buttons with these accessible names:
  - `添加图片片段`
  - `添加视频片段`
  - `添加字幕`
- Render a numeric input labelled `工程时长（秒）`.
- On every action, call `onUpdateNodeData(nodeId, { videoEditor: nextVideoEditor })`.

- [ ] **Step 4: Run shell tests to verify green**

Run:

```bash
npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx
```

Expected: pass.

## Task 2: Canvas Store Integration

- [ ] **Step 1: Write failing integration test**

Add a test in `src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx`:

```tsx
useFlowCanvasStore.getState().loadProject({
  id: 'project-1',
  title: '项目',
  nodes: [videoNode as any],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  version: 1,
  updatedAt: 1,
});

render(<AiFlowCanvas cullingEnabled={false} />);

act(() => {
  window.dispatchEvent(
    new CustomEvent(OPEN_PRODUCTION_STUDIO_EVENT, {
      detail: { nodeId: 'video-node', studio: 'video_editor' },
    }),
  );
});

fireEvent.click(screen.getByRole('button', { name: '添加图片片段' }));

const node = useFlowCanvasStore.getState().nodes.find((item) => item.id === 'video-node');
expect(node?.data.videoEditor?.timeline.clips[0]).toMatchObject({
  kind: 'image',
  assetId: 'placeholder-image-1',
});
expect(JSON.stringify(node?.data.videoEditor)).not.toMatch(/blob:|data:/);
```

- [ ] **Step 2: Run integration test to verify red or confirm existing callback**

Run:

```bash
npm test -- src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx
```

Expected: fail until `VideoEditorContent` accepts and uses the existing `onUpdateNodeData` prop; if the shared callback is already wired, it may pass after Task 1 implementation.

- [ ] **Step 3: Keep canvas callback path unchanged**

No new canvas persistence API is needed. The existing `ProductionStudioShell` invocation in `AiFlowCanvas.tsx` should continue to pass `onUpdateNodeData={updateNodeData}`.

- [ ] **Step 4: Run integration test to verify green**

Run:

```bash
npm test -- src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx
```

Expected: pass.

## Task 3: Validation And Record

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx
```

- [ ] **Step 2: Run build**

Run:

```bash
npm run build
```

- [ ] **Step 3: Update `PROJECT_RECORD.md`**

Add a 2026-07-05 entry for video editor studio timeline editing, including validation commands and the editing-only billing note.

- [ ] **Step 4: Commit relevant changes**

Run:

```bash
git add docs/superpowers/plans/2026-07-05-video-editor-studio-editing-phase-5.md src/flowCanvas/studios/ProductionStudioShell.tsx src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx PROJECT_RECORD.md
git commit -m "feat: add video editor studio editing"
```
