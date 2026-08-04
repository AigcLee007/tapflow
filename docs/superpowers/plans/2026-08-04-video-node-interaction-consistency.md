# Video Node Interaction Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make video-node upload, editor scaling, and sizing interactions consistent with the approved design while preserving the tuned text/image editor appearance exactly.

**Architecture:** Extract the existing text/image floating prompt shell into a focused `NodeEditorSurface` that owns node-relative placement and inverse viewport scaling. Keep `VideoNodeComposer` responsible only for editor content, route all empty-node uploads through the selected-node top toolbar, and leave video dimensions under requested-ratio or natural-media control by removing only the video node's `NodeResizer`.

**Tech Stack:** React 19, TypeScript, `@xyflow/react`, Vitest, Testing Library, Vite, existing browser smoke harness.

---

## Scope And Safety Constraints

- Treat `docs/superpowers/specs/2026-08-04-video-node-interaction-consistency-design.md` as authoritative.
- Do not modify `src/flowCanvas/flowCanvas.css`; it already contains an unrelated user change.
- Do not change `getPromptBarDensity("text")` or `getPromptBarDensity("image")` values.
- Do not change video generation requests, model capabilities, pricing, billing, asset persistence, or flow-draft contracts.
- Do not remove the shared `NodeResizer` import from `FlowNodes.tsx`; other node types still use it.
- Stage only the files named by the current task before each commit.

## File Map

- Create `src/flowCanvas/nodes/NodeEditorSurface.tsx`: shared node-relative editor shell, density selection, and inverse-zoom transform.
- Create `src/flowCanvas/nodes/NodeEditorSurface.test.tsx`: exact zoom and text/image compatibility contract.
- Modify `src/flowCanvas/nodes/FlowNodes.tsx`: replace `FloatingPromptBar`, make the empty video preview passive, keep upload button as the sole trigger, remove the video-only resizer, and wrap the composer.
- Modify `src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx`: interaction, upload-entry, no-resizer, and ready-state regression coverage.
- Modify `src/flowCanvas/video/VideoNodeComposer.tsx`: remove canvas placement and shell styling so it is content-only.
- Modify `src/flowCanvas/video/VideoNodeComposer.test.tsx`: assert the content-only boundary and preserve the existing responsive content layout.
- Modify `scripts/smoke-video-node.ts`: verify real XYFlow selection/upload behavior, zoom-stable editor geometry, no resize controls, and automatic node sizing.
- Modify `scripts/smoke-video-node.test.ts`: lock the new browser-smoke assertions into the script contract.
- Modify `PROJECT_RECORD.md`: record the completed interaction repair and verification evidence.

### Task 1: Add The Shared Inverse-Zoom Editor Surface

**Files:**
- Create: `src/flowCanvas/nodes/NodeEditorSurface.tsx`
- Create: `src/flowCanvas/nodes/NodeEditorSurface.test.tsx`
- Read: `src/flowCanvas/utils/promptBarDensity.ts`

- [ ] **Step 1: Write the failing shared-surface tests**

Create `src/flowCanvas/nodes/NodeEditorSurface.test.tsx` with a controlled viewport mock and exact baseline assertions:

```tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { getNodeEditorSurfaceStyle, NodeEditorSurface } from "./NodeEditorSurface";

const viewport = vi.hoisted(() => ({ zoom: 1 }));

vi.mock("@xyflow/react", () => ({
  useViewport: () => ({ zoom: viewport.zoom }),
}));

describe("NodeEditorSurface", () => {
  beforeEach(() => {
    viewport.zoom = 1;
  });

  test.each([
    [0.25, "translateX(-50%) scale(4)"],
    [0.5, "translateX(-50%) scale(2)"],
    [1, "translateX(-50%) scale(1)"],
    [2, "translateX(-50%) scale(0.5)"],
  ])("uses the inverse scale for viewport zoom %s", (zoom, transform) => {
    expect(getNodeEditorSurfaceStyle("video", zoom).transform).toBe(transform);
  });

  test("preserves the tuned text and image surface values", () => {
    expect(getNodeEditorSurfaceStyle("text", 1)).toMatchObject({
      borderRadius: 18,
      gap: 10,
      minHeight: 120,
      padding: "12px 16px 12px",
      top: "calc(100% + 14px)",
      transform: "translateX(-50%) scale(1)",
      transformOrigin: "top center",
      width: "clamp(520px, 42vw, 760px)",
      zIndex: 30,
    });
    expect(getNodeEditorSurfaceStyle("image", 1)).toMatchObject({
      borderRadius: 18,
      gap: 10,
      minHeight: 128,
      padding: "12px 16px 12px",
      top: "calc(100% + 14px)",
      transform: "translateX(-50%) scale(1)",
      transformOrigin: "top center",
      width: "clamp(560px, 44vw, 820px)",
      zIndex: 30,
    });
  });

  test("keeps video sizing independent from text and image", () => {
    expect(getNodeEditorSurfaceStyle("video", 1)).toMatchObject({
      background: "#17171b",
      minHeight: 136,
      width: "min(calc(100vw - 32px), clamp(640px, 52vw, 980px))",
      zIndex: 40,
    });
    expect(getNodeEditorSurfaceStyle("text", 1).width).toBe("clamp(520px, 42vw, 760px)");
    expect(getNodeEditorSurfaceStyle("image", 1).width).toBe("clamp(560px, 44vw, 820px)");
  });

  test("isolates editor interactions from the canvas", () => {
    render(<NodeEditorSurface ariaLabel="Video editor" variant="video"><span>content</span></NodeEditorSurface>);

    const surface = screen.getByLabelText("Video editor");
    expect(surface.className).toContain("nodrag");
    expect(surface.className).toContain("nopan");
    expect(surface.className).toContain("nowheel");
    expect(surface.dataset.nodeEditorVariant).toBe("video");
  });
});
```

- [ ] **Step 2: Run the new test and verify the red state**

Run:

```bash
npx vitest --run src/flowCanvas/nodes/NodeEditorSurface.test.tsx
```

Expected: FAIL because `./NodeEditorSurface` does not exist.

- [ ] **Step 3: Implement the shared surface without changing density tokens**

Create `src/flowCanvas/nodes/NodeEditorSurface.tsx`:

```tsx
import type { CSSProperties, ReactNode } from "react";
import { useViewport } from "@xyflow/react";

import { getPromptBarDensity, type PromptBarDensityVariant } from "../utils/promptBarDensity";

type NodeEditorSurfaceProps = {
  ariaLabel?: string;
  children: ReactNode;
  variant: PromptBarDensityVariant;
};

const baseSurfaceStyle: CSSProperties = {
  position: "absolute",
  left: "50%",
  background: "rgba(38,38,38,0.98)",
  border: "1px solid rgba(255,255,255,0.1)",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  boxShadow: "0 12px 48px rgba(0,0,0,0.6)",
  backdropFilter: "blur(20px)",
  transition: "transform 0.1s ease-out",
};

export function getNodeEditorSurfaceStyle(
  variant: PromptBarDensityVariant,
  zoom: number,
): CSSProperties {
  const density = getPromptBarDensity(variant);
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const isVideo = variant === "video";

  return {
    ...baseSurfaceStyle,
    top: `calc(100% + ${density.topGap}px)`,
    width: isVideo
      ? `min(calc(100vw - 32px), ${density.width})`
      : density.width,
    minHeight: density.minHeight,
    borderRadius: density.borderRadius,
    padding: density.padding,
    gap: density.gap,
    background: isVideo ? "#17171b" : baseSurfaceStyle.background,
    boxShadow: isVideo
      ? "0 18px 42px rgba(0,0,0,0.45)"
      : baseSurfaceStyle.boxShadow,
    backdropFilter: isVideo ? undefined : baseSurfaceStyle.backdropFilter,
    zIndex: isVideo ? 40 : 30,
    transform: `translateX(-50%) scale(${1 / safeZoom})`,
    transformOrigin: "top center",
  };
}

export function NodeEditorSurface({ ariaLabel, children, variant }: NodeEditorSurfaceProps) {
  const { zoom } = useViewport();

  return (
    <div
      aria-label={ariaLabel}
      className="nodrag nopan nowheel"
      data-node-editor-variant={variant}
      style={getNodeEditorSurfaceStyle(variant, zoom)}
    >
      {children}
    </div>
  );
}
```

