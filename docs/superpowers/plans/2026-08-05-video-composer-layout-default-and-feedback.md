# Video Composer Layout, Default Model, and Generation Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make new video nodes choose a usable default model, keep the composer layout stable after model selection, and show persistent preview-area feedback from submission through success or retryable failure.

**Architecture:** Keep catalog eligibility and model-selection normalization in pure video-domain helpers, then hydrate only unconfigured nodes from the always-mounted `VideoNodeComponent`. Reorganize `VideoNodeComposer` into prompt tools, conditional references, prompt, and execution controls; add a focused `VideoGenerationFeedback` preview component driven by existing node runtime state. Reuse the existing workflow runner, route validation, exact pricing, and billing path without backend or schema changes.

**Tech Stack:** React 19, TypeScript, Zustand, `@xyflow/react`, Tailwind utility classes, Lucide icons, Vitest, Testing Library, Playwright CLI smoke harness.

---

## Scope And File Map

This is one cohesive frontend change. The three symptoms share the video catalog, video node container, and composer state, so splitting them into separately deployed projects would duplicate state transitions and regression work.

**Create:**

- `src/flowCanvas/video/videoModelSelection.ts` - constructs the canonical node patch for explicit and automatic model selection.
- `src/flowCanvas/video/videoModelSelection.test.ts` - verifies capability correction, automatic mode normalization, and route/model alignment.
- `src/flowCanvas/video/VideoGenerationFeedback.tsx` - converts runtime state into submitting, generating, or error preview UI.
- `src/flowCanvas/video/VideoGenerationFeedback.test.tsx` - verifies state mapping, retry behavior, zero-progress visibility, and reduced-motion-safe classes.

**Modify:**

- `src/flowCanvas/video/videoModelCatalog.ts` - exports the pure usable-default resolver.
- `src/flowCanvas/video/videoModelCatalog.test.ts` - covers Gemini preference, sorted fallback, blocked models, and empty catalogs.
- `src/flowCanvas/nodes/FlowNodes.tsx` - hydrates unconfigured video nodes, guarantees immediate pending state, and renders preview feedback.
- `src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx` - covers hydration, preservation of saved choices, immediate generation feedback, unselected feedback, and retry.
- `src/flowCanvas/video/VideoNodeComposer.tsx` - reorders controls, bounds model text, exposes catalog states, disables unusable generation, and locks request controls while generating.
- `src/flowCanvas/video/VideoNodeComposer.test.tsx` - updates the old mode-row assertion and adds layout, catalog, model-label, and generation-lock tests.
- `src/flowCanvas/video/VideoModeMenu.tsx` and `VideoModeMenu.test.tsx` - add a disabled contract and close an open menu when generation begins.
- `src/flowCanvas/video/VideoPalettePopover.tsx` and `VideoPalettePopover.test.tsx` - add the same disabled/close contract.
- `src/flowCanvas/video/VideoReferenceStrip.tsx` and `VideoReferenceStrip.test.tsx` - disable reference mutation and close an open picker while generating.
- `src/flowCanvas/video/VideoHumanReviewControl.tsx` and `VideoHumanReviewControl.test.tsx` - add a compact execution-row presentation and disabled verification action.
- `scripts/smoke-video-node.ts` - validate automatic Gemini selection, stable rows, generation feedback, reduced motion, and four responsive widths.
- `scripts/smoke-video-node.test.ts` - lock the new browser smoke contract.
- `PROJECT_RECORD.md` - record the implemented behavior and actual validation evidence.

**Intentionally unchanged:**

- `src/flowCanvas/nodes/NodeEditorSurface.tsx`
- `src/flowCanvas/utils/promptBarDensity.ts`
- Text/image editor implementations and sizing tokens
- AI Gateway, provider adapters, route keys, pricing, billing, database, and deployment configuration
- `src/flowCanvas/flowCanvas.css`, which already contains unrelated user changes in the current worktree

### Task 1: Resolve The Default Video Model

**Files:**
- Modify: `src/flowCanvas/video/videoModelCatalog.ts`
- Modify: `src/flowCanvas/video/videoModelCatalog.test.ts`

- [ ] **Step 1: Add failing resolver tests**

Append tests that use complete `VideoModelOption` fixtures and preserve catalog order:

```ts
import { mergeVideoCapabilities } from "./videoGenerationCapabilities";
import type { VideoModelOption } from "./videoTypes";
import { resolveDefaultVideoModel, toVideoModelOptions } from "./videoModelCatalog";

const option = (overrides: Partial<VideoModelOption> = {}): VideoModelOption => ({
  blocker: null,
  capabilities: mergeVideoCapabilities({ confirmedByRoute: true }),
  estimatedCredits: 1,
  id: "fallback-id",
  label: "Fallback Video",
  minChargeCredits: 1,
  modelKey: "fallback-video",
  pricing: {
    billingBasis: "duration_second",
    exact: true,
    minChargeCredits: 1,
    unit: "video_generation",
    unitCredits: 1,
  },
  routeKey: "video.fallback",
  ...overrides,
});

describe("resolveDefaultVideoModel", () => {
  test("prefers an eligible Gemini Omni Flash regardless of sorted position", () => {
    const fallback = option();
    const gemini = option({ id: "gemini-id", modelKey: "gemini-omni-flash", routeKey: "video.pixelhub.gemini-omni-flash" });
    expect(resolveDefaultVideoModel([fallback, gemini])).toBe(gemini);
  });

  test("uses the first sorted eligible option when Gemini is blocked", () => {
    const first = option({ id: "first" });
    const gemini = option({ blocker: "PRICING_NOT_FOUND", id: "gemini-id", modelKey: "gemini-omni-flash", pricing: null });
    expect(resolveDefaultVideoModel([gemini, first])).toBe(first);
  });

  test("returns null when every option is blocked or the catalog is empty", () => {
    const blocked = option({ blocker: "PRICING_NOT_FOUND", pricing: null });
    expect(resolveDefaultVideoModel([blocked])).toBeNull();
    expect(resolveDefaultVideoModel([])).toBeNull();
  });
});
```

