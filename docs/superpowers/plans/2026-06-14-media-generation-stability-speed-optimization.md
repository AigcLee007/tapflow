# Media Generation Stability and Speed Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve image/video generation reliability and reduce the time from provider completion to visible canvas result without weakening the current OSS-backed asset persistence model.

**Architecture:** Keep the stable v2 path: provider result -> worker -> OSS/S3 asset -> `assets` / `asset_variants` -> `node_runs.output_json` -> canvas assetId + signed preview URL. Optimize by adding stage-level timing, returning first visible assets sooner, moving expensive preview/video post-processing to background work, and separating image/video queue pressure.

**Tech Stack:** Vite + React canvas frontend, Fastify API, BullMQ/Redis worker queues, Postgres, S3-compatible object storage, `sharp` image processing, existing v2 AI Gateway runtime.

---

## Current Chain and Bottlenecks

Current stable chain:

1. Frontend calls `runBackendWorkflow()` in `src/flowCanvas/runtime/v2WorkflowRunner.ts`.
2. Frontend saves the latest remote draft before run creation.
3. API creates `workflow_runs` and `node_runs` in `apps/api/src/modules/workflow-runs/workflow-runs.service.ts`.
4. API reserves billing credits and enqueues worker jobs.
5. Worker executes `image.generate` or `video.generate` in `apps/worker/src/workflow-runtime/service.ts`.
6. Worker calls AI Gateway provider adapters.
7. Worker receives provider outputs as URLs or base64.
8. Worker downloads/decodes provider output in `apps/worker/src/workflow-runtime/media-asset-store.ts`.
9. Worker uploads original output to OSS/S3 and writes `assets`.
10. Worker synchronously creates image variants and writes `asset_variants`.
11. Worker updates `node_runs.output_json`, patches target node draft, and emits completion events.
12. Frontend finalizes the run, calls asset APIs for signed preview URLs, and updates canvas node data.

Known bottlenecks:

- Provider time is usually the largest unavoidable block.
- After provider completion, large videos pay a worker download + OSS upload cost before users see anything.
- Images currently generate variants synchronously before the node can complete.
- Frontend performs an extra signed URL resolution after terminal node status.
- Image and video work can compete for worker capacity.
- There is not enough stage-level timing to know which segment is slow in production.

Optimization principles:

- Do not show provider/private upstream URLs as durable canvas data.
- Do not store base64/blob/data URLs in draft JSON.
- Do not mark billing settled until durable persistence has succeeded or a clearly recoverable state exists.
- Prefer faster first visible result while preserving recoverability through `assetId`.
- Keep rollback simple: feature flags or queue routing can return to current synchronous behavior.

## Target Metrics

Add these measurable targets before performance work begins:

- `provider_latency_ms`: provider request start to provider result completion.
- `provider_output_download_ms`: provider output URL/base64 to local binary buffer.
- `asset_original_upload_ms`: original binary upload to OSS/S3.
- `asset_db_insert_ms`: `assets` insert/update time.
- `asset_variant_enqueue_ms`: async variant job enqueue time.
- `asset_variant_processing_ms`: background preview/thumbnail generation time.
- `node_output_persist_ms`: `node_runs.output_json` and draft patch time.
- `canvas_first_visible_ms`: frontend run created to first visible asset URL applied.
- `provider_finished_to_canvas_visible_ms`: provider completed to canvas visible.

Success thresholds for the first optimization pass:

- Image provider-finished-to-visible p50 under 2s for normal-size outputs.
- Image provider-finished-to-visible p95 under 5s excluding provider latency.
- Video provider-finished-to-visible p50 improved by at least 25 percent compared with baseline.
- No increase in failed/corrupt asset rate.
- Asset recovery after page refresh remains reliable through `assetId`.

## Phase 0: Baseline Instrumentation

### Task 0.1: Add Worker Stage Timing Helpers

**Files:**

- Modify: `apps/worker/src/workflow-runtime/service.ts`
- Modify: `apps/worker/src/workflow-runtime/media-asset-store.ts`
- Test: `apps/worker/src/workflow-runtime/service.test.ts` if present, otherwise add focused tests beside existing worker runtime tests

- [ ] **Step 1: Inspect existing worker test locations**