This preserves the current text/image inline style contract and gives video a separate width/background/shadow branch. Do not move any values into `flowCanvas.css`.

- [ ] **Step 4: Run focused density and surface tests**

Run:

```bash
npx vitest --run src/flowCanvas/nodes/NodeEditorSurface.test.tsx src/flowCanvas/utils/promptBarDensity.test.ts
```

Expected: both files PASS; zoom cases are `4`, `2`, `1`, and `0.5`; text/image density assertions remain unchanged.

- [ ] **Step 5: Commit the shared surface**

```bash
git add src/flowCanvas/nodes/NodeEditorSurface.tsx src/flowCanvas/nodes/NodeEditorSurface.test.tsx
git commit -m "refactor(canvas): add shared node editor surface"
```

### Task 2: Move Text, Image, And Video Onto The Shared Boundary

**Files:**
- Modify: `src/flowCanvas/nodes/FlowNodes.tsx` around the current `bottomFloatingBarBase`, `FloatingPromptBar`, text editor, image editor, and `VideoNodeComponent`
- Modify: `src/flowCanvas/video/VideoNodeComposer.tsx` at the root element
- Modify: `src/flowCanvas/video/VideoNodeComposer.test.tsx`
- Test: `src/flowCanvas/nodes/NodeEditorSurface.test.tsx`

- [ ] **Step 1: Strengthen the content-boundary test before changing production code**

Replace the current `stacks the V2 composer controls...` assertion in `VideoNodeComposer.test.tsx` with:

```tsx
test("renders content without owning canvas placement or inverse zoom", () => {
  const data = { generationPrompt: "", params: { videoGeneration: createDefaultVideoGenerationParams() } } as any;
  render(<VideoNodeComposer data={data} generating={false} nodeId="video-1" onGenerate={vi.fn()} onUpdate={vi.fn()} selected />);

  const composer = screen.getByLabelText("视频创作面板");
  expect(composer.className).toContain("w-full");
  expect(composer.className).toContain("flex-col");
  expect(composer.className).not.toContain("absolute");
  expect(composer.className).not.toContain("top-[calc(100%+14px)]");
  expect(composer.className).not.toContain("-translate-x-1/2");
  expect(composer.className).not.toContain("md:w-[clamp(640px,52vw,980px)]");
  expect(screen.getByRole("button", { name: "选择视频模型" }).parentElement?.parentElement?.className).toContain("max-md:flex-col");
});
```

Use the existing Unicode-safe labels from `VIDEO_UI_COPY` if the source file renders Chinese escape sequences in the local terminal.

- [ ] **Step 2: Run the composer test and verify the red state**

Run:

```bash
npx vitest --run src/flowCanvas/video/VideoNodeComposer.test.tsx
```

Expected: FAIL because the composer root still contains absolute placement, width, and translation classes.

- [ ] **Step 3: Make `VideoNodeComposer` content-only**

Change only its root element in `src/flowCanvas/video/VideoNodeComposer.tsx`:

```tsx
return <div
  aria-label={VIDEO_UI_COPY.videoComposer}
  className="flex w-full flex-col text-white"
>
```

Keep all reference, prompt, model, parameter, palette, camera, human-review, pricing, and generation children unchanged. Keep the existing `if (!selected) return null` behavior so standalone component tests retain their selection contract.

- [ ] **Step 4: Replace `FloatingPromptBar` with `NodeEditorSurface`**

In `src/flowCanvas/nodes/FlowNodes.tsx`:

1. Import `NodeEditorSurface` from `./NodeEditorSurface`.
2. Delete only `bottomFloatingBarBase` and the local `FloatingPromptBar` component.
3. Replace the text opening/closing tags with `NodeEditorSurface variant="text"`.
4. Replace the image opening/closing tags with `NodeEditorSurface variant="image"`.
5. Wrap the V2 video composer as follows:

