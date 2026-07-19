# Nine-grid Toolbar Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the nine-grid image templates as a standalone selected-image toolbar menu and prepare an editable downstream node without starting generation until the user clicks generate.

**Architecture:** Extract the template list from `ImageMoreMenu` into a focused `ImageTemplateEditMenu`. Replace the execution-oriented template graph helper with `prepareImageTemplateEdit`, which creates an idle downstream image node containing the resolved prompt and inherited settings. `ImageNodeHeavy` owns the new dismissible menu layer, prepares and selects the target node, and leaves submission to the existing image prompt editor.

**Tech Stack:** React 19, TypeScript, Zustand, `@xyflow/react`, Testing Library, Vitest, Vite.

---

### Task 1: Standalone nine-grid template menu

**Files:**
- Create: `src/flowCanvas/nodes/ImageTemplateEditMenu.tsx`
- Create: `src/flowCanvas/nodes/ImageTemplateEditMenu.test.tsx`
- Modify: `src/flowCanvas/nodes/ImageMoreMenu.tsx`
- Modify: `src/flowCanvas/nodes/ImageMoreMenu.test.tsx`

- [ ] **Step 1: Write failing menu tests**

Add a test proving the More menu has no Nine-grid Tools action:

```tsx
test('does not contain the standalone nine-grid tools entry', () => {
  render(<ImageMoreMenu fixedPosition={{ left: 420, top: 188 }} onSelect={vi.fn()} />);
  expect(screen.queryByRole('button', { name: /九宫格工具/i })).toBeNull();
});
```

Create `ImageTemplateEditMenu.test.tsx` with tests that verify fixed positioning, the shared menu width/z-index, all `FLOW_IMAGE_TEMPLATE_EDIT_ACTIONS` labels, and the emitted template key:

```tsx
test('emits the selected template key from the standalone menu', () => {
  const onSelect = vi.fn();
  render(
    <ImageTemplateEditMenu
      fixedPosition={{ left: 420, top: 188 }}
      onSelect={onSelect}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: /多机位九宫格/i }));
  expect(onSelect).toHaveBeenCalledWith('multiCameraGrid');
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npx vitest --run src/flowCanvas/nodes/ImageMoreMenu.test.tsx src/flowCanvas/nodes/ImageTemplateEditMenu.test.tsx
```

Expected: FAIL because the More menu still renders Nine-grid Tools and `ImageTemplateEditMenu` does not exist.

- [ ] **Step 3: Implement the standalone menu and simplify More**

Create a focused component with this public contract and surface structure:

```tsx
interface ImageTemplateEditMenuProps {
  menuRef?: React.RefObject<HTMLDivElement | null>;
  fixedPosition: { left: number; top: number };
  onSelect: (templateActionKey: FlowImageTemplateEditActionKey) => void;
}

export const ImageTemplateEditMenu: React.FC<ImageTemplateEditMenuProps> = ({
  fixedPosition,
  menuRef,
  onSelect,
}) => (
  <MenuSurface
    ref={menuRef as React.RefObject<HTMLDivElement>}
    className="nodrag nopan nowheel fixed -translate-x-1/2 p-2"
    role="menu"
    style={{
      left: fixedPosition.left,
      top: fixedPosition.top,
      width: IMAGE_MODEL_MENU_WIDTH,
      zIndex: IMAGE_MENU_SURFACE_Z_INDEX,
    }}
    onClick={(event) => event.stopPropagation()}
  >
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        bottom: '100%',
        left: '50%',
        transform: 'translateX(-50%)',
        border: '9px solid transparent',
        borderBottomColor: 'rgba(28,28,32,0.95)',
      }}
    />
    <div className="grid max-h-[70vh] gap-1 overflow-y-auto pr-1">
      {FLOW_IMAGE_TEMPLATE_EDIT_ACTIONS.map((action) => (
        <button
          key={action.key}
          type="button"
          onClick={() => onSelect(action.key)}
          className={`${MENU_ITEM_CLASS} min-h-[38px]`}
        >
          <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-white/[0.08] text-white/90">
            {TEMPLATE_ACTION_ICONS[action.key]}
          </span>
          <span className="min-w-0 flex-1">
            <span className={`${MENU_ITEM_PRIMARY_CLASS} block`}>{action.label}</span>
            <span className={`${MENU_ITEM_SECONDARY_CLASS} mt-1 block`}>{action.description}</span>
          </span>
        </button>
      ))}
    </div>
  </MenuSurface>
);
```