Run:

```bash
rg -n "workflow media assets persisted|MediaAssetStore|persistOutputs|provider image generation" apps/worker/src apps/worker/test apps/worker -g "*.test.ts" -g "*.ts"
```

Expected: identify existing tests that cover worker media persistence and logging.

- [ ] **Step 2: Define timing fields in code comments and log payloads**

In `apps/worker/src/workflow-runtime/service.ts`, add timing fields to the existing log around `"provider image generation request started"`, `"provider image generation request finished"`, and `"workflow media assets persisted"`.

Use exact field names:

```ts
provider_latency_ms
media_persist_total_ms
provider_finished_to_asset_persisted_ms
```

In `apps/worker/src/workflow-runtime/media-asset-store.ts`, return per-asset timing metadata internally from persistence:

```ts
type PersistedAssetTiming = {
  assetId: string;
  asset_db_insert_ms: number;
  asset_original_upload_ms: number;
  asset_variant_processing_ms: number;
  provider_output_download_ms: number;
};
```

Keep this timing server-side only. Do not expose provider names, upstream URLs, or secrets to frontend responses.

- [ ] **Step 3: Add tests for timing shape**

Add a test that stubs provider output download and storage upload, then asserts the persisted output path includes non-negative timing values in logs or internal returned metadata.

Use assertions like:

```ts
expect(timing.provider_output_download_ms).toBeGreaterThanOrEqual(0);
expect(timing.asset_original_upload_ms).toBeGreaterThanOrEqual(0);
expect(timing.asset_db_insert_ms).toBeGreaterThanOrEqual(0);
```

- [ ] **Step 4: Run worker tests**

Run:

```bash
npm run test --workspace @aigc-flow/worker
```

Expected: worker tests pass. If local infra is required, document the exact missing dependency and run the focused unit test command that does not require infra.

- [ ] **Step 5: Commit**

```bash
git add apps/worker/src/workflow-runtime/service.ts apps/worker/src/workflow-runtime/media-asset-store.ts apps/worker/src/**/*.test.ts
git commit -m "chore: instrument media generation persistence timing"
```

### Task 0.2: Add Frontend First-Visible Timing

**Files:**

- Modify: `src/flowCanvas/runtime/v2WorkflowRunner.ts`
- Test: `src/flowCanvas/runtime/v2WorkflowRunner.test.ts`

- [ ] **Step 1: Write failing test**

In `src/flowCanvas/runtime/v2WorkflowRunner.test.ts`, add a test that simulates a terminal run with asset output and verifies a frontend timing marker is recorded when `thumbnailUrl` or `posterUrl` is applied.

Expected behavior:

```ts
expect(updatedNode?.data.workflowLaunchStatus).toBe("visible");
expect(typeof updatedNode?.data.workflowLaunchUpdatedAt).toBe("number");
```

If `workflowLaunchStatus: "visible"` is too broad for current type usage, use a more specific status:

```ts
workflowLaunchStatus: "asset_visible"
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run src/flowCanvas/runtime/v2WorkflowRunner.test.ts
```

Expected: new test fails because first-visible state is not recorded.

- [ ] **Step 3: Implement minimal marker**

In `buildGeneratedAssetNodePatch()`, when an image/video asset patch is built, include:

```ts
workflowLaunchStatus: "asset_visible",
workflowLaunchUpdatedAt: Date.now(),
```

Do not alter asset persistence semantics.

- [ ] **Step 4: Run test to verify pass**

Run:

```bash
npx vitest run src/flowCanvas/runtime/v2WorkflowRunner.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/flowCanvas/runtime/v2WorkflowRunner.ts src/flowCanvas/runtime/v2WorkflowRunner.test.ts
git commit -m "chore: track canvas media first visible timing"
```

## Phase 1: Remove Synchronous Image Variant Blocking

### Task 1.1: Split Original Asset Persistence from Variant Creation

**Files:**

- Modify: `apps/worker/src/workflow-runtime/media-asset-store.ts`
- Create: `apps/worker/src/workflow-runtime/media-variant-jobs.ts`
- Test: existing worker media asset store tests or new focused test file

- [ ] **Step 1: Write failing test for immediate asset ref return**

