# Reference Video 720p Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically create a server-side 720p-compatible reference variant when a video asset upload completes, while preserving the original and preventing H3video generation from sending an unprepared high-resolution reference.

**Architecture:** Add a dedicated BullMQ `asset.video-reference-variant` queue. The API enqueues an idempotent job after `complete-upload`; the worker downloads the original from S3, probes/transcodes with the Docker-provided FFmpeg, stores `reference-720p` in `asset_variants`, and records processing status in asset metadata. Workflow URL hydration selects the variant only for the H3video route and fails closed while it is pending or failed.

**Tech Stack:** TypeScript, Fastify, BullMQ/Redis, PostgreSQL `assets` and `asset_variants`, S3-compatible storage, FFmpeg/ffprobe, Vitest, React/Vite.

---

## File Map

- `packages/redis/src/queues.ts`, `packages/redis/src/index.ts`: queue name and typed payload.
- `apps/api/src/app.ts`, `apps/api/src/modules/assets/assets.service.ts`: inject the queue and enqueue after upload completion.
- `apps/api/test/assets.test.ts`: API enqueue/idempotency coverage.
- `apps/worker/src/config/env.ts`, `apps/worker/src/main.ts`, `apps/worker/src/queues/registry.ts`: worker queue construction, concurrency, and processor registration.
- `apps/worker/src/workflow-runtime/video-reference-variant.ts`: pure FFmpeg argument/probe/transcode helpers.
- `apps/worker/src/workflow-runtime/video-reference-variant-processor.ts`: tenant-scoped S3 read, transcode, variant upsert, and status updates.
- `apps/worker/src/processors/asset-video-reference-variant.processor.ts`: BullMQ adapter and structured logging.
- `apps/worker/test/video-reference-variant.test.ts`, `apps/worker/test/video-reference-variant-processor.test.ts`: focused helper and processor tests.
- `apps/worker/src/workflow-runtime/service.ts`: H3video reference variant selection during URL hydration.
- `apps/worker/test/worker.test.ts` or a focused workflow-runtime test: pending/failed/ready selection and no provider call.
- `src/assets/assetApi.ts`, `src/assets/assetApi.test.ts`: video metadata/status typing and upload metadata support.
- `src/flowCanvas/nodes/FlowNodes.tsx`, relevant `FlowNodes` test: disable/show processing state for an unready high-resolution reference.
- `docker-compose.staging.yml`, `docs/STAGING_ENV_TEMPLATE.md`: worker concurrency variable propagation.
- `PROJECT_RECORD.md`: record the completed product/operational change after implementation.

## Task 1: Add the typed video-variant queue contract

**Files:**
- Modify: `packages/redis/src/queues.ts`
- Modify: `packages/redis/src/index.ts`
- Test: `packages/redis/test/redis.test.ts`

- [ ] **Step 1: Write the failing queue contract test.** Assert that `QUEUE_NAMES.assetVideoReferenceVariant` is `asset.video-reference-variant`, the payload accepts only `tenantId`, `assetId`, and optional `traceId`, and `assertLightweightJobPayload` rejects a media body or URL.

```ts
expect(QUEUE_NAMES.assetVideoReferenceVariant).toBe("asset.video-reference-variant");
assertLightweightJobPayload({ assetId: "asset-1", tenantId: "tenant-1", traceId: "trace-1" });
expect(() => assertLightweightJobPayload({ assetId: "asset-1", tenantId: "tenant-1", body: "x".repeat(513) })).toThrow();
```

- [ ] **Step 2: Run the focused test and verify it fails** because the queue name and payload type do not exist.

Run: `npm run test --workspace @aigc-flow/redis -- redis.test.ts`

- [ ] **Step 3: Implement the contract.** Add `AssetVideoReferenceVariantJobPayload = BaseJobPayload & { assetId: string }`, add the queue name to `QUEUE_NAMES`, `QueuePayloadMap`, `AnyJobPayload` exports, and keep the payload free of URLs and bytes.

- [ ] **Step 4: Run the focused test and package typecheck/build.**

Run: `npm run test --workspace @aigc-flow/redis -- redis.test.ts`

Run: `npm run build --workspace @aigc-flow/redis`

- [ ] **Step 5: Commit.**