Move the existing `TEMPLATE_ACTION_ICONS` mapping and template rows into this component. Remove `ArrowLeft`, template panel state, template imports, `templateEdit` action type, template payload field, and the Nine-grid Tools row from `ImageMoreMenu`. Keep Quick Split unchanged.

- [ ] **Step 4: Run tests and verify GREEN**

Run:

```bash
npx vitest --run src/flowCanvas/nodes/ImageMoreMenu.test.tsx src/flowCanvas/nodes/ImageTemplateEditMenu.test.tsx
```

Expected: both files PASS with no failures.

- [ ] **Step 5: Commit the menu extraction**

```bash
git add src/flowCanvas/nodes/ImageMoreMenu.tsx src/flowCanvas/nodes/ImageMoreMenu.test.tsx src/flowCanvas/nodes/ImageTemplateEditMenu.tsx src/flowCanvas/nodes/ImageTemplateEditMenu.test.tsx
git commit -m "feat: expose standalone nine-grid menu"
```

### Task 2: Prepare an idle template node

**Files:**
- Modify: `src/flowCanvas/runtime/graphExecutor.ts`
- Modify: `src/flowCanvas/runtime/graphExecutor.test.ts`

- [ ] **Step 1: Replace the runtime test with preparation expectations**

Import `prepareImageTemplateEdit` and rename the describe block. Assert the downstream node is connected, preserves the resolved prompt and inherited settings, and remains idle:

```ts
expect(targetNode?.data).toMatchObject({
  generationPrompt: expect.stringContaining('3x3 director multi-camera contact sheet'),
  generationStatus: 'idle',
  imageTemplateEditRequest: {
    mode: 'multi_camera_nine_grid',
    routeKey: 'image.production',
    sourceNodeId: sourceNode.id,
    templateActionKey: 'multiCameraGrid',
  },
  lastEditType: 'template:multiCameraGrid',
  modelId: 'gpt-image-2',
  routeKey: 'image.production',
  status: 'idle',
  progress: 0,
});
```

Also add a missing-asset test:

```ts
await expect(prepareImageTemplateEdit(sourceNode.id, 'multiCameraGrid'))
  .rejects.toThrow('当前图片节点还没有可供后端工作流使用的素材');
expect(useFlowCanvasStore.getState().nodes).toHaveLength(1);
```

- [ ] **Step 2: Run test and verify RED**

Run:

```bash
npx vitest --run src/flowCanvas/runtime/graphExecutor.test.ts
```

Expected: FAIL because `prepareImageTemplateEdit` is not exported and the existing helper creates `running`/`generating` node data.

- [ ] **Step 3: Implement preparation semantics**

Rename `runImageTemplateEdit` to:

```ts
export async function prepareImageTemplateEdit(
  sourceNodeId: string,
  templateActionKey: FlowImageTemplateEditActionKey,
  options: RunImageTemplateEditParams = {},
): Promise<string | undefined>
```

Keep the existing source validation, prompt construction, ratio resolution, inherited parameter merge, derived position, edge creation, and reusable failed-node behavior. Change `nextNodeData` to explicitly use idle values and omit execution-only timestamps/labels:

```ts
const nextNodeData: Partial<FlowNodeData> = {
  ...displaySize,
  errorMessage: undefined,
  generationMode: 'standard',
  generationPrompt: prompt,
  generationStatus: 'idle',
  imageEditRequest,
  imageTemplateEditRequest,
  lastEditType: `template:${templateActionKey}`,
  modelId,
  params: nextParams,
  progress: 0,
  routeId,
  routeKey,
  status: 'idle',
  title: options.title || String(reusableNode?.data.title || `${action.titlePrefix}${resultIndex}`),
};
```

The helper must not import or call `runBackendWorkflow`.

- [ ] **Step 4: Run test and verify GREEN**

Run:

```bash
npx vitest --run src/flowCanvas/runtime/graphExecutor.test.ts
```

Expected: PASS, including idle state, inherited settings, resolved ratio, connection, and missing-asset validation.

- [ ] **Step 5: Commit the preparation helper**

```bash
git add src/flowCanvas/runtime/graphExecutor.ts src/flowCanvas/runtime/graphExecutor.test.ts
git commit -m "feat: prepare image templates before generation"
```

### Task 3: Wire the standalone toolbar action to preparation and selection

**Files:**
- Modify: `src/flowCanvas/nodes/FlowNodes.tsx`
- Modify: `src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx`

- [ ] **Step 1: Write the failing integration test**

Render a selected image node containing `assetId`, `thumbnailUrl`, `modelId`, `routeKey`, and parameter values. Open the standalone button, select Multi-camera Nine-grid, then assert:

