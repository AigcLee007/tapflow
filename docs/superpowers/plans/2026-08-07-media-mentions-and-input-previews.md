# Media Mentions and Unified Input Previews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make connected text inputs one fixed first-position group, add image/video hover previews, and give image/video nodes one stable media-only `@` reference workflow.

**Architecture:** Keep React Flow edges and `assetId` as the authoritative connection and media identities. Extend the unified input projection with text/media partitions and distinct thumbnail/hover URLs, centralize text-first ordering in the Store, and replace the image-only prompt behavior with a shared Lexical media-mention editor whose persisted bindings use stable `inputKey` values.

**Tech Stack:** React 19, TypeScript 5.8, Zustand, `@xyflow/react`, Lexical, Vitest, Testing Library, Playwright CLI, Vite.

**Design reference:** `docs/superpowers/specs/2026-08-07-media-mentions-and-input-previews-design.md`

---

## File Map

Create these focused units:

- `src/flowCanvas/mentions/mediaMentions.ts`: durable mention types, label allocation, legacy reconciliation, and invalid-state projection.
- `src/flowCanvas/mentions/mediaMentions.test.ts`: pure mention identity and legacy compatibility coverage.
- `src/flowCanvas/mentions/mediaMentionCandidates.ts`: compatible candidate normalization, de-duplication, filtering, and group ordering.
- `src/flowCanvas/mentions/mediaMentionCandidates.test.ts`: text exclusion, source ordering, and capability filtering coverage.
- `src/flowCanvas/mentions/MediaMentionCandidateMenu.tsx`: shared body-portal candidate menu with keyboard-safe rows.
- `src/flowCanvas/mentions/MediaMentionPromptEditor.tsx`: shared Lexical prompt editor, mention pills, IME control, and candidate activation.
- `src/flowCanvas/mentions/MediaMentionPromptEditor.test.tsx`: prompt, caret, IME, menu, binding, deletion, and invalid-reference tests.
- `src/flowCanvas/inputs/MediaHoverPreview.tsx`: image/video preview portal and video playback lifecycle.
- `src/flowCanvas/inputs/MediaHoverPreview.test.tsx`: positioning, fallback, autoplay, pause, and reset coverage.

Modify these existing files:

- `src/flowCanvas/types.ts`: add durable `mediaMentionBindings` to `FlowNodeData`.
- `src/flowCanvas/inputs/canvasInputProjection.ts`: text/media partitions, text-first order, thumbnail and hover-preview fields.
- `src/flowCanvas/inputs/canvasInputProjection.test.ts`: projection and safe-signature regressions.
- `src/flowCanvas/store/flowCanvasStore.ts`: canonical text-first order and atomic remove-all-text action.
- `src/flowCanvas/store/flowCanvasStore.test.ts`: connection, restoration, reorder, and bulk removal regressions.
- `src/flowCanvas/inputs/useCanvasInputAssets.ts`: resolve thumbnail and hover-preview variants independently.
- `src/flowCanvas/inputs/useCanvasInputAssets.test.tsx`: image/video variant and retry behavior.
- `src/flowCanvas/inputs/NodeInputTray.tsx`: aggregate text group, media-only drag order, and hover preview integration.
- `src/flowCanvas/inputs/NodeInputTray.test.tsx`: aggregate text interactions and media-only ordering.
- `src/flowCanvas/nodes/FlowNodes.tsx`: image/video adapters, candidate activation, and removal of image-only prompt code.
- `src/flowCanvas/nodes/FlowNodes.image-inputs.test.tsx`: image mention and aggregate text integration.
- `src/flowCanvas/video/videoReferenceRules.ts`: reusable role/allocation helper for picker and mentions.
- `src/flowCanvas/video/videoReferenceRules.test.ts`: reference helper regressions.
- `src/flowCanvas/video/VideoReferenceStrip.tsx`: consume the shared video reference helper.
- `src/flowCanvas/video/VideoNodeComposer.tsx`: render the shared mention editor instead of a plain textarea.
- `src/flowCanvas/video/VideoNodeComposer.test.tsx`: video mention editor and capability filtering.
- `src/flowCanvas/utils/canonicalGraph.test.ts`: durable mention metadata and transient URL stripping.
- `apps/worker/test/workflow-runtime-image-request.test.ts`: image prompt/reference regression.
- `apps/worker/test/worker.test.ts`: video prompt/reference regression.
- `scripts/smoke-node-input-tray.ts`: real text group, hover preview, and image/video mention browser scenario.
- `scripts/smoke-node-input-tray.test.ts`: smoke harness contract coverage.
- `PROJECT_RECORD.md`: implementation and verification record.

Delete after both nodes have migrated:

- `src/flowCanvas/nodes/PromptLexicalEditor.tsx`: superseded image-only editor.

Do not change billing, API contracts, AI route selection, database schema, or provider credentials.

---

### Task 1: Stable Media Mention Domain Model

**Files:**
- Create: `src/flowCanvas/mentions/mediaMentions.ts`
- Create: `src/flowCanvas/mentions/mediaMentions.test.ts`
- Modify: `src/flowCanvas/types.ts:300-330`

- [ ] **Step 1: Write failing identity and legacy tests**

Create `mediaMentions.test.ts` with concrete cases for stable reuse, monotonic labels, legacy `@Image N`, and invalid bindings:

```ts
import { describe, expect, it } from "vitest";
import {
  allocateMediaMentionBinding,
  reconcileLegacyMediaMentions,
  resolveMediaMentionTokens,
} from "./mediaMentions";

describe("media mentions", () => {
  it("reuses one stable label for the same input key across reordering", () => {
    const first = allocateMediaMentionBinding([], { inputKey: "asset:a", kind: "image" });
    const second = allocateMediaMentionBinding(first.bindings, { inputKey: "asset:a", kind: "image" });
    expect(second.binding).toEqual({ inputKey: "asset:a", kind: "image", label: "图片1" });
    expect(second.bindings).toHaveLength(1);
  });

  it("allocates independent monotonic labels by media kind", () => {
    const one = allocateMediaMentionBinding([], { inputKey: "asset:a", kind: "image" });
    const two = allocateMediaMentionBinding(one.bindings, { inputKey: "asset:v", kind: "video" });
    const three = allocateMediaMentionBinding(two.bindings, { inputKey: "asset:b", kind: "image" });
    expect(three.bindings.map((item) => item.label)).toEqual(["图片1", "视频1", "图片2"]);
  });

  it("binds unambiguous legacy image labels and leaves ambiguous text unresolved", () => {
    expect(reconcileLegacyMediaMentions("use @Image 1", [], [
      { inputKey: "asset:a", kind: "image" },
    ])).toEqual([{ inputKey: "asset:a", kind: "image", label: "Image 1" }]);
    expect(reconcileLegacyMediaMentions("use @Image 2", [], [
      { inputKey: "asset:a", kind: "image" },
    ])).toEqual([]);
  });

  it("marks a binding invalid without rebinding it", () => {
    const tokens = resolveMediaMentionTokens("use @图片1", [
      { inputKey: "asset:removed", kind: "image", label: "图片1" },
    ], new Set(["asset:other"]));
    expect(tokens).toContainEqual(expect.objectContaining({ label: "图片1", valid: false }));
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npm test -- src/flowCanvas/mentions/mediaMentions.test.ts
```

