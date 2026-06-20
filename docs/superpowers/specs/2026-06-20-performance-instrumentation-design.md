# Performance Instrumentation Design

**Date:** 2026-06-20  
**Status:** Approved for implementation planning  
**Scope:** v2 workbench image generation, worker asset persistence, and frontend first-image visibility diagnostics

## Goal

Add formal, structured performance instrumentation for the image-generation path so operators can answer four questions for every slow run:

1. Was the model/provider call itself slow?
2. Was worker-side asset persistence slow?
3. Was object-storage upload or variant generation the bottleneck?
4. Did the frontend receive preview data quickly but still render the first visible image late?

This design intentionally starts with structured logs and browser performance marks rather than new database tables. The first milestone is fast diagnosis with low rollout risk.

## Non-Goals

- No new production metrics backend is required in this phase.
- No new Postgres performance tables are required in this phase.
- No admin dashboard work is included in this phase.
- No provider protocol changes are included in this phase.
- No billing behavior changes are included in this phase.

## Why This Design

The current system already records some useful timing data:

- `ai_call_logs.latency_ms` records provider/runtime call latency.
- `workbench_generations` records `created_at`, `started_at`, and `finished_at`.
- `MediaAssetStore` already computes:
  - `provider_output_download_ms`
  - `asset_original_upload_ms`
  - `asset_db_insert_ms`
  - `asset_variant_processing_ms`

The main gap is observability, not raw timing capture. Today, those timings are split across DB state, runtime-only objects, and browser devtools. Operators cannot reconstruct a slow run from one consistent event stream. This design fixes that with:

- backend structured logs for stage timings
- frontend performance marks for first-image visibility
- consistent correlation fields across API, worker, and browser diagnostics

## Approaches Considered

### Approach A: Structured logs first

Add structured JSON logs in worker and API code, plus frontend browser performance marks.

Pros:

- smallest blast radius
- no schema migration
- fastest to ship
- enough to identify the slow stage in most cases

Cons:

- aggregation is log-driven, not query-driven
- historical analysis is less convenient than a dedicated table

### Approach B: Structured logs plus diagnostic API

Persist or summarize timing details into an API-visible admin/debug endpoint.

Pros:

- easier for operators who do not want to inspect logs
- prepares the path for a small internal monitoring page

Cons:

- more implementation work
- requires deciding how to persist or reconstruct timings

### Approach C: Full metrics model

Add new DB tables and a complete admin performance surface.

Pros:

- best long-term operator UX
- supports richer historical reporting

Cons:

- much larger change set
- more migrations and rollout risk
- unnecessary for immediate diagnosis

## Recommendation

Implement **Approach A** first.

It matches the current project stage: fast diagnosis, low risk, and minimal schema churn. Once logs show stable bottlenecks and event shapes, the same event model can later feed an API endpoint or performance table without redesigning names and boundaries.

## System Boundaries

The instrumented path begins when a user submits a workbench generation request and ends when the first image becomes visible in the browser.

The performance design divides this path into four layers:

1. **Provider runtime**
   - route resolution
   - provider call
   - provider poll completion

2. **Worker persistence**
   - provider output download
   - original asset upload to object storage
   - asset row insert
   - preview/thumb generation
   - variant uploads and variant row inserts

3. **Workbench/API delivery**
   - generation polling
   - preview URL readiness in API response

4. **Frontend rendering**
   - submit click
   - generation record available
   - preview URL available
   - first image request start/end
   - first visible render

## Correlation Model

Every backend event in this design must use structured logs and carry the same correlation keys wherever available:

- `traceId`
- `tenantId`
- `workflowRunId`
- `generationId`
- `nodeRunId`
- `assetId`
- `routeKey`
- `modelId`
- `providerTaskId`

Not every event will have every field. Missing fields should be emitted as `null` or omitted according to the local logger pattern, but event names and primary identifiers must stay stable.

Frontend performance marks cannot automatically inherit server trace IDs in all cases, so the frontend correlation model is:

- `generationId`
- `resultId`
- `assetId`
- client-side `startedAtMs`

If later we expose `traceId` to authenticated debug responses, the same design can absorb it without renaming events.

## Event Naming

Event names must be stable, dot-separated, and stage-specific. Avoid generic labels such as `performance.done` or `image.slow`.

### Provider/runtime events

- `media.generate.started`
- `media.generate.finished`
- `media.generate.failed`
- `media.poll.started`
- `media.poll.finished`
- `media.poll.failed`

### Asset persistence events

- `asset.persist.started`
- `asset.persist.output_download.finished`
- `asset.persist.original_upload.finished`
- `asset.persist.db_insert.finished`
- `asset.variant.generate.finished`
- `asset.variant.upload.finished`
- `asset.variant.db_insert.finished`
- `asset.persist.completed`
- `asset.persist.failed`