- [ ] **Step 2: Run the resolver tests and observe the red state**

Run:

```bash
npx vitest --run src/flowCanvas/video/videoModelCatalog.test.ts
```

Expected: FAIL because `resolveDefaultVideoModel` is not exported.

- [ ] **Step 3: Implement the minimal resolver**

Add to `videoModelCatalog.ts`:

```ts
export function resolveDefaultVideoModel(models: VideoModelOption[]): VideoModelOption | null {
  const eligible = (option: VideoModelOption) => option.blocker === null;
  return models.find((option) => option.modelKey === "gemini-omni-flash" && eligible(option))
    ?? models.find(eligible)
    ?? null;
}
```

Do not sort again. `toVideoModelOptions` already provides the product order, and `blocker` is the established fail-closed usability result after route, capability, and exact-price filtering.

- [ ] **Step 4: Run the focused test**

Run:

```bash
npx vitest --run src/flowCanvas/video/videoModelCatalog.test.ts
```

Expected: all catalog and resolver tests PASS.

- [ ] **Step 5: Commit the resolver**

```bash
git add src/flowCanvas/video/videoModelCatalog.ts src/flowCanvas/video/videoModelCatalog.test.ts
git commit -m "feat(video): resolve usable default model"
```

### Task 2: Share Model Selection And Hydrate Unconfigured Nodes

**Files:**
- Create: `src/flowCanvas/video/videoModelSelection.ts`
- Create: `src/flowCanvas/video/videoModelSelection.test.ts`
- Modify: `src/flowCanvas/video/VideoNodeComposer.tsx`
- Modify: `src/flowCanvas/nodes/FlowNodes.tsx`
- Modify: `src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx`

- [ ] **Step 1: Write failing tests for the canonical model-selection patch**

Create `videoModelSelection.test.ts` with a route-confirmed narrow model and invalid current parameters:

```ts
import { describe, expect, test } from "vitest";
import { createDefaultVideoGenerationParams } from "./videoGenerationParams";
import { createVideoModelSelectionPatch } from "./videoModelSelection";
import { mergeVideoCapabilities } from "./videoGenerationCapabilities";
import type { VideoModelOption } from "./videoTypes";

const gemini: VideoModelOption = {
  blocker: null,
  capabilities: mergeVideoCapabilities({
    aspectRatios: ["16:9"],
    confirmedByRoute: true,
    defaults: { durationSeconds: 4, generateAudio: true, resolution: "720P" },
    maxDurationSeconds: 10,
    resolutions: ["720P"],
    supportedDurations: [4, 6, 8, 10],
    supportedModes: ["text_to_video"],
  }),
  estimatedCredits: 1,
  id: "gemini-db-id",
  label: "Gemini Omni Flash",
  minChargeCredits: 4,
  modelKey: "gemini-omni-flash",
  pricing: { billingBasis: "duration_second", exact: true, minChargeCredits: 4, unit: "video_generation", unitCredits: 1 },
  routeKey: "video.pixelhub.gemini-omni-flash",
};

test("aligns model, route, and corrected parameters in one patch", () => {
  const data = {
    params: {
      videoGeneration: {
        ...createDefaultVideoGenerationParams(),
        aspectRatio: "9:16",
        durationSeconds: 9,
        resolution: "1080P",
      },
    },
  } as any;

  expect(createVideoModelSelectionPatch(data, gemini)).toMatchObject({
    modelId: "gemini-db-id",
    routeKey: "video.pixelhub.gemini-omni-flash",
    params: { videoGeneration: { aspectRatio: "16:9", durationSeconds: 4, resolution: "720P" } },
  });
});
```

- [ ] **Step 2: Run the new helper test and observe the red state**

Run:

```bash
npx vitest --run src/flowCanvas/video/videoModelSelection.test.ts
```

Expected: FAIL because the helper module does not exist.

- [ ] **Step 3: Implement the canonical selection helper**

Create `videoModelSelection.ts`:

```ts
import type { FlowNodeData } from "../types";
import { normalizeVideoGenerationParams } from "./videoGenerationParams";
import { correctVideoGenerationParams } from "./videoGenerationCapabilities";
import { resolveAutomaticVideoMode } from "./videoReferenceRules";
import type { VideoModelOption } from "./videoTypes";

export function createVideoModelSelectionPatch(
  data: FlowNodeData,
  option: VideoModelOption,
): Partial<FlowNodeData> {
  const params = normalizeVideoGenerationParams(data).params;
  const corrected = option.capabilities.confirmedByRoute
    ? correctVideoGenerationParams(params, option.capabilities).params
    : params;
  const automatic = resolveAutomaticVideoMode(
    option.capabilities,
    corrected.referenceInputs,
    corrected.mode,
  );

  return {
    modelId: option.id,
    routeKey: option.routeKey,
    params: {
      ...(data.params ?? {}),
      videoGeneration: {
        ...corrected,
        mode: automatic.mode,
        referenceInputs: automatic.references,
      },
    },
  };
}
```

- [ ] **Step 4: Replace the composer's duplicated model-selection logic**

Import `createVideoModelSelectionPatch` and reduce `handleModelChange` to:

```ts
const handleModelChange = (modelId: string) => {
  const nextOption = catalog.models.find((model) => model.id === modelId);
  if (!nextOption || nextOption.blocker) return;
  onUpdate(createVideoModelSelectionPatch(data, nextOption));
  closeModel();
};
```