Expected: FAIL because `mediaMentions.ts` does not exist.

- [ ] **Step 3: Add durable types and minimal pure implementation**

Add to `src/flowCanvas/types.ts`:

```ts
export type FlowMediaMentionKind = "image" | "video" | "audio";

export type FlowMediaMentionBinding = {
  inputKey: string;
  kind: FlowMediaMentionKind;
  label: string;
};

// Inside FlowNodeData
mediaMentionBindings?: FlowMediaMentionBinding[];
```

Implement these exact exports in `mediaMentions.ts`:

```ts
import type { FlowMediaMentionBinding, FlowMediaMentionKind } from "../types";

const PREFIX: Record<FlowMediaMentionKind, string> = {
  image: "图片",
  video: "视频",
  audio: "音频",
};

export function allocateMediaMentionBinding(
  bindings: FlowMediaMentionBinding[],
  input: { inputKey: string; kind: FlowMediaMentionKind },
): { binding: FlowMediaMentionBinding; bindings: FlowMediaMentionBinding[] } {
  const existing = bindings.find((item) => item.inputKey === input.inputKey);
  if (existing) return { binding: existing, bindings };
  const prefix = PREFIX[input.kind];
  const nextNumber = bindings.reduce((max, item) => {
    const match = item.label.match(new RegExp(`^${prefix}(\\d+)$`));
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0) + 1;
  const binding = { ...input, label: `${prefix}${nextNumber}` };
  return { binding, bindings: [...bindings, binding] };
}

export function reconcileLegacyMediaMentions(
  prompt: string,
  bindings: FlowMediaMentionBinding[],
  mediaInputs: Array<{ inputKey: string; kind: FlowMediaMentionKind }>,
): FlowMediaMentionBinding[] {
  const next = [...bindings];
  for (const match of prompt.matchAll(/@Image\s+(\d+)/g)) {
    const input = mediaInputs.filter((item) => item.kind === "image")[Number(match[1]) - 1];
    if (!input || next.some((item) => item.label === match[0].slice(1))) continue;
    next.push({ ...input, label: match[0].slice(1) });
  }
  return next;
}

export function resolveMediaMentionTokens(
  prompt: string,
  bindings: FlowMediaMentionBinding[],
  activeInputKeys: ReadonlySet<string>,
) {
  return bindings
    .filter((binding) => prompt.includes(`@${binding.label}`))
    .map((binding) => ({ ...binding, valid: activeInputKeys.has(binding.inputKey) }));
}
```

- [ ] **Step 4: Run the focused test and build type check**

Run:

```bash
npm test -- src/flowCanvas/mentions/mediaMentions.test.ts
npm run build
```

Expected: 4 tests PASS; Vite build exits 0.

- [ ] **Step 5: Commit the domain model**

```bash
git add src/flowCanvas/types.ts src/flowCanvas/mentions/mediaMentions.ts src/flowCanvas/mentions/mediaMentions.test.ts
git commit -m "feat(canvas): add stable media mention bindings"
```

---

### Task 2: Text-First Input Projection and Media Preview Fields

**Files:**
- Modify: `src/flowCanvas/inputs/canvasInputProjection.ts:1-90`
- Modify: `src/flowCanvas/inputs/canvasInputProjection.test.ts:1-180`

- [ ] **Step 1: Replace the mixed-order expectation with failing text-first tests**

Add tests that require text inputs to ignore media positions in `inputOrder`:

```ts
it("projects one stable text partition before ordered media", () => {
  const secondText = { ...upstreamText, inputKey: "upstream:text-2", sourceNodeId: "text-2", title: "Second" };
  const projection = resolveCanvasInputProjection({
    inputOrder: [directAsset.inputKey, secondText.inputKey, upstreamImage.inputKey, upstreamText.inputKey],
    seeds: [upstreamText, upstreamImage, secondText, directAsset],
  });
  expect(projection.textItems.map((item) => item.inputKey)).toEqual([
    upstreamText.inputKey,
    secondText.inputKey,
  ]);
  expect(projection.mediaItems.map((item) => item.inputKey)).toEqual([
    directAsset.inputKey,
    upstreamImage.inputKey,
  ]);
  expect(projection.items.map((item) => item.inputKey)).toEqual([
    upstreamText.inputKey,
    secondText.inputKey,
    directAsset.inputKey,
    upstreamImage.inputKey,
  ]);
});

it("keeps thumbnail and hover preview URLs out of the safe signature", () => {
  const item = { ...upstreamImage, thumbnailUrl: "https://cdn/thumb", hoverPreviewUrl: "https://cdn/preview" };
  const changed = { ...item, thumbnailUrl: "https://cdn/new-thumb", hoverPreviewUrl: "https://cdn/new-preview" };
  expect(buildCanvasInputSignature({ items: [item], localPrompt: "x", targetNodeId: "n" }))
    .toBe(buildCanvasInputSignature({ items: [changed], localPrompt: "x", targetNodeId: "n" }));
});
```

- [ ] **Step 2: Run the projection test and verify RED**

```bash
npm test -- src/flowCanvas/inputs/canvasInputProjection.test.ts
```

Expected: FAIL because `resolveCanvasInputProjection` and the new URL fields do not exist.

- [ ] **Step 3: Implement explicit partitions while retaining the compatibility wrapper**

Extend `CanvasInputSeed`:

```ts
thumbnailUrl?: string;
hoverPreviewUrl?: string;
```

Add:

```ts
export type CanvasInputProjection = {
  items: CanvasInputItem[];
  mediaItems: CanvasInputItem[];
  textItems: CanvasInputItem[];
};

export function resolveCanvasInputProjection(args: {
  inputOrder?: string[];
  seeds: CanvasInputSeed[];
}): CanvasInputProjection {
  const unique = new Map<string, CanvasInputSeed>();
  args.seeds.forEach((seed) => { if (!unique.has(seed.inputKey)) unique.set(seed.inputKey, seed); });
  const seeds = [...unique.values()];
  const textSeeds = seeds.filter((seed) => seed.kind === "text");
  const mediaByKey = new Map(seeds.filter((seed) => seed.kind !== "text").map((seed) => [seed.inputKey, seed]));
  const mediaSeeds: CanvasInputSeed[] = [];
  const seen = new Set<string>();
  for (const key of args.inputOrder ?? []) {
    const seed = mediaByKey.get(key);
    if (seed && !seen.has(key)) { mediaSeeds.push(seed); seen.add(key); }
  }
  for (const seed of mediaByKey.values()) {
    if (!seen.has(seed.inputKey)) mediaSeeds.push(seed);
  }
  const items = [...textSeeds, ...mediaSeeds].map((seed, order) => ({ ...seed, order }));
  return {
    items,
    textItems: items.filter((item) => item.kind === "text"),
    mediaItems: items.filter((item) => item.kind !== "text"),
  };
}

export function resolveCanvasInputItems(args: { inputOrder?: string[]; seeds: CanvasInputSeed[] }) {
  return resolveCanvasInputProjection(args).items;
}
```

- [ ] **Step 4: Run projection tests**

```bash
npm test -- src/flowCanvas/inputs/canvasInputProjection.test.ts
```