```tsx
{showNodeEditor && (VIDEO_COMPOSER_V2_ENABLED
  ? (
      <NodeEditorSurface variant="video">
        <VideoNodeComposer
          catalog={videoCatalog}
          data={d}
          generating={isGenerating}
          nodeId={id}
          onConnectCanvasReference={(input) => connectVideoReference({ ...input, targetNodeId: id })}
          onGenerate={handleGenerate}
          onUpdate={(patch) => updateNodeData(id, patch)}
          onUploadReference={async (file, mediaKind) => {
            if (!backendProjectId) throw new Error("REFERENCE_UPLOAD_UNAVAILABLE");
            const asset = await uploadAssetFile({ file, kind: mediaKind, projectId: backendProjectId });
            return { id: asset.id, kind: asset.kind };
          }}
          referencePreviewUrlsBySource={videoReferencePreviewUrlsBySource}
          selected={showNodeEditor}
        />
      </NodeEditorSurface>
    )
  : (
      <VideoNodeLegacyComposer
        data={d}
        effectivePosterUrl={effectivePosterUrl}
        generating={isGenerating}
        nodeId={id}
        onGenerate={handleGenerate}
        onUpdate={(patch) => updateNodeData(id, patch)}
        runtimeVideoAssets={runtimeVideoAssets}
      />
    )
)}
```

Keep the legacy branch structurally unchanged. Do not alter `FloatingToolbar`, which already has its own inverse-zoom implementation.

- [ ] **Step 5: Run the focused component tests**

Run:

```bash
npx vitest --run src/flowCanvas/nodes/NodeEditorSurface.test.tsx src/flowCanvas/utils/promptBarDensity.test.ts src/flowCanvas/video/VideoNodeComposer.test.tsx src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx
```

Expected: PASS. Existing text/image assertions and all composer controls remain green.

- [ ] **Step 6: Commit the shared-boundary migration**

```bash
git add src/flowCanvas/nodes/FlowNodes.tsx src/flowCanvas/video/VideoNodeComposer.tsx src/flowCanvas/video/VideoNodeComposer.test.tsx
git commit -m "refactor(video): share zoom-stable editor surface"
```

### Task 3: Restrict Upload To The Top Button And Remove Video Resizing

**Files:**
- Modify: `src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx`
- Modify: `src/flowCanvas/nodes/FlowNodes.tsx` inside `VideoNodeComponent`
- Test: `src/flowCanvas/video/videoNodeSizing.test.ts`

- [ ] **Step 1: Make the `NodeResizer` mock observable**

Add this hoisted mock beside the existing API mocks:

```tsx
const nodeResizerMock = vi.hoisted(() => vi.fn(() => null));
```

Change the XYFlow mock from `NodeResizer: () => null` to:

```tsx
NodeResizer: nodeResizerMock,
```

Reset it in `beforeEach`:

```tsx
nodeResizerMock.mockClear();
```

- [ ] **Step 2: Add failing empty-node interaction and no-resizer tests**

Add these cases to `FlowNodes.agent-metadata.test.tsx`, using the same complete `NodeProps` already used by the upload tests:

```tsx
it("opens empty-video upload only from the selected-node top button", () => {
  const node = useFlowCanvasStore.getState().addNode("video", { x: 0, y: 0 }, {
    createdAt: 1,
    generationStatus: "idle",
    height: 170,
    kind: "video",
    status: "idle",
    title: "Upload video",
    updatedAt: 1,
    width: 302,
  } as any, { selected: true });
  const { container, getByTestId } = render(
    <VideoNodeComponent id={node.id} selected data={node.data as any} dragging={false} zIndex={1} isConnectable type="video" xPos={0} yPos={0} />,
  );
  const input = container.querySelector('input[type="file"][accept="video/*"]') as HTMLInputElement;
  const clickSpy = vi.spyOn(input, "click");

  fireEvent.click(getByTestId("video-empty-placeholder"));
  fireEvent.drop(getByTestId("video-empty-placeholder"), {
    dataTransfer: { files: [new File(["video"], "dropped.mp4", { type: "video/mp4" })] },
  });
  expect(clickSpy).not.toHaveBeenCalled();
  expect(assetApiMocks.uploadAssetFile).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: /上传/ }));
  expect(clickSpy).toHaveBeenCalledTimes(1);
});

it("does not render resize controls for a selected video node", () => {
  const node = useFlowCanvasStore.getState().addNode("video", { x: 0, y: 0 }, {
    createdAt: 1,
    generationStatus: "idle",
    kind: "video",
    status: "idle",
    title: "Video",
    updatedAt: 1,
  } as any, { selected: true });

  render(<VideoNodeComponent id={node.id} selected data={node.data as any} dragging={false} zIndex={1} isConnectable type="video" xPos={0} yPos={0} />);

  expect(nodeResizerMock).not.toHaveBeenCalled();
});
```