### Workbench generation events

- `workbench.generation.started`
- `workbench.generation.provider_completed`
- `workbench.generation.assets_persisted`
- `workbench.generation.finished`
- `workbench.generation.failed`

### Frontend/browser marks

- `workbench-submit-click`
- `workbench-generation-created`
- `workbench-generation-preview-url-ready`
- `workbench-first-image-load-start`
- `workbench-first-image-load-end`
- `workbench-first-image-visible`

### Frontend/browser measures

- `workbench-submit-to-created`
- `workbench-submit-to-preview-url-ready`
- `workbench-submit-to-first-image-visible`
- `workbench-preview-url-ready-to-first-image-visible`

## Event Schemas

### Common backend log fields

All backend performance logs should prefer this common envelope:

```json
{
  "event": "asset.persist.original_upload.finished",
  "traceId": "trace-123",
  "tenantId": "tenant-1",
  "generationId": "gen-1",
  "workflowRunId": null,
  "nodeRunId": null,
  "assetId": "asset-1",
  "routeKey": "image.default",
  "modelId": "nano-banana-pro",
  "status": "ok",
  "durationMs": 1842,
  "timestamp": "2026-06-20T12:00:00.000Z"
}
```

### Provider/runtime event payload

Additional fields:

- `providerTaskId`
- `providerKey`
- `providerStatus`
- `latencyMs`
- `inputAssetCount`
- `outputCount`

### Asset persistence event payload

Additional fields:

- `bucket`
- `objectKey`
- `variantKey`
- `sizeBytes`
- `mimeType`
- `width`
- `height`
- `variantCount`

### Workbench generation summary payload

Additional fields:

- `queueWaitMs`
- `providerLatencyMs`
- `assetPersistTotalMs`
- `runDurationMs`
- `totalDurationMs`
- `resultCount`

### Frontend measure payload

Frontend measurements should be emitted through browser `performance.mark` / `performance.measure` first. In a later phase they may optionally be mirrored to debug logs or telemetry beacons.

Recommended console/debug shape:

```json
{
  "event": "workbench.first_image.visible",
  "generationId": "gen-1",
  "assetId": "asset-1",
  "submitToFirstImageVisibleMs": 7421,
  "previewReadyToVisibleMs": 913
}
```

## Backend Instrumentation Design

### 1. Provider runtime

Primary file:

- `packages/ai-gateway-core/src/database-media-runtime.ts`

Existing state:

- Provider latency is already measured and inserted into `ai_call_logs.latency_ms`.

Required additions:

- Emit structured logs for `media.generate.*` and `media.poll.*`
- Reuse the existing measured duration instead of recomputing semantics elsewhere
- Include route/model/provider correlation fields

Rules:

- Successful provider calls log `*.finished`
- Exceptions log `*.failed`
- Poll calls must log separately from initial generate calls
- Do not log secrets, request headers, raw auth material, or full provider payloads

### 2. Worker asset persistence

Primary file:

- `apps/worker/src/workflow-runtime/media-asset-store.ts`

Existing state:

- Per-asset stage timings are already measured in code.

Required additions:

- Accept an optional logger/context input so the store can emit structured logs without inventing global state
- Emit one log per major stage
- Emit one summary log at asset completion

Required stages:

1. output download
2. original upload
3. asset row insert
4. variant generation
5. variant upload per variant
6. variant row insert per variant
7. per-asset summary

Important boundary:

- `asset_variant_processing_ms` is currently a rolled-up number. The new logs must preserve both:
  - rolled-up total
  - sub-stage detail

This keeps backward reasoning simple while making future bottlenecks obvious.

### 3. Worker generation summary

Primary file:

- `apps/worker/src/workbench/workbench-generation.service.ts`

Required additions:

- Start log when execution begins
- Log after provider completion
- Log after asset persistence completes
- Final summary log on success/failure

This layer is where the system should compute:

- `providerLatencyMs`
- `assetPersistTotalMs`
- `runDurationMs`
- `totalDurationMs`

Definitions:

- `providerLatencyMs`: provider request start to provider outputs ready
- `assetPersistTotalMs`: start of asset persistence to last persisted asset completion
- `runDurationMs`: worker `started_at` to worker completion
- `totalDurationMs`: generation `created_at` to worker completion

If `created_at` is available but `started_at` is delayed, the difference becomes queue wait:

- `queueWaitMs = started_at - created_at`

### 4. Workflow runtime path

Primary file:

- `apps/worker/src/workflow-runtime/service.ts`

Existing state:

- This path already collects `assetTimings` from `MediaAssetStore`.