Expected: all projection tests PASS after updating the previous mixed-order assertion to the text-first invariant.

- [ ] **Step 5: Commit the projection contract**

```bash
git add src/flowCanvas/inputs/canvasInputProjection.ts src/flowCanvas/inputs/canvasInputProjection.test.ts
git commit -m "feat(canvas): project text inputs before media"
```

---

### Task 3: Store-Level Text-First Invariant and Atomic Bulk Removal

**Files:**
- Modify: `src/flowCanvas/store/flowCanvasStore.ts:180-205,500-680,1780-1870`
- Modify: `src/flowCanvas/store/flowCanvasStore.test.ts`

- [ ] **Step 1: Write failing Store tests**

Add three focused tests:

```ts
it("canonicalizes restored input order as incoming text edges then user-ordered media", () => {
  useFlowCanvasStore.getState().restoreGraphSnapshot({
    nodes: [textA, imageA, textB, videoTargetWithOrder(["upstream:image-a", "upstream:text-b", "upstream:text-a"])],
    edges: [edge(textA, target), edge(imageA, target), edge(textB, target)],
  });
  expect(node(target).data.inputOrder).toEqual([
    "upstream:text-a", "upstream:text-b", "upstream:image-a",
  ]);
});

it("reorders media without moving it ahead of text", () => {
  seedTextAndTwoMediaInputs();
  useFlowCanvasStore.getState().reorderNodeInputs(target, ["upstream:video", "upstream:image"]);
  expect(node(target).data.inputOrder).toEqual([
    "upstream:text", "upstream:video", "upstream:image",
  ]);
});

it("removes all upstream text edges atomically and preserves media", () => {
  seedTwoTextAndOneMediaInputs();
  useFlowCanvasStore.getState().removeTextNodeInputs(target);
  expect(useFlowCanvasStore.getState().edges.map((item) => item.source)).toEqual(["image"]);
  expect(node(target).data.inputOrder).toEqual(["upstream:image"]);
});
```

Use the existing `addNode`, `connectNodes`, and state reset helpers in this test file rather than introducing mocked Store behavior.

- [ ] **Step 2: Run Store tests and verify RED**

```bash
npm test -- src/flowCanvas/store/flowCanvasStore.test.ts
```

Expected: FAIL on text-first restoration/reorder and missing `removeTextNodeInputs`.

- [ ] **Step 3: Centralize input-order normalization**

Add to `FlowCanvasState`:

```ts
removeTextNodeInputs: (targetNodeId: string) => void;
```

Replace `orderedKeysForNode` with a helper that receives classified keys:

```ts
const normalizeNodeInputOrder = (
  storedOrder: unknown,
  textKeys: string[],
  mediaKeys: string[],
) => {
  const mediaSet = new Set(mediaKeys);
  const storedMedia = getUniqueInputKeys(storedOrder).filter((key) => mediaSet.has(key));
  const orderedMedia = mediaKeys.reduce(appendInputOrderKey, storedMedia);
  return [...getUniqueInputKeys(textKeys), ...orderedMedia];
};
```

In `reconcileNodeInputs`, classify upstream sources with `getNodeReferenceInputKind`. Build `textKeys` from incoming edges in edge order and `mediaKeys` from upstream media plus direct assets. Use `normalizeNodeInputOrder` for image and video nodes.

In `reorderNodeInputs`, retain the current text prefix and apply requested keys only to valid media keys before reconciliation.

Implement `removeTextNodeInputs` in one `set` transaction: identify incoming edges whose source kind is `text`, remove those edges, reconcile the target, rebuild the graph index, mark dirty, and push one history entry.

- [ ] **Step 4: Run Store and projection suites**

```bash
npm test -- src/flowCanvas/store/flowCanvasStore.test.ts src/flowCanvas/inputs/canvasInputProjection.test.ts
```

Expected: both files PASS; existing image/video reference-order tests remain green.

- [ ] **Step 5: Commit Store invariants**

```bash
git add src/flowCanvas/store/flowCanvasStore.ts src/flowCanvas/store/flowCanvasStore.test.ts
git commit -m "feat(canvas): enforce text-first node inputs"
```

---

### Task 4: Resolve Separate Thumbnail and Hover Variants

**Files:**
- Modify: `src/flowCanvas/inputs/useCanvasInputAssets.ts`
- Modify: `src/flowCanvas/inputs/useCanvasInputAssets.test.tsx`
- Modify: `src/flowCanvas/store/flowCanvasStore.ts:240-360`
- Modify: `src/flowCanvas/store/flowCanvasStore.test.ts:1-220`

- [ ] **Step 1: Write failing asset-resolution tests**

Add assertions for image and video assets:

```ts
it("resolves a video thumb separately from its playable preview", async () => {
  getAssetMock.mockResolvedValue({ id: "video-1", kind: "video", title: "Clip" });
  getAssetVariantUrlMock.mockImplementation(async (_id, variant) => ({
    url: variant === "thumb" ? "https://cdn/clip.webp" : "https://cdn/clip.mp4",
  }));
  const { result } = renderHook(() => useCanvasInputAssets([videoItem]));
  await waitFor(() => expect(result.current.items[0]).toMatchObject({
    thumbnailUrl: "https://cdn/clip.webp",
    hoverPreviewUrl: "https://cdn/clip.mp4",
    previewState: "ready",
  }));
});

it("keeps a ready thumbnail when the hover variant is unavailable", async () => {
  getAssetVariantUrlMock.mockImplementation(async (_id, variant) => {
    if (variant === "preview") throw new Error("preview pending");
    return { url: "https://cdn/image-thumb.webp" };
  });
  const { result } = renderHook(() => useCanvasInputAssets([imageItem]));
  await waitFor(() => expect(result.current.items[0]).toMatchObject({
    thumbnailUrl: "https://cdn/image-thumb.webp",
    previewState: "ready",
  }));
});
```

- [ ] **Step 2: Run hook tests and verify RED**

```bash
npm test -- src/flowCanvas/inputs/useCanvasInputAssets.test.tsx
```

Expected: FAIL because only `previewUrl` is resolved.

- [ ] **Step 3: Resolve variants independently**

Change `ResolvedAsset` to contain `thumbnailUrl` and `hoverPreviewUrl`. For image and video assets, request `thumb` and `preview` with independent `Promise.allSettled` branches. Set `previewState` to `ready` when either the existing runtime URL, thumb, or preview exists; set `error` only when metadata and both media requests fail; preserve audio behavior.

Update the returned item merge:

```ts
return {
  ...item,
  durationMs: item.durationMs ?? resolved.durationMs,
  hoverPreviewUrl: item.hoverPreviewUrl ?? resolved.hoverPreviewUrl,
  previewState: resolved.previewState,
  thumbnailUrl: item.thumbnailUrl ?? resolved.thumbnailUrl,
  title: item.title || resolved.title || item.title,
};
```

Split Store URL derivation into `getNodeReferenceThumbnailUrl` and `getNodeReferenceHoverPreviewUrl`. For video, the thumbnail helper reads `posterUrl`/`thumbnailUrl`; the hover helper reads `previewUrl`/`videoUrl`/`originalVideoUrl`/runtime video download URL. Populate both fields in `upstreamInputRefsByNodeId`.

- [ ] **Step 4: Run hook and Store graph-index tests**