Retain the existing upload-success tests that dispatch `change` directly on the hidden input; they verify the durable asset path independently from the UI trigger.

- [ ] **Step 3: Run the tests and verify the red state**

Run:

```bash
npx vitest --run src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx
```

Expected: FAIL because placeholder click/drop still initiate upload and the selected video node still calls `NodeResizer`.

- [ ] **Step 4: Make the empty preview passive and the toolbar button authoritative**

Add a button-only handler above the return in `VideoNodeComponent`:

```tsx
const handleOpenVideoUpload = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
  event.stopPropagation();
  videoInputRef.current?.click();
}, []);
```

Replace the empty placeholder with:

```tsx
<div
  data-testid="video-empty-placeholder"
  style={placeholderArea(requestedVideoSize.height)}
>
  <Video size={48} strokeWidth={1} color="rgba(255,255,255,0.2)" />
</div>
```

Remove its `onClick`, `onDragOver`, `onDrop`, and pointer cursor. Normal bubbling remains available to React Flow for node selection.

Change the top upload button to:

```tsx
<button type="button" style={uploadBtn} onClick={handleOpenVideoUpload}>
  <span style={{ fontSize: 16 }}>↑</span> 上传
</button>
```

Keep the hidden file input conditional on `!hasReadyVideo`; do not add a ready-state replacement path.

- [ ] **Step 5: Remove only the video node's `NodeResizer`**

Delete the `NodeResizer` block immediately inside `VideoNodeComponent`:

```tsx
<NodeResizer
  isVisible={showSingleNodeControls}
  minWidth={160}
  minHeight={160}
  lineStyle={{ border: "none" }}
/>
```

Do not remove any other `NodeResizer` callsites, global resize styles, connection handles, or the shared import.

- [ ] **Step 6: Run upload, sizing, composer, and ready-state regressions**

Run:

```bash
npx vitest --run src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx src/flowCanvas/video/videoNodeSizing.test.ts src/flowCanvas/video/VideoNodeComposer.test.tsx src/flowCanvas/video/VideoReadyState.test.tsx
```

Expected: PASS. Specifically, requested `9:16` remains `170 x 302`, natural `1080 x 1920` remains `170 x 302`, upload produces an asset-backed ready state, and ready states show download/fullscreen without upload or replacement.

- [ ] **Step 7: Commit the interaction repair**

```bash
git add src/flowCanvas/nodes/FlowNodes.tsx src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx
git commit -m "fix(video): restrict upload and remove manual resize"
```

### Task 4: Extend Real-Browser Acceptance And Complete Verification

**Files:**
- Modify: `scripts/smoke-video-node.ts`
- Modify: `scripts/smoke-video-node.test.ts`
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Add failing smoke-contract expectations**

Extend the field list in `scripts/smoke-video-node.test.ts` with:

```tsx
for (const field of [
  "emptyPreviewDoesNotOpenUpload",
  "topUploadButtonOpensUpload",
  "placeholderDropDoesNotUpload",
  "videoNodeHasNoResizeControls",
  "editorGeometryByZoom",
  "editorSizeStableAcrossZoom",
  "editorRemainsNodeAnchored",
  "textEditorBaselineStable",
  "imageEditorBaselineStable",
]) {
  expect(code).toContain(field);
}
expect(code).toContain("video-empty-placeholder");
expect(code).toContain("setVideoSmokeZoom");
expect(code).toContain(".react-flow__resize-control");
expect(code).toContain("[data-node-editor-variant=\"video\"]");
```