```bash
git add packages/redis/src/queues.ts packages/redis/src/index.ts packages/redis/test/redis.test.ts
git commit -m "feat(redis): add video reference variant queue"
```

## Task 2: Implement deterministic FFmpeg video variant helpers

**Files:**
- Create: `apps/worker/src/workflow-runtime/video-reference-variant.ts`
- Test: `apps/worker/test/video-reference-variant.test.ts`

- [ ] **Step 1: Write failing tests for the sizing and command contract.** Cover landscape `1920x1080 -> 1280x720`, portrait `1080x1920 -> 720x1280`, 4:3 `1920x1440 -> 960x720`, already-compliant sources being skipped, odd output dimensions being rounded down to even values, and FFmpeg args containing H.264, `yuv420p`, `+faststart`, and an MP4 output.

```ts
expect(resolveReferenceVideoTargetSize(1920, 1440)).toEqual({ height: 720, width: 960 });
expect(resolveReferenceVideoTargetSize(1920, 1080)).toEqual({ height: 720, width: 1280 });
expect(isReferenceVideoSizeCompliant(1280, 720)).toBe(true);
expect(isReferenceVideoSizeCompliant(1920, 1080)).toBe(false);
expect(buildReferenceVideoFfmpegArgs("input.mp4", "output.mp4", { height: 720, width: 960 })).toEqual(expect.arrayContaining(["-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart"]));
```

- [ ] **Step 2: Run the test to confirm it fails** because the helpers do not exist.

Run: `npm run test --workspace @aigc-flow/worker -- video-reference-variant.test.ts`

- [ ] **Step 3: Implement the helpers.** Export `isReferenceVideoSizeCompliant(width, height)`, `resolveReferenceVideoTargetSize(width, height)`, `buildReferenceVideoFfmpegArgs(inputPath, outputPath, target)`, and `transcodeReferenceVideo(input, output, deps)`; choose the `1280x720` or `720x1280` fit box by orientation, preserve aspect ratio, round dimensions down to even values, and use `execFile` with a bounded timeout.

- [ ] **Step 4: Run the helper tests and build the worker package.**

Run: `npm run test --workspace @aigc-flow/worker -- video-reference-variant.test.ts`

Run: `npm run build --workspace @aigc-flow/worker`

- [ ] **Step 5: Commit.**

```bash
git add apps/worker/src/workflow-runtime/video-reference-variant.ts apps/worker/test/video-reference-variant.test.ts
git commit -m "feat(worker): add reference video 720p transcode helpers"
```

## Task 3: Add the worker processor and queue registration

**Files:**
- Create: `apps/worker/src/workflow-runtime/video-reference-variant-processor.ts`
- Create: `apps/worker/src/processors/asset-video-reference-variant.processor.ts`
- Modify: `apps/worker/src/queues/registry.ts`
- Modify: `apps/worker/src/main.ts`
- Modify: `apps/worker/src/config/env.ts`
- Test: `apps/worker/test/video-reference-variant-processor.test.ts`

- [ ] **Step 1: Write processor tests before implementation.** Mock a tenant-scoped asset row and S3 provider. Assert non-video assets are ignored, compliant videos create a `reference-720p` row pointing at the original only when the variant contract permits it, high-resolution videos call FFmpeg and write an MP4, repeat processing upserts the same `(asset_id, variant_key)`, and FFmpeg failure sets `referenceVideoVariantStatus=failed` without changing the original asset.

- [ ] **Step 2: Run the focused worker tests and confirm failure.**

Run: `npm run test --workspace @aigc-flow/worker -- video-reference-variant-processor.test.ts`

- [ ] **Step 3: Implement tenant-safe processing.** Query `assets` by both `id` and `tenant_id` with `status='available'`; set metadata status to `pending`; read the original through `storageProvider.getObject`; probe dimensions; skip physical transcoding for compliant assets but still record a ready decision; otherwise write an object key from `buildAssetObjectKey({ assetId, filename: "reference-720p.mp4", tenantId })`; upsert `asset_variants` with actual dimensions and metadata; finally set status `ready`. On any processing error, set status `failed` with a short sanitized error code and rethrow for BullMQ retry.

- [ ] **Step 4: Register the queue.** Add `assetVideoReferenceVariant` to `WORKER_QUEUE_NAMES`, `WorkerQueueConcurrency`, queue creation/closing in `main.ts`, and the registry branch that invokes `processAssetVideoReferenceVariantJob`.

