# Text Node Whole-Content Font Size Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the text-node size presets immediately resize all existing node text while preserving node dimensions, canvas zoom, text content, generated-text styling, and remote draft persistence.

**Architecture:** Keep `FlowNodeData.fontSize` as the durable node-level setting and add one small preset module as the only source of labels and pixel values. `TextNodeComponent` will update only `fontSize`, render both canvas and fullscreen editors from the normalized preset, and stop text-area wheel propagation so overflow scrolls internally without reaching React Flow. Existing draft serialization already persists node data, so focused regression coverage will prove the field survives save and hydration without API or database changes.

**Tech Stack:** React 19, TypeScript, Zustand, `@xyflow/react`, Vitest, Testing Library, Vite.

---

## File Structure

- Create `src/flowCanvas/nodes/textFontSize.ts`: typed preset values, labels, normalization, and canvas/fullscreen pixel lookup.
- Create `src/flowCanvas/nodes/textFontSize.test.ts`: pure unit coverage for defaults, malformed legacy values, labels, ordering, and pixel sizes.
- Modify `src/flowCanvas/nodes/FlowNodes.tsx`: replace Markdown heading actions with whole-node font-size updates in both toolbars; use the shared size lookup; isolate textarea wheel events.
- Modify `src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx`: component regressions for existing text, selection independence, active state, unchanged geometry/viewport, internal wheel handling, fullscreen synchronization, and later text updates.
- Modify `src/flowCanvas/hooks/useRemoteFlowAutosave.test.tsx`: save-and-reload regression for `fontSize` and unchanged viewport.
- Modify `PROJECT_RECORD.md`: record the completed behavior and validation evidence after implementation.

No API, worker, database migration, billing, or AI Gateway files should change.

### Task 1: Establish The Font-Size Contract

**Files:**
- Create: `src/flowCanvas/nodes/textFontSize.test.ts`
- Create: `src/flowCanvas/nodes/textFontSize.ts`

- [ ] **Step 1: Write the failing preset contract tests**

Create `src/flowCanvas/nodes/textFontSize.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  TEXT_FONT_SIZE_PRESETS,
  getTextFontSizePx,
  normalizeTextFontSize,
} from "./textFontSize";

describe("textFontSize", () => {
  it("exposes the approved presets in toolbar order", () => {
    expect(TEXT_FONT_SIZE_PRESETS).toEqual([
      { canvasPx: 18, fullscreenPx: 34, label: "一号", value: "h1" },
      { canvasPx: 16, fullscreenPx: 28, label: "二号", value: "h2" },
      { canvasPx: 14, fullscreenPx: 22, label: "三号", value: "h3" },
      { canvasPx: 12, fullscreenPx: 15, label: "正文", value: "body" },
    ]);
  });

  it.each([undefined, null, "", "oversized"])(
    "falls back to body for malformed value %s",
    (value) => {
      expect(normalizeTextFontSize(value)).toBe("body");
      expect(getTextFontSizePx(value, "canvas")).toBe(12);
      expect(getTextFontSizePx(value, "fullscreen")).toBe(15);
    },
  );

  it("returns the approved canvas and fullscreen sizes", () => {
    expect(getTextFontSizePx("h1", "canvas")).toBe(18);
    expect(getTextFontSizePx("h2", "canvas")).toBe(16);
    expect(getTextFontSizePx("h3", "canvas")).toBe(14);
    expect(getTextFontSizePx("body", "canvas")).toBe(12);
    expect(getTextFontSizePx("h1", "fullscreen")).toBe(34);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx vitest --run src/flowCanvas/nodes/textFontSize.test.ts
```

Expected: FAIL because `./textFontSize` does not exist.

- [ ] **Step 3: Implement the shared preset module**

Create `src/flowCanvas/nodes/textFontSize.ts`:

