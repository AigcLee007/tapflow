# Director Desk Inspector Editing Phase 6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the canvas-native 3D Director Desk studio select actors, cameras, and shots, then persist basic inspector edits into `director3d` node data.

**Architecture:** Keep editing inside `ProductionStudioShell` and reuse `onUpdateNodeData(nodeId, patch)` for all persistence. Selection is local React state because it is only a studio UI affordance; actor/camera/shot edits are persisted as structured `director3d` fields on the canvas node. This slice remains staging-only and free; no AI render, asset write, export, pricing, or billing path is added.

**Tech Stack:** React, TypeScript, Zustand canvas store, Testing Library, Vitest.

---

## Scope

- Make actor, camera, and shot rows selectable in the `3D导演台` studio.
- Show a compact inspector for the selected item.
- Persist:
  - actor rename
  - actor visibility toggle
  - actor lock toggle
  - camera prompt edit
  - shot prompt edit
- Keep persisted data structured and free of `blob:`, `data:`, base64, `File`, or `Blob` media.

## File Map

- Modify: `src/flowCanvas/studios/ProductionStudioShell.tsx`
- Modify: `src/flowCanvas/studios/ProductionStudioShell.test.tsx`
- Modify: `src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx`
- Modify: `PROJECT_RECORD.md`

## Task 1: Director Shell Inspector Editing

- [ ] **Step 1: Write failing shell tests**

Add a test to `src/flowCanvas/studios/ProductionStudioShell.test.tsx` proving selected actor edits emit structured patches:

```tsx
const onUpdateNodeData = vi.fn();
render(
  <ProductionStudioShell
    studio="director3d"
    node={directorNode as any}
    onClose={vi.fn()}
    onUpdateNodeData={onUpdateNodeData}
  />,
);

fireEvent.click(screen.getByRole('button', { name: '选择对象 角色 A' }));
fireEvent.change(screen.getByLabelText('对象名称'), { target: { value: '主角 A' } });
expect(onUpdateNodeData).toHaveBeenCalledWith('director-node', {
  director3d: expect.objectContaining({
    actors: expect.arrayContaining([expect.objectContaining({ id: 'actor-1', name: '主角 A' })]),
  }),
});

fireEvent.click(screen.getByRole('checkbox', { name: '对象可见' }));
expect(onUpdateNodeData).toHaveBeenCalledWith('director-node', {
  director3d: expect.objectContaining({
    actors: expect.arrayContaining([expect.objectContaining({ id: 'actor-1', visible: false })]),
  }),
});

fireEvent.click(screen.getByRole('checkbox', { name: '对象锁定' }));
expect(JSON.stringify(onUpdateNodeData.mock.calls.at(-1)?.[1])).not.toMatch(/blob:|data:/);
```

Add another test proving camera and shot prompt edits emit structured patches:

```tsx
const onUpdateNodeData = vi.fn();
render(
  <ProductionStudioShell
    studio="director3d"
    node={directorNode as any}
    onClose={vi.fn()}
    onUpdateNodeData={onUpdateNodeData}
  />,
);

fireEvent.click(screen.getByRole('button', { name: '选择对象 主镜头' }));
fireEvent.change(screen.getByLabelText('镜头提示词'), { target: { value: '低机位环绕主角' } });
expect(onUpdateNodeData).toHaveBeenCalledWith('director-node', {
  director3d: expect.objectContaining({
    cameras: expect.arrayContaining([expect.objectContaining({ id: 'camera-1', prompt: '低机位环绕主角' })]),
  }),
});

fireEvent.click(screen.getByRole('button', { name: '选择镜头段 1' }));
fireEvent.change(screen.getByLabelText('镜头段提示词'), { target: { value: '镜头缓慢推进' } });
expect(onUpdateNodeData).toHaveBeenCalledWith('director-node', {
  director3d: expect.objectContaining({
    shots: expect.arrayContaining([expect.objectContaining({ id: 'shot-1', prompt: '镜头缓慢推进' })]),
  }),
});
```

- [ ] **Step 2: Run shell tests to verify red**

Run:

```bash
npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx
```

Expected: fail because director rows are not selectable buttons and the inspector does not expose editable fields yet.

- [ ] **Step 3: Implement director inspector editing**

Update `ProductionStudioShell.tsx`:

- Import `useState` from React.
- Add local selected item state in `DirectorDeskContent`:

```ts
const [selected, setSelected] = useState<{ type: 'actor' | 'camera' | 'shot'; id: string } | null>(null);
```

- Render actor/camera rows as buttons with accessible names:
  - `选择对象 ${actor.name}`
  - `选择对象 ${camera.name}`
- Render shot rail items as buttons with accessible names:
  - `选择镜头段 ${index + 1}`
- Add helpers that return a new `FlowDirector3dData`:
  - `patchActor(actorId, patch)`
  - `patchCamera(cameraId, patch)`
  - `patchShot(shotId, patch)`
- In the right inspector:
  - For an actor, render `对象名称`, `对象可见`, and `对象锁定`.
  - For a camera, render `镜头提示词`.
  - For a shot, render `镜头段提示词`.

- [ ] **Step 4: Run shell tests to verify green**

Run:

```bash
npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx
```

Expected: pass.

## Task 2: Canvas Store Integration

- [ ] **Step 1: Write failing integration test**

Add a test in `src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx` proving an inspector edit persists through the canvas store:

```tsx
render(<AiFlowCanvas cullingEnabled={false} />);

act(() => {
  window.dispatchEvent(
    new CustomEvent(OPEN_PRODUCTION_STUDIO_EVENT, {
      detail: { nodeId: 'director-node', studio: 'director3d' },
    }),
  );
});

fireEvent.click(screen.getByRole('button', { name: '选择对象 主镜头' }));
fireEvent.change(screen.getByLabelText('镜头提示词'), { target: { value: '俯拍建立空间关系' } });

const node = useFlowCanvasStore.getState().nodes.find((item) => item.id === 'director-node');
expect(node?.data.director3d?.cameras[0]?.prompt).toBe('俯拍建立空间关系');
expect(JSON.stringify(node?.data.director3d)).not.toMatch(/blob:|data:/);
```

- [ ] **Step 2: Run integration test**

Run:

```bash
npm test -- src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx
```

Expected: pass after Task 1 implementation because the canvas already passes `updateNodeData` into `ProductionStudioShell`.

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

Add a 2026-07-05 entry for Director Desk inspector editing, including validation commands and the editing-only billing note.

- [ ] **Step 4: Commit relevant changes**

Run:

```bash
git add docs/superpowers/plans/2026-07-05-director-desk-inspector-editing-phase-6.md src/flowCanvas/studios/ProductionStudioShell.tsx src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx PROJECT_RECORD.md
git commit -m "feat: add director desk inspector editing"
```