Keep the existing parameter-correction effect because it handles a saved model whose route-confirmed capabilities arrive after node data.

- [ ] **Step 5: Add failing component tests for default hydration and preservation**

In `FlowNodes.agent-metadata.test.tsx`, import `createDefaultVideoGenerationParams`, `mergeVideoCapabilities`, `FlowNodeData`, and `VideoModelOption`, then add these reusable fixtures at describe scope:

```tsx
function usableVideoOption(overrides: Partial<VideoModelOption> = {}): VideoModelOption {
  const { capabilities, ...rest } = overrides;
  return {
    blocker: null,
    capabilities: mergeVideoCapabilities({ confirmedByRoute: true, ...capabilities }),
    estimatedCredits: 1,
    id: "fallback-id",
    label: "Fallback Video",
    minChargeCredits: 1,
    modelKey: "fallback-video",
    pricing: { billingBasis: "duration_second", exact: true, minChargeCredits: 1, unit: "video_generation", unitCredits: 1 },
    routeKey: "video.fallback",
    ...rest,
  };
}

function usableVideoCatalog(models: VideoModelOption[]) {
  return { error: null, loading: false, models, retry: vi.fn() };
}

function StoreBackedVideoNode({ nodeId, selected = true }: { nodeId: string; selected?: boolean }) {
  const node = useFlowCanvasStore((state) => state.nodes.find((item) => item.id === nodeId));
  if (!node) return null;
  return <VideoNodeComponent id={node.id} selected={selected} data={node.data as any} dragging={false} zIndex={1} isConnectable type="video" xPos={0} yPos={0} />;
}

function addConfiguredVideoNode(overrides: Partial<FlowNodeData> = {}) {
  return useFlowCanvasStore.getState().addNode("video", { x: 0, y: 0 }, {
    createdAt: 1,
    generationPrompt: "A moving train",
    generationStatus: "idle",
    height: 170,
    kind: "video",
    modelId: "gemini-id",
    params: { videoGeneration: createDefaultVideoGenerationParams() },
    routeKey: "video.pixelhub.gemini-omni-flash",
    status: "idle",
    title: "Video",
    updatedAt: 1,
    width: 302,
    ...overrides,
  }, { selected: true });
}
```

Use those fixtures in the hydration tests:

```ts
it("hydrates an unconfigured video node with the usable Gemini catalog option", async () => {
  videoCatalogMocks.current = usableVideoCatalog([
    usableVideoOption({ id: "sora-id", modelKey: "sora-v3-pro", routeKey: "video.pixelhub.sora-v3-pro" }),
    usableVideoOption({ id: "gemini-id", modelKey: "gemini-omni-flash", routeKey: "video.pixelhub.gemini-omni-flash" }),
  ]);
  const node = useFlowCanvasStore.getState().addNode("video", { x: 0, y: 0 }, { generationPrompt: "" } as any, { selected: true });

  render(<StoreBackedVideoNode nodeId={node.id} />);

  await waitFor(() => expect(useFlowCanvasStore.getState().nodes.find((item) => item.id === node.id)?.data).toMatchObject({
    modelId: "gemini-id",
    routeKey: "video.pixelhub.gemini-omni-flash",
  }));
});

it("does not overwrite a saved video model", async () => {
  videoCatalogMocks.current = usableVideoCatalog([usableVideoOption({ id: "gemini-id", modelKey: "gemini-omni-flash" })]);
  const node = useFlowCanvasStore.getState().addNode("video", { x: 0, y: 0 }, {
    modelId: "saved-sora-id",
    routeKey: "video.pixelhub.sora-v3-pro",
  } as any, { selected: true });

  render(<StoreBackedVideoNode nodeId={node.id} />);
  await waitFor(() => expect(useFlowCanvasStore.getState().nodes.find((item) => item.id === node.id)?.data.modelId).toBe("saved-sora-id"));
});
```

Keep these helpers at describe scope so Task 4 reuses structurally complete models and real store rerenders.

- [ ] **Step 6: Run the component tests and observe the red state**

Run:

```bash
npx vitest --run src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx
```

Expected: the new hydration test FAILS because the node component does not resolve a default.

- [ ] **Step 7: Add idempotent hydration to the always-mounted node**

In `VideoNodeComponent`, import the resolver and selection helper, then add:

```ts
const defaultModelHydrationRef = useRef<string | null>(null);

useEffect(() => {
  if (videoCatalog.loading || videoCatalog.error || d.modelId) return;
  const defaultOption = resolveDefaultVideoModel(videoCatalog.models);
  if (!defaultOption) return;
  const signature = `${id}:${defaultOption.id}:${defaultOption.routeKey}`;
  if (defaultModelHydrationRef.current === signature) return;
  defaultModelHydrationRef.current = signature;
  updateNodeData(id, createVideoModelSelectionPatch(d, defaultOption));
}, [d, id, updateNodeData, videoCatalog.error, videoCatalog.loading, videoCatalog.models]);
```

This effect must remain above the selected-only composer render. A node with any `modelId`, including an unavailable saved model, is never silently replaced. A node with no `modelId` but a stale `routeKey` is unconfigured and receives the complete aligned patch.

- [ ] **Step 8: Run helper, catalog, composer, and node tests**

Run:

```bash
npx vitest --run src/flowCanvas/video/videoModelSelection.test.ts src/flowCanvas/video/videoModelCatalog.test.ts src/flowCanvas/video/VideoNodeComposer.test.tsx src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx
```

Expected: all focused tests PASS; existing explicit model-switch behavior remains green.

- [ ] **Step 9: Commit shared selection and hydration**