```bash
npm test -- src/flowCanvas/inputs/useCanvasInputAssets.test.tsx src/flowCanvas/store/flowCanvasStore.test.ts
```

Expected: PASS, including a Store assertion that an upstream video seed has different thumbnail and hover URLs.

- [ ] **Step 5: Commit media variant resolution**

```bash
git add src/flowCanvas/inputs/useCanvasInputAssets.ts src/flowCanvas/inputs/useCanvasInputAssets.test.tsx src/flowCanvas/store/flowCanvasStore.ts src/flowCanvas/store/flowCanvasStore.test.ts
git commit -m "feat(canvas): resolve input hover previews"
```

---

### Task 5: Body-Level Image and Video Hover Preview

**Files:**
- Create: `src/flowCanvas/inputs/MediaHoverPreview.tsx`
- Create: `src/flowCanvas/inputs/MediaHoverPreview.test.tsx`

- [ ] **Step 1: Write failing image, video, and positioning tests**

```tsx
it("portals an image preview and clamps it to the viewport", () => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
  const trigger = document.createElement("button");
  vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(rect({ left: 350, right: 382, top: 760, bottom: 812 }));
  render(<MediaHoverPreview item={imageItem} open trigger={trigger} />);
  const preview = screen.getByRole("dialog", { name: "预览 Reference image" });
  expect(preview.parentElement).toBe(document.body);
  expect(Number.parseFloat(preview.style.left)).toBeLessThanOrEqual(382);
  expect(screen.getByRole("img", { name: "Reference image" })).toHaveAttribute("src", imageItem.hoverPreviewUrl);
});

it("plays muted video on open and pauses and resets on close", async () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  const { rerender } = render(<MediaHoverPreview item={videoItem} open trigger={trigger} />);
  const video = screen.getByLabelText("视频预览 Clip") as HTMLVideoElement;
  expect(video.muted).toBe(true);
  await waitFor(() => expect(play).toHaveBeenCalled());
  Object.defineProperty(video, "currentTime", { configurable: true, writable: true, value: 3 });
  rerender(<MediaHoverPreview item={videoItem} open={false} trigger={trigger} />);
  expect(pause).toHaveBeenCalled();
  expect(video.currentTime).toBe(0);
});
```

- [ ] **Step 2: Run the component test and verify RED**

```bash
npm test -- src/flowCanvas/inputs/MediaHoverPreview.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement preview rendering and lifecycle**

Export:

```ts
export type MediaHoverPreviewProps = {
  item: CanvasInputItem;
  open: boolean;
  trigger: HTMLElement | null;
};
```

Use `createPortal(..., document.body)`, `IMAGE_MENU_SURFACE_Z_INDEX + 1`, a fixed-position layer with `maxWidth: min(420px, calc(100vw - 16px))`, and the same viewport clamping calculation used by the tray overflow surface. Render `<img>` for image items. Render `<video muted playsInline preload="metadata" poster={item.thumbnailUrl}>` for video items. On `open`, call `play().catch(() => undefined)`; cleanup calls `pause()` and assigns `currentTime = 0`. Use `pointer-events: none` so the preview does not interfere with card removal and drag/drop.

- [ ] **Step 4: Run preview tests**

```bash
npm test -- src/flowCanvas/inputs/MediaHoverPreview.test.tsx
```

Expected: image, video, fallback, portal, and clamping tests PASS.

- [ ] **Step 5: Commit preview component**

```bash
git add src/flowCanvas/inputs/MediaHoverPreview.tsx src/flowCanvas/inputs/MediaHoverPreview.test.tsx
git commit -m "feat(canvas): add media input hover previews"
```

---

### Task 6: Aggregate Text Group and Media-Only Tray Ordering

**Files:**
- Modify: `src/flowCanvas/inputs/NodeInputTray.tsx`
- Modify: `src/flowCanvas/inputs/NodeInputTray.test.tsx`

- [ ] **Step 1: Write failing text-group and media-order tests**

Replace tests that expect individual draggable text cards with:

```tsx
it("renders one first-position text group with count and source actions", () => {
  const onFocusSource = vi.fn();
  const onRemove = vi.fn();
  const onRemoveAllText = vi.fn();
  render(<NodeInputTray
    items={[textA, imageA, textB, videoA]}
    onFocusSource={onFocusSource}
    onRemove={onRemove}
    onRemoveAllText={onRemoveAllText}
  />);
  expect(screen.getByRole("button", { name: "文本输入，共 2 个节点" })).toBeTruthy();
  expect(screen.getAllByTestId("media-input-card").map((node) => node.getAttribute("title")))
    .toEqual(["Reference image", "Clip"]);
  fireEvent.mouseEnter(screen.getByRole("button", { name: "文本输入，共 2 个节点" }));
  expect(screen.getByRole("menu", { name: "文本输入节点" })).toBeTruthy();
  fireEvent.doubleClick(screen.getByRole("menuitem", { name: /Script A/ }));
  expect(onFocusSource).toHaveBeenCalledWith("upstream:text-a");
  fireEvent.click(screen.getByRole("button", { name: "移除全部文本输入" }));
  expect(onRemoveAllText).toHaveBeenCalledTimes(1);
});

it("emits media keys only and cannot drag the text group", () => {
  const onReorder = vi.fn();
  render(<NodeInputTray items={[textA, imageA, videoA]} onReorder={onReorder} />);
  expect(screen.getByRole("button", { name: /文本输入/ })).not.toHaveAttribute("draggable", "true");
  drag(screen.getByTitle("Clip"), screen.getByTitle("Reference image"));
  expect(onReorder).toHaveBeenCalledWith([videoA.inputKey, imageA.inputKey]);
});
```

Add a test that media `mouseEnter` renders `MediaHoverPreview` with the correct image/video element and `mouseLeave` closes it.

- [ ] **Step 2: Run tray tests and verify RED**

```bash
npm test -- src/flowCanvas/inputs/NodeInputTray.test.tsx
```

Expected: FAIL because text cards are still individual/draggable and `onRemoveAllText` is missing.

- [ ] **Step 3: Refactor the tray around explicit partitions**

Extend props:

```ts
onRemoveAllText?: () => void;
```

Inside `NodeInputTray`, derive:

```ts
const textItems = items.filter((item) => item.kind === "text");
const mediaItems = items.filter((item) => item.kind !== "text");
```

Render one non-draggable text group before `mediaItems`. The group uses `useDismissibleLayer`, body portal, shared 38px menu rows, source title/excerpt, individual `onRemove(inputKey)`, and a final remove-all command. Open on pointer enter and click; use a short close timer so moving between trigger and menu does not collapse it. Clear timers on unmount.

Keep at most eight visible tray cells total: when the text group exists, render it plus the first seven media cards; otherwise render the first eight media cards. Overflow contains media only. Run drag/drop, overflow, `moveInput`, and order callbacks exclusively against `mediaItems`. Add local `hoveredMediaKey` state and render `MediaHoverPreview` for the active image/video item. Preserve existing disabled, retry, focus, overflow, and accessibility behaviors.

- [ ] **Step 4: Run tray and preview tests**

```bash
npm test -- src/flowCanvas/inputs/NodeInputTray.test.tsx src/flowCanvas/inputs/MediaHoverPreview.test.tsx
```

Expected: PASS with no nested interactive controls and no text key in reorder callbacks.

- [ ] **Step 5: Commit the tray behavior**

```bash
git add src/flowCanvas/inputs/NodeInputTray.tsx src/flowCanvas/inputs/NodeInputTray.test.tsx
git commit -m "feat(canvas): group text inputs in node trays"
```

---

### Task 7: Media-Only Mention Candidate Projection

**Files:**
- Create: `src/flowCanvas/mentions/mediaMentionCandidates.ts`
- Create: `src/flowCanvas/mentions/mediaMentionCandidates.test.ts`

- [ ] **Step 1: Write failing source-order and filtering tests**

```ts
it("orders connected, canvas, recent assets, then library assets and excludes text", () => {
  const result = buildMediaMentionCandidates({
    allowedKinds: new Set(["image", "video"]),
    connected: [connectedImage, connectedText, connectedVideo],
    canvas: [canvasImage, canvasText, canvasVideo],
    assets: [assetImage, assetVideo],
    currentNodeId: "target",
    recentAssetIds: [assetVideo.assetId!],
  });
  expect(result.map((item) => item.candidateKey)).toEqual([
    "connected:upstream:image", "connected:upstream:video",
    "canvas:canvas-image", "canvas:canvas-video",
    "asset:asset-video", "asset:asset-image",
  ]);
  expect(result.some((item) => item.kind === "text")).toBe(false);
});

