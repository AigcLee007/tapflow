# Storyboard Studio Editing Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the canvas-native storyboard studio edit and persist selected storyboard cell data through existing flow node data.

**Architecture:** Keep storyboard editing inside the `ProductionStudioShell` overlay. The shell receives a narrow `onUpdateNodeData(nodeId, patch)` callback from `AiFlowCanvas`, normalizes storyboard data with existing utilities, and writes only structured `storyboard` fields back to the selected node. This slice stays editing-only and does not enqueue generation, create assets, or change billing.

**Tech Stack:** React, TypeScript, Zustand canvas store, Testing Library, Vitest.

---

## Scope

- Add storyboard cell selection in the studio grid.
- Add editable title and prompt fields for the selected storyboard cell.
- Persist edits through existing `updateNodeData` and `patchStoryboardCell`.
- Keep data safe: no transient URLs, files, blobs, base64 media, or asset writes.
- Preserve the existing shell layouts for 3D Director Desk and Video Editor.

## File Map

- Modify: `src/flowCanvas/studios/ProductionStudioShell.tsx`
- Modify: `src/flowCanvas/studios/ProductionStudioShell.test.tsx`
- Modify: `src/flowCanvas/canvas/AiFlowCanvas.tsx`
- Modify: `src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx`
- Modify: `PROJECT_RECORD.md`

## Task 1: Storyboard Shell Editing

- [ ] **Step 1: Write failing shell tests**

Add tests to `src/flowCanvas/studios/ProductionStudioShell.test.tsx` proving:

```tsx
const onUpdateNodeData = vi.fn();
render(
  <ProductionStudioShell
    studio="storyboard"
    node={storyboardNode as any}
    onClose={vi.fn()}
    onUpdateNodeData={onUpdateNodeData}
  />,
);

fireEvent.click(screen.getByRole('button', { name: '选择镜头 1' }));
expect(onUpdateNodeData).toHaveBeenCalledWith('storyboard-node', {
  storyboard: expect.objectContaining({ selectedIndex: 0 }),
});

fireEvent.change(screen.getByLabelText('分镜标题'), { target: { value: '新的开场' } });
expect(onUpdateNodeData).toHaveBeenCalledWith('storyboard-node', {
  storyboard: expect.objectContaining({
    cells: expect.arrayContaining([expect.objectContaining({ id: 'cell-2', title: '新的开场' })]),
  }),
});

fireEvent.change(screen.getByLabelText('分镜提示词'), { target: { value: '新的镜头提示词' } });
expect(JSON.stringify(onUpdateNodeData.mock.calls.at(-1)?.[1])).not.toMatch(/blob:|data:/);
```

- [ ] **Step 2: Run shell tests to verify red**

Run:

```bash
npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx
```

Expected: fail because storyboard cells are not buttons and no title/prompt inputs exist.

- [ ] **Step 3: Implement shell editing**

Update `ProductionStudioShell.tsx`:

- Add optional prop `onUpdateNodeData?: (nodeId: string, patch: Partial<FlowNodeData>) => void`.
- Pass `node.id`, `node.data.storyboard`, and an update callback into `StoryboardContent`.
- Render storyboard cells as buttons with `aria-label="选择镜头 X"`.
- On cell click, call `onUpdateNodeData(nodeId, { storyboard: { ...storyboard, selectedIndex: index } })`.
- Render controlled `input` labelled `分镜标题` and `textarea` labelled `分镜提示词`.
- On title/prompt change, call `patchStoryboardCell(storyboard, storyboard.selectedIndex, { title })` or `{ prompt }`, then update the node.

- [ ] **Step 4: Run shell tests to verify green**

Run:

```bash
npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx
```

Expected: pass.

## Task 2: Canvas Store Integration

- [ ] **Step 1: Write failing canvas integration test**

Update `src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx` with a storyboard node case. Dispatch the open-studio event, change `分镜提示词`, and assert `useFlowCanvasStore.getState().nodes[0].data.storyboard.cells[0].prompt` is updated.

- [ ] **Step 2: Run integration test to verify red**

Run:

```bash
npm test -- src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx
```

Expected: fail because `AiFlowCanvas` does not pass `updateNodeData` into the shell yet.

- [ ] **Step 3: Wire canvas callback**

Update `AiFlowCanvas.tsx` so `ProductionStudioShell` receives `onUpdateNodeData={updateNodeData}`.

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
npm test -- src/flowCanvas/studios/ProductionStudioShell.test.tsx src/flowCanvas/canvas/AiFlowCanvas.production-studios.test.tsx src/flowCanvas/utils/storyboardNodeData.test.ts
```

- [ ] **Step 2: Run build**

Run:

```bash
npm run build
```

- [ ] **Step 3: Update `PROJECT_RECORD.md`**

Add a 2026-07-05 entry for storyboard studio editing, including validation commands and the editing-only billing note.