```bash
git add src/flowCanvas/video/videoModelSelection.ts src/flowCanvas/video/videoModelSelection.test.ts src/flowCanvas/video/VideoNodeComposer.tsx src/flowCanvas/nodes/FlowNodes.tsx src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx
git commit -m "feat(video): hydrate unconfigured nodes"
```

### Task 3: Stabilize The Composer Layout And Lock Request Controls

**Files:**
- Modify: `src/flowCanvas/video/VideoNodeComposer.tsx`
- Modify: `src/flowCanvas/video/VideoNodeComposer.test.tsx`
- Modify: `src/flowCanvas/video/VideoModeMenu.tsx`
- Modify: `src/flowCanvas/video/VideoModeMenu.test.tsx`
- Modify: `src/flowCanvas/video/VideoPalettePopover.tsx`
- Modify: `src/flowCanvas/video/VideoPalettePopover.test.tsx`
- Modify: `src/flowCanvas/video/VideoReferenceStrip.tsx`
- Modify: `src/flowCanvas/video/VideoReferenceStrip.test.tsx`
- Modify: `src/flowCanvas/video/VideoHumanReviewControl.tsx`
- Modify: `src/flowCanvas/video/VideoHumanReviewControl.test.tsx`

- [ ] **Step 1: Replace the obsolete bottom-mode test with failing row-contract tests**

In `VideoNodeComposer.test.tsx`, remove `places the video mode trigger in the bottom creation toolbar` and add assertions against explicit row test IDs:

```ts
test("separates prompt tools, references, and execution controls", () => {
  const data = { generationPrompt: "", params: { videoGeneration: createDefaultVideoGenerationParams() } } as any;
  render(<VideoNodeComposer data={data} generating={false} nodeId="video-1" onGenerate={vi.fn()} onUpdate={vi.fn()} selected />);

  const tools = screen.getByTestId("video-composer-tools");
  const actions = screen.getByTestId("video-composer-actions");
  expect(tools.contains(screen.getByRole("button", { name: "生成模式" }))).toBe(true);
  expect(tools.contains(screen.getByRole("button", { name: "运镜库" }))).toBe(true);
  expect(tools.contains(screen.getByRole("button", { name: "调色盘" }))).toBe(true);
  expect(actions.contains(screen.getByRole("button", { name: "选择视频模型" }))).toBe(true);
  expect(actions.contains(screen.getByRole("button", { name: "视频参数摘要" }))).toBe(true);
  expect(screen.queryByTestId("video-composer-references")).toBeNull();
});

test("renders reference controls in a dedicated row", () => {
  const data = {
    generationPrompt: "",
    params: { videoGeneration: { ...createDefaultVideoGenerationParams(), mode: "image_to_video" } },
  } as any;
  render(<VideoNodeComposer data={data} generating={false} nodeId="video-1" onGenerate={vi.fn()} onUpdate={vi.fn()} selected />);
  expect(screen.getByTestId("video-composer-references").contains(screen.getByLabelText("参考素材"))).toBe(true);
});

test("uses one desktop action row and exactly two mobile groups", () => {
  const data = { generationPrompt: "", params: { videoGeneration: createDefaultVideoGenerationParams() } } as any;
  render(<VideoNodeComposer data={data} generating={false} nodeId="video-1" onGenerate={vi.fn()} onUpdate={vi.fn()} selected />);
  const actions = screen.getByTestId("video-composer-actions");
  expect(actions.className).toMatch(/md:flex-row/);
  expect(actions.className).toMatch(/md:flex-nowrap/);
  expect(actions.children).toHaveLength(2);
});
```

- [ ] **Step 2: Add failing catalog-state and generation-lock tests**

Add tests with catalog overrides:

```ts
test("shows catalog state and disables generation without a usable model", () => {
  const data = { generationPrompt: "", params: { videoGeneration: createDefaultVideoGenerationParams() } } as any;
  const catalog = { error: null, loading: true, models: [], retry: vi.fn() };
  render(<VideoNodeComposer catalog={catalog} data={data} generating={false} nodeId="video-1" onGenerate={vi.fn()} onUpdate={vi.fn()} selected />);
  expect((screen.getByRole("button", { name: "选择视频模型" }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: "生成视频" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText("正在加载视频模型")).toBeTruthy();
});

test("locks every request-changing control while generating", () => {
  const catalog = usableVideoCatalog([usableVideoOption({ id: "gemini-id", modelKey: "gemini-omni-flash" })]);
  const data = { generationPrompt: "scene", modelId: "gemini-id", params: { videoGeneration: createDefaultVideoGenerationParams() } } as any;
  render(<VideoNodeComposer catalog={catalog} data={data} generating nodeId="video-1" onGenerate={vi.fn()} onUpdate={vi.fn()} selected />);

  expect((screen.getByLabelText("视频提示词") as HTMLTextAreaElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: "生成模式" }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: "运镜库" }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: "调色盘" }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: "选择视频模型" }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: "视频参数摘要" }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: "生成视频" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole("button", { name: "生成视频" }).textContent).toContain("生成中");
});
```

- [ ] **Step 3: Run composer tests and observe the red state**

Run:

```bash
npx vitest --run src/flowCanvas/video/VideoNodeComposer.test.tsx
```

Expected: new layout, catalog-state, and disabled-control assertions FAIL.

- [ ] **Step 4: Add consistent disabled contracts to child controls**

Add `disabled?: boolean` to `VideoModeMenu`, `VideoPalettePopover`, both `VideoReferenceStrip` prop variants, and `VideoHumanReviewControl`. Each trigger or mutation button uses `disabled={disabled || existingCondition}`. Mode and palette close their dismissible layers when disabled:

```ts
useEffect(() => {
  if (disabled) layer.closeLayer();
}, [disabled, layer.closeLayer]);
```