it("filters unsupported kinds before de-duplicating a connected source", () => {
  const result = buildMediaMentionCandidates({
    allowedKinds: new Set(["image"]),
    connected: [connectedVideo, connectedImage],
    canvas: [canvasImageWithSameNodeId],
    assets: [],
    currentNodeId: "target",
    recentAssetIds: [],
  });
  expect(result.map((item) => item.mediaKind)).toEqual(["image"]);
  expect(result).toHaveLength(1);
});
```

- [ ] **Step 2: Run the candidate test and verify RED**

```bash
npm test -- src/flowCanvas/mentions/mediaMentionCandidates.test.ts
```

Expected: FAIL because the candidate projection does not exist.

- [ ] **Step 3: Implement the normalized candidate contract**

Export:

```ts
export type MediaMentionConnectedSeed = {
  assetId?: string;
  inputKey: string;
  kind: "text" | FlowMediaMentionKind;
  sourceNodeId?: string;
  thumbnailUrl?: string;
  title: string;
};

export type MediaMentionCanvasSeed = {
  kind: "text" | FlowMediaMentionKind;
  nodeId: string;
  thumbnailUrl?: string;
  title: string;
};

export type MediaMentionAssetSeed = {
  assetId: string;
  kind: "text" | FlowMediaMentionKind;
  thumbnailUrl?: string;
  title: string;
};

export type MediaMentionCandidate = {
  activation:
    | { type: "connected"; inputKey: string }
    | { type: "canvas"; nodeId: string }
    | { type: "asset"; assetId: string };
  candidateKey: string;
  mediaKind: FlowMediaMentionKind;
  thumbnailUrl?: string;
  title: string;
};

export function buildMediaMentionCandidates(input: {
  allowedKinds: ReadonlySet<FlowMediaMentionKind>;
  assets: MediaMentionAssetSeed[];
  canvas: MediaMentionCanvasSeed[];
  connected: MediaMentionConnectedSeed[];
  currentNodeId: string;
  recentAssetIds: string[];
}): MediaMentionCandidate[];
```

Implement `buildMediaMentionCandidates` as a pure function. Filter by `allowedKinds`, current node ID, and non-empty safe IDs. Remove canvas candidates already represented by a connected `sourceNodeId`; remove asset candidates already represented by a connected `assetId`. Preserve connected and canvas input order. Split assets into recent and remaining groups using `recentAssetIds`.

- [ ] **Step 4: Run candidate tests**

```bash
npm test -- src/flowCanvas/mentions/mediaMentionCandidates.test.ts
```

Expected: all candidate ordering/filtering tests PASS.

- [ ] **Step 5: Commit candidate projection**

```bash
git add src/flowCanvas/mentions/mediaMentionCandidates.ts src/flowCanvas/mentions/mediaMentionCandidates.test.ts
git commit -m "feat(canvas): project media mention candidates"
```

---

### Task 8: Shared Lexical Media Mention Editor and Menu

**Files:**
- Create: `src/flowCanvas/mentions/MediaMentionCandidateMenu.tsx`
- Create: `src/flowCanvas/mentions/MediaMentionPromptEditor.tsx`
- Create: `src/flowCanvas/mentions/MediaMentionPromptEditor.test.tsx`

- [ ] **Step 1: Write failing editor behavior tests**

Cover the actual public component API:

```tsx
it("opens media-only candidates for @ and activates the keyboard selection", async () => {
  const onActivateCandidate = vi.fn(async () => ({ inputKey: "asset:image", kind: "image" as const }));
  const onChange = vi.fn();
  render(<MediaMentionPromptEditor
    activeInputKeys={new Set(["asset:image"])}
    bindings={[]}
    candidates={[imageCandidate]}
    onActivateCandidate={onActivateCandidate}
    onChange={onChange}
    value=""
  />);
  const editor = screen.getByRole("textbox", { name: "生成提示词" });
  fireEvent.input(editor, { data: "@", inputType: "insertText" });
  expect(screen.getByRole("listbox", { name: "引用媒体" })).toBeTruthy();
  fireEvent.keyDown(editor, { key: "Enter" });
  await waitFor(() => expect(onActivateCandidate).toHaveBeenCalledWith(imageCandidate));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
    value: "@图片1 ",
    bindings: [{ inputKey: "asset:image", kind: "image", label: "图片1" }],
  }));
});

it("does not open or accept candidates during IME composition", () => {
  renderEditor();
  const editor = screen.getByRole("textbox", { name: "生成提示词" });
  fireEvent.compositionStart(editor);
  fireEvent.input(editor, { data: "@", inputType: "insertCompositionText", isComposing: true });
  expect(screen.queryByRole("listbox", { name: "引用媒体" })).toBeNull();
  fireEvent.compositionEnd(editor);
});

it("deleting a mention changes prompt text without activating or removing its input", () => {
  const onChange = vi.fn();
  renderEditor({ value: "scene @图片1 ", bindings: [imageBinding], onChange });
  fireEvent.click(screen.getByRole("button", { name: "删除引用 图片1" }));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ value: "scene ", bindings: [imageBinding] }));
});

it("renders a removed input binding as invalid plain mention text", () => {
  renderEditor({ value: "scene @图片1", bindings: [imageBinding], activeInputKeys: new Set() });
  expect(screen.getByText("@图片1")).toHaveAttribute("data-invalid", "true");
});
```

Also test Arrow Up/Down, Escape, outside click, query filtering, selection replacement, pasted text, and editor focus restoration.

- [ ] **Step 2: Run editor tests and verify RED**

```bash
npm test -- src/flowCanvas/mentions/MediaMentionPromptEditor.test.tsx
```

Expected: FAIL because the shared editor and menu do not exist.

- [ ] **Step 3: Implement the editor contract**

Export these props:

```ts
export type ActivatedMediaMention = { inputKey: string; kind: FlowMediaMentionKind };

