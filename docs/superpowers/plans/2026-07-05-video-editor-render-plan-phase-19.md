# Video Editor Render Plan Phase 19 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the worker-side normalized render plan that turns a `videoEditor.timeline` into a validated, server-renderable composition description before any provider or renderer execution.

**Architecture:** Keep the current v2 workflow and billing path intact. Add a pure `apps/worker` module that validates asset-backed video editor timelines, computes output resolution and duration, and returns an FFmpeg-oriented structured plan. Wire the sanitized plan into existing `video.generate` metadata so future internal render routes can consume it, while invalid editor exports fail in the worker before provider calls and refund through the existing failure path.

**Tech Stack:** TypeScript, `apps/worker`, Vitest, existing workflow runtime request builder.

---

### File Structure

- Create `apps/worker/src/workflow-runtime/video-editor-render-plan.ts`
  - Owns all server-side video editor timeline normalization.
  - Exports `buildVideoEditorRenderPlan`, `VideoEditorRenderPlanError`, and related plan types.
  - Does not perform I/O, download assets, run FFmpeg, write assets, or mutate billing.
- Create `apps/worker/test/video-editor-render-plan.test.ts`
  - Focused tests for valid timelines, empty/invalid timelines, transient media reference rejection, and default output normalization.
- Modify `apps/worker/src/workflow-runtime/service.ts`
  - Imports `buildVideoEditorRenderPlan`.
  - Adds the sanitized render plan under `metadata.videoEditorExport.renderPlan` for editor exports.
  - Lets invalid render plans throw before `mediaGenerationRuntime.generateVideo`.
- Modify `apps/worker/test/worker.test.ts`
  - Extends the existing video editor export request test to assert render plan metadata exists and remains draft-safe.
- Modify `PROJECT_RECORD.md`
  - Adds the Phase 19 progress entry and validation evidence.

No Dockerfile or compose change is included in this phase. The binary FFmpeg installation belongs with the later executor phase that actually runs `ffmpeg`; this phase is the deterministic plan boundary.

---

### Task 1: Pure Render Plan Tests

**Files:**
- Create: `apps/worker/test/video-editor-render-plan.test.ts`
- Create later: `apps/worker/src/workflow-runtime/video-editor-render-plan.ts`

- [ ] **Step 1: Write the failing valid-plan test**

Add this test:

```ts
import { describe, expect, test } from "vitest";
import {
  VideoEditorRenderPlanError,
  buildVideoEditorRenderPlan,
} from "../src/workflow-runtime/video-editor-render-plan.js";

describe("buildVideoEditorRenderPlan", () => {
  test("normalizes asset-backed clips, audio, and subtitles into an ffmpeg render plan", () => {
    const plan = buildVideoEditorRenderPlan({
      aspect: "16:9",
      resolution: "1920x1080",
      timeline: {
        durationMs: 7000,
        clips: [
          { id: "clip-1", assetId: "asset-image-1", kind: "image", track: 1, startMs: 0, inMs: 0, outMs: 3000, speed: 1 },
          { id: "clip-2", assetId: "asset-video-2", kind: "video", track: 1, startMs: 3000, inMs: 200, outMs: 4200, speed: 2, muted: true, volume: 0.25 },
        ],
        audio: [
          { id: "audio-1", assetId: "asset-audio-1", track: 2, startMs: 500, inMs: 100, outMs: 5100, volume: 0.8 },
        ],
        subtitles: [
          { id: "sub-1", text: "Opening", startMs: 0, endMs: 1200 },
        ],
      },
    });

    expect(plan).toMatchObject({
      version: 1,
      renderer: "ffmpeg",
      output: {
        width: 1920,
        height: 1080,
        durationMs: 7000,
        mimeType: "video/mp4",
      },
      assetIds: ["asset-image-1", "asset-video-2", "asset-audio-1"],
    });
    expect(plan.clips[1]).toMatchObject({
      assetId: "asset-video-2",
      durationMs: 2000,
      effectiveDurationMs: 1000,
      muted: true,
      volume: 0.25,
    });
    expect(plan.audio[0]).toMatchObject({
      assetId: "asset-audio-1",
      durationMs: 5000,
      startMs: 500,
      volume: 0.8,
    });
    expect(plan.subtitles).toEqual([
      { id: "sub-1", text: "Opening", startMs: 0, endMs: 1200 },
    ]);
    expect(JSON.stringify(plan)).not.toMatch(/blob:|data:|https?:\/\//);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test --workspace @aigc-flow/worker -- test/video-editor-render-plan.test.ts
```