Reference strips clear `activeRole` or `pickerKind` when disabled and do not call `onChange`, upload, or connect callbacks. Human review keeps its status text visible but disables the verification button. Add one focused test per component that renders it enabled, opens or activates it, rerenders with `disabled`, and verifies the layer closes and callbacks cannot fire.

- [ ] **Step 5: Add the compact human-review presentation**

Extend the human-review props:

```ts
type VideoHumanReviewControlProps = {
  compact?: boolean;
  disabled?: boolean;
  onRequestVerification?: () => void;
  value: VideoHumanReview;
};
```

For `compact`, render a bounded execution-row control:

```tsx
<div className="flex h-[38px] max-w-[118px] shrink-0 items-center gap-1.5" aria-label={VIDEO_UI_COPY.humanVerification}>
  <ShieldAlert aria-hidden="true" size={15} />
  <button disabled={disabled} onClick={onRequestVerification} title={VIDEO_UI_COPY.verificationBlocked} type="button">
    {value.status === "verified" ? VIDEO_UI_COPY.verified : VIDEO_UI_COPY.completeVerification}
  </button>
</div>
```

Retain the existing expanded rendering when `compact` is false so other consumers do not change.

- [ ] **Step 6: Rebuild the composer into four explicit regions**

In `VideoNodeComposer.tsx`:

1. Close model, camera, and parameter layers when `generating` becomes true.
2. Render `VideoModeMenu`, camera trigger, and `VideoPalettePopover` inside `data-testid="video-composer-tools"`.
3. Render `VideoReferenceStrip` inside `data-testid="video-composer-references"` only when `params.mode !== "text_to_video"`.
4. Keep the prompt between references and execution controls.
5. Render the execution region as exactly two groups below 768px and one non-wrapping row at `md` and above.

Use this structural shape:

```tsx
<div aria-label={VIDEO_UI_COPY.videoComposer} aria-busy={generating} className="flex w-full flex-col text-white">
  <div className="flex flex-nowrap items-center gap-2" data-testid="video-composer-tools">
    <VideoModeMenu capabilities={capabilities} disabled={generating} onChange={...} value={params.mode} />
    <button disabled={generating} aria-label={VIDEO_UI_COPY.cameraLibrary}>...</button>
    <VideoPalettePopover disabled={generating} onChange={setParams} sourceDisplayByRole={sourceDisplayByRole} value={params} />
  </div>

  {params.mode !== "text_to_video" ? (
    <div className="mt-2 flex min-w-0 flex-wrap gap-2" data-testid="video-composer-references">
      <VideoReferenceStrip disabled={generating} ... />
    </div>
  ) : null}

  <textarea disabled={generating} ... />

  <div className="mt-2 flex flex-col gap-2 border-t border-white/10 pt-2 md:flex-row md:flex-nowrap md:items-center" data-testid="video-composer-actions">
    <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-2" data-testid="video-composer-settings-group">...</div>
    <div className="flex shrink-0 items-center justify-between gap-2 md:justify-end" data-testid="video-composer-submit-group">...</div>
  </div>
</div>
```

Bound the model trigger with `max-w-[150px] min-w-0`, wrap its label in a truncating span with `title={option?.label}`, make the parameter trigger `min-w-0 flex-1`, and render `VideoHumanReviewControl compact disabled={generating}`. Remove `flex-wrap`, `ml-auto`, mode, and palette from the execution row.

Model button state:

```ts
const selectedModelUsable = option?.blocker === null;
const modelButtonLabel = catalog.loading
  ? VIDEO_UI_COPY.loadingModels
  : catalog.error
    ? VIDEO_UI_COPY.modelCatalogError
    : option?.label ?? VIDEO_UI_COPY.chooseModel;
const generationDisabled = generating || !selectedModelUsable || catalog.loading || Boolean(catalog.error);
```

The model trigger is disabled while loading or generating. On catalog error it remains enabled so its existing menu retry action is reachable. Generate uses `generationDisabled` and continues relying on `handleGenerate` for prompt, capability, and human-review validation.

- [ ] **Step 7: Run all changed component tests**

Run:

```bash
npx vitest --run src/flowCanvas/video/VideoNodeComposer.test.tsx src/flowCanvas/video/VideoModeMenu.test.tsx src/flowCanvas/video/VideoPalettePopover.test.tsx src/flowCanvas/video/VideoReferenceStrip.test.tsx src/flowCanvas/video/VideoHumanReviewControl.test.tsx
```

Expected: all tests PASS, including menu dismissal and disabled mutation prevention.

- [ ] **Step 8: Re-run editor surface regressions**

Run:

```bash
npx vitest --run src/flowCanvas/nodes/NodeEditorSurface.test.tsx src/flowCanvas/utils/promptBarDensity.test.ts
```

Expected: all tests PASS with unchanged text/image values and unchanged zoom-stable video surface geometry.

- [ ] **Step 9: Commit the stable composer layout**

```bash
git add src/flowCanvas/video/VideoNodeComposer.tsx src/flowCanvas/video/VideoNodeComposer.test.tsx src/flowCanvas/video/VideoModeMenu.tsx src/flowCanvas/video/VideoModeMenu.test.tsx src/flowCanvas/video/VideoPalettePopover.tsx src/flowCanvas/video/VideoPalettePopover.test.tsx src/flowCanvas/video/VideoReferenceStrip.tsx src/flowCanvas/video/VideoReferenceStrip.test.tsx src/flowCanvas/video/VideoHumanReviewControl.tsx src/flowCanvas/video/VideoHumanReviewControl.test.tsx
git commit -m "refactor(video): stabilize composer control rows"
```

### Task 4: Add Persistent Preview-Area Generation Feedback

