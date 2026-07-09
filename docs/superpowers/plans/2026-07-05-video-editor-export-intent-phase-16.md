# Video Editor Export Intent Phase 16 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make video editor export runs identifiable in provider requests and billing usage metadata without changing the existing v2 video-generation billing path.

**Architecture:** Keep `video_editor` editing free and keep exported canvas `video` nodes on the existing `video.generate` workflow path. Add a small, sanitized `videoEditorExport` metadata object derived from `params.videoEditor`, then attach it to the provider request and usage event metadata so billing/admin views can explain the charge as a video-editor export/generation.

**Tech Stack:** TypeScript, Vitest, existing worker runtime request builder, existing billing reserve/settle usage-event path.

---

### Task 1: Add Worker Request Coverage

**Files:**
- Modify: `apps/worker/test/worker.test.ts`

- [x] **Step 1: Write the failing assertion**

Extend `video.generate request uses exported video editor prompt and timeline asset ids` so it expects `metadata.videoEditorExport`:

```ts
expect(request.metadata).toEqual(expect.objectContaining({
  videoEditorExport: expect.objectContaining({
    billingUnit: "video_generation",
    durationMs: 7000,
    source: "video_editor_export",
    sourceVideoEditorNodeId: "video-editor-1",
    timelineAssetCounts: {
      audio: 1,
      clips: 2,
    },
  }),
}));
```

- [x] **Step 2: Run the test to verify it fails**

```bash
npm run test --workspace @aigc-flow/worker -- test/worker.test.ts
```

Expected: FAIL because `metadata.videoEditorExport` does not exist yet.

### Task 2: Implement Export Intent Metadata

**Files:**
- Modify: `apps/worker/src/workflow-runtime/service.ts`
- Test: `apps/worker/test/worker.test.ts`

- [x] **Step 1: Add a sanitized export metadata helper**

Add a helper near `buildVideoEditorRequestMetadata`:

```ts
function buildVideoEditorExportMetadata(videoEditor: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!videoEditor) {
    return null;
  }
  const timeline = isPlainObject(videoEditor.timeline) ? videoEditor.timeline : {};
  const clips = Array.isArray(timeline.clips) ? timeline.clips : [];
  const audio = Array.isArray(timeline.audio) ? timeline.audio : [];
  return {
    ...(readTrimmedString(videoEditor.sourceVideoEditorNodeId)
      ? { sourceVideoEditorNodeId: readTrimmedString(videoEditor.sourceVideoEditorNodeId) }
      : {}),
    ...(readTrimmedString(videoEditor.aspect) ? { aspect: readTrimmedString(videoEditor.aspect) } : {}),
    ...(readTrimmedString(videoEditor.resolution) ? { resolution: readTrimmedString(videoEditor.resolution) } : {}),
    billingUnit: "video_generation",
    durationMs: readFiniteNumberOrNull(timeline.durationMs) ?? 0,
    source: "video_editor_export",
    timelineAssetCounts: {
      audio: audio.filter((item) => isPlainObject(item) && readTrimmedString(item.assetId)).length,
      clips: clips.filter((item) => isPlainObject(item) && readTrimmedString(item.assetId)).length,
    },
  };
}
```

- [x] **Step 2: Attach it to video requests**

Update `buildVideoRequest`:

```ts
const videoEditorExportMetadata = buildVideoEditorExportMetadata(videoEditor);
const metadata = {
  ...baseMetadata,
  ...(videoEditorMetadata ? { videoEditor: videoEditorMetadata } : {}),
  ...(videoEditorExportMetadata ? { videoEditorExport: videoEditorExportMetadata } : {}),
};
```

- [x] **Step 3: Run the worker test**

```bash
npm run test --workspace @aigc-flow/worker -- test/worker.test.ts
```

Expected: PASS or DB-backed tests skip when local DB env is unavailable. The request-builder test must pass.

### Task 3: Add Billing Usage Metadata Coverage

**Files:**
- Modify: `apps/worker/test/worker.test.ts`
- Modify: `apps/worker/src/workflow-runtime/service.ts`

- [x] **Step 1: Add a failing request-level helper assertion**

If a pure helper is exposed through `__workerTestUtils`, add a test that calls it with a video-editor config and expects:

```ts
expect(metadata).toMatchObject({
  sourceNodeType: "video.generate",
  videoEditorExport: expect.objectContaining({
    billingUnit: "video_generation",
    source: "video_editor_export",
  }),
});
```

- [x] **Step 2: Implement usage metadata helper**

Add:

```ts
function buildMediaUsageMetadata(kind: "image" | "video", node: CompiledWorkflowNode): Record<string, unknown> {
  const base = { sourceNodeType: node.type };
  if (kind !== "video") {
    return base;
  }
  const videoEditor = readVideoEditorConfig(node.config ?? {});
  const videoEditorExport = buildVideoEditorExportMetadata(videoEditor);
  return videoEditorExport ? { ...base, videoEditorExport } : base;
}
```

Use this helper inside `mapMediaOutcome`:

```ts
metadata: buildMediaUsageMetadata(kind, node),
```

Expose the helper through `__workerTestUtils` only for focused unit coverage.

- [x] **Step 3: Run the worker test**

```bash
npm run test --workspace @aigc-flow/worker -- test/worker.test.ts
```

Expected: PASS or DB-backed tests skip when local DB env is unavailable.

### Task 4: Record And Verify

**Files:**
- Modify: `PROJECT_RECORD.md`

- [x] **Step 1: Update project record**

Add a top entry:

```md
## 2026-07-05 - Video Editor Export Intent Phase 16

- added sanitized `videoEditorExport` metadata for exported `video` nodes so provider requests and usage-event metadata can identify video-editor export/generation runs.
- kept pricing on the existing `video_generation` unit and existing server-side reserve/run/settle/refund path; no new tables, routes, secrets, or frontend billing mutations were added.
- validation:
  - `npm run test --workspace @aigc-flow/worker -- test/worker.test.ts`
  - `npm run build --workspace @aigc-flow/worker`
  - `npm run build`
  - `git diff --check`
```

- [x] **Step 2: Run validation**

```bash
npm run test --workspace @aigc-flow/worker -- test/worker.test.ts
npm run build --workspace @aigc-flow/worker
npm run build
git diff --check
```

Expected: worker tests pass or DB-backed tests skip due missing DB env; builds pass with only existing non-blocking warnings; diff check exits cleanly.

- [x] **Step 3: Commit**

```bash
git add apps/worker/src/workflow-runtime/service.ts apps/worker/test/worker.test.ts PROJECT_RECORD.md docs/superpowers/plans/2026-07-05-video-editor-export-intent-phase-16.md
git commit -m "feat: mark video editor export runs"
```