Create or update a test for `MediaAssetStore.persistOutputs()`:

```ts
test("returns image asset refs after original upload without waiting for variant creation when async variants are enabled", async () => {
  const store = new MediaAssetStore({
    assetBucket: "bucket",
    storageProvider,
    variantMode: "async",
  });

  const refs = await store.persistOutputs(client, {
    kind: "image",
    nodeRunId: "node-run-id",
    outputs: [{ base64: pngBase64, mimeType: "image/png" }],
    projectId: "project-id",
    tenantId: "tenant-id",
    workflowRunId: "workflow-run-id",
  });

  expect(refs).toHaveLength(1);
  expect(refs[0].assetId).toBeTruthy();
  expect(variantQueue.add).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ assetId: refs[0].assetId }),
  );
});
```

Expected: test fails because variants are currently created synchronously.

- [ ] **Step 2: Add variant mode option**

In `MediaAssetStore` constructor, add:

```ts
variantMode?: "sync" | "async";
variantQueue?: {
  add(name: string, payload: Record<string, unknown>): Promise<unknown>;
};
```

Default to `"sync"` to preserve current behavior during rollout.

- [ ] **Step 3: Enqueue async variant job after original asset insert**

If `input.kind === "image"` and `variantMode === "async"`, enqueue:

```ts
await this.variantQueue.add("asset.image-variants.create", {
  assetId,
  bucket: this.assetBucket,
  objectKey,
  tenantId: input.tenantId,
  nodeRunId: input.nodeRunId,
  workflowRunId: input.workflowRunId,
});
```

Skip synchronous `createImageVariants()` in async mode.

- [ ] **Step 4: Keep sync mode unchanged**

If `variantMode === "sync"`, run the existing `createImageVariants()` and `asset_variants` insert flow exactly as today.

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm run test --workspace @aigc-flow/worker
```

Expected: existing sync behavior tests and new async behavior tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/worker/src/workflow-runtime/media-asset-store.ts apps/worker/src/workflow-runtime/media-variant-jobs.ts apps/worker/src/**/*.test.ts
git commit -m "feat: allow async image variant persistence"
```

### Task 1.2: Add Worker Processor for Image Variants

**Files:**

- Modify: `apps/worker/src/main.ts`
- Modify: queue constants file where `QUEUE_NAMES` is defined
- Create: `apps/worker/src/workflow-runtime/image-variant-processor.ts`
- Test: worker processor test

- [ ] **Step 1: Find queue constant source**

Run:

```bash
rg -n "QUEUE_NAMES|providerPoll|nodeExecute" apps packages -g "*.ts"
```

Expected: identify the shared queue names module used by worker and API.

- [ ] **Step 2: Add queue name**

Add:

```ts
assetImageVariant: "asset-image-variant"
```

or follow existing naming style.

- [ ] **Step 3: Implement processor**

Create `apps/worker/src/workflow-runtime/image-variant-processor.ts` with a processor that:

- loads the original asset row by `assetId` and `tenantId`
- reads the original object from storage
- calls `createImageVariants()`
- uploads each variant to OSS/S3
- upserts `asset_variants`
- is idempotent through `ON CONFLICT (asset_id, variant_key) DO UPDATE`

Pseudo-code:

```ts
export async function processImageVariantJob(input: ImageVariantJobInput): Promise<void> {
  const asset = await loadAsset(input.assetId, input.tenantId);
  const original = await storageProvider.getObject({ bucket: asset.bucket, key: asset.objectKey });
  const variants = await createImageVariants({ body: original.body, mimeType: asset.mimeType });
  for (const variant of variants) {
    await storageProvider.putObject({ bucket: asset.bucket, key: variantObjectKey, body: variant.body, contentType: variant.mimeType });
    await upsertAssetVariant(...);
  }
}
```

- [ ] **Step 4: Register worker queue**

In `apps/worker/src/main.ts`, instantiate a BullMQ worker for the image variant queue using the same Redis connection pattern as existing workers.

- [ ] **Step 5: Add retry/backoff**

Configure retries:

```ts
attempts: 3,
backoff: { type: "exponential", delay: 2000 }
```

This must not fail the original generation after the original asset is already available.

- [ ] **Step 6: Run worker build and tests**