export type MediaMentionPromptEditorProps = {
  activeInputKeys: ReadonlySet<string>;
  bindings: FlowMediaMentionBinding[];
  candidates: MediaMentionCandidate[];
  disabled?: boolean;
  densityVariant: "image" | "video";
  onActivateCandidate: (candidate: MediaMentionCandidate) => Promise<ActivatedMediaMention> | ActivatedMediaMention;
  onChange: (next: { bindings: FlowMediaMentionBinding[]; value: string }) => void;
  placeholder: string;
  value: string;
};
```

Generalize the proven Lexical structure from `PromptLexicalEditor.tsx`: `ReferenceNode` stores `inputKey`, `kind`, and label; `getTextContent()` returns `@${label}`. Build the parser regex from escaped binding labels sorted longest-first rather than the hard-coded `/@Image\s+\d+/g`. Render valid pills with media icon/thumbnail and a hover-only remove button. Render invalid bindings with warning color, `data-invalid="true"`, and no image.

Track the active `@query` only when the caret is immediately after `/@([^\s@/]*)$/`. Suppress query updates while composition is active. On candidate activation, await `onActivateCandidate`, call `allocateMediaMentionBinding`, insert the stable label at the current selection, close the menu, call `onChange`, and restore focus.

Implement `MediaMentionCandidateMenu` with `MenuSurface`, 38px rows, grouped labels, `useDismissibleLayer`, a body portal, viewport clamping, listbox/option roles, and no text candidates in its type contract.

- [ ] **Step 4: Run editor/domain/menu tests**

```bash
npm test -- src/flowCanvas/mentions/mediaMentions.test.ts src/flowCanvas/mentions/mediaMentionCandidates.test.ts src/flowCanvas/mentions/MediaMentionPromptEditor.test.tsx
```

Expected: all mention tests PASS without composition or focus warnings.

- [ ] **Step 5: Commit the shared editor**

```bash
git add src/flowCanvas/mentions/MediaMentionCandidateMenu.tsx src/flowCanvas/mentions/MediaMentionPromptEditor.tsx src/flowCanvas/mentions/MediaMentionPromptEditor.test.tsx
git commit -m "feat(canvas): add shared media mention editor"
```

---

### Task 9: Migrate the Image Node to Shared Mentions

**Files:**
- Modify: `src/flowCanvas/nodes/FlowNodes.tsx:4350-5980,7290-7410`
- Modify: `src/flowCanvas/nodes/FlowNodes.image-inputs.test.tsx`
- Delete: `src/flowCanvas/nodes/PromptLexicalEditor.tsx`

- [ ] **Step 1: Write failing image integration tests**

Add tests that mount the real image node with Store and asset-library mocks:

```tsx
it("shows one text group and excludes text nodes from image @ candidates", async () => {
  seedImageTargetWithTextAndImageEdges();
  renderImageNode();
  expect(screen.getByRole("button", { name: "文本输入，共 1 个节点" })).toBeTruthy();
  typeIntoPrompt("@");
  expect(screen.queryByRole("option", { name: /Script node/ })).toBeNull();
  expect(screen.getByRole("option", { name: /Reference image/ })).toBeTruthy();
});

it("connects an unconnected canvas image and inserts one stable mention", async () => {
  const source = seedUnconnectedImageNode();
  renderImageNode();
  typeIntoPrompt("@");
  fireEvent.click(screen.getByRole("option", { name: source.data.title }));
  await waitFor(() => expect(store().edges).toContainEqual(expect.objectContaining({ source: source.id, target: target.id })));
  expect(node(target.id).data.generationPrompt).toContain("@图片1");
  expect(node(target.id).data.mediaMentionBindings).toContainEqual({
    inputKey: `upstream:${source.id}`, kind: "image", label: "图片1",
  });
});

it("adds a library asset, preserves text-first order, and does not remove it when the pill is deleted", async () => {
  seedAssetLibraryImage("asset-library");
  renderImageNode();
  selectMentionCandidate("Library image");
  await waitFor(() => expect(node(target.id).data.inputOrder).toEqual([
    "upstream:text", "asset:asset-library",
  ]));
  fireEvent.click(screen.getByRole("button", { name: "删除引用 图片1" }));
  expect(node(target.id).data.referenceAssetItemIds).toContain("asset-library");
});
```

- [ ] **Step 2: Run the image integration test and verify RED**

```bash
npm test -- src/flowCanvas/nodes/FlowNodes.image-inputs.test.tsx
```

Expected: FAIL because the current image editor uses image-only mutable numbering and individual text cards.

- [ ] **Step 3: Replace image-only prompt state with an adapter**

Build `imageMentionCandidates` with:

- connected media from `resolvedImageInputItems` filtered to image;
- unconnected image nodes from Store `nodes`, excluding `id` and already connected source IDs;
- image assets from `folderItems`, ordered by `recentReferenceAssetItemIds`.

Pass `allowedKinds: new Set(["image"])` to `buildMediaMentionCandidates`.

Implement activation:

```ts
const activateImageMentionCandidate = useCallback((candidate: MediaMentionCandidate) => {
  if (candidate.activation.type === "connected") {
    return { inputKey: candidate.activation.inputKey, kind: candidate.mediaKind };
  }
  if (candidate.activation.type === "canvas") {
    connectNodes(candidate.activation.nodeId, id);
    return { inputKey: `upstream:${candidate.activation.nodeId}`, kind: candidate.mediaKind };
  }
  addImageAssetInput(candidate.activation.assetId); // existing referenceAssetItemIds/referenceOrder/inputOrder update, extracted as a callback
  return { inputKey: `asset:${candidate.activation.assetId}`, kind: candidate.mediaKind };
}, [addImageAssetInput, connectNodes, id]);
```

Render `MediaMentionPromptEditor` with `activeInputKeys`, `d.mediaMentionBindings ?? reconcileLegacyMediaMentions(...)`, candidates, and one atomic `updateNodeData` call for prompt/bindings. Pass `onRemoveAllText={() => removeTextNodeInputs(id)}` to `NodeInputTray`.

Delete the old rich-content selection serializers, mutable `Image N` insertion handlers, and obsolete menu state only after no references remain. Delete `PromptLexicalEditor.tsx` and its import.

- [ ] **Step 4: Run image, tray, and mention suites**

```bash
npm test -- src/flowCanvas/nodes/FlowNodes.image-inputs.test.tsx src/flowCanvas/inputs/NodeInputTray.test.tsx src/flowCanvas/mentions/MediaMentionPromptEditor.test.tsx
```

Expected: PASS; selecting/removing/reordering an image never rebinds an existing mention.

- [ ] **Step 5: Commit image migration**

```bash
git add src/flowCanvas/nodes/FlowNodes.tsx src/flowCanvas/nodes/FlowNodes.image-inputs.test.tsx src/flowCanvas/nodes/PromptLexicalEditor.tsx
git commit -m "feat(image): unify media mention inputs"
```

---

### Task 10: Reuse Video Reference Rules and Add Video Mentions

**Files:**
- Modify: `src/flowCanvas/video/videoReferenceRules.ts`
- Modify: `src/flowCanvas/video/videoReferenceRules.test.ts`
- Modify: `src/flowCanvas/video/VideoReferenceStrip.tsx:184-285`
- Modify: `src/flowCanvas/video/VideoNodeComposer.tsx:20-165`
- Modify: `src/flowCanvas/video/VideoNodeComposer.test.tsx`
- Modify: `src/flowCanvas/nodes/FlowNodes.tsx:7600-8035`

- [ ] **Step 1: Write failing pure video-reference tests**

Move role selection and append semantics behind one exported helper and test it first:

```ts
it("adds a source video with the capability-selected role and automatic mode", () => {
  const next = appendVideoReferenceInput({
    capabilities: mergeVideoCapabilities({ referenceSemantics: "style_images_and_source_video" }),
    mediaKind: "video",
    params: createDefaultVideoGenerationParams(),
    source: { kind: "asset", id: "asset-video" },
  });
  expect(next.referenceInputs).toContainEqual(expect.objectContaining({
    mediaKind: "video", role: "source_video", source: { kind: "asset", id: "asset-video" },
  }));
});

