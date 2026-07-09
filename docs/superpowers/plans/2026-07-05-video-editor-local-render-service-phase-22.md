# Video Editor Local Render Service Phase 22 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a worker-local render service that downloads asset-backed video editor render plan inputs to a temporary directory, runs the FFmpeg executor, and returns a local-file `MediaOutput` ready for the existing asset persistence pipeline.

**Architecture:** Build a standalone `VideoEditorLocalRenderService` that takes a Phase 19 `VideoEditorRenderPlan`, storage lookups for its `assetIds`, and the existing `StorageProvider`. It uses `StorageProvider.getObject` to hydrate local files, calls Phase 20 `buildVideoEditorFfmpegArgs` and `runVideoEditorFfmpeg`, returns a Phase 21 `MediaOutput` with `localFilePath`, and cleans up input temp files while keeping the output file available for the caller to persist. This phase still does not wire the service into `WorkflowNodeExecutionService`, pricing, usage settlement, provider routes, API endpoints, or frontend UI.

**Tech Stack:** TypeScript, Node.js `fs/promises`, Node.js `os/path`, existing `StorageProvider`, existing render plan/executor modules, Vitest.

---

### File Structure

- Create `apps/worker/src/workflow-runtime/video-editor-local-render-service.ts`
  - Owns object-storage hydration to temp files and FFmpeg execution orchestration.
  - Exports `VideoEditorLocalRenderService`, `VideoEditorLocalRenderServiceError`, and asset lookup types.
  - Does not persist assets, mutate database rows, settle billing, or patch canvas drafts.
- Create `apps/worker/test/video-editor-local-render-service.test.ts`
  - Tests asset hydration, FFmpeg argument invocation, returned local-file output metadata, missing `getObject` error, and cleanup behavior.
- Modify `PROJECT_RECORD.md`
  - Adds Phase 22 notes and validation evidence.

---

### Task 1: Failing Local Render Service Tests

**Files:**
- Create: `apps/worker/test/video-editor-local-render-service.test.ts`
- Create later: `apps/worker/src/workflow-runtime/video-editor-local-render-service.ts`

- [ ] **Step 1: Write the failing happy-path test**

Add:

```ts
import { stat } from "node:fs/promises";
import { describe, expect, test, vi } from "vitest";

import type { StorageProvider } from "@aigc-flow/storage";
import type { VideoEditorRenderPlan } from "../src/workflow-runtime/video-editor-render-plan.js";
import {
  VideoEditorLocalRenderService,
  VideoEditorLocalRenderServiceError,
} from "../src/workflow-runtime/video-editor-local-render-service.js";

class MemoryStorageProvider implements StorageProvider {
  readonly objects = new Map<string, { body: Buffer; contentType: string | null }>();

  async putObject(): Promise<void> {
    throw new Error("not used");
  }

  async headObject() {
    throw new Error("not used");
  }

  async getObject(input: { bucket: string; key: string }) {
    const object = this.objects.get(`${input.bucket}/${input.key}`);
    if (!object) {
      throw new Error(`missing object ${input.bucket}/${input.key}`);
    }
    return {
      body: object.body,
      contentLength: object.body.byteLength,
      contentType: object.contentType,
      metadata: {},
    };
  }

  async deleteObject(): Promise<void> {
    throw new Error("not used");
  }

  async createPresignedPutUrl() {
    throw new Error("not used");
  }

  async createPresignedGetUrl() {
    throw new Error("not used");
  }
}

const plan: VideoEditorRenderPlan = {
  version: 1,
  renderer: "ffmpeg",
  output: { width: 1920, height: 1080, durationMs: 7000, mimeType: "video/mp4" },
  assetIds: ["asset-image-1", "asset-video-1", "asset-audio-1"],
  clips: [
    { id: "clip-1", assetId: "asset-image-1", kind: "image", track: 0, startMs: 0, inMs: 0, outMs: 3000, durationMs: 3000, effectiveDurationMs: 3000, speed: 1, muted: false, volume: null },
    { id: "clip-2", assetId: "asset-video-1", kind: "video", track: 0, startMs: 3000, inMs: 0, outMs: 4000, durationMs: 4000, effectiveDurationMs: 4000, speed: 1, muted: false, volume: null },
  ],
  audio: [
    { id: "audio-1", assetId: "asset-audio-1", track: 1, startMs: 0, inMs: 0, outMs: 7000, durationMs: 7000, volume: 1 },
  ],
  subtitles: [],
};

describe("VideoEditorLocalRenderService", () => {
  test("downloads render plan assets, runs ffmpeg, and returns a local video output", async () => {
    const storageProvider = new MemoryStorageProvider();
    storageProvider.objects.set("asset-bucket/images/source.png", { body: Buffer.from("image"), contentType: "image/png" });
    storageProvider.objects.set("asset-bucket/videos/source.mp4", { body: Buffer.from("video"), contentType: "video/mp4" });
    storageProvider.objects.set("asset-bucket/audio/source.m4a", { body: Buffer.from("audio"), contentType: "audio/mp4" });

    const runFfmpeg = vi.fn(async ({ outputPath }: { outputPath: string }) => {
      await import("node:fs/promises").then(({ writeFile }) => writeFile(outputPath, Buffer.from("rendered video")));
      return { exitCode: 0, stderr: "" };
    });
    const service = new VideoEditorLocalRenderService({
      buildArgs: vi.fn((input) => ["-i", input.assetFiles["asset-image-1"], input.outputPath]),
      runFfmpeg,
      storageProvider,
    });

    const result = await service.render({
      assetLookups: new Map([
        ["asset-image-1", { bucket: "asset-bucket", mimeType: "image/png", objectKey: "images/source.png" }],
        ["asset-video-1", { bucket: "asset-bucket", mimeType: "video/mp4", objectKey: "videos/source.mp4" }],
        ["asset-audio-1", { bucket: "asset-bucket", mimeType: "audio/mp4", objectKey: "audio/source.m4a" }],
      ]),
      plan,
      tenantId: "tenant-1",
      workflowRunId: "workflow-1",
    });

    expect(result.output).toEqual(expect.objectContaining({
      durationMs: 7000,
      height: 1080,
      localFilePath: expect.stringContaining("rendered-output.mp4"),
      mimeType: "video/mp4",
      width: 1920,
    }));
    expect(runFfmpeg).toHaveBeenCalledWith(expect.objectContaining({
      outputPath: result.output.localFilePath,
    }));
    await expect(stat(result.output.localFilePath ?? "")).resolves.toEqual(expect.objectContaining({
      size: 14,
    }));
    await expect(stat(result.tempDir)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test --workspace @aigc-flow/worker -- test/video-editor-local-render-service.test.ts
```

Expected: FAIL because `video-editor-local-render-service.ts` does not exist.

- [ ] **Step 3: Add missing storage capability and cleanup tests**

Append:

```ts
test("fails clearly when storage provider cannot read objects", async () => {
  const service = new VideoEditorLocalRenderService({
    storageProvider: {
      async putObject() {},
      async headObject() { throw new Error("not used"); },
      async deleteObject() {},
      async createPresignedPutUrl() { throw new Error("not used"); },
      async createPresignedGetUrl() { throw new Error("not used"); },
    },
  });

  await expect(service.render({
    assetLookups: new Map(),
    plan,
    tenantId: "tenant-1",
    workflowRunId: "workflow-1",
  })).rejects.toMatchObject({
    code: "VIDEO_EDITOR_RENDER_STORAGE_UNSUPPORTED",
  });
});

test("fails when a required asset lookup is missing", async () => {
  const storageProvider = new MemoryStorageProvider();
  const service = new VideoEditorLocalRenderService({ storageProvider });

  await expect(service.render({
    assetLookups: new Map(),
    plan,
    tenantId: "tenant-1",
    workflowRunId: "workflow-1",
  })).rejects.toMatchObject({
    code: "VIDEO_EDITOR_RENDER_ASSET_LOOKUP_MISSING",
  });
});
```

