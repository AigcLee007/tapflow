# Video Editor FFmpeg Executor Phase 20 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the worker-side FFmpeg command/execution boundary for video editor render plans, without yet wiring it into workflow completion or asset persistence.

**Architecture:** Keep Phase 19 render plans as the input contract. Add a pure command builder plus a small child-process runner in `apps/worker/src/workflow-runtime/video-editor-ffmpeg-executor.ts`. The command builder accepts hydrated local file paths supplied by a later asset-download phase, emits deterministic `ffmpeg` arguments, rejects missing files, and escapes subtitle text for FFmpeg drawtext filters. The runner wraps `child_process.spawn`, collects stderr for diagnostics, and never touches billing, provider routes, object storage, database rows, or canvas drafts. Add `ffmpeg` to the production Docker image so the eventual executor can run in deployed worker containers.

**Tech Stack:** TypeScript, Node.js `child_process`, Vitest, existing worker render plan types, Docker Alpine package install.

---

### File Structure

- Create `apps/worker/src/workflow-runtime/video-editor-ffmpeg-executor.ts`
  - Owns FFmpeg argument generation and process execution.
  - Imports only render plan types from `video-editor-render-plan.ts`.
  - Does not download assets, write assets, mutate workflow state, or charge billing.
- Create `apps/worker/test/video-editor-ffmpeg-executor.test.ts`
  - Tests deterministic args, subtitle escaping, missing local file rejection, and spawn success/failure behavior with a fake spawn implementation.
- Modify `Dockerfile`
  - Install `ffmpeg` in the production stage with `apk add --no-cache ffmpeg`.
- Modify `PROJECT_RECORD.md`
  - Adds the Phase 20 progress entry and validation evidence.

---

### Task 1: FFmpeg Command Builder Tests

**Files:**
- Create: `apps/worker/test/video-editor-ffmpeg-executor.test.ts`
- Create later: `apps/worker/src/workflow-runtime/video-editor-ffmpeg-executor.ts`

- [ ] **Step 1: Write the failing command-builder test**

Add:

```ts
import { EventEmitter } from "node:events";
import { describe, expect, test, vi } from "vitest";

import type { VideoEditorRenderPlan } from "../src/workflow-runtime/video-editor-render-plan.js";
import {
  VideoEditorFfmpegExecutorError,
  buildVideoEditorFfmpegArgs,
  runVideoEditorFfmpeg,
} from "../src/workflow-runtime/video-editor-ffmpeg-executor.js";

const plan: VideoEditorRenderPlan = {
  version: 1,
  renderer: "ffmpeg",
  output: { width: 1920, height: 1080, durationMs: 7000, mimeType: "video/mp4" },
  assetIds: ["asset-image-1", "asset-video-2", "asset-audio-1"],
  clips: [
    { id: "clip-1", assetId: "asset-image-1", kind: "image", track: 0, startMs: 0, inMs: 0, outMs: 3000, durationMs: 3000, effectiveDurationMs: 3000, speed: 1, muted: false, volume: null },
    { id: "clip-2", assetId: "asset-video-2", kind: "video", track: 0, startMs: 3000, inMs: 200, outMs: 4200, durationMs: 4000, effectiveDurationMs: 4000, speed: 1, muted: true, volume: 0.5 },
  ],
  audio: [
    { id: "audio-1", assetId: "asset-audio-1", track: 1, startMs: 0, inMs: 0, outMs: 7000, durationMs: 7000, volume: 0.8 },
  ],
  subtitles: [
    { id: "sub-1", text: "Bob's \"Opening\": 100%", startMs: 500, endMs: 1800 },
  ],
};

describe("buildVideoEditorFfmpegArgs", () => {
  test("builds deterministic ffmpeg args from a render plan and local asset files", () => {
    const args = buildVideoEditorFfmpegArgs({
      assetFiles: {
        "asset-audio-1": "C:/render/audio.m4a",
        "asset-image-1": "C:/render/image.png",
        "asset-video-2": "C:/render/video.mp4",
      },
      outputPath: "C:/render/output.mp4",
      plan,
    });

    expect(args.slice(0, 6)).toEqual(["-y", "-loop", "1", "-t", "3.000", "-i"]);
    expect(args).toContain("C:/render/image.png");
    expect(args).toContain("C:/render/video.mp4");
    expect(args).toContain("C:/render/audio.m4a");
    expect(args).toContain("-filter_complex");
    expect(args.join(" ")).toContain("scale=1920:1080");
    expect(args.join(" ")).toContain("drawtext=");
    expect(args.join(" ")).toContain("Bob\\'s \\\"Opening\\\"\\: 100%");
    expect(args.slice(-7)).toEqual(["-map", "[vout]", "-map", "[aout]", "-t", "7.000", "C:/render/output.mp4"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test --workspace @aigc-flow/worker -- test/video-editor-ffmpeg-executor.test.ts
```

Expected: FAIL because `video-editor-ffmpeg-executor.ts` does not exist.

- [ ] **Step 3: Add validation and runner tests**

Append:

```ts
test("rejects render plans when a local file is missing for an asset id", () => {
  expect(() => buildVideoEditorFfmpegArgs({
    assetFiles: { "asset-image-1": "C:/render/image.png" },
    outputPath: "C:/render/output.mp4",
    plan,
  })).toThrow(VideoEditorFfmpegExecutorError);
});

describe("runVideoEditorFfmpeg", () => {
  test("resolves when ffmpeg exits successfully", async () => {
    const spawned = new EventEmitter() as EventEmitter & {
      stderr: EventEmitter;
    };
    spawned.stderr = new EventEmitter();
    const spawn = vi.fn(() => spawned);
    const promise = runVideoEditorFfmpeg({
      args: ["-version"],
      ffmpegPath: "ffmpeg",
      spawn,
    });
    spawned.emit("close", 0);
    await expect(promise).resolves.toEqual({ exitCode: 0, stderr: "" });
    expect(spawn).toHaveBeenCalledWith("ffmpeg", ["-version"], { windowsHide: true });
  });

  test("rejects with stderr when ffmpeg exits non-zero", async () => {
    const spawned = new EventEmitter() as EventEmitter & {
      stderr: EventEmitter;
    };
    spawned.stderr = new EventEmitter();
    const spawn = vi.fn(() => spawned);
    const promise = runVideoEditorFfmpeg({
      args: ["-bad"],
      ffmpegPath: "ffmpeg",
      spawn,
    });
    spawned.stderr.emit("data", Buffer.from("bad filter"));
    spawned.emit("close", 1);
    await expect(promise).rejects.toMatchObject({
      code: "VIDEO_EDITOR_FFMPEG_FAILED",
      stderr: "bad filter",
    });
  });
});
```

- [ ] **Step 4: Run test to verify failures are expected**

Run:

```bash
npm run test --workspace @aigc-flow/worker -- test/video-editor-ffmpeg-executor.test.ts
```

Expected: FAIL because the executor module is not implemented.

### Task 2: FFmpeg Executor Implementation

**Files:**
- Create: `apps/worker/src/workflow-runtime/video-editor-ffmpeg-executor.ts`

- [ ] **Step 1: Add types and error class**

Implement:

```ts
export type VideoEditorFfmpegExecutorErrorCode =
  | "VIDEO_EDITOR_FFMPEG_ASSET_FILE_MISSING"
  | "VIDEO_EDITOR_FFMPEG_FAILED"
  | "VIDEO_EDITOR_FFMPEG_SPAWN_FAILED";
```

The error class should expose `code` and optional `stderr`.

- [ ] **Step 2: Implement command builder**

Build args with:

- `-y`
- each image clip as `-loop 1 -t <seconds> -i <path>`
- each video clip as `-ss <inSeconds> -t <seconds> -i <path>`
- each audio item as `-ss <inSeconds> -t <seconds> -i <path>`
- one `-filter_complex` string that scales/pads each clip to output size, concatenates video clips into `[vbase]`, overlays escaped subtitles via `drawtext`, and mixes audio into `[aout]`
- `-map [vout] -map [aout] -t <durationSeconds> <outputPath>`

Keep the generated command deterministic by ordering clips by `track`, then `startMs`, then `id`, and audio by `track`, then `startMs`, then `id`.

- [ ] **Step 3: Implement process runner**

Implement `runVideoEditorFfmpeg({ args, ffmpegPath, spawn })` with:

- default `ffmpegPath: "ffmpeg"`.
- default `spawn` from `node:child_process`.
- `{ windowsHide: true }`.
- stderr collection capped to the last 8000 characters.
- reject on `error` with `VIDEO_EDITOR_FFMPEG_SPAWN_FAILED`.
- reject on non-zero close with `VIDEO_EDITOR_FFMPEG_FAILED`.
- resolve `{ exitCode, stderr }` on zero close.

- [ ] **Step 4: Run tests to verify green**

Run:

```bash
npm run test --workspace @aigc-flow/worker -- test/video-editor-ffmpeg-executor.test.ts
```

Expected: PASS.

### Task 3: Runtime Dependency

**Files:**
- Modify: `Dockerfile`

- [ ] **Step 1: Add FFmpeg to the production runtime image**

In the production stage after `WORKDIR /app`, add:

```dockerfile
RUN apk add --no-cache ffmpeg
```

Do not add Node package dependencies for FFmpeg.

- [ ] **Step 2: Verify diff**

Run:

```bash
git diff -- Dockerfile
```

Expected: only the production-stage `apk add --no-cache ffmpeg` line is added.

### Task 4: Validation, Record, Commit

**Files:**
- Modify: `PROJECT_RECORD.md`
- Track: `docs/superpowers/plans/2026-07-05-video-editor-ffmpeg-executor-phase-20.md`

- [ ] **Step 1: Run focused worker tests**

Run:

```bash
npm run test --workspace @aigc-flow/worker -- test/video-editor-ffmpeg-executor.test.ts test/video-editor-render-plan.test.ts test/worker.test.ts
```

Expected: PASS, with existing DB-backed worker tests skipped when local DB env is unavailable.

- [ ] **Step 2: Run worker package build**

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

Prepend `2026-07-05 - Video Editor FFmpeg Executor Phase 20` summarizing:

- added deterministic FFmpeg command/executor boundary for render plans.
- production Docker image now includes the `ffmpeg` binary.
- still no workflow wiring, asset persistence, pricing unit, browser-local export, or billing mutation.
- validation commands and outcomes.

- [ ] **Step 6: Commit**

Run:

```bash
git add apps/worker/src/workflow-runtime/video-editor-ffmpeg-executor.ts apps/worker/test/video-editor-ffmpeg-executor.test.ts Dockerfile PROJECT_RECORD.md docs/superpowers/plans/2026-07-05-video-editor-ffmpeg-executor-phase-20.md
git commit -m "feat: add video editor ffmpeg executor boundary"
```