```ts
import type { FlowNodeData } from "../types";

export type TextFontSizePreset = NonNullable<FlowNodeData["fontSize"]>;
export type TextFontSizeSurface = "canvas" | "fullscreen";

export const TEXT_FONT_SIZE_PRESETS = [
  { canvasPx: 18, fullscreenPx: 34, label: "一号", value: "h1" },
  { canvasPx: 16, fullscreenPx: 28, label: "二号", value: "h2" },
  { canvasPx: 14, fullscreenPx: 22, label: "三号", value: "h3" },
  { canvasPx: 12, fullscreenPx: 15, label: "正文", value: "body" },
] as const satisfies ReadonlyArray<{
  canvasPx: number;
  fullscreenPx: number;
  label: string;
  value: TextFontSizePreset;
}>;

const PRESET_BY_VALUE = new Map(
  TEXT_FONT_SIZE_PRESETS.map((preset) => [preset.value, preset]),
);

export function normalizeTextFontSize(value: unknown): TextFontSizePreset {
  return typeof value === "string" && PRESET_BY_VALUE.has(value as TextFontSizePreset)
    ? (value as TextFontSizePreset)
    : "body";
}

export function getTextFontSizePx(value: unknown, surface: TextFontSizeSurface): number {
  const preset = PRESET_BY_VALUE.get(normalizeTextFontSize(value))!;
  return surface === "canvas" ? preset.canvasPx : preset.fullscreenPx;
}
```

- [ ] **Step 4: Run the contract tests**

Run:

```bash
npx vitest --run src/flowCanvas/nodes/textFontSize.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit the contract**

```bash
git add src/flowCanvas/nodes/textFontSize.ts src/flowCanvas/nodes/textFontSize.test.ts
git commit -m "feat(canvas): define text font size presets"
```

### Task 2: Make Toolbar Presets Resize The Whole Existing Text

**Files:**
- Modify: `src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx`
- Modify: `src/flowCanvas/nodes/FlowNodes.tsx:3182-3950`

- [ ] **Step 1: Add failing whole-node interaction tests**

Inside `describe("FlowNodes agent metadata", ...)` in `src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx`, add:

```tsx
it("resizes all existing text without changing content, geometry, or viewport", () => {
  const node = useFlowCanvasStore.getState().addNode(
    "text",
    { x: 120, y: 240 },
    {
      fontSize: "body",
      height: 260,
      text: "Already generated\nsecond line",
      title: "Readable copy",
      width: 320,
    },
    { selected: true },
  );
  useFlowCanvasStore.setState({ viewport: { x: 15, y: -20, zoom: 0.7 } });
  render(<StoreBackedTextNode nodeId={node.id} />);

  const editor = screen.getByRole("textbox", { name: "文本内容" }) as HTMLTextAreaElement;
  editor.setSelectionRange(0, 7);
  const before = useFlowCanvasStore.getState().nodes.find((item) => item.id === node.id)!;

  fireEvent.click(screen.getByRole("button", { name: "全文设为一号字号" }));

  const after = useFlowCanvasStore.getState().nodes.find((item) => item.id === node.id)!;
  expect(editor.value).toBe("Already generated\nsecond line");
  expect(editor.style.fontSize).toBe("18px");
  expect(after.data.fontSize).toBe("h1");
  expect(after.data.text).toBe(before.data.text);
  expect(after.position).toEqual(before.position);
  expect(after.data.width).toBe(before.data.width);
  expect(after.data.height).toBe(before.data.height);
  expect(useFlowCanvasStore.getState().viewport).toEqual({ x: 15, y: -20, zoom: 0.7 });
  expect(editor.value).not.toContain("# ");
});

it("supports all presets, defaults legacy nodes to body, and marks the active preset", () => {
  const node = useFlowCanvasStore.getState().addNode(
    "text",
    { x: 0, y: 0 },
    { text: "Legacy text", title: "Legacy" },
    { selected: true },
  );
  render(<StoreBackedTextNode nodeId={node.id} />);

  const editor = screen.getByRole("textbox", { name: "文本内容" });
  expect(editor.style.fontSize).toBe("12px");
  expect(screen.getByRole("button", { name: "全文设为正文字号" }).getAttribute("aria-pressed")).toBe("true");

  for (const [name, value, pixels] of [
    ["全文设为一号字号", "h1", "18px"],
    ["全文设为二号字号", "h2", "16px"],
    ["全文设为三号字号", "h3", "14px"],
    ["全文设为正文字号", "body", "12px"],
  ] as const) {
    fireEvent.click(screen.getByRole("button", { name }));
    expect(useFlowCanvasStore.getState().nodes.find((item) => item.id === node.id)?.data.fontSize).toBe(value);
    expect(editor.style.fontSize).toBe(pixels);
    expect(screen.getByRole("button", { name }).getAttribute("aria-pressed")).toBe("true");
  }
});

