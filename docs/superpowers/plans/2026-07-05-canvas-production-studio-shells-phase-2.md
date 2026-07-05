# Canvas Production Studio Shells Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make storyboard, 3D Director Desk, and video editor nodes open real canvas-native studio shells from the v2 project canvas.

**Architecture:** Keep the studios inside `AiFlowCanvas` as overlay surfaces scoped to the current project canvas. Production nodes dispatch a typed browser event with the node id and studio kind; the canvas owns active studio state, renders the shell, and closes it without writing transient media into draft JSON. This slice adds useful UI structure only; editing is free and no billing/export workflow is introduced yet.

**Tech Stack:** Vite, React, TypeScript, `@xyflow/react`, Zustand canvas store, Vitest, Testing Library.

---

## Scope

- Add a typed open-studio event utility for production nodes.
- Make `storyboard`, `director3d`, and `video_editor` nodes expose open actions with clean Chinese labels.
- Add a reusable `ProductionStudioShell` overlay with three domain layouts:
  - 3D Director Desk: object list, viewport grid, inspector, shot strip.
  - Storyboard: shot grid/editor shell.
  - Video Editor: asset bin, preview, timeline, inspector.
- Integrate the overlay into `AiFlowCanvas` and close it on close button or Escape.
- Update `PROJECT_RECORD.md`.

## Non-Goals

- Do not implement full Three.js manipulation in this slice.
- Do not implement server-side video export in this slice.
- Do not add billing mutations in this slice.
- Do not store `blob:`, `data:`, base64, `File`, or `Blob` values in node data.

## File Map

- Create: `src/flowCanvas/studios/productionStudioEvents.ts`
- Create: `src/flowCanvas/studios/ProductionStudioShell.tsx`
- Create: `src/flowCanvas/studios/ProductionStudioShell.test.tsx`
- Modify: `src/flowCanvas/nodes/ProductionNodes.tsx`
- Modify: `src/flowCanvas/nodes/ProductionNodes.test.tsx`
- Modify: `src/flowCanvas/canvas/AiFlowCanvas.tsx`
- Create: `src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx`
- Modify: `src/flowCanvas/utils/nodeFactory.ts`
- Modify: `src/flowCanvas/utils/nodeFactory.test.ts`
- Modify: `PROJECT_RECORD.md`

## Task 1: Production Node Open Events

- [ ] **Step 1: Write failing node tests**

Add tests to `src/flowCanvas/nodes/ProductionNodes.test.tsx` proving the node buttons dispatch a studio event and render clean Chinese labels:

```tsx
it('opens each production studio from node actions', () => {
  const listener = vi.fn();
  window.addEventListener('tapflow:open-production-studio', listener as EventListener);

  render(<StoryboardNodeComponent {...baseProps} data={{ kind: 'storyboard', title: '故事板', width: 360, height: 260, status: 'idle' }} />);
  render(<Director3dNodeComponent {...baseProps} id="director-node" data={{ kind: 'director3d', title: '3D导演台', width: 340, height: 220, status: 'idle' }} />);
  render(<VideoEditorNodeComponent {...baseProps} id="video-node" data={{ kind: 'video_editor', title: '剪辑工程', width: 360, height: 220, status: 'idle' }} />);

  fireEvent.click(screen.getByRole('button', { name: '打开故事板' }));
  fireEvent.click(screen.getByRole('button', { name: '打开导演台' }));
  fireEvent.click(screen.getByRole('button', { name: '打开剪辑器' }));

  expect(listener).toHaveBeenCalledTimes(3);
  expect((listener.mock.calls[0][0] as CustomEvent).detail).toMatchObject({ studio: 'storyboard' });
  expect((listener.mock.calls[1][0] as CustomEvent).detail).toMatchObject({ nodeId: 'director-node', studio: 'director3d' });
  expect((listener.mock.calls[2][0] as CustomEvent).detail).toMatchObject({ nodeId: 'video-node', studio: 'video_editor' });

  window.removeEventListener('tapflow:open-production-studio', listener as EventListener);
});
```

- [ ] **Step 2: Run node tests and verify red**

Run:

```bash
npm test -- src/flowCanvas/nodes/ProductionNodes.test.tsx
```

Expected: fail because storyboard has no open action and no studio event is dispatched.

- [ ] **Step 3: Implement event utility and node actions**

Create `src/flowCanvas/studios/productionStudioEvents.ts` with a constant event name, a `ProductionStudioKind` type, and an `openProductionStudio()` dispatcher. Update `ProductionNodes.tsx` to call it from each open button and replace mojibake production labels with `故事板`, `3D导演台`, `剪辑工程`, `打开故事板`, `打开导演台`, and `打开剪辑器`.

- [ ] **Step 4: Run node tests and verify green**

Run:

```bash
npm test -- src/flowCanvas/nodes/ProductionNodes.test.tsx
```

Expected: pass.

## Task 2: Production Studio Shell

- [ ] **Step 1: Write failing shell tests**

Create `src/flowCanvas/studios/ProductionStudioShell.test.tsx` proving each studio renders the expected layout and closes:

```tsx
it('renders the 3D director desk shell with scene panels', () => {
  const onClose = vi.fn();
  render(<ProductionStudioShell studio="director3d" node={directorNode as any} onClose={onClose} />);

  expect(screen.getByRole('dialog', { name: '3D导演台' })).toBeTruthy();
  expect(screen.getByText('场景对象')).toBeTruthy();
  expect(screen.getByText('导演视口')).toBeTruthy();
  expect(screen.getByText('镜头轨道')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: '关闭工作台' }));
  expect(onClose).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run shell tests and verify red**

Run:

```bash
npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx
```

Expected: fail because the shell file does not exist.

- [ ] **Step 3: Implement shell**

Create `ProductionStudioShell.tsx` with fixed overlay layout, `role="dialog"`, close button, Escape handling, and domain-specific panels. Use only structured node data counts and labels; do not render or persist transient media URLs.

- [ ] **Step 4: Run shell tests and verify green**

Run:

```bash
npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx
```

Expected: pass.

## Task 3: Canvas Integration

- [ ] **Step 1: Write failing canvas integration test**

Create `src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx` with a mocked React Flow renderer. Load a project containing a `director3d` node, dispatch the open-studio event, assert the shell appears, and close it.

- [ ] **Step 2: Run integration test and verify red**

Run:

```bash
npm test -- src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx
```

Expected: fail because `AiFlowCanvas` does not listen for the event yet.

- [ ] **Step 3: Implement canvas listener**

Update `AiFlowCanvas.tsx` to keep `activeProductionStudio` state, listen for the event, find the target node, close context/image/agent side panels, and render `ProductionStudioShell`.

- [ ] **Step 4: Run integration test and verify green**

Run:

```bash
npm test -- src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx
```

Expected: pass.

## Task 4: Validation And Record

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm test -- src/flowCanvas/nodes/ProductionNodes.test.tsx src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx src/flowCanvas/utils/nodeFactory.test.ts
```

- [ ] **Step 2: Run build**

Run:

```bash
npm run build
```

- [ ] **Step 3: Update `PROJECT_RECORD.md`**

Add a new 2026-07-05 entry describing the production studio shells, clean Chinese labels, validation commands, and the fact that no billing/export workflow was added in this slice.