- [ ] **Step 5: Add `ASSET_VIDEO_REFERENCE_VARIANT_CONCURRENCY`.** Parse it with the same positive-integer helper as image variant concurrency, default to `1`, and pass it through `main.ts`. Add the variable to `x-tapflow-env` in `docker-compose.staging.yml` and the placeholder in `docs/STAGING_ENV_TEMPLATE.md`.

- [ ] **Step 6: Run focused tests/build and commit.**

Run: `npm run test --workspace @aigc-flow/worker -- video-reference-variant-processor.test.ts`

Run: `npm run build --workspace @aigc-flow/worker`

```bash
git add apps/worker/src/workflow-runtime/video-reference-variant-processor.ts apps/worker/src/processors/asset-video-reference-variant.processor.ts apps/worker/src/queues/registry.ts apps/worker/src/main.ts apps/worker/src/config/env.ts apps/worker/test/video-reference-variant-processor.test.ts docker-compose.staging.yml docs/STAGING_ENV_TEMPLATE.md
git commit -m "feat(worker): process uploaded reference video variants"
```

## Task 4: Enqueue processing after API upload completion

**Files:**
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/modules/assets/assets.service.ts`
- Modify: `apps/api/src/modules/assets/assets.routes.ts` only if route wiring needs the queue type
- Test: `apps/api/test/assets.test.ts`

- [ ] **Step 1: Write the failing service test.** Construct `AssetsService` with a fake queue and assert `completeUpload` adds `{ tenantId, assetId, traceId }` only for a completed `video` asset, with the fixed `jobId: `${assetId}:reference-720p``; assert repeated processing is harmless because the processor upserts the same `(asset_id, variant_key)` even if BullMQ has removed a completed job.

- [ ] **Step 2: Run the test and confirm the queue injection is missing.**

Run: `npm run test --workspace @aigc-flow/api -- assets.test.ts`

- [ ] **Step 3: Inject a lightweight queue interface into `AssetsService`.** Pass the API app's `assetVideoReferenceVariantQueue` from `app.ts`; after the transaction returns an available asset, call `queue.add("prepare-reference-720p", payload, { jobId, removeOnComplete: true })` only when `asset.kind === "video"`. Do not put URLs, file bytes, or request bodies in the job.

- [ ] **Step 4: Make retry/idempotency explicit.** Treat BullMQ duplicate-job errors as success for the already-completed asset, and leave the upload completion response independent from the worker's eventual processing result.

- [ ] **Step 5: Run API tests/build and commit.**

Run: `npm run test --workspace @aigc-flow/api -- assets.test.ts`

Run: `npm run build --workspace @aigc-flow/api`

```bash
git add apps/api/src/app.ts apps/api/src/modules/assets/assets.service.ts apps/api/src/modules/assets/assets.routes.ts apps/api/test/assets.test.ts
git commit -m "feat(api): enqueue reference video processing after upload"
```

## Task 5: Select the prepared variant during H3video URL hydration

**Files:**
- Modify: `apps/worker/src/workflow-runtime/service.ts`
- Test: `apps/worker/test/worker.test.ts` or the closest existing workflow-runtime test file

- [ ] **Step 1: Write failing tests around `hydrateInputAssetUrls`.** Use an H3video request containing a `reference_video` asset and a fake `asset_variants` lookup. Assert a compliant original uses the original URL, a high-resolution original uses a signed URL for `reference-720p`, a missing variant throws `REFERENCE_VIDEO_VARIANT_PROCESSING`, a failed status throws `REFERENCE_VIDEO_VARIANT_FAILED`, and the provider runtime is never called in either blocking case.

- [ ] **Step 2: Run the focused tests and confirm they fail** because hydration currently signs `assets.object_key` unconditionally.

Run: `npm run test --workspace @aigc-flow/worker -- worker.test.ts -t "reference video"`

- [ ] **Step 3: Implement route-scoped selection.** Pass the request route key into hydration. For `video.pixellelabs.h3video-2k` references whose `videoReference.role` is `reference_video` or `source_video`, query `asset_variants` for `reference-720p`; if the source fits the 1280x720/720x1280 constraint, retain the original; otherwise sign the variant object. Never fall back to the original for an oversized source.

- [ ] **Step 4: Preserve security and persistence boundaries.** Keep signed URLs only in the in-memory provider request metadata; do not write them to graph JSON, node data, `flow_drafts`, or logs. Use tenant-scoped queries for both original and variant rows.

- [ ] **Step 5: Run worker tests/build and commit.**

Run: `npm run test --workspace @aigc-flow/worker -- worker.test.ts -t "reference video"`

Run: `npm run build --workspace @aigc-flow/worker`

```bash
git add apps/worker/src/workflow-runtime/service.ts apps/worker/test/worker.test.ts
git commit -m "fix(worker): use prepared 720p H3 reference videos"
```

## Task 6: Surface upload processing state in the frontend

**Files:**
- Modify: `src/assets/assetApi.ts`
- Modify: `src/assets/assetApi.test.ts`
- Modify: `src/flowCanvas/nodes/FlowNodes.tsx`
- Test: `src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx` or the focused video node test

- [ ] **Step 1: Write failing frontend tests.** Assert a high-resolution reference with `referenceVideoVariantStatus=pending` disables generation and shows `参考视频处理中，请稍后再生成`; failed status shows `参考视频处理失败，请重新上传`; a compliant video remains immediately generatable.

- [ ] **Step 2: Extend asset typing and metadata acquisition.** Add the status metadata key to `AssetItem.metadata` usage and, when a video upload does not provide dimensions, use a small `readVideoMetadata(file)` helper based on `HTMLVideoElement.loadedmetadata`; do not store a Blob URL in node data.

- [ ] **Step 3: Implement state refresh without user choice.** After a video reference upload, retain the asset ID and poll `getAsset(assetId)` at a bounded interval while status is pending; update node input state when the status becomes ready or failed. Disable only the affected generation action, leaving the original asset visible.

- [ ] **Step 4: Run focused frontend tests/build and commit.**

Run: `npm run test -- src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx src/assets/assetApi.test.ts`

Run: `npm run build`

```bash
git add src/assets/assetApi.ts src/assets/assetApi.test.ts src/flowCanvas/nodes/FlowNodes.tsx src/flowCanvas/nodes/FlowNodes.agent-metadata.test.tsx
git commit -m "feat(canvas): show reference video processing state"
```

## Task 7: End-to-end verification and project record

**Files:**
- Modify: `PROJECT_RECORD.md`
- Test: relevant API, worker, Redis, and frontend test files from Tasks 1-6

- [ ] **Step 1: Run focused package tests.**

Run: `npm test`

Run: `npm run test --workspace @aigc-flow/api`

Run: `npm run test --workspace @aigc-flow/worker`

Run: `npm run test --workspace @aigc-flow/redis`

- [ ] **Step 2: Run the production build and diff checks.**

Run: `npm run build`

Run: `git diff --check`

- [ ] **Step 3: Perform a local smoke test.** Start `npm run dev:infra`, API, worker, and frontend; upload a known high-resolution MP4; verify the original remains downloadable, `reference-720p` appears with dimensions within the orientation box, and an H3video all-reference request sends only the prepared variant. Verify pending/failed cases stop before provider invocation and do not create usage events.

- [ ] **Step 4: Update `PROJECT_RECORD.md`.** Record the queue, variant key, H3video route behavior, validation commands, and any environment variable added. Do not include real storage credentials or signed URLs.

- [ ] **Step 5: Review the final diff and commit the record.**

```bash
git add PROJECT_RECORD.md
git commit -m "docs: record reference video variant pipeline"
```

## Self-Review Checklist

- Spec coverage: original preservation, upload-time processing, orientation-safe 720p sizing, idempotent storage, pending/failed fail-closed behavior, billing protection, frontend status, and verification are covered by Tasks 1-7.
- Placeholder scan: no unfilled implementation placeholder remains; each task names files, test commands, expected behavior, and commit boundaries.
- Type consistency: `AssetVideoReferenceVariantJobPayload`, `QUEUE_NAMES.assetVideoReferenceVariant`, `reference-720p`, `REFERENCE_VIDEO_VARIANT_PROCESSING`, and `REFERENCE_VIDEO_VARIANT_FAILED` are used consistently across API, worker, and tests.
- Security: queue payloads contain IDs only; signed URLs stay in memory and provider requests; all asset/variant queries include tenant scope.