it("does not duplicate an existing source when mention activation repeats", () => {
  const once = appendVideoReferenceInput(input);
  const twice = appendVideoReferenceInput({ ...input, params: once });
  expect(twice.referenceInputs).toHaveLength(1);
});
```

- [ ] **Step 2: Run the rule tests and verify RED**

```bash
npm test -- src/flowCanvas/video/videoReferenceRules.test.ts
```

Expected: FAIL because `appendVideoReferenceInput` is missing.

- [ ] **Step 3: Implement and adopt the shared video reference helper**

Export from `videoReferenceRules.ts`:

```ts
export function appendVideoReferenceInput(input: {
  capabilities: VideoGenerationCapabilities;
  mediaKind: VideoReferenceInputV2["mediaKind"];
  params: VideoGenerationParamsV2;
  source: VideoReferenceInputV2["source"];
}): VideoGenerationParamsV2;
```

Move the exact current `referenceRoleFor` decision from `VideoReferenceStrip.tsx` into this helper, de-duplicate by source kind/id, append with a stable `referenceKey`, and call `resolveAutomaticVideoMode`. Update `VideoReferenceStrip` asset upload/picker paths to use it so mention and button-based additions cannot diverge.

- [ ] **Step 4: Write failing VideoNodeComposer mention tests**

```tsx
it("renders the shared mention editor and inserts a connected video reference", async () => {
  const onUpdate = vi.fn();
  render(<VideoNodeComposer {...baseProps} inputItems={[videoInput]} mentionCandidates={[connectedVideoCandidate]} onUpdate={onUpdate} />);
  typeIntoVideoPrompt("@");
  fireEvent.click(screen.getByRole("option", { name: /Clip/ }));
  await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
    generationPrompt: "@视频1 ",
    mediaMentionBindings: [{ inputKey: videoInput.inputKey, kind: "video", label: "视频1" }],
  })));
});

it("does not expose text or capability-incompatible media candidates", () => {
  renderComposerWithCandidates([textCandidate, imageCandidate, videoCandidate], imageOnlyCapabilities);
  typeIntoVideoPrompt("@");
  expect(screen.queryByRole("option", { name: /Text/ })).toBeNull();
  expect(screen.queryByRole("option", { name: /Video/ })).toBeNull();
  expect(screen.getByRole("option", { name: /Image/ })).toBeTruthy();
});
```

- [ ] **Step 5: Run composer tests and verify RED**

```bash
npm test -- src/flowCanvas/video/VideoNodeComposer.test.tsx
```

Expected: FAIL because the composer still renders a plain textarea and has no mention props.

- [ ] **Step 6: Integrate the shared editor and video adapter**

Add composer props:

```ts
mentionCandidates?: MediaMentionCandidate[];
onActivateMentionCandidate?: MediaMentionPromptEditorProps["onActivateCandidate"];
```

Replace the prompt `<textarea>` with `MediaMentionPromptEditor`, passing current bindings, active media input keys, `densityVariant="video"`, and `onUpdate({ generationPrompt: value, mediaMentionBindings: bindings })`.

In `VideoNodeComponent`, derive allowed kinds from active mode constraints and model capabilities: include image when the mode/model accepts images, video when max video inputs is positive, and audio when max audio inputs is positive. Build candidates from connected inputs, unconnected canvas media nodes, and `useAssetLibrary` assets. Activation behavior:

- connected: return its existing input key;
- canvas: call `connectVideoReference` with the role produced by the shared helper and return `upstream:<nodeId>`;
- asset: call `appendVideoReferenceInput`, update `params.videoGeneration`, `referenceAssetItemIds`, `referenceOrder`, and text-first `inputOrder`, then return `asset:<assetId>`.

Pass `onRemoveAllText={() => removeTextNodeInputs(id)}` through `VideoNodeComposer` and `VideoReferenceStrip` to `NodeInputTray`.

- [ ] **Step 7: Run video integration suites**

```bash
npm test -- src/flowCanvas/video/videoReferenceRules.test.ts src/flowCanvas/video/VideoNodeComposer.test.tsx src/flowCanvas/video/VideoReferenceStrip.test.tsx src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx
```

Expected: PASS; old picker behavior and new `@` activation produce the same normalized video references.

- [ ] **Step 8: Commit video migration**

```bash
git add src/flowCanvas/video/videoReferenceRules.ts src/flowCanvas/video/videoReferenceRules.test.ts src/flowCanvas/video/VideoReferenceStrip.tsx src/flowCanvas/video/VideoNodeComposer.tsx src/flowCanvas/video/VideoNodeComposer.test.tsx src/flowCanvas/nodes/FlowNodes.tsx
git commit -m "feat(video): support media mentions"
```

---

### Task 11: Persistence and Worker Compatibility Regressions

**Files:**
- Modify: `src/flowCanvas/utils/canonicalGraph.test.ts`
- Modify: `apps/worker/test/workflow-runtime-image-request.test.ts`
- Modify: `apps/worker/test/worker.test.ts`

- [ ] **Step 1: Add a failing canonical-graph safety test**

```ts
it("persists stable mention bindings but strips all runtime mention previews", () => {
  const graph = canonicalizeGraph({
    edges: [],
    nodes: [{ id: "image", type: "image", position: { x: 0, y: 0 }, data: {
      inputOrder: ["asset:ref"],
      generationPrompt: "use @图片1",
      mediaMentionBindings: [{ inputKey: "asset:ref", kind: "image", label: "图片1", thumbnailUrl: "blob:unsafe" }],
      hoverPreviewUrl: "https://cdn.test/ref?X-Amz-Signature=unsafe",
    }}],
    viewport: { x: 0, y: 0, zoom: 1 },
  });
  expect(graph.nodes[0].data).toMatchObject({
    generationPrompt: "use @图片1",
    mediaMentionBindings: [{ inputKey: "asset:ref", kind: "image", label: "图片1" }],
  });
  expect(JSON.stringify(graph)).not.toMatch(/blob:|X-Amz-Signature|hoverPreviewUrl|thumbnailUrl/);
});
```

- [ ] **Step 2: Run canonical tests and verify RED if transient fields survive**

```bash
npm test -- src/flowCanvas/utils/canonicalGraph.test.ts
```

Expected: either FAIL on `hoverPreviewUrl`/`thumbnailUrl` stripping or PASS if recursive URL sanitization already proves the invariant. If it passes immediately, retain the test as a regression and do not change production canonicalization unnecessarily.

- [ ] **Step 3: Add Worker prompt/reference regressions**

In the image request suite, use ordered upstream text plus local `generationPrompt: "use @图片1"` and assert the provider prompt contains both strings while image references retain media order. In `worker.test.ts`, add the equivalent video request with `@图片1` and `@视频1` and assert the local prompt is not replaced by upstream text.

Representative assertions:

```ts
expect(request.prompt).toContain("upstream scene description");
expect(request.prompt).toContain("use @图片1");
expect(request.referenceImages).toEqual([expectedImageUrl]);