Run:

```bash
npm run test --workspace @aigc-flow/worker
npm run build --workspace @aigc-flow/worker
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add apps/worker/src/main.ts apps/worker/src/workflow-runtime/image-variant-processor.ts apps/worker/src/**/*.test.ts packages/**/*
git commit -m "feat: process image variants asynchronously"
```

### Task 1.3: Make Frontend Preview Fallback Robust While Variants Are Pending

**Files:**

- Modify: `src/flowCanvas/runtime/v2WorkflowRunner.ts`
- Modify: `src/assets/assetApi.ts` if needed
- Test: `src/flowCanvas/runtime/v2WorkflowRunner.test.ts`

- [ ] **Step 1: Write failing test**

Add a test where `getAssetVariantUrl(assetId, "preview")` returns `404`, then `getAssetVariantUrl(assetId)` returns a valid original signed URL.

Assert:

```ts
expect(updatedNode?.data.thumbnailUrl).toBe("https://cdn.test/original.png?sig=1");
expect(updatedNode?.data.assetId).toBe("asset-1");
```

- [ ] **Step 2: Verify existing behavior**

Run:

```bash
npx vitest run src/flowCanvas/runtime/v2WorkflowRunner.test.ts
```

Expected: if this already passes, keep the test as regression coverage. If it fails, implement fallback.

- [ ] **Step 3: Keep original fallback**

Ensure `resolveAssetRefs()` does:

```ts
const download = await getAssetVariantUrl(asset.assetId, "preview")
  .catch(() => getAssetVariantUrl(asset.assetId));
```

If already present, only add/adjust the test.

- [ ] **Step 4: Commit**

```bash
git add src/flowCanvas/runtime/v2WorkflowRunner.ts src/flowCanvas/runtime/v2WorkflowRunner.test.ts
git commit -m "test: cover original asset fallback before preview variants"
```

## Phase 2: Queue Isolation for Image and Video

### Task 2.1: Split Worker Concurrency by Modality

**Files:**

- Modify: queue constants file
- Modify: `apps/api/src/modules/workflow-runs/workflow-runs.service.ts`
- Modify: `apps/worker/src/main.ts`
- Modify: `apps/worker/src/config/env.ts`
- Test: workflow run service queue routing tests

- [ ] **Step 1: Add queue constants**

Add:

```ts
nodeExecuteImage: "node-execute-image",
nodeExecuteVideo: "node-execute-video",
nodeExecuteDefault: "node-execute-default"
```

Keep the old queue active during migration or route it to default.

- [ ] **Step 2: Write failing API queue routing test**

Test that:

- `image.generate` target-node run enqueues image queue
- `video.generate` target-node run enqueues video queue
- text/output nodes use default queue

Expected assertion:

```ts
expect(nodeExecuteQueue.add).toHaveBeenCalledWith(
  QUEUE_NAMES.nodeExecuteVideo,
  expect.objectContaining({ nodeType: "video.generate" }),
  expect.any(Object),
);
```

- [ ] **Step 3: Implement queue selection helper**

In workflow run service:

```ts
function getNodeExecuteQueueName(nodeType: string): string {
  if (nodeType === "image.generate") return QUEUE_NAMES.nodeExecuteImage;
  if (nodeType === "video.generate") return QUEUE_NAMES.nodeExecuteVideo;
  return QUEUE_NAMES.nodeExecuteDefault;
}
```

Use it when adding node execute jobs.

- [ ] **Step 4: Configure worker concurrency**

In `apps/worker/src/config/env.ts`, add:

```ts
WORKER_IMAGE_CONCURRENCY
WORKER_VIDEO_CONCURRENCY
WORKER_DEFAULT_CONCURRENCY
```

Recommended initial staging values:

- image: `4`
- video: `1`
- default: `4`

- [ ] **Step 5: Register separate BullMQ workers**

In `apps/worker/src/main.ts`, create separate workers for image, video, and default queues using the same execution service.

- [ ] **Step 6: Keep backward compatibility**

Keep a worker listening to the old node execute queue for one deploy cycle or route old queue messages into default execution.

- [ ] **Step 7: Run tests and builds**

Run:

```bash
npm run test --workspace @aigc-flow/api
npm run test --workspace @aigc-flow/worker
npm run build --workspace @aigc-flow/api
npm run build --workspace @aigc-flow/worker
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/workflow-runs apps/worker/src packages/**/*
git commit -m "feat: isolate media generation worker queues"
```

## Phase 3: Faster Video Visibility

### Task 3.1: Return Original Video Asset Before Poster or Transcode Work

**Files:**

- Modify: `apps/worker/src/workflow-runtime/media-asset-store.ts`
- Modify: `src/flowCanvas/runtime/v2WorkflowRunner.ts`
- Test: worker media persistence test and frontend workflow runner test

- [ ] **Step 1: Confirm video currently skips image variants**

Read `apps/worker/src/workflow-runtime/media-asset-store.ts` and confirm whether `createImageVariants()` is called for video outputs. If it is called for video, fix it so variants only run for image MIME types.

Implementation guard:

```ts
if (input.kind === "image") {
  const variants = await createImageVariants(...);
}
```

- [ ] **Step 2: Add video first-visible frontend test**

In `src/flowCanvas/runtime/v2WorkflowRunner.test.ts`, simulate a `video.generate` succeeded node with:

```ts
assets: [{ assetId: "video-1", kind: "video", mimeType: "video/mp4" }]
```

Assert:

```ts
expect(updatedNode?.data.assetId).toBe("video-1");
expect(updatedNode?.data.posterUrl).toContain("video-1");
expect(updatedNode?.data.generationStatus).toBe("done");
```

- [ ] **Step 3: Ensure signed original URL fallback for video**