**Files:**
- Create: `src/flowCanvas/video/VideoGenerationFeedback.tsx`
- Create: `src/flowCanvas/video/VideoGenerationFeedback.test.tsx`
- Modify: `src/flowCanvas/nodes/FlowNodes.tsx`
- Modify: `src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx`

- [ ] **Step 1: Write failing state and component tests**

Create `VideoGenerationFeedback.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { resolveVideoGenerationFeedback, VideoGenerationFeedback } from "./VideoGenerationFeedback";

describe("resolveVideoGenerationFeedback", () => {
  test.each(["pending", "runnable"] as const)("maps %s to submission feedback", (runtimeStatus) => {
    expect(resolveVideoGenerationFeedback(runtimeStatus, "idle", null)).toMatchObject({ kind: "submitting", label: "正在提交任务" });
  });

  test.each(["running", "waiting_provider"] as const)("maps %s to generation feedback", (runtimeStatus) => {
    expect(resolveVideoGenerationFeedback(runtimeStatus, "idle", null)).toMatchObject({ kind: "generating", label: "正在生成视频" });
  });

  test("uses the compatibility generating status even at zero progress", () => {
    expect(resolveVideoGenerationFeedback(undefined, "generating", null)).toMatchObject({ kind: "generating" });
  });

  test("maps a safe error message to retryable failure", () => {
    expect(resolveVideoGenerationFeedback("failed", "error", "生成失败")).toEqual({ kind: "error", label: "生成失败" });
  });
});

test("renders an indeterminate reduced-motion-safe status without a percentage", () => {
  render(<VideoGenerationFeedback generationStatus="generating" onRetry={vi.fn()} />);
  expect(screen.getByRole("status").textContent).toContain("正在生成视频");
  expect(screen.queryByText(/0%/)).toBeNull();
  expect(screen.getByTestId("video-generation-indicator").className).toContain("motion-safe:animate-spin");
});

test("renders a retry action for failure", () => {
  const onRetry = vi.fn();
  render(<VideoGenerationFeedback errorMessage="生成失败" generationStatus="error" onRetry={onRetry} />);
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the new component tests and observe the red state**

Run:

```bash
npx vitest --run src/flowCanvas/video/VideoGenerationFeedback.test.tsx
```

Expected: FAIL because the component module does not exist.

- [ ] **Step 3: Implement normalized feedback and preview UI**

Create `VideoGenerationFeedback.tsx` with these public props and resolver:

```tsx
import { AlertTriangle, LoaderCircle, RotateCcw } from "lucide-react";
import type { FlowGenerationStatus, FlowNodeStatus } from "../types";

type VideoGenerationFeedbackProps = {
  errorMessage?: string | null;
  generationStatus?: FlowGenerationStatus;
  onRetry: () => void;
  runtimeStatus?: FlowNodeStatus;
};

export type VideoGenerationFeedbackState =
  | { kind: "submitting" | "generating" | "error"; label: string }
  | null;

export function resolveVideoGenerationFeedback(
  runtimeStatus?: FlowNodeStatus,
  generationStatus?: FlowGenerationStatus,
  errorMessage?: string | null,
): VideoGenerationFeedbackState {
  if ((runtimeStatus === "error" || runtimeStatus === "failed" || generationStatus === "error") && errorMessage) {
    return { kind: "error", label: errorMessage };
  }
  if (runtimeStatus === "pending" || runtimeStatus === "runnable") {
    return { kind: "submitting", label: "正在提交任务" };
  }
  if (runtimeStatus === "running" || runtimeStatus === "waiting_provider") {
    return { kind: "generating", label: "正在生成视频" };
  }
  if (generationStatus === "generating") {
    return { kind: "generating", label: "正在生成视频" };
  }
  return null;
}
```

Render an absolute, full-preview surface. Submitting/generating uses `role="status"`, `aria-live="polite"`, a `LoaderCircle` with `motion-safe:animate-spin`, subtle static background layers, and no numeric percentage. Tailwind's `motion-safe` variant must compile the animation behind `@media (prefers-reduced-motion: no-preference)`, leaving the indicator static for users who request reduced motion. Error uses `role="alert"`, an `AlertTriangle`, the supplied provider-safe error text, and a `RotateCcw` button labelled `重试`. Do not add global CSS or modify `flowCanvas.css`.

- [ ] **Step 4: Add failing node-level transition tests**

In `FlowNodes.agent-metadata.test.tsx`, add:

```tsx
it("shows submitting feedback immediately and locks the composer after Generate", async () => {
  videoCatalogMocks.current = usableVideoCatalog([usableVideoOption({ id: "gemini-id", modelKey: "gemini-omni-flash" })]);
  const node = addConfiguredVideoNode({ generationPrompt: "A moving train", modelId: "gemini-id" });
  render(<StoreBackedVideoNode nodeId={node.id} />);

  fireEvent.click(screen.getByRole("button", { name: "生成视频" }));

  expect(screen.getByRole("status").textContent).toContain("正在提交任务");
  expect((screen.getByRole("button", { name: "生成视频" }) as HTMLButtonElement).disabled).toBe(true);
  expect(workflowRunnerMocks.runBackendWorkflow).toHaveBeenCalledTimes(1);
});

it("keeps provider-wait feedback visible when the node is unselected", () => {
  const node = addConfiguredVideoNode({ generationStatus: "generating", modelId: "gemini-id" });
  useFlowCanvasStore.setState((state) => ({ nodeRunStatusByNodeId: { ...state.nodeRunStatusByNodeId, [node.id]: "waiting_provider" } }));
  render(<VideoNodeComponent id={node.id} selected={false} data={node.data as any} dragging={false} zIndex={1} isConnectable type="video" xPos={0} yPos={0} />);
  expect(screen.getByRole("status").textContent).toContain("正在生成视频");
  expect(screen.queryByLabelText("视频创作面板")).toBeNull();
});

