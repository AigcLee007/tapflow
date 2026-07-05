# Video Editor Runtime Request Phase 15 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make exported video editor nodes pass their prompt and timeline asset references into the existing v2 video generation runtime.

**Architecture:** Keep the frontend export node shape from Phase 14. In the worker request builder, read `generationPrompt` as the static prompt fallback and extract `params.videoEditor.timeline.clips/audio` asset ids into `VideoGenerationRequest.inputAssets`, while preserving a structured `metadata.videoEditor` payload for adapters that can consume edit timelines later.

**Tech Stack:** TypeScript, Vitest, `@aigc-flow/ai-gateway-core` request types, existing worker runtime service.

---

### Task 1: Worker Request Test

**Files:**
- Modify: `apps/worker/test/worker.test.ts`
- Modify: `apps/worker/src/workflow-runtime/service.ts`

- [x] **Step 1: Write the failing test**

Import `__workerTestUtils` from the worker service:

```ts
import { WorkflowNodeExecutionService, __workerTestUtils } from "../src/workflow-runtime/service.js";
```

Add a unit test near the non-database worker tests:

```ts
test("video.generate request uses exported video editor prompt and timeline asset ids", () => {
  const request = __workerTestUtils.buildVideoRequest([], {
    generationPrompt: "根据剪辑工程时间线生成视频",
    params: {
      videoEditor: {
        sourceVideoEditorNodeId: "video-editor-1",
        aspect: "16:9",
        resolution: "1920x1080",
        timeline: {
          audio: [
            { id: "audio-1", assetId: "asset-audio-1", track: 2, startMs: 0, inMs: 0, outMs: 3000, volume: 0.8 },
          ],
          clips: [
            { id: "clip-1", assetId: "asset-image-1", kind: "image", track: 1, startMs: 0, inMs: 0, outMs: 3000, speed: 1 },
            { id: "clip-2", assetId: "asset-video-2", kind: "video", track: 1, startMs: 3000, inMs: 200, outMs: 4200, speed: 1 },
          ],
          durationMs: 7000,
          subtitles: [{ id: "sub-1", text: "开场", startMs: 0, endMs: 1200 }],
        },
      },
    },
    routeKey: "video.default",
  });

  expect(request.prompt).toBe("根据剪辑工程时间线生成视频");
  expect(request.routeKey).toBe("video.default");
  expect(request.inputAssets).toEqual([
    expect.objectContaining({ assetId: "asset-image-1", kind: "image" }),
    expect.objectContaining({ assetId: "asset-video-2", kind: "video" }),
    expect.objectContaining({ assetId: "asset-audio-1", kind: "audio" }),
  ]);
  expect(request.metadata).toEqual(expect.objectContaining({
    videoEditor: expect.objectContaining({
      aspect: "16:9",
      resolution: "1920x1080",
      timeline: expect.objectContaining({
        durationMs: 7000,
      }),
    }),
  }));
  expect(JSON.stringify(request)).not.toMatch(/blob:|data:/);
});
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test --workspace @aigc-flow/worker -- test/worker.test.ts --runInBand
```

If the worker test command does not support `--runInBand`, run:

```bash
npm run test --workspace @aigc-flow/worker -- test/worker.test.ts
```

Expected: FAIL because `__workerTestUtils` does not export `buildVideoRequest`, and the current video request ignores `generationPrompt` and `params.videoEditor`.

### Task 2: Video Editor Request Builder

**Files:**
- Modify: `apps/worker/src/workflow-runtime/service.ts`
- Test: `apps/worker/test/worker.test.ts`

- [x] **Step 1: Implement asset extraction helpers**

Add helpers beside the existing request builder helpers:

```ts
function readVideoEditorConfig(config: Record<string, unknown>): Record<string, unknown> | null {
  const params = isPlainObject(config.params) ? config.params : {};
  return isPlainObject(params.videoEditor) ? params.videoEditor : null;
}

function buildVideoEditorTimelineAssets(videoEditor: Record<string, unknown> | null): AssetReferenceInput[] {
  const timeline = isPlainObject(videoEditor?.timeline) ? videoEditor.timeline : {};
  const clips = Array.isArray(timeline.clips) ? timeline.clips : [];
  const audio = Array.isArray(timeline.audio) ? timeline.audio : [];
  const assets: AssetReferenceInput[] = [];

  for (const clip of clips) {
    if (!isPlainObject(clip) || typeof clip.assetId !== "string" || !clip.assetId.trim()) continue;
    assets.push({
      assetId: clip.assetId.trim(),
      durationMs: typeof clip.outMs === "number" && typeof clip.inMs === "number" ? Math.max(0, clip.outMs - clip.inMs) : null,
      kind: typeof clip.kind === "string" ? clip.kind : "video",
      metadata: {
        clipId: typeof clip.id === "string" ? clip.id : null,
        source: "video-editor-timeline",
        startMs: typeof clip.startMs === "number" ? clip.startMs : null,
        track: typeof clip.track === "number" ? clip.track : null,
      },
      mimeType: null,
    });
  }

  for (const item of audio) {
    if (!isPlainObject(item) || typeof item.assetId !== "string" || !item.assetId.trim()) continue;
    assets.push({
      assetId: item.assetId.trim(),
      durationMs: typeof item.outMs === "number" && typeof item.inMs === "number" ? Math.max(0, item.outMs - item.inMs) : null,
      kind: "audio",
      metadata: {
        audioId: typeof item.id === "string" ? item.id : null,
        source: "video-editor-timeline",
        startMs: typeof item.startMs === "number" ? item.startMs : null,
        track: typeof item.track === "number" ? item.track : null,
      },
      mimeType: null,
    });
  }

  return assets;
}
```

- [x] **Step 2: Update `buildVideoRequest`**

Use `generationPrompt` as the fallback prompt and merge upstream/video-editor assets:

```ts
const videoEditor = readVideoEditorConfig(config);
const upstreamAssets = extractAssetInputs(upstreamOutputs);
const editorAssets = buildVideoEditorTimelineAssets(videoEditor);
const fallbackPrompt = readTrimmedString(config.generationPrompt)
  ?? readTrimmedString(config.prompt)
  ?? "";

return {
  inputAssets: mergeAssetInputs(upstreamAssets, editorAssets),
  metadata: {
    ...(isPlainObject(config.metadata) ? config.metadata : {}),
    ...(videoEditor ? { videoEditor } : {}),
  },
  model: typeof config.model === "string" ? config.model : null,
  prompt: extractPromptFromUpstreamOutputs(upstreamOutputs, fallbackPrompt),
  routeKey: typeof config.routeKey === "string" ? config.routeKey : null,
};
```

Export `buildVideoRequest` from `__workerTestUtils`.

- [x] **Step 3: Run test to verify it passes**

Run:

```bash
npm run test --workspace @aigc-flow/worker -- test/worker.test.ts
```

Expected: PASS or database-backed tests skip when local database is unavailable. The new non-database request builder test must pass.

### Task 3: Record, Verify, Commit

**Files:**
- Modify: `PROJECT_RECORD.md`

- [x] **Step 1: Update project record**

Add an entry for Phase 15:

```md
- Phase 15 adapted the worker video request builder so exported video editor nodes send `generationPrompt`, timeline clip/audio `assetId` references, and structured `metadata.videoEditor` into the existing v2 video generation path.
```

- [x] **Step 2: Run validation**

Run:

```bash
npm run test --workspace @aigc-flow/worker -- test/worker.test.ts
npm run build --workspace @aigc-flow/worker
npm run build
git diff --check
```

Expected: worker request test passes; worker TypeScript build passes; frontend build passes with existing warnings; diff check has no output.

- [x] **Step 3: Commit**

Stage only Phase 15 files:

```bash
git add apps/worker/src/workflow-runtime/service.ts apps/worker/test/worker.test.ts PROJECT_RECORD.md docs/superpowers/plans/2026-07-05-video-editor-runtime-request-phase-15.md
git commit -m "feat: pass video editor timeline to runtime"
```