Expected: FAIL because `video-editor-render-plan.ts` does not exist.

- [ ] **Step 3: Add invalid timeline tests**

Append tests:

```ts
test("rejects empty editor timelines before provider or renderer execution", () => {
  expect(() => buildVideoEditorRenderPlan({
    resolution: "1920x1080",
    timeline: { durationMs: 0, clips: [], audio: [], subtitles: [] },
  })).toThrow(VideoEditorRenderPlanError);
});

test("rejects transient media references instead of treating them as asset ids", () => {
  expect(() => buildVideoEditorRenderPlan({
    resolution: "1920x1080",
    timeline: {
      durationMs: 3000,
      clips: [
        { id: "clip-1", assetId: "blob:http://local/asset", kind: "image", track: 1, startMs: 0, inMs: 0, outMs: 3000, speed: 1 },
      ],
      audio: [],
      subtitles: [],
    },
  })).toThrow(VideoEditorRenderPlanError);
});

test("uses 16:9 1080p defaults when editor output settings are missing", () => {
  const plan = buildVideoEditorRenderPlan({
    timeline: {
      durationMs: 0,
      clips: [
        { id: "clip-1", assetId: "asset-image-1", kind: "image", track: 0, startMs: 0, inMs: 0, outMs: 4500, speed: 1 },
      ],
      audio: [],
      subtitles: [],
    },
  });

  expect(plan.output).toMatchObject({
    width: 1920,
    height: 1080,
    durationMs: 4500,
    mimeType: "video/mp4",
  });
});
```

- [ ] **Step 4: Run test to verify failures are expected**

Run:

```bash
npm run test --workspace @aigc-flow/worker -- test/video-editor-render-plan.test.ts
```

Expected: FAIL because the render plan module is not implemented.

### Task 2: Pure Render Plan Implementation

**Files:**
- Create: `apps/worker/src/workflow-runtime/video-editor-render-plan.ts`

- [ ] **Step 1: Add types and error class**

Implement:

```ts
export type VideoEditorRenderPlanErrorCode =
  | "VIDEO_EDITOR_TIMELINE_EMPTY"
  | "VIDEO_EDITOR_TIMELINE_INVALID"
  | "VIDEO_EDITOR_ASSET_REFERENCE_INVALID";

export class VideoEditorRenderPlanError extends Error {
  readonly code: VideoEditorRenderPlanErrorCode;

  constructor(code: VideoEditorRenderPlanErrorCode, message: string) {
    super(message);
    this.name = "VideoEditorRenderPlanError";
    this.code = code;
  }
}
```

- [ ] **Step 2: Implement normalization helpers**

Add helpers that:

- accept only finite non-negative millisecond values for timing.
- accept clip kind `image` or `video`, defaulting unknown kind to `video`.
- default clip speed to `1` and reject speeds `<= 0`.
- default resolution to `1920x1080`; support `1280x720`, `1920x1080`, `720x1280`, `1080x1920`.
- reject `assetId` values starting with `blob:`, `data:`, `http://`, `https://`, or values containing base64-looking data URL payloads.

- [ ] **Step 3: Implement `buildVideoEditorRenderPlan`**

Return this shape:

```ts
{
  version: 1,
  renderer: "ffmpeg",
  output: { width, height, durationMs, mimeType: "video/mp4" },
  assetIds,
  clips,
  audio,
  subtitles,
}
```

Duration should be the maximum of:

- explicit `timeline.durationMs`
- each clip `startMs + ((outMs - inMs) / speed)`
- each audio item `startMs + (outMs - inMs)`
- each subtitle `endMs`

Reject if there are no valid clip or audio asset references.

- [ ] **Step 4: Run tests to verify green**

Run:

```bash
npm run test --workspace @aigc-flow/worker -- test/video-editor-render-plan.test.ts
```

Expected: PASS.

### Task 3: Worker Request Integration

**Files:**
- Modify: `apps/worker/src/workflow-runtime/service.ts`
- Modify: `apps/worker/test/worker.test.ts`

- [ ] **Step 1: Write the failing integration assertion**

In the existing `video.generate request uses exported video editor prompt and timeline asset ids` test, add:

```ts
expect(request.metadata).toEqual(expect.objectContaining({
  videoEditorExport: expect.objectContaining({
    renderPlan: expect.objectContaining({
      renderer: "ffmpeg",
      output: expect.objectContaining({
        width: 1920,
        height: 1080,
        durationMs: 7000,
        mimeType: "video/mp4",
      }),
      assetIds: ["asset-image-1", "asset-video-2", "asset-audio-1"],
    }),
  }),
}));
```

- [ ] **Step 2: Run integration test to verify it fails**

Run:

```bash
npm run test --workspace @aigc-flow/worker -- test/worker.test.ts
```

Expected: FAIL because `metadata.videoEditorExport.renderPlan` does not exist yet.

- [ ] **Step 3: Wire render plan into video export metadata**

In `service.ts`:

```ts
import { buildVideoEditorRenderPlan } from "./video-editor-render-plan.js";
```

Then add the plan inside `buildVideoEditorExportMetadata(videoEditor)`:

```ts
const renderPlan = buildVideoEditorRenderPlan(videoEditor);

return {
  ...
  renderPlan,
};
```

This intentionally lets invalid editor timelines throw before the provider call in the existing worker execution path.

- [ ] **Step 4: Run integration tests to verify green**

Run:

```bash
npm run test --workspace @aigc-flow/worker -- test/worker.test.ts
```

Expected: PASS, with existing DB-backed tests skipped when local DB env is unavailable.

### Task 4: Validation, Record, Commit

**Files:**
- Modify: `PROJECT_RECORD.md`
- Track: `docs/superpowers/plans/2026-07-05-video-editor-render-plan-phase-19.md`

- [ ] **Step 1: Run worker package build**

Run:

```bash
npm run build --workspace @aigc-flow/worker
```

Expected: PASS.

- [ ] **Step 2: Run root build**

Run:

```bash
npm run build
```

Expected: PASS, allowing existing Browserslist, dynamic-import, and chunk-size warnings.

- [ ] **Step 3: Run whitespace check**

Run:

```bash
git diff --check
```

Expected: PASS.

- [ ] **Step 4: Update project record**

Prepend `2026-07-05 - Video Editor Render Plan Phase 19` summarizing:

- added worker-side render plan normalization for video editor exports.
- invalid/empty/transient-reference timelines fail before provider/runtime rendering.
- no browser-local export, new pricing unit, asset-write shortcut, provider secret exposure, Docker image change, or billing mutation was added.
- validation commands and outcomes.

- [ ] **Step 5: Commit**

Run:

```bash
git add apps/worker/src/workflow-runtime/video-editor-render-plan.ts apps/worker/test/video-editor-render-plan.test.ts apps/worker/src/workflow-runtime/service.ts apps/worker/test/worker.test.ts PROJECT_RECORD.md docs/superpowers/plans/2026-07-05-video-editor-render-plan-phase-19.md
git commit -m "feat: plan video editor render exports"
```