it("retries a failed video through the normal generation handler", () => {
  const node = addConfiguredVideoNode({ errorMessage: "生成失败", generationStatus: "error", modelId: "gemini-id", status: "error" });
  render(<StoreBackedVideoNode nodeId={node.id} />);
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  expect(workflowRunnerMocks.runBackendWorkflow).toHaveBeenCalledWith({ runMode: "target_node", targetNodeId: node.id });
});
```

Use the real store-backed wrapper so `updateNodeData` causes React to rerender after the click.

- [ ] **Step 5: Run node tests and observe the red state**

Run:

```bash
npx vitest --run src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx
```

Expected: new status, unselected visibility, and retry tests FAIL before integration.

- [ ] **Step 6: Integrate immediate state and preview feedback**

In `handleGenerate`, keep every existing blocker check. In the successful preflight patch, add immediate UI state before invoking the existing runner:

```ts
updateNodeData(id, {
  errorCode: undefined,
  errorMessage: undefined,
  generationStatus: "generating",
  params: { ...(d.params || {}), videoGeneration: corrected.params },
  routeKey: option.routeKey,
  status: "pending",
});
void runBackendWorkflow({ runMode: "target_node", targetNodeId: id }).catch(() => undefined);
```

Then replace the video-only two-pixel progress bar and external duplicate error bar with:

```tsx
<VideoGenerationFeedback
  errorMessage={d.errorMessage}
  generationStatus={d.generationStatus}
  onRetry={handleGenerate}
  runtimeStatus={runtimeNodeStatus ?? d.status}
/>
```

Render it inside the video card after the ready/empty content. It is independent of `showNodeEditor`, so unselected nodes retain feedback. Success produces no feedback state and leaves `VideoReadyState` visible. Retry goes through `handleGenerate`, preserving preflight validation, exact pricing, route selection, workflow billing, and queue behavior.

- [ ] **Step 7: Run feedback, node, and composer tests**

Run:

```bash
npx vitest --run src/flowCanvas/video/VideoGenerationFeedback.test.tsx src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx src/flowCanvas/video/VideoNodeComposer.test.tsx
```

Expected: all tests PASS. No assertion depends on fake percentages.

- [ ] **Step 8: Commit generation feedback**

```bash
git add src/flowCanvas/video/VideoGenerationFeedback.tsx src/flowCanvas/video/VideoGenerationFeedback.test.tsx src/flowCanvas/nodes/FlowNodes.tsx src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx
git commit -m "feat(video): show generation feedback"
```

### Task 5: Extend Real-Browser Video Acceptance

**Files:**
- Modify: `scripts/smoke-video-node.ts`
- Modify: `scripts/smoke-video-node.test.ts`

- [ ] **Step 1: Extend the smoke contract test first**

Add required result fields and source markers:

```ts
for (const field of [
  "defaultGeminiSelected",
  "desktopActionsSingleRow",
  "tabletActionsSingleRow",
  "mobileActionsTwoGroups",
  "generationFeedbackVisibleUnselected",
  "generationControlsLocked",
  "reducedMotionFeedbackSafe",
]) {
  expect(code).toContain(field);
}
expect(code).toContain("768");
expect(code).toContain('data-testid="video-composer-tools"');
expect(code).toContain('data-testid="video-composer-actions"');
expect(html).toContain("modelKey: 'gemini-omni-flash'");
```

Update `VideoNodeSmokeCheckOptions` expectations to include `tabletScreenshotPath`.

- [ ] **Step 2: Run the smoke contract test and observe the red state**

Run:

```bash
npm run test:smoke-video-node
```

Expected: FAIL because the script does not expose the new fields or 768-pixel check.

- [ ] **Step 3: Update the real browser harness**

In the smoke catalog fixture, set `modelKey: 'gemini-omni-flash'` while retaining the stable database fixture ID and route. Expose narrow test-only helpers from the harness that update the existing store, not browser persistence:

```js
window.setVideoSmokeRunStatus = (status) => useFlowCanvasStore.setState((state) => ({
  nodeRunStatusByNodeId: { ...state.nodeRunStatusByNodeId, 'video-smoke-node': status },
}));
window.setVideoSmokeSelected = (selected) => useFlowCanvasStore.setState((state) => ({
  nodes: state.nodes.map((node) => node.id === 'video-smoke-node' ? { ...node, selected } : node),
}));
```

Add `tablet = { width: 768, height: 900 }`, its own context, and `tabletScreenshotPath`. Measure action groups with `getBoundingClientRect()`:

```js
async function actionLayout(page) {
  return page.locator('[data-testid="video-composer-actions"]').evaluate((actions) => {
    const groups = [...actions.children].map((child) => child.getBoundingClientRect());
    return {
      groupCount: groups.length,
      sameRow: groups.length === 2 && Math.abs(groups[0].top - groups[1].top) <= 1,
    };
  });
}
```

Assertions:

- Wait until node data contains `modelId === 'video-smoke-model'` and the Gemini route before opening the model menu.
- At 1440, 1024, and 768 pixels, both action groups have the same top coordinate.
- At 390 pixels, exactly two action groups have different top coordinates without viewport overflow.
- Set runtime status to `pending`, verify `正在提交任务`, deselect the node, and verify the status remains visible.
- Set runtime status to `waiting_provider`, verify `正在生成视频` and no text matching `/\d+%/`.
- In the reduced-motion context, verify the indicator's computed `animationName` is `none`.
- While generating, verify prompt, mode, camera, palette, model, parameter, and Generate controls are disabled.
- Restore idle state before ready-video and blocked-generation checks.

Include all new booleans in the returned result and final fail condition. Close the tablet context in `finally`.

- [ ] **Step 4: Run the script unit contract**

Run:

```bash
npm run test:smoke-video-node
```

Expected: all smoke contract tests PASS.

- [ ] **Step 5: Run the real browser smoke**

Run:

```bash
npm run smoke:video-node
```

Expected: JSON output with `status: "ok"`; screenshots exist for desktop, narrow, tablet, and mobile; all new result booleans are `true`.

- [ ] **Step 6: Visually inspect all four screenshots**

Inspect:

```text
output/playwright/video-node/desktop.png
output/playwright/video-node/narrow.png
output/playwright/video-node/tablet.png
output/playwright/video-node/mobile.png
```

Verify no control overlap, truncation exposes a usable model trigger, desktop/tablet execution controls stay on one line, mobile uses two deliberate groups, and the feedback surface fills the video preview without covering node handles or the editor.

- [ ] **Step 7: Commit browser acceptance coverage**

```bash
git add scripts/smoke-video-node.ts scripts/smoke-video-node.test.ts
git commit -m "test(video): cover composer and feedback states"
```

### Task 6: Final Regression, Build, And Project Record

**Files:**
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Run the complete focused regression suite**

Run:

```bash
npx vitest --run src/flowCanvas/video/videoModelCatalog.test.ts src/flowCanvas/video/videoModelSelection.test.ts src/flowCanvas/video/VideoNodeComposer.test.tsx src/flowCanvas/video/VideoModeMenu.test.tsx src/flowCanvas/video/VideoPalettePopover.test.tsx src/flowCanvas/video/VideoReferenceStrip.test.tsx src/flowCanvas/video/VideoHumanReviewControl.test.tsx src/flowCanvas/video/VideoGenerationFeedback.test.tsx src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx src/flowCanvas/nodes/NodeEditorSurface.test.tsx src/flowCanvas/utils/promptBarDensity.test.ts scripts/smoke-video-node.test.ts
```

Expected: all focused tests PASS.

- [ ] **Step 2: Run the production frontend build**

Run:

```bash
npm run build
```

Expected: exit code 0. Existing documented Vite chunk-size or dynamic-import warnings may remain, but no TypeScript or build error is accepted.

- [ ] **Step 3: Run the full test suite as broader evidence**

Run:

```bash
npm test
```

Expected: PASS, or record the exact unrelated pre-existing failures/timeouts separately. Any failure in a file changed by this plan is blocking.

- [ ] **Step 4: Update the project record with actual evidence**

Prepend a dated `2026-08-05 - Video Composer Default And Generation Feedback` entry to `PROJECT_RECORD.md` that records:

```markdown
## 2026-08-05 - Video Composer Default And Generation Feedback