```tsx
fireEvent.click(screen.getByRole('button', { name: '九宫格工具' }));
fireEvent.click(await screen.findByRole('button', { name: /多机位九宫格/i }));

const state = useFlowCanvasStore.getState();
const target = state.nodes.find((node) => node.id !== source.id);
expect(target?.selected).toBe(true);
expect(state.edges.some((edge) => edge.source === source.id && edge.target === target?.id)).toBe(true);
expect(target?.data).toMatchObject({
  generationStatus: 'idle',
  modelId: 'gpt-image-2',
  routeKey: 'image.gpt-image-2',
  status: 'idle',
});
expect(workflowRunnerMocks.runBackendWorkflow).not.toHaveBeenCalled();
expect(screen.queryByRole('menu')).toBeNull();
```

- [ ] **Step 2: Run test and verify RED**

Run:

```bash
npx vitest --run src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx
```

Expected: FAIL because the standalone Nine-grid Tools toolbar button is absent.

- [ ] **Step 3: Add the toolbar layer and preparation handler**

In `ImageNodeHeavy`:

- Import `ImageTemplateEditMenu` and `prepareImageTemplateEdit`.
- Add `templateMenuButtonRef`, `templateMenuLayer`, and `templateMenuPosition` alongside the More menu state.
- Add a position helper using the shared 320px menu width and viewport padding.
- Add `{ id: 'templateEdit', icon: <Grid3X3 ... />, label: '九宫格工具' }` immediately before More.
- Assign the toolbar button and dismissible trigger refs for `templateEdit`.
- Extend `handleToolAction` so template, More, and panorama layers are mutually exclusive and `templateEdit` positions/toggles its layer.
- Render `ImageTemplateEditMenu` through `createPortal` when its layer is open.
- Close the new layer when multi-selection begins or the node editor closes.

Use a preparation handler that selects the target and never submits it:

```ts
const prepareTemplateAiEdit = useCallback(async (templateActionKey: FlowImageTemplateEditActionKey) => {
  templateMenuLayer.closeLayer();
  const targetNodeId = await prepareImageTemplateEdit(id, templateActionKey, {
    modelId: String(d.modelId || currentModelId),
    params: { ...((d.params || {}) as Record<string, unknown>), size: currentSize },
    routeId: typeof d.routeId === 'string' ? d.routeId : undefined,
    routeKey: currentRouteKey || undefined,
  });
  if (targetNodeId) selectNodesByIds([targetNodeId]);
}, [currentModelId, currentRouteKey, currentSize, d.modelId, d.params, d.routeId, id, selectNodesByIds, templateMenuLayer]);
```

On rejection, store the existing source validation error on the source node with failed/error status, matching the current error handling.

- [ ] **Step 4: Run integration and menu tests and verify GREEN**

Run:

```bash
npx vitest --run src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx src/flowCanvas/nodes/ImageMoreMenu.test.tsx src/flowCanvas/nodes/ImageTemplateEditMenu.test.tsx src/flowCanvas/runtime/graphExecutor.test.ts
```

Expected: all focused tests PASS and `runBackendWorkflow` remains uncalled on template selection.

- [ ] **Step 5: Commit toolbar integration**

```bash
git add src/flowCanvas/nodes/FlowNodes.tsx src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx
git commit -m "feat: confirm nine-grid settings before generation"
```

### Task 4: Project record and final verification

**Files:**
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Update the project record**

Add a dated entry describing the standalone nine-grid toolbar action, idle downstream preparation, inherited settings, manual confirmation requirement, and verification commands.

- [ ] **Step 2: Run focused regression tests**

Run:

```bash
npx vitest --run src/flowCanvas/nodes/ImageMoreMenu.test.tsx src/flowCanvas/nodes/ImageTemplateEditMenu.test.tsx src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx src/flowCanvas/runtime/graphExecutor.test.ts src/flowCanvas/utils/imageTemplateEditActions.test.ts
```

Expected: all test files PASS with zero failures.

- [ ] **Step 3: Run the required production build**

Run:

```bash
npm run build
```

Expected: Vite build and build-version writer exit with code 0.

- [ ] **Step 4: Inspect final diff and commit the record**

```bash
git diff --check
git status --short
git add PROJECT_RECORD.md
git commit -m "docs: record nine-grid confirmation flow"
```

Confirm only task files are committed and unrelated dirty files remain untouched.

- [ ] **Step 5: Push verified main**

```bash
git branch --show-current
git push origin main
```

Expected: current branch is `main` and GitHub reports the remote branch updated to the final local commit.