- [ ] **Step 2: Run the smoke contract and verify the red state**

Run:

```bash
npm run test:smoke-video-node
```

Expected: FAIL because the generated browser script does not yet include these fields and selectors.

- [ ] **Step 3: Expose controlled zoom and upload instrumentation in the real XYFlow harness**

Import the shared surface in `buildVideoNodeSmokeHtml()` and add a probe node that has no editor internals of its own:

```js
import { NodeEditorSurface } from '/src/flowCanvas/nodes/NodeEditorSurface.tsx';

function SurfaceProbeNode({ data }) {
  return React.createElement(
    'div',
    { style: { height: 60, position: 'relative', width: 120 } },
    React.createElement(
      NodeEditorSurface,
      { variant: data.variant },
      React.createElement('span', null, data.variant + '-surface-probe'),
    ),
  );
}
```

Add two unselected probe nodes beside `initialNode` in the store seed:

```js
const surfaceProbeNodes = [
  { id: 'text-surface-probe', type: 'surfaceProbe', position: { x: 30, y: 520 }, selected: false, data: { variant: 'text' } },
  { id: 'image-surface-probe', type: 'surfaceProbe', position: { x: 820, y: 520 }, selected: false, data: { variant: 'image' } },
];
useFlowCanvasStore.setState({
  edges: [],
  nodes: [initialNode, ...surfaceProbeNodes],
  selectedNodeCount: 1,
  nodeOutputByNodeId: {},
  nodeRunStatusByNodeId: {},
});
```

Register `surfaceProbe: SurfaceProbeNode` beside `video: VideoNodeComponent` in the harness `nodeTypes`. Preserve probe nodes in `setVideoSmokeNodeData`, `resetVideoSmokeBlockedNode`, and `positionVideoSmokeNode` by continuing to map only the `video-smoke-node` ID.

Inside `SmokeViewportCoordinator` in `buildVideoNodeSmokeHtml()`:

```js
window.setVideoSmokeZoom = async (zoom) => {
  await reactFlow.setViewport({ x: 0, y: 0, zoom }, { duration: 0 });
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
};
```

Remove the controlled `viewport: { x: 0, y: 0, zoom: 1 }` prop from `ReactFlow`; keep `defaultViewport`, `minZoom`, `nodes`, `nodeTypes`, and `onNodesChange`. The coordinator's initial `setViewport(...zoom: 1)` remains the stable starting state.

Track asset-upload requests in `window.videoNodeSmokeState`:

```js
window.videoNodeSmokeState = { assetUploadRequestCount: 0, workflowRequestCount: 0 };
```

Increment `assetUploadRequestCount` when `requestUrl.includes('/api/v2/assets/presigned-upload')`, `requestUrl.includes('/complete-upload')`, or `requestUrl.includes('/upload-bytes')`. This makes a dropped-file assertion independent of video metadata loading.

- [ ] **Step 4: Add browser assertions for the approved interaction contract**

Extend `VideoNodeSmokeResult` so later code and callers use one consistent result shape:

```ts
export type VideoNodeSmokeResult = {
  blockedGenerationDidNotCreateRun: boolean;
  cameraGridColumns: number;
  cameraPresetCount: number;
  composerVisible: boolean;
  durationRangeIsDefault: boolean;
  editorGeometryByZoom: Array<{ height: number; width: number; zoom: number }>;
  editorRemainsNodeAnchored: boolean;
  editorSizeStableAcrossZoom: boolean;
  emptyPreviewDoesNotOpenUpload: boolean;
  imageEditorBaselineStable: boolean;
  modelMenuNoSearch: boolean;
  parameterDialogIsTopLayer: boolean;
  placeholderDropDoesNotUpload: boolean;
  resolutionOptions: string[];
  textEditorBaselineStable: boolean;
  topUploadButtonOpensUpload: boolean;
  videoNodeHasNoResizeControls: boolean;
};
```

In `buildVideoNodeCheckCode()`, add a geometry helper:

```js
async function readEditorGeometry(viewportPage) {
  return await viewportPage.locator('[data-node-editor-variant="video"]').evaluate((editor) => {
    const rect = editor.getBoundingClientRect();
    const nodeRect = editor.closest('.react-flow__node')?.getBoundingClientRect();
    return {
      bottom: rect.bottom,
      height: rect.height,
      left: rect.left,
      nodeBottom: nodeRect?.bottom ?? null,
      top: rect.top,
      width: rect.width,
    };
  });
}
```

Collect `[0.25, 0.5, 1, 2]` measurements:

```js
const editorGeometryByZoom = [];
for (const zoom of [0.25, 0.5, 1, 2]) {
  await desktopPage.evaluate((nextZoom) => window.setVideoSmokeZoom(nextZoom), zoom);
  editorGeometryByZoom.push({ zoom, ...(await readEditorGeometry(desktopPage)) });
}
const baselineGeometry = editorGeometryByZoom.find((entry) => entry.zoom === 1);
const editorSizeStableAcrossZoom = editorGeometryByZoom.every((entry) =>
  Math.abs(entry.width - baselineGeometry.width) <= 1 &&
  Math.abs(entry.height - baselineGeometry.height) <= 1
);
const editorRemainsNodeAnchored = editorGeometryByZoom.every((entry) =>
  entry.nodeBottom !== null && entry.top >= entry.nodeBottom
);
```

Add interaction checks before switching the node to ready state:

```js
let emptyPreviewFileChooserCount = 0;
const onEmptyPreviewFileChooser = () => { emptyPreviewFileChooserCount += 1; };
desktopPage.on('filechooser', onEmptyPreviewFileChooser);
await desktopPage.getByTestId('video-empty-placeholder').click();
await desktopPage.waitForTimeout(100);
desktopPage.off('filechooser', onEmptyPreviewFileChooser);
const emptyPreviewDoesNotOpenUpload = emptyPreviewFileChooserCount === 0;

const chooserPromise = desktopPage.waitForEvent('filechooser');
await desktopPage.getByRole('button', { name: /上传/ }).click();
await chooserPromise;
const topUploadButtonOpensUpload = true;

const uploadsBeforeDrop = await desktopPage.evaluate(() => window.videoNodeSmokeState.assetUploadRequestCount);
await desktopPage.getByTestId('video-empty-placeholder').evaluate((placeholder) => {
  const transfer = new DataTransfer();
  transfer.items.add(new File(['video'], 'dropped.mp4', { type: 'video/mp4' }));
  placeholder.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
});
await desktopPage.waitForTimeout(100);
const uploadsAfterDrop = await desktopPage.evaluate(() => window.videoNodeSmokeState.assetUploadRequestCount);
const placeholderDropDoesNotUpload = uploadsAfterDrop === uploadsBeforeDrop;

const videoNodeHasNoResizeControls = await desktopPage.locator('.react-flow__node[data-id="video-smoke-node"] .react-flow__resize-control').count() === 0;
```

For text/image compatibility, add two `NodeEditorSurface` probe node types to the same XYFlow harness. During the same `[0.25, 0.5, 1, 2]` loop, measure all three `data-node-editor-variant` rectangles and retain `width` and `height` for each variant. Assert exact inline style contracts and one-pixel geometry stability against each variant's `zoom=1` measurement:

```js
async function readVariantGeometry(viewportPage, variant) {
  return await viewportPage.locator(`[data-node-editor-variant="${variant}"]`).evaluate((surface) => {
    const rect = surface.getBoundingClientRect();
    return { height: rect.height, width: rect.width };
  });
}
const surfaceGeometryByVariantAndZoom = { image: [], text: [], video: [] };
for (const zoom of [0.25, 0.5, 1, 2]) {
  await desktopPage.evaluate((nextZoom) => window.setVideoSmokeZoom(nextZoom), zoom);
  for (const variant of ['text', 'image', 'video']) {
    surfaceGeometryByVariantAndZoom[variant].push({
      zoom,
      ...(await readVariantGeometry(desktopPage, variant)),
    });
  }
}
function isVariantStable(variant) {
  const values = surfaceGeometryByVariantAndZoom[variant];
  const baseline = values.find((entry) => entry.zoom === 1);
  return values.every((entry) =>
    Math.abs(entry.width - baseline.width) <= 1 &&
    Math.abs(entry.height - baseline.height) <= 1
  );
}
const textStyleStable = await desktopPage.locator('[data-node-editor-variant="text"]').evaluate((surface) =>
  surface.style.width === 'clamp(520px, 42vw, 760px)' &&
  surface.style.minHeight === '120px' &&
  surface.style.padding === '12px 16px'
);
const imageStyleStable = await desktopPage.locator('[data-node-editor-variant="image"]').evaluate((surface) =>
  surface.style.width === 'clamp(560px, 44vw, 820px)' &&
  surface.style.minHeight === '128px' &&
  surface.style.padding === '12px 16px'
);
const textEditorBaselineStable = textStyleStable && isVariantStable('text');
const imageEditorBaselineStable = imageStyleStable && isVariantStable('image');
```

Return every new field from the smoke result and throw a named error when any boolean is false. Restore zoom `1` before existing menu, ready-state, narrow, and mobile checks.

- [ ] **Step 5: Run unit and real-browser smoke verification**

Run:

```bash
npm run test:smoke-video-node
npm run smoke:video-node
```

Expected: the contract test PASS; the real browser smoke returns `status: "ok"`, writes desktop/narrow/mobile screenshots under `output/playwright/video-node`, and reports all new interaction and geometry fields as successful.

- [ ] **Step 6: Update the project record**

Append a dated section to `PROJECT_RECORD.md`:

```markdown
## 2026-08-04 - Video Node Interaction Consistency

- empty video previews are now passive selection surfaces; only the selected empty node's top upload button opens the video file picker, and ready video nodes retain no upload or replacement path.
- video editor controls now use the shared node-relative inverse-zoom surface, while the existing text and image density, dimensions, position, shadow, and transform-origin contracts remain unchanged.
- video nodes no longer render manual resize controls; requested aspect ratio remains authoritative before media, and natural video dimensions remain authoritative after upload or generation.
- focused component, sizing, browser-smoke, and production frontend build validation passed. No workflow, model, billing, credential, asset-persistence, or draft contract changed.
```

Replace the last validation sentence with the exact commands and any concrete failure if a required command does not pass.

- [ ] **Step 7: Run final verification from a clean test invocation**

Run:

```bash
npx vitest --run src/flowCanvas/nodes/NodeEditorSurface.test.tsx src/flowCanvas/utils/promptBarDensity.test.ts src/flowCanvas/video/VideoNodeComposer.test.tsx src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx src/flowCanvas/video/videoNodeSizing.test.ts src/flowCanvas/video/VideoReadyState.test.tsx scripts/smoke-video-node.test.ts
npm run smoke:video-node
npm run build
git diff --check
git status --short
```

Expected:

- all focused Vitest files PASS;
- browser smoke returns `status: "ok"` at desktop, narrow, and mobile viewports;
- Vite production build succeeds, with only already-known non-blocking warnings if they remain;
- `git diff --check` reports no whitespace errors;
- `src/flowCanvas/flowCanvas.css` remains modified but unstaged and byte-for-byte untouched by this task.

- [ ] **Step 8: Commit browser coverage and project record**

```bash
git add scripts/smoke-video-node.ts scripts/smoke-video-node.test.ts PROJECT_RECORD.md
git commit -m "test(video): verify interaction consistency"
```

## Completion Checklist

- Empty preview click selects only; it never opens the picker.
- Empty preview drop never uploads.
- The top upload button is the only empty-node upload trigger.
- Ready uploaded/generated video states expose no upload or replacement action.
- Video editor width and height are stable at zoom `0.25`, `0.5`, `1`, and `2` within one browser pixel.
- Text and image editor density and geometry match their pre-extraction constants.
- No video-node resize controls or transparent resize hit areas exist.
- Requested-ratio and natural-media sizing tests remain green.
- No generated media URL, `File`, `Blob`, blob URL, data URL, or secret is added to node data.
- `PROJECT_RECORD.md` contains the exact final validation evidence.