- new unconfigured video nodes now prefer usable Gemini Omni Flash and otherwise fall back to the first sorted fully usable model without overwriting saved selections;
- input mode, camera movement, and palette now share the upper tool row, reference inputs have a conditional row, and the execution row remains stable on desktop/tablet with an explicit two-group mobile layout;
- video preview surfaces now show submitting, provider-generation, failure, and retry states without fake progress percentages, while request-changing controls lock during generation;
- validation evidence states the exact focused assertion count, the browser smoke `status`, the production build exit result, and any full-suite residual failure observed in Steps 1-3.
```

Write the validation bullet from the real command output before committing. Do not claim the full suite passed if it timed out or retained unrelated failures.

- [ ] **Step 5: Review the final diff for scope and secrets**

Run:

```bash
git status --short
git diff --check
git diff --stat HEAD~4
```

Expected: only the files listed in this plan plus `PROJECT_RECORD.md` are part of implementation commits; no API keys, signed URLs, output screenshots, `.env` files, or unrelated `flowCanvas.css` changes are staged.

- [ ] **Step 6: Commit the verified project record**

```bash
git add PROJECT_RECORD.md
git commit -m "docs: record video composer feedback rollout"
```

- [ ] **Step 7: Report completion without deploying**

Report the commit hashes, focused test result, browser smoke result, build result, and exact full-suite status. This frontend-only plan requires no database migration or environment change. Do not push, merge, or deploy unless the user explicitly requests it after reviewing implementation results.

## Acceptance Checklist

- [ ] A blank video node selects usable `gemini-omni-flash` after catalog load.
- [ ] Blocked Gemini falls back to the first sorted option with `blocker === null`.
- [ ] Loading, failed, empty, and all-blocked catalogs never enable generation accidentally.
- [ ] Saved or user-selected `modelId` values are never overwritten.
- [ ] Explicit and automatic selection use the same route and parameter-correction helper.
- [ ] Input mode, camera movement, and palette are in the upper tool row.
- [ ] Reference media has a dedicated row and text-to-video has no empty row.
- [ ] The execution area is one row at 1440, 1024, and 768 pixels and two deliberate groups at 390 pixels.
- [ ] Long model labels truncate without changing row geometry and expose their full label by title/menu.
- [ ] Clicking Generate immediately shows `正在提交任务` and disables request-changing controls.
- [ ] `running`, `waiting_provider`, and compatibility generating state show `正在生成视频` even at zero progress.
- [ ] Feedback remains visible when the node is unselected.
- [ ] Failure unlocks editing and Retry executes the normal validated and billed workflow path.
- [ ] Success replaces feedback with the durable asset-backed video preview.
- [ ] Reduced-motion mode has no looping feedback animation.
- [ ] Text and image editor size, anchor, zoom behavior, and interactions are unchanged.
- [ ] No provider secret, Authorization header, signed URL, blob URL, data URL, or raw upstream payload is newly persisted or rendered.
