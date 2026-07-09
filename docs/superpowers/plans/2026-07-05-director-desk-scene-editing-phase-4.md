# Director Desk Scene Editing Phase 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 3D Director Desk studio create and persist basic actors, cameras, and shot records inside `director3d` node data.

**Architecture:** Keep the director desk as a canvas-native overlay. The shell receives the same `onUpdateNodeData(nodeId, patch)` callback used by storyboard editing and writes only structured `director3d` data back to the node. This slice is free editing/staging only; AI rendering, asset export, Three.js transform controls, and billing remain later phases.

**Tech Stack:** React, TypeScript, Zustand canvas store, Testing Library, Vitest.

---

## Scope

- Add `添加角色`, `添加镜头`, and `捕获镜头段` controls to the 3D Director Desk shell.
- Persist added actors/cameras/shots to `director3d` node data.
- Keep generated ids deterministic enough for tests and stable enough for drafts.
- Do not store preview URLs, file objects, blobs, base64 media, or provider/runtime data.
- Do not enqueue generation or mutate billing.

## File Map

- Modify: `src/flowCanvas/studios/ProductionStudioShell.tsx`
- Modify: `src/flowCanvas/studios/ProductionStudioShell.test.tsx`
- Modify: `src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx`
- Modify: `PROJECT_RECORD.md`

## Task 1: Director Shell Scene Editing

- [ ] **Step 1: Write failing shell tests**

Add tests to `src/flowCanvas/studios/ProductionStudioShell.test.tsx` proving the shell emits structured director patches:

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

fireEvent.click(screen.getByRole('button', { name: '添加角色' }));
expect(onUpdateNodeData).toHaveBeenCalledWith('director-node', {
  director3d: expect.objectContaining({
    actors: expect.arrayContaining([expect.objectContaining({ kind: 'placeholder_humanoid', visible: true })]),
  }),
});

fireEvent.click(screen.getByRole('button', { name: '添加镜头' }));
expect(onUpdateNodeData).toHaveBeenCalledWith('director-node', {
  director3d: expect.objectContaining({
    cameras: expect.arrayContaining([expect.objectContaining({ name: '镜头 2' })]),
  }),
});

fireEvent.click(screen.getByRole('button', { name: '捕获镜头段' }));
expect(onUpdateNodeData).toHaveBeenCalledWith('director-node', {
  director3d: expect.objectContaining({
    shots: expect.arrayContaining([expect.objectContaining({ cameraId: 'camera-1', motion: 'static' })]),
  }),
});
```

- [ ] **Step 2: Run shell test to verify red**

Run:

```bash
npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx
```

Expected: fail because director action buttons do not emit node-data patches yet.

- [ ] **Step 3: Implement director patching**

Update `ProductionStudioShell.tsx`:

- Pass `nodeId` and `onUpdateNodeData` into `DirectorDeskContent`.
- Add helper `normalizeDirector3dData(data)` with default scene, actors, cameras, and shots.
- Add helper builders for actor, camera, and shot objects.
- Render action buttons `添加角色`, `添加镜头`, `捕获镜头段`.
- On click, call `onUpdateNodeData(nodeId, { director3d: nextDirectorData })`.

- [ ] **Step 4: Run shell test to verify green**

Run:

```bash
npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx
```

Expected: pass.

## Task 2: Canvas Store Integration

- [ ] **Step 1: Write failing integration test**

Add a test in `src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx`: open a `director3d` node, click `添加角色`, and assert the canvas store node has a new `director3d.actors[0]`.

- [ ] **Step 2: Run integration test**

Run:

```bash
npm test -- src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx
```

Expected: pass if the shared `onUpdateNodeData` callback from Phase 3 already reaches the director shell; otherwise wire the missing prop.

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

Add a 2026-07-05 entry for director desk scene editing, including validation commands and the editing-only billing note.