it("keeps text-area wheel events inside the node", () => {
  const outerWheel = vi.fn();
  const node = useFlowCanvasStore.getState().addNode(
    "text",
    { x: 0, y: 0 },
    { fontSize: "h1", text: Array.from({ length: 40 }, (_, index) => `Line ${index}`).join("\n") },
    { selected: true },
  );
  render(
    <div onWheel={outerWheel}>
      <StoreBackedTextNode nodeId={node.id} />
    </div>,
  );

  const editor = screen.getByRole("textbox", { name: "文本内容" });
  expect(editor.style.overflowY).toBe("auto");
  fireEvent.wheel(editor, { deltaY: 120 });
  expect(outerWheel).not.toHaveBeenCalled();
});

it("uses the same active preset in fullscreen and preserves it after later text updates", () => {
  const node = useFlowCanvasStore.getState().addNode(
    "text",
    { x: 0, y: 0 },
    { fontSize: "h2", text: "Initial text" },
    { selected: true },
  );
  render(<StoreBackedTextNode nodeId={node.id} />);

  fireEvent.click(screen.getByRole("button", { name: "全文设为一号字号" }));
  fireEvent.click(screen.getByRole("button", { name: "全屏" }));
  expect(screen.getByRole("textbox", { name: "全屏文本内容" }).style.fontSize).toBe("34px");
  expect(screen.getAllByRole("button", { name: "全文设为一号字号" }).some((button) => button.getAttribute("aria-pressed") === "true")).toBe(true);

  act(() => {
    useFlowCanvasStore.getState().updateNodeData(node.id, { text: "Generated replacement" });
  });
  expect(useFlowCanvasStore.getState().nodes.find((item) => item.id === node.id)?.data).toMatchObject({
    fontSize: "h1",
    text: "Generated replacement",
  });
});
```

The current fullscreen trigger has only a visual tooltip. Add `type="button"` and `aria-label="全屏"` to that button as part of this test contract; do not weaken the query to a DOM selector.

- [ ] **Step 2: Run the component tests to verify they fail for the old Markdown behavior**

Run:

```bash
npx vitest --run src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx
```

Expected: the new tests FAIL because the old H1/H2/H3 controls mutate `text`, do not expose the approved Chinese preset controls or active state, and do not explicitly stop wheel propagation.

- [ ] **Step 3: Import and normalize the shared preset state**

In `src/flowCanvas/nodes/FlowNodes.tsx`, import:

```ts
import {
  TEXT_FONT_SIZE_PRESETS,
  getTextFontSizePx,
  normalizeTextFontSize,
  type TextFontSizePreset,
} from "./textFontSize";
```

Inside `TextNodeComponent`, immediately after `const showNodeEditor = showSingleNodeControls;`, add:

```ts
const activeTextFontSize = normalizeTextFontSize(d.fontSize);
const canvasTextFontSize = getTextFontSizePx(activeTextFontSize, "canvas");
const fullscreenTextFontSize = getTextFontSizePx(activeTextFontSize, "fullscreen");
const applyWholeNodeFontSize = (fontSize: TextFontSizePreset) => {
  updateNodeData(id, { fontSize });
};
```

- [ ] **Step 4: Remove heading presets from the Markdown mutation action**

Change the `applyTextAction` union to:

```ts
const applyTextAction = (type: "bullet" | "number" | "divider" | "bold" | "italic") => {
```

Delete only the `h1` / `h2` / `h3` branch that creates `# ` prefixes. Preserve the existing bullet, number, divider, bold, italic, cursor restoration, and `updateNodeData(id, { text: newText })` behavior.

- [ ] **Step 5: Render node text from the shared preset and isolate its wheel events**

On the canvas textarea, add the accessible name and wheel handler, and replace the inline ternary size:

```tsx
<textarea
  aria-label="文本内容"
  data-node-id={id}
  className="nodrag nopan nowheel sleek-scroll-y"
  onWheel={(event) => event.stopPropagation()}
  // retain the existing value, readOnly, onChange, keyboard, and other props
  style={{
    // retain existing styles
    fontSize: canvasTextFontSize,
    overflowY: "auto",
  }}
/>
```

Do not call `preventDefault()`: the browser must retain native textarea scrolling. Do not call React Flow viewport or node-size APIs.

- [ ] **Step 6: Replace both toolbar heading groups with node-level preset buttons**

In the floating toolbar and fullscreen toolbar, replace the H1/H2/H3/Body controls with the same mapping:

```tsx
{TEXT_FONT_SIZE_PRESETS.map((preset) => {
  const active = activeTextFontSize === preset.value;
  return (
    <Tooltip key={preset.value} title={`全文设为${preset.label}字号`}>
      <button
        type="button"
        aria-label={`全文设为${preset.label}字号`}
        aria-pressed={active}
        onClick={() => applyWholeNodeFontSize(preset.value)}
        style={toolbarBtnStyle(active)}
      >
        {preset.label}
      </button>
    </Tooltip>
  );
})}
```

Keep the existing shared floating-toolbar spacing, radius, typography, dividers, and z-index. Do not create a dropdown or a menu surface for four always-visible presets.

- [ ] **Step 7: Synchronize fullscreen rendering**

Add `type="button"` and `aria-label="全屏"` to the fullscreen trigger. Add `aria-label="全屏文本内容"` and use `fontSize: fullscreenTextFontSize` on the fullscreen textarea. Replace the dormant rendering layer's outer fallback `fontSize` with `fullscreenTextFontSize`; leave its explicit Markdown line rendering unchanged because that hidden parser is outside this feature.

- [ ] **Step 8: Run the component tests**

Run:

```bash
npx vitest --run src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx src/flowCanvas/nodes/textFontSize.test.ts
```

Expected: PASS. Confirm the pre-existing text-node generation-error regression remains green.

- [ ] **Step 9: Commit the interaction**

```bash
git add src/flowCanvas/nodes/FlowNodes.tsx src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx
git commit -m "feat(canvas): resize whole text nodes"
```

### Task 3: Prove Remote Draft Persistence And Reload

**Files:**
- Modify: `src/flowCanvas/hooks/useRemoteFlowAutosave.test.tsx`

- [ ] **Step 1: Add a failing font-size round-trip test**

Add this test inside `describe("useRemoteFlowAutosave", ...)`:

```ts
it("persists a text node font preset without changing geometry or viewport", async () => {
  vi.useRealTimers();
  const initialDraft = createDraft(3);
  initialDraft.graph.nodes = [
    {
      id: "text-readable",
      position: { x: 120, y: 240 },
      type: "text",
      data: {
        fontSize: "body",
        height: 260,
        kind: "text",
        text: "Existing generated copy",
        width: 320,
      },
    },
  ];
  initialDraft.graph.viewport = { x: 15, y: -20, zoom: 0.7 };
  loadStoreFromDraft(initialDraft);
  saveFlowDraftMock.mockImplementation(async (_flowId: string, input: { graph: FlowDraft["graph"] }) => ({
    ...initialDraft,
    graph: input.graph,
    revision: 4,
    updatedAt: "2026-08-13T00:00:04.000Z",
  }));

  const { result } = renderHook(() =>
    useRemoteFlowAutosave({ draft: initialDraft, enabled: true, flowId: "flow-1" }),
  );

  act(() => {
    useFlowCanvasStore.getState().updateNodeData("text-readable", { fontSize: "h1" });
  });
  await act(async () => result.current.saveNow());

  const savedGraph = saveFlowDraftMock.mock.calls[0]?.[1].graph as FlowDraft["graph"];
  expect(savedGraph.viewport).toEqual({ x: 15, y: -20, zoom: 0.7 });
  expect(savedGraph.nodes[0]).toMatchObject({
    position: { x: 120, y: 240 },
    data: {
      fontSize: "h1",
      height: 260,
      text: "Existing generated copy",
      width: 320,
    },
  });

  loadStoreFromDraft({ ...initialDraft, graph: savedGraph, revision: 4 });
  expect(useFlowCanvasStore.getState().nodes[0]?.data.fontSize).toBe("h1");
  expect(useFlowCanvasStore.getState().viewport).toEqual({ x: 15, y: -20, zoom: 0.7 });
});
```

- [ ] **Step 2: Run the persistence test**

Run:

```bash
npx vitest --run src/flowCanvas/hooks/useRemoteFlowAutosave.test.tsx
```

Expected: PASS because existing graph serialization is generic. If it fails, correct only the existing canonical graph boundary that strips `fontSize`; do not add a new endpoint, table, or local-storage path.

- [ ] **Step 3: Commit the persistence regression**

```bash
git add src/flowCanvas/hooks/useRemoteFlowAutosave.test.tsx
git commit -m "test(canvas): preserve text size in drafts"
```

### Task 4: Validate The User Flow And Record The Change

**Files:**
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Run all focused regressions**

Run:

```bash
npx vitest --run src/flowCanvas/nodes/textFontSize.test.ts src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx src/flowCanvas/hooks/useRemoteFlowAutosave.test.tsx
```

Expected: all selected files PASS.

- [ ] **Step 2: Run the required frontend build**

Run:

```bash
npm run build
```

Expected: exit code 0. Existing Browserslist, mixed-import, CSS, or chunk-size warnings may remain warnings; record any new failure exactly.

- [ ] **Step 3: Start the local v2 application for browser acceptance**

Use separate terminals for long-running processes:

```bash
npm run dev:infra
npm run db:migrate
npm run dev:api
npm run dev:worker
npm run dev -- --host 127.0.0.1
```

Expected URLs: frontend `http://localhost:5188`, API health `http://localhost:3366/health`. If Docker, Postgres, Redis, or required local credentials are unavailable, preserve the passing focused tests/build and record the exact infrastructure blocker instead of claiming browser QA passed.

- [ ] **Step 4: Verify the authenticated canvas at desktop and narrow widths**

Using the existing local QA account and a project canvas, verify at `1440x900` and `390x844`:

1. Create or select a text node containing multiple lines of existing text.
2. Record the node bounds and current canvas zoom.
3. Click 一号, 二号, 三号, and 正文; confirm all existing lines change immediately and no `#` characters appear.
4. Confirm the active button state follows the last selection.
5. Choose 一号 on enough lines to overflow; wheel over the text and confirm the text scrolls while canvas zoom and node bounds remain fixed.
6. Generate or replace text in the same node; confirm the selected size remains active.
7. Refresh the project and confirm the selected size, text, node bounds, and viewport restore.
8. Open fullscreen and confirm it uses the same selected preset.
9. Capture screenshots showing the node before and after size switching and check that toolbar text does not overlap at either viewport.

- [ ] **Step 5: Update the project record with actual evidence**

Append a dated entry to `PROJECT_RECORD.md`. Use the first validation line only when every command and browser check passes:

```md
## 2026-08-13 - Text Node Whole-Content Font Sizing

- replaced the text-node H1/H2/H3 Markdown-prefix actions with node-level 一号/二号/三号/正文 presets; existing, newly typed, and generated text now immediately shares the selected size without changing text content.
- kept node geometry and canvas zoom independent from font sizing; overflowing text scrolls inside the node and its wheel events do not reach the canvas.
- preserved the existing `fontSize` draft field with a `body` fallback for old nodes; no API or database migration was required.
- validation passed: the three focused Vitest files passed, `npm run build` passed, and authenticated browser acceptance passed at 1440x900 and 390x844.
```

If browser acceptance is blocked by local infrastructure, replace only that final line with a factual sentence that names the failing startup command, its exit code, and the first non-secret error line exactly as printed. End the sentence with `no browser pass is claimed`.

- [ ] **Step 6: Review the final diff and commit the record**

Run:

```bash
git diff --check
git status --short
git diff -- src/flowCanvas/nodes/textFontSize.ts src/flowCanvas/nodes/textFontSize.test.ts src/flowCanvas/nodes/FlowNodes.tsx src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx src/flowCanvas/hooks/useRemoteFlowAutosave.test.tsx PROJECT_RECORD.md
```

Verify that unrelated dirty files are absent from the staged set, then commit only the project record:

```bash
git add PROJECT_RECORD.md
git commit -m "docs: record text font size controls"
```

The task is complete only after focused tests and `npm run build` pass, plus browser acceptance passes or its concrete local-infrastructure blocker is documented.