If preview variant is unavailable for video, `resolveAssetRefs()` must fall back to original signed URL exactly as image does.

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/flowCanvas/runtime/v2WorkflowRunner.test.ts
npm run test --workspace @aigc-flow/worker
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/flowCanvas/runtime/v2WorkflowRunner.ts src/flowCanvas/runtime/v2WorkflowRunner.test.ts apps/worker/src/workflow-runtime/media-asset-store.ts apps/worker/src/**/*.test.ts
git commit -m "fix: show video assets as soon as originals persist"
```

### Task 3.2: Add Optional Video Poster Job

**Files:**

- Create: `apps/worker/src/workflow-runtime/video-poster-processor.ts`
- Modify: `apps/worker/src/main.ts`
- Modify: queue constants file
- Test: worker video poster processor test

- [ ] **Step 1: Add queue name**

Add:

```ts
assetVideoPoster: "asset-video-poster"
```

- [ ] **Step 2: Add poster job input type**

```ts
type VideoPosterJobInput = {
  assetId: string;
  bucket: string;
  objectKey: string;
  tenantId: string;
  workflowRunId: string;
  nodeRunId: string;
};
```

- [ ] **Step 3: Implement no-op safe processor first**

Because video poster extraction may require ffmpeg availability, start with a processor that:

- logs if poster extraction is disabled
- exits successfully
- does not block video visibility

Feature flag:

```txt
WORKER_VIDEO_POSTER_ENABLED=false
```

- [ ] **Step 4: Add poster extraction only if runtime support exists**

If ffmpeg or another approved dependency is available, extract one poster frame and write `asset_variants` with `variant_key = 'poster'`. Do not add a new production dependency unless approved.

- [ ] **Step 5: Run tests/build**

```bash
npm run test --workspace @aigc-flow/worker
npm run build --workspace @aigc-flow/worker
```

Expected: pass with poster disabled by default.

- [ ] **Step 6: Commit**

```bash
git add apps/worker/src/main.ts apps/worker/src/workflow-runtime/video-poster-processor.ts apps/worker/src/**/*.test.ts packages/**/*
git commit -m "feat: add optional async video poster processing"
```

## Phase 4: Reduce Generate-Start Latency

### Task 4.1: Skip Redundant Draft Flush When Autosave Is Fresh

**Files:**

- Modify: `src/flowCanvas/runtime/v2WorkflowRunner.ts`
- Modify: `src/flowCanvas/store/flowCanvasStore.ts` if draft freshness state is missing
- Test: `src/flowCanvas/runtime/v2WorkflowRunner.test.ts`

- [ ] **Step 1: Write failing test**

Simulate target-node generation when the draft is already saved and graph revision is current.

Assert:

```ts
expect(saveNowMock).not.toHaveBeenCalled();
expect(createWorkflowRunMock).toHaveBeenCalled();
```

- [ ] **Step 2: Add freshness helper**

Define a helper:

```ts
function shouldFlushDraftBeforeRun(state: FlowCanvasState, targetNodeId?: string): boolean {
  if (!state.backendFlowId) return true;
  if (state.remoteDraftSaveStatus === "saving") return true;
  if (state.hasUnsavedRemoteDraftChanges) return true;
  if (targetNodeId && state.lastRemoteSavedAt && Date.now() - state.lastRemoteSavedAt < 1500) return false;
  return true;
}
```

Use actual store property names. If names differ, adapt the helper and test to existing state.

- [ ] **Step 3: Implement conditional flush**

In `runBackendWorkflow()`, replace unconditional `await flushRemoteDraftBeforeRun()` with:

```ts
if (shouldFlushDraftBeforeRun(useFlowCanvasStore.getState(), options?.targetNodeId)) {
  await flushRemoteDraftBeforeRun();
}
```

- [ ] **Step 4: Preserve safety fallback**

If state freshness cannot be determined, flush as current behavior.

- [ ] **Step 5: Run tests**

```bash
npx vitest run src/flowCanvas/runtime/v2WorkflowRunner.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/flowCanvas/runtime/v2WorkflowRunner.ts src/flowCanvas/runtime/v2WorkflowRunner.test.ts src/flowCanvas/store/flowCanvasStore.ts
git commit -m "perf: skip redundant draft flush before media runs"
```

## Phase 5: Production/Staging Rollout

### Task 5.1: Add Environment Flags and Documentation

**Files:**

- Modify: `docker-compose.staging.yml`
- Modify: `docs/STAGING_ENV_TEMPLATE.md`
- Modify: `docs/PRODUCTION_RUNBOOK.md`
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Add env placeholders**

Add placeholders:

```txt
WORKER_IMAGE_CONCURRENCY=4
WORKER_VIDEO_CONCURRENCY=1
WORKER_DEFAULT_CONCURRENCY=4
WORKER_IMAGE_VARIANTS_MODE=async
WORKER_VIDEO_POSTER_ENABLED=false
```

- [ ] **Step 2: Wire compose variables**

In `docker-compose.staging.yml`, ensure each worker-needed env var is included in `x-tapflow-env`.

- [ ] **Step 3: Add rollout section**

Document rollout:

```bash
cd /opt/aittco/tapflow
git fetch --all --prune
git pull --ff-only origin main
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml build
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml stop tapflow-worker
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm tapflow-api node packages/db/dist/cli.js
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml up -d tapflow-redis tapflow-api tapflow-worker tapflow-frontend
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml logs --tail=100 tapflow-worker tapflow-api
```

- [ ] **Step 4: Add rollback section**

Rollback flags:

```txt
WORKER_IMAGE_VARIANTS_MODE=sync
WORKER_VIDEO_POSTER_ENABLED=false
WORKER_VIDEO_CONCURRENCY=1
```

Rollback code:

```bash
git checkout <previous_good_commit>
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml build
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml up -d tapflow-worker tapflow-api tapflow-frontend
```

- [ ] **Step 5: Commit**

```bash
git add docker-compose.staging.yml docs/STAGING_ENV_TEMPLATE.md docs/PRODUCTION_RUNBOOK.md PROJECT_RECORD.md
git commit -m "docs: document media generation performance rollout"
```

### Task 5.2: Staging Smoke Test

**Files:**

- Modify: `docs/PRODUCTION_RUNBOOK.md` if smoke commands need updates
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Run image smoke**

Create a small image generation from the canvas.

Record:

- time from click to provider waiting/running
- time from provider completion to visible canvas image
- asset appears in `/assets`
- page refresh restores image from `assetId`

- [ ] **Step 2: Run video smoke**

Create a short video generation from the canvas.

Record:

- time from click to provider waiting/running
- time from provider completion to visible canvas video/poster/original URL
- asset appears in `/assets`
- page refresh restores video from `assetId`

- [ ] **Step 3: Inspect worker logs**

Run:

```bash
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml logs --tail=300 tapflow-worker
```

Expected: logs contain stage timing fields and no repeated variant/poster failures.

- [ ] **Step 4: Inspect API logs**

Run:

```bash
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml logs --tail=150 tapflow-api
```

Expected: no asset signed URL or workflow finalization errors.

- [ ] **Step 5: Record staging result**

Update `PROJECT_RECORD.md` with:

- commit hash
- staging env values
- image/video timing summary
- any residual issues

- [ ] **Step 6: Commit staging notes**

```bash
git add PROJECT_RECORD.md docs/PRODUCTION_RUNBOOK.md
git commit -m "docs: record media generation performance smoke results"
```

## Phase 6: Later High-Impact Options

These should be evaluated after Phases 0-5 produce baseline data.

### Option A: Provider Webhook Reconciliation

Use when providers can notify completion instead of worker polling.

Implementation direction:

- Add provider task callback endpoint under authenticated/internal API.
- Validate webhook signatures if provider supports them.
- Store provider task status updates in DB.
- Enqueue persistence job when provider says output is ready.
- Keep polling fallback for providers without webhooks.

Expected benefit:

- Lower worker occupancy for long video generations.
- Faster completion detection when provider supports webhook.

Risk:

- More external integration surface.
- Requires provider-specific security checks.

### Option B: Provider Direct-to-OSS

Use only if provider supports customer-supplied upload URLs or storage destinations.

Implementation direction:

- Create short-lived presigned PUT URL for provider output.
- Provider writes directly to our bucket.
- Worker verifies object with `headObject`, writes `assets`, and patches node.
- Never expose broad OSS credentials to providers.

Expected benefit:

- Avoid worker downloading and re-uploading large videos.
- Major speed improvement for video post-provider latency.

Risk:

- Provider support varies.
- Must carefully scope presigned URLs and validate uploaded object type/size.

### Option C: CDN Acceleration for Preview URLs

Use if OSS region/network is a bottleneck.

Implementation direction:

- Put CDN in front of preview/original GET URLs.
- Keep signed URL security.
- Prefer preview variants for images, original for videos until poster/transcode exists.

Expected benefit:

- Faster canvas display and asset library browsing.

Risk:

- Cache invalidation and signed URL behavior need testing.

## Verification Matrix

Run after implementation:

```bash
npx vitest run src/flowCanvas/runtime/v2WorkflowRunner.test.ts
npm run test --workspace @aigc-flow/api
npm run test --workspace @aigc-flow/worker
npm run build --workspace @aigc-flow/api
npm run build --workspace @aigc-flow/worker
npm run build
```

Manual checks:

- Image generation result appears on canvas.
- Image asset appears in `/assets`.
- Refresh restores image via `assetId`.
- Video generation result appears on canvas.
- Video asset appears in `/assets`.
- Refresh restores video via `assetId`.
- Failed variant/poster jobs do not mark generation failed after original asset is available.
- Billing reserve/settle/refund behavior remains unchanged.

## Recommended Execution Order

1. Phase 0 instrumentation.
2. Deploy instrumentation only to staging and capture baseline.
3. Phase 1 async image variants.
4. Phase 2 queue isolation.
5. Phase 3 video first-visible and optional poster job.
6. Phase 4 draft flush optimization.
7. Phase 5 staging rollout and smoke validation.
8. Decide whether Option A/B/C is worth implementing based on timing data.

## Rollback Strategy

Fast rollback without database restore:

- Set `WORKER_IMAGE_VARIANTS_MODE=sync`.
- Set `WORKER_VIDEO_POSTER_ENABLED=false`.
- Route all node execution back to the old/default queue if queue isolation misbehaves.
- Keep existing assets and `asset_variants` rows; do not delete historical asset data.
- If a route/provider is unstable, mark the AI route inactive instead of deleting records.

Code rollback:

- Redeploy previous good commit.
- Stop worker before migrations or queue topology changes.
- Start API/worker/frontend using the existing Docker Compose v2 flow.

Data safety:

- No migration should delete assets or asset variants.
- New queues/jobs must be idempotent.
- Variant/poster failures must be recoverable by retrying jobs.
