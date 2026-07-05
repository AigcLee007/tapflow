# Video Editor Export Node Phase 14 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the video editor studio export its timeline as a runnable canvas video node without starting a workflow run or bypassing billing.

**Architecture:** Extend the existing production studio callback so it can request either an image node or a video node. `VideoEditorContent` emits a draft-safe video export request with a structured `params.videoEditor` snapshot, and `AiFlowCanvas` uses the existing store `addNode` path so the default `video.default` route and later target-node workflow billing remain intact.

**Tech Stack:** Vite, React, TypeScript, Vitest, React Testing Library, Zustand canvas store, `@xyflow/react`.

---

### Task 1: Studio Export Request Contract

**Files:**
- Modify: `src/flowCanvas/studios/ProductionStudioShell.tsx`
- Test: `src/flowCanvas/studios/ProductionStudioShell.test.tsx`

- [x] **Step 1: Write the failing test**

Add this test near the video editor tests:

```tsx
it('exports a safe video node request from the video editor timeline', () => {
  const onCreateCanvasNodeFromStudio = vi.fn();
  render(
    <ProductionStudioShell
      studio="video_editor"
      node={videoNode as any}
      onClose={vi.fn()}
      onCreateCanvasNodeFromStudio={onCreateCanvasNodeFromStudio}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: '导出到画布' }));

  expect(onCreateCanvasNodeFromStudio).toHaveBeenCalledWith({
    kind: 'video',
    position: { x: 420, y: 40 },
    data: expect.objectContaining({
      durationMs: 3000,
      generationPrompt: '根据剪辑工程时间线生成视频',
      params: {
        videoEditor: expect.objectContaining({
          sourceVideoEditorNodeId: 'video-node',
          timeline: expect.objectContaining({
            clips: [
              expect.objectContaining({
                assetId: 'asset-video-1',
                id: 'clip-1',
              }),
            ],
          }),
        }),
      },
      title: '剪辑工程导出',
    }),
  });
  expect(JSON.stringify(onCreateCanvasNodeFromStudio.mock.calls[0]?.[0])).not.toMatch(/blob:|data:/);
});
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx
```

Expected: FAIL because there is no `导出到画布` button and `StudioCanvasNodeRequest` only accepts `kind: 'image'`.

- [x] **Step 3: Write minimal implementation**

Change the request type:

```ts
export type StudioCanvasNodeRequest = {
  kind: 'image' | 'video';
  position: { x: number; y: number };
  data: Partial<FlowNodeData>;
};
```

Pass `nodePosition` and `onCreateCanvasNodeFromStudio` into `VideoEditorContent`, then add:

```ts
const exportVideoToCanvas = () => {
  onCreateCanvasNodeFromStudio?.({
    kind: 'video',
    position: {
      x: nodePosition.x + 420,
      y: nodePosition.y + 40,
    },
    data: {
      title: '剪辑工程导出',
      durationMs: timeline.durationMs,
      generationPrompt: '根据剪辑工程时间线生成视频',
      params: {
        videoEditor: {
          sourceVideoEditorNodeId: nodeId,
          aspect: videoEditor.aspect,
          resolution: videoEditor.resolution,
          timeline,
        },
      },
    },
  });
};
```

Add a `导出到画布` action button in the video editor action stack.

- [x] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx
```

Expected: PASS.

### Task 2: Canvas Landing Behavior

**Files:**
- Modify: `src/flowCanvas/canvas/AiFlowCanvas.tsx`
- Test: `src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx`

- [x] **Step 1: Write the failing test**

Add this test after the video editor canvas tests:

```tsx
it('creates a runnable video node from the video editor export request', () => {
  useFlowCanvasStore.getState().loadProject({
    id: 'project-1',
    title: '项目',
    nodes: [videoNodeWithClip as any],
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
  fireEvent.click(screen.getByRole('button', { name: '导出到画布' }));

  const state = useFlowCanvasStore.getState();
  const exported = state.nodes.find((item) => item.type === 'video' && item.data.title === '剪辑工程导出');
  expect(exported).toBeTruthy();
  expect(exported?.position).toEqual({ x: 600, y: 200 });
  expect(exported?.selected).toBe(true);
  expect(exported?.data.routeKey).toBe('video.default');
  expect(exported?.data.params).toEqual({
    videoEditor: expect.objectContaining({
      sourceVideoEditorNodeId: 'video-node',
      timeline: expect.objectContaining({
        clips: [expect.objectContaining({ assetId: 'asset-video-1' })],
      }),
    }),
  });
  expect(JSON.stringify(exported?.data)).not.toMatch(/blob:|data:/);
});
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx
```

Expected: FAIL until Task 1 implementation is present and the callback can create `video` nodes.

- [x] **Step 3: Write minimal implementation**

No special canvas branching is needed after `StudioCanvasNodeRequest.kind` accepts `video`; keep:

```ts
const handleCreateCanvasNodeFromStudio = useCallback(
  (request: StudioCanvasNodeRequest) => {
    addNode(request.kind, request.position, request.data, { selected: true });
  },
  [addNode],
);
```

The existing node factory supplies `routeKey: 'video.default'`.

- [x] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx
```

Expected: PASS.

### Task 3: Project Record and Full Verification

**Files:**
- Modify: `PROJECT_RECORD.md`

- [x] **Step 1: Update project record**

Add an entry for Phase 14 noting:

```md
- Phase 14 added video editor export-to-canvas: a clip timeline can create a downstream runnable `video` node with `params.videoEditor`, while generation, asset creation, and billing remain on the existing v2 workflow run path.
```

- [x] **Step 2: Run focused tests**

Run:

```bash
npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx
```

Expected: PASS.

- [x] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: PASS, allowing existing non-blocking warnings.

- [x] **Step 4: Run whitespace check**

Run:

```bash
git diff --check
```

Expected: no output and exit code 0.

- [x] **Step 5: Commit**

Stage only current phase files:

```bash
git add src/flowCanvas/studios/ProductionStudioShell.tsx src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx PROJECT_RECORD.md docs/superpowers/plans/2026-07-05-video-editor-export-node-phase-14.md
git commit -m "feat: export video editor timeline to canvas"
```
