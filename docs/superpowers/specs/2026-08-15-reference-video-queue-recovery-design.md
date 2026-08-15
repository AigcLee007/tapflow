# Reference Video Queue Recovery Design

## Status

Approved direction. This specification covers an immediate production recovery followed by a separate hardening phase. The immediate phase is intentionally small and does not redesign media processing or billing.

## Incident Summary

Uploaded videos are marked with `referenceVideoVariantStatus=pending`, but the reference-video variant job is rejected before it reaches BullMQ because its custom job ID contains a colon:

```text
<asset-id>:reference-720p
```

The deployed BullMQ version rejects that value with `Custom Id cannot contain :`. The upload completion path catches and discards the enqueue error, while the Worker reconciler retries the same invalid ID every minute. FFmpeg never starts, so affected assets remain pending indefinitely.

## Goals

- Restore automatic 720P reference-video preparation for new and already-pending assets.
- Preserve idempotent enqueue behavior without using forbidden BullMQ job ID characters.
- Make unexpected enqueue failures observable instead of silently losing work.
- Keep the current upload UX: no compression switch, resolution selector, or additional user action.
- Preserve the original video and create `reference-720p` only when the source exceeds the H3video reference limit.

## Non-Goals For Immediate Recovery

- No database migration or new task table.
- No dedicated transcode service or autoscaling in the emergency patch.
- No new frontend state machine.
- No change to billing reserve, settle, refund, or provider submission behavior.
- No synchronous transcoding inside the upload request.

## Approaches Considered

### 1. Replace The Colon Only

Change both call sites to use `<asset-id>-reference-720p`. This restores enqueueing quickly but leaves two independent ID implementations and continues to hide infrastructure errors.

### 2. Shared Safe Job ID And Observable Enqueue Failure (Selected)

Introduce one shared helper that returns `reference-720p-<asset-id>`, use it in the API upload path and Worker reconciler, and narrow upload error handling so duplicate/idempotent conditions are harmless while unexpected errors are logged with asset, tenant, queue, and trace context. This is the smallest production-appropriate recovery.

### 3. Synchronous Upload Transcoding

Transcode before completing the upload request. This is rejected because large videos can exceed HTTP timeouts and tie user requests to CPU, memory, storage, and S3 availability.

## Immediate Recovery Design

### Shared Job Identity

Add a helper to the shared Redis package:

```ts
buildAssetVideoReferenceVariantJobId(assetId)
// reference-720p-6587e4ba-174a-4b45-90d0-4afd97bf8b26
```

The helper trims and validates the asset ID, produces only letters, digits, and hyphens, and never contains `:`. API and Worker code must not construct this job ID independently.

### API Enqueue Behavior

Upload completion continues to commit the asset as `available` with `referenceVideoVariantStatus=pending`, then enqueues the lightweight `{ assetId, tenantId, traceId }` payload.

Successful enqueue and an already-existing idempotent job are treated as success. Any unexpected enqueue error is logged with structured, non-secret context. The upload remains successful because the original asset is durable and the reconciler is the recovery path; however, failure is no longer silent.

The immediate patch does not introduce a new `queue_failed` frontend status because doing so would expand the API and UI contract. The pending timestamp and reconciler provide bounded recovery once the queue becomes available.

### Worker Reconciliation

The existing reconciler keeps scanning up to 50 `pending` or legacy-unmarked video assets every 60 seconds. It uses the shared safe ID and therefore re-enqueues all assets stranded by the incident without requiring re-upload or manual database updates.

The Worker logs the number of assets enqueued per pass. A failure for one candidate must include its asset and tenant identifiers and must not obscure the root error. The current batch and transcode concurrency remain unchanged for the emergency rollout to avoid unexpected CPU saturation.

### Processing And UI

The existing processor remains authoritative:

```text
queued -> probe original -> compliant: ready
                         -> oversized: transcode -> upload variant -> ready
                         -> error: failed
```

The frontend continues polling pending assets every two seconds. The previously shipped server-status precedence fix allows the canvas to move from `pending` to `ready` or `failed` without refresh.

## Historical Pending Recovery

No invalid BullMQ jobs need deletion because BullMQ rejected them before creation. After deployment and Worker restart, the first reconciliation pass selects existing pending assets and submits valid jobs. With a batch size of 50 and a one-minute interval, enqueue recovery capacity is 50 assets per minute; actual transcode throughput remains limited by `ASSET_VIDEO_REFERENCE_VARIANT_CONCURRENCY`.

Operators must not manually change affected rows to `ready`. A `ready` status is valid only after the processor verifies a compliant source or persists the `reference-720p` variant.

## Error Handling And Observability

Required structured events:

- API enqueue success: queue name, job ID, asset ID, tenant ID, trace ID.
- API enqueue failure: the same identifiers plus sanitized error class/message.
- Reconciler pass: candidate count and enqueued count.
- Processor success: source dimensions, output dimensions, transcoded flag, duration, and variant count.
- Processor failure: asset ID, tenant ID, stage, attempt count, and sanitized error code.

No S3 URLs, credentials, raw headers, or media bodies may enter logs.

## Testing

- Shared Redis unit test asserts the generated ID is deterministic and contains no colon.
- Queue integration/contract test passes the generated ID through the installed BullMQ validation path.
- API asset test asserts upload completion uses the shared safe job ID.
- API test asserts unexpected enqueue failures are logged and upload completion remains durable.
- Worker reconciler test asserts pending assets use the shared safe job ID.
- Worker processor tests continue covering compliant, oversized, and failed transcodes.
- Focused API, Redis, Worker, frontend tests and all affected workspace builds must pass.

## Deployment And Acceptance

1. Build images from the repaired `main` commit.
2. Stop the Worker, run the existing database migration command, then start Redis, API, Worker, and frontend using `docker-compose.staging.yml`.
3. Confirm Worker logs no longer contain `Custom Id cannot contain :`.
4. Confirm the reconciler enqueues historical pending assets within 60 seconds.
5. Confirm one known 15-second oversized video creates `reference-720p` and changes to `ready`.
6. Confirm H3video generation automatically becomes available and uses the prepared variant.
7. Confirm a forced processing failure changes the asset to `failed` instead of leaving it pending.

## Follow-Up Production Hardening

After incident recovery is stable, design and implement a separate durable preprocessing workflow with stage states (`queued`, `downloading`, `probing`, `transcoding`, `uploading`, `ready`, `failed`), timestamps, heartbeat/stall recovery, attempt history, streaming S3 I/O, a dedicated transcode Worker pool, and generation runs that wait for variant readiness and automatically continue or refund on failure. That work requires its own database, billing, workflow, and frontend specification and is not bundled into this emergency patch.

## Rollback

Redeploy the previous application commit if the patch introduces queue regressions. Existing originals remain unchanged. Do not mark pending assets ready during rollback. Because this change requires no migration, rollback does not require database restoration.