Required additions:

- Emit a workflow-node summary log with rolled-up asset timing totals
- Keep output JSON payload behavior unchanged for now unless an implementation plan explicitly decides to expose diagnostic timing downstream

This avoids changing user-facing API payloads prematurely.

## Frontend Instrumentation Design

### 1. Workbench submission and polling

Primary files:

- `src/workbench/useWorkbenchGenerations.ts`
- `src/services/v2WorkbenchApi.ts`

Required marks:

- when user clicks generate
- when create-generation API returns
- when a generation payload first contains a usable `previewUrl` or `downloadUrl`

Rules:

- Marks must be keyed per generation to avoid collisions when multiple requests are in flight
- Retry and regenerate flows should use the same measurement model

### 2. First image load and visibility

Primary files:

- `src/workbench/WorkbenchPage.tsx`
- any shared result-card component that renders preview images

Required marks:

- image element begins loading
- image `onLoad` fires
- image becomes visible after the next animation frame

Why visible uses animation-frame:

- `onLoad` means the resource is decoded enough to trigger the event
- the user-visible paint can still happen one frame later
- recording visibility after `requestAnimationFrame` is a better approximation of perceived first-image latency

### 3. Browser diagnostics surface

This phase does not require shipping frontend telemetry to the server.

Instead:

- use `performance.mark`
- use `performance.measure`
- keep names stable
- allow developers/operators to inspect values via browser Performance panel or console helpers

If later needed, a follow-up phase can add a lightweight `sendBeacon`-style diagnostics channel for sampled runs.

## Proposed Minimal Deliverable

The first implementation milestone must produce these six diagnosable signals:

1. `media.generate.finished`
2. `asset.persist.output_download.finished`
3. `asset.persist.original_upload.finished`
4. `asset.persist.variant_processing.finished`
5. `asset.persist.completed`
6. `workbench-submit-to-first-image-visible`

With those six in place, operators can separate:

- provider slowness
- cross-region upload slowness
- synchronous variant generation slowness
- frontend rendering slowness

## Rollout Plan

### Phase 1: Instrumentation only

- Add backend structured logs
- Add frontend performance marks
- Do not change business logic
- Do not change API payload contracts

### Phase 2: Staging baseline

- Deploy instrumentation to staging
- Run at least 10 image generations with the same route/model
- Compare:
  - provider latency
  - asset persistence total
  - submit-to-visible latency

### Phase 3: Bottleneck-driven optimization

Only after baseline data exists should we optimize, for example:

- `WORKER_IMAGE_VARIANTS_MODE=async`
- object storage topology changes
- CDN/edge acceleration
- concurrency adjustments

This sequence matters. Optimization without stage timing evidence will produce guesswork.

## Validation and Acceptance

Implementation is considered successful when all of the following are true:

1. A single image generation can be traced end-to-end by `traceId` and `generationId`.
2. Logs clearly show provider latency separate from worker persistence latency.
3. Logs clearly show original upload separate from variant processing/upload.
4. Browser diagnostics can report `submit-to-first-image-visible`.
5. No secret material appears in logs.
6. Existing generation, billing, and asset persistence behavior remains unchanged.

## Operational Usage

After rollout, the minimum operator workflow for a slow image complaint should be:

1. Find the generation ID or approximate timestamp.
2. Inspect `ai_call_logs.latency_ms` or the corresponding `media.generate.finished` event.
3. Inspect `asset.persist.*` events for the same generation or node.
4. Compare backend completion time to browser first-image-visible timing.
5. Classify the bottleneck as:
   - provider
   - worker download
   - original upload
   - variant generation/upload
   - frontend image fetch/render

## Risks and Guardrails

### Log volume

Per-asset and per-variant logs can become noisy.

Guardrail:

- Keep payloads compact
- Avoid logging full prompt text beyond existing truncated summaries
- Prefer one event per meaningful stage, not per internal helper call

### Secret exposure

Performance logs must never include:

- API keys
- credential ciphertext
- raw Authorization headers
- full presigned URLs if they are considered sensitive in operator logs

If presigned URLs need correlation, log object metadata such as bucket/key or asset ID instead of the full URL.

### Multi-image batches

Batch generations can produce multiple child results.

Guardrail:

- keep summary logs on the parent generation
- keep asset persistence logs per child asset
- include `batchId`, `parentGenerationId`, and `batchIndex` where available

## Future Extensions

This design intentionally preserves a clean upgrade path to:

- sampled telemetry beacons from frontend to backend
- an admin performance timeline page
- a `generation_performance_events` table
- alerting on p95 provider latency or p95 provider-finished-to-visible latency

Those extensions should reuse the same event names and duration definitions from this document.