expect(videoRequest.prompt).toContain("use @图片1 and @视频1");
expect(videoRequest.references.map((item) => item.kind)).toEqual(["image", "video"]);
```

- [ ] **Step 4: Run persistence and Worker suites**

```bash
npm test -- src/flowCanvas/utils/canonicalGraph.test.ts
npm run test --workspace @aigc-flow/worker
```

Expected: canonical tests PASS; Worker reports all test files passed. Local Redis connection stderr is acceptable only if the command exits 0 and no test fails.

- [ ] **Step 5: Commit compatibility coverage**

```bash
git add src/flowCanvas/utils/canonicalGraph.test.ts apps/worker/test/workflow-runtime-image-request.test.ts apps/worker/test/worker.test.ts
git commit -m "test(canvas): cover mention persistence and runtime prompts"
```

---

### Task 12: Real Browser Acceptance, Project Record, and Final Verification

**Files:**
- Modify: `scripts/smoke-node-input-tray.ts`
- Modify: `scripts/smoke-node-input-tray.test.ts`
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Strengthen the smoke contract test before the harness**

Require the generated smoke source/check code to include:

```ts
for (const value of [
  "文本输入，共 2 个节点",
  "MediaMentionPromptEditor",
  "@图片1",
  "@视频1",
  "video.play",
  "hoverPreviewUrl",
  "removeTextNodeInputs",
  "document.documentElement.scrollWidth",
]) {
  expect(`${html}\n${code}`).toContain(value);
}
```

Also assert the harness mounts two text sources, one connected image, one unconnected video, and one asset candidate.

- [ ] **Step 2: Run the smoke contract and verify RED**

```bash
npm run test:smoke-node-input-tray
```

Expected: FAIL because the current harness covers only one text input, one image, reorder, and removal.

- [ ] **Step 3: Extend the real React Flow smoke harness**

Use committed assets `/logo.png` for image preview and `/video-camera-library/v2/fixed.mp4` for video playback. Mount:

- two upstream text nodes connected to the target;
- one connected image node with `thumbnailUrl` and `hoverPreviewUrl`;
- one unconnected video node offered as an `@` candidate;
- one direct asset candidate;
- the real Store, `ReactFlowProvider`, `NodeInputTray`, `VideoNodeComposer`, and shared mention editor.

At 1440x900, 1024x768, and 390x844, assert:

```ts
await expectTextGroupFirst(p, 2);
await hoverAndAssertImagePreview(p);
await hoverAndAssertVideoElement(p);
await insertMentionAndAssertEdge(p, "Unconnected video", "@视频1");
await insertMentionAndAssertAssetInput(p, "Library image", "@图片1");
await assertTextCandidateAbsent(p);
await assertMediaReorderKeepsTextPrefix(p);
await assertNoHorizontalOverflow(p);
```

Write fresh desktop, tablet, and mobile screenshots under `output/playwright/node-input-tray/`; keep that output untracked.

- [ ] **Step 4: Run browser acceptance**

```bash
npm run test:smoke-node-input-tray
npm run smoke:node-input-tray
```

Expected smoke JSON:

```json
{"status":"ok","textGroupCount":2,"imagePreview":true,"videoPreview":true,"imageMention":true,"videoMention":true,"textCandidateExcluded":true,"viewports":[1440,1024,390]}
```

- [ ] **Step 5: Update the running project record**

Add a dated `2026-08-07` entry to `PROJECT_RECORD.md` containing:

- the text-group-first behavior;
- image/video hover previews;
- stable shared media mentions for image/video nodes;
- draft safety behavior;
- exact focused tests, Worker test count, build commands, and browser smoke result;
- any non-fatal Redis or bundle-size warning observed during fresh verification.

- [ ] **Step 6: Run the complete required verification gate**

```bash
npm test -- src/flowCanvas/mentions/mediaMentions.test.ts src/flowCanvas/mentions/mediaMentionCandidates.test.ts src/flowCanvas/mentions/MediaMentionPromptEditor.test.tsx src/flowCanvas/inputs/canvasInputProjection.test.ts src/flowCanvas/inputs/useCanvasInputAssets.test.tsx src/flowCanvas/inputs/MediaHoverPreview.test.tsx src/flowCanvas/inputs/NodeInputTray.test.tsx src/flowCanvas/store/flowCanvasStore.test.ts src/flowCanvas/nodes/FlowNodes.image-inputs.test.tsx src/flowCanvas/video/videoReferenceRules.test.ts src/flowCanvas/video/VideoNodeComposer.test.tsx src/flowCanvas/video/VideoReferenceStrip.test.tsx src/flowCanvas/utils/canonicalGraph.test.ts
npm run build
npm run build --workspace @aigc-flow/worker
npm run test --workspace @aigc-flow/worker
npm run test:smoke-node-input-tray
npm run smoke:node-input-tray
git diff --check
```

Expected: every command exits 0. Record the exact test totals rather than copying totals from an earlier run.

- [ ] **Step 7: Inspect persistence and working-tree scope**

```bash
rg -n "mediaMentionBindings|thumbnailUrl|hoverPreviewUrl" src/flowCanvas
git status --short
git diff --stat
```

Confirm no binding contains a URL field, no generated `output/` or `.playwright-cli/` path is staged, and unrelated pre-existing files remain untouched.

- [ ] **Step 8: Commit final acceptance artifacts**

```bash
git add scripts/smoke-node-input-tray.ts scripts/smoke-node-input-tray.test.ts PROJECT_RECORD.md
git commit -m "test(canvas): verify unified media mentions"
```

---

## Final Review Checklist

- [ ] Every connected text node appears inside one first-position aggregate card.
- [ ] Text order follows incoming edges and media reorder cannot cross it.
- [ ] Remove-all text input is one Store transaction and one history entry.
- [ ] Image cards use `<img>` hover previews and video cards use `<video>` hover previews.
- [ ] Preview URLs remain runtime-only and are absent from canonical drafts.
- [ ] Image and video nodes share one mention editor and one candidate menu.
- [ ] Text nodes never enter mention candidates.
- [ ] Canvas candidate selection creates an edge before inserting a mention.
- [ ] Asset candidate selection creates an ordered input before inserting a mention.
- [ ] Mention labels bind to stable `inputKey` values across reorder.
- [ ] Deleting a mention does not remove an input or edge.
- [ ] Removing an input leaves a visible invalid mention without rebinding.
- [ ] Image/video Worker prompts still merge upstream text and local mention text.
- [ ] Desktop, tablet, and mobile browser acceptance passes without overflow.
- [ ] `PROJECT_RECORD.md` contains fresh verification evidence.