- [ ] **Step 4: Run test to verify failures are expected**

Run:

```bash
npm run test --workspace @aigc-flow/worker -- test/video-editor-local-render-service.test.ts
```

Expected: FAIL because the service is not implemented.

### Task 2: Local Render Service Implementation

**Files:**
- Create: `apps/worker/src/workflow-runtime/video-editor-local-render-service.ts`

- [ ] **Step 1: Add types and error class**

Implement error codes:

```ts
export type VideoEditorLocalRenderServiceErrorCode =
  | "VIDEO_EDITOR_RENDER_STORAGE_UNSUPPORTED"
  | "VIDEO_EDITOR_RENDER_ASSET_LOOKUP_MISSING"
  | "VIDEO_EDITOR_RENDER_ASSET_DOWNLOAD_FAILED";
```

The error class should expose `code`.

- [ ] **Step 2: Implement constructor dependencies**

Constructor options:

- `storageProvider: StorageProvider`
- optional `buildArgs`, default `buildVideoEditorFfmpegArgs`
- optional `runFfmpeg`, default wrapper that calls `runVideoEditorFfmpeg` with args
- optional `tmpRoot`, default `tmpdir()`

- [ ] **Step 3: Implement `render`**

`render(input)` should:

- require `storageProvider.getObject`, otherwise throw `VIDEO_EDITOR_RENDER_STORAGE_UNSUPPORTED`
- create a parent temp directory named with `tapflow-video-render-`
- create a separate output directory named with `tapflow-video-render-output-`
- for each `plan.assetIds`, require a lookup and download `bucket/objectKey`
- write each input file under the temp dir with a safe filename like `<assetId>-<index>.<extension>`
- call `buildArgs({ plan, assetFiles, outputPath })`
- call `runFfmpeg({ args, outputPath })`
- return:

```ts
{
  output: {
    durationMs: plan.output.durationMs,
    height: plan.output.height,
    localFilePath: outputPath,
    mimeType: plan.output.mimeType,
    width: plan.output.width,
  },
  tempDir,
}
```

- always remove the input temp dir in `finally`
- keep the output dir/file for the caller to persist later

- [ ] **Step 4: Run tests to verify green**

Run:

```bash
npm run test --workspace @aigc-flow/worker -- test/video-editor-local-render-service.test.ts
```

Expected: PASS.

### Task 3: Validation, Record, Commit

**Files:**
- Modify: `PROJECT_RECORD.md`
- Track: `docs/superpowers/plans/2026-07-05-video-editor-local-render-service-phase-22.md`

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm run test --workspace @aigc-flow/worker -- test/video-editor-local-render-service.test.ts test/video-editor-ffmpeg-executor.test.ts test/video-editor-render-plan.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run worker build**

Run:

```bash
npm run build --workspace @aigc-flow/worker
```

Expected: PASS.

- [ ] **Step 3: Run root build**

Run:

```bash
npm run build
```

Expected: PASS, allowing existing Browserslist, dynamic-import, and chunk-size warnings.

- [ ] **Step 4: Run whitespace check**

Run:

```bash
git diff --check
```

Expected: PASS.

- [ ] **Step 5: Update project record**

Prepend `2026-07-05 - Video Editor Local Render Service Phase 22` summarizing:

- added local render service for storage hydration -> FFmpeg -> local MediaOutput.
- input temp files are cleaned up; output file remains for asset persistence.
- no workflow wiring, billing mutation, API route, frontend export, or database schema change was added.
- validation commands and outcomes.

- [ ] **Step 6: Commit**

Run:

```bash
git add apps/worker/src/workflow-runtime/video-editor-local-render-service.ts apps/worker/test/video-editor-local-render-service.test.ts PROJECT_RECORD.md docs/superpowers/plans/2026-07-05-video-editor-local-render-service-phase-22.md
git commit -m "feat: prepare local video editor render service"
```
