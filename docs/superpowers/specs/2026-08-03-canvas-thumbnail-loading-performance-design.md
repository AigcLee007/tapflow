# Canvas Thumbnail Loading Performance Design

## 1. Goal

Optimize canvas image-node cold-start performance for users in mainland China without making the private object-storage bucket public and without introducing a CDN in the first phase.

The first visible image should normally appear within one second, visible canvas nodes should load lightweight thumbnails instead of 1024px previews or originals, and fullscreen/editing workflows must retain their current image quality.

## 2. Confirmed Deployment Topology

The production path is:

```txt
Mainland China browser
  -> Los Angeles API for authentication, asset lookup, and signed URL generation
  -> Zhejiang Ningbo private object storage for image bytes
```

The browser downloads image bytes directly from the Ningbo bucket. The Los Angeles API does not proxy normal canvas image bytes. This means the design must minimize cross-Pacific API round trips, while keeping the media transfer path direct to Ningbo.

The repository's local staging environment file is not authoritative for this design because it references a different object-storage region. Deployment validation must use the actual server environment without logging credentials or signed URLs.

## 3. Current Problems

The existing implementation has five confirmed performance problems:

1. Canvas image nodes request the `preview` variant, even though a normal node is approximately 260x210 CSS pixels and is often displayed at a lower canvas zoom.
2. Every visible image uses eager loading, so fitting many nodes into the viewport starts all downloads and decodes together.
3. The signed URL endpoint accepts batches but resolves each request sequentially, performing an asset query and a variant query per item.
4. If one requested preview variant is missing, the frontend retries the whole batch using originals. One incomplete asset can therefore make every image in the batch download its original file.
5. Signed URL caching is process-memory only. A browser refresh loses the cache and repeats the cross-Pacific signing request even when the URL is still valid.

The existing backfill script also diverges from production variant rules: it creates a 320px thumbnail while the current runtime creates a 640px thumbnail, and it selects only assets with neither variant instead of assets missing either required variant.

## 4. Chosen Approach

Use a three-tier asset delivery policy:

| Tier | Specification | Allowed use |
| --- | --- | --- |
| `thumb` | WebP, longest edge 640px, quality 80 | Canvas nodes, result strips, reference chips, canvas asset tiles |
| `preview` | WebP, longest edge 1024px, quality 78 | Fullscreen viewer, crop, repaint, annotate, and image-editing overlays |
| `original` | Original uploaded/generated file | Download, export, and model input when original bytes are required |

Normal canvas opening must request `thumb`. Selecting a node may prefetch `preview`, but the visible `thumb` remains in place until the preview has loaded. Fullscreen and image-editing workflows request `preview` on demand. Original files are not part of the normal canvas display path.

No CDN is required in this phase. CDN evaluation is deferred until application-layer optimization is deployed and real Ningbo object download timings are measured.

## 5. Canvas Loading Data Flow

1. Flow drafts continue to persist durable `assetId` values and never persist signed URLs as authoritative graph data.
2. React Flow continues to render visible elements only.
3. Mounted image nodes request `thumb` URLs through a shared resolver. The resolver coalesces duplicate asset requests and batches up to 100 unique assets.
4. For up to 100 visible assets, the browser sends one signed URL request to the Los Angeles API.
5. The API performs one tenant-scoped bulk query for the requested assets and their `thumb` and `preview` variants.
6. The API resolves each asset independently using `thumb -> preview -> original`.
7. The browser downloads the selected object directly from the Zhejiang Ningbo bucket.
8. When fullscreen or an editing overlay opens, the resolver requests `preview` for that asset only. The thumbnail stays visible until the preview succeeds.
9. Download and export actions continue to request original bytes through the existing authenticated download path.

## 6. Signed URL API Contract

The existing `POST /api/v2/assets/signed-urls` route remains authenticated, tenant-scoped, permission-protected, and limited to 100 requests.

The request gains an additive fallback option:

```ts
type SignedAssetUrlRequestItem = {
  assetId: string;
  variantKey?: "thumb" | "preview";
  allowVariantFallback?: boolean;
};
```

The response isolates item failures:

```ts
type SignedAssetUrlBatchResponse = {
  items: Array<{
    assetId: string;
    expiresAt: string;
    method: "GET";
    requestedVariantKey: "thumb" | "preview" | null;
    servedVariantKey: "thumb" | "preview" | null;
    variantKey: "thumb" | "preview" | null;
    status: "ok" | "fallback";
    url: string;
  }>;
  errors: Array<{
    assetId: string;
    code: "ASSET_UNAVAILABLE";
  }>;
};
```

Compatibility rules:

- Existing callers that omit `allowVariantFallback` retain strict variant behavior.
- The existing `variantKey` response field remains as a compatibility alias for `servedVariantKey`.
- Canvas callers request `variantKey: "thumb"` and `allowVariantFallback: true`.
- Preview callers request `variantKey: "preview"` and `allowVariantFallback: true`.
- A malformed request still returns an HTTP validation error.
- Missing, deleted, unauthorized, or unavailable individual assets are returned in `errors` using the same non-enumerating `ASSET_UNAVAILABLE` code.
- One item error never fails otherwise valid items in the same batch.
- The API never returns object-storage credentials, authorization headers, or internal storage errors.

The bulk lookup preserves request order and removes duplicate work. URL signing may run concurrently after the single database lookup because S3-compatible URL signing is local computation and does not require an object-storage round trip.

## 7. Frontend Resolver and Cache

The shared asset resolver becomes variant-aware instead of preview-only. Its cache key remains `assetId + requestedVariantKey` and stores the actual served variant with the expiry.

Cache layers:

1. In-memory cache for the current React runtime.
2. `sessionStorage` cache for refreshes in the same browser tab.

The session cache is a performance cache, not an authoritative asset store. It contains only signed URL metadata already available to the current authenticated browser session. It must:

- reject entries with invalid shapes or non-finite expiry values;
- reject entries that expire within 60 seconds;
- be cleared on logout and tenant change;
- never be copied into flow drafts, node data, logs, screenshots, or analytics;
- remain bounded by entry count and remove the earliest-expiring entries first.

The resolver continues to coalesce in-flight requests and batch up to 100 assets. A failed URL refresh invalidates only the exact asset/variant entry and retries once. It does not invalidate the entire batch.

## 8. Image Node State and Error Handling

Each image node follows this state model:

```txt
idle
  -> signing-thumb
  -> loading-thumb
  -> ready-thumb
  -> prefetching-preview
  -> ready-preview
```

Error behavior:

- Signing network failure: retry the affected batch once after a short bounded delay.
- Expired URL or image 403: invalidate and refresh the exact URL once.
- Missing or unavailable asset: show the existing compact preview failure state and do not retry automatically.
- Missing `thumb`: use that asset's `preview` only.
- Missing `thumb` and `preview`: use that asset's original only as a temporary compatibility fallback and record it for repair.
- Preview upgrade failure: keep the already visible thumbnail and allow a later fullscreen/edit retry.
- Component unmount: ignore late promise completion and avoid state updates.

There are no infinite retries. Canvas interaction, text nodes, edges, and unrelated image nodes remain usable while an item is loading or unavailable.

## 9. Loading Priority

React Flow already uses visible-element rendering, so the first phase does not add a custom download scheduler.

Loading policy:

- Use `loading="lazy"` for normal image nodes.
- Use `fetchPriority="high"` only for the selected node or the image nearest the viewport center.
- Use `fetchPriority="auto"` for other visible nodes.
- Keep `decoding="async"`.
- Do not request `preview` merely because a node mounted.
- Prefetch `preview` after selection or immediately before opening fullscreen/editing tools.

If production measurements still show decode contention after thumbnail delivery is fixed, a bounded visible-image scheduler may be considered separately. It is not part of this scope.

## 10. Historical Variant Audit and Backfill

Reuse the existing `asset.image-variant` queue and image variant processor. Do not create a second processing pipeline.

The backfill command must:

- default to audit-only behavior;
- require `--apply` for mutations;
- support `--tenant-id`, `--limit`, `--batch-size`, and `--missing=thumb|preview|any`;
- count images missing either required variant, not only images missing both;
- use the same 640px/1024px variant implementation as normal generation;
- enqueue deterministic jobs such as `asset-image-variant:<assetId>:v1`;
- remain idempotent through the existing `(asset_id, variant_key)` conflict handling;
- print counts and aggregate original byte estimates without printing object URLs or credentials;
- refuse an unscoped production apply unless an explicit production acknowledgement variable is set.

The image variant worker queue receives an independent concurrency setting with a production default of 2. Historical repair must not inherit the general worker concurrency of 16 and compete with normal workflow execution.

At the current storage size of approximately 1GB, backfill can run online in small batches without maintenance downtime.

For the first rollout, production should use:

```txt
WORKER_IMAGE_VARIANTS_MODE=sync
```

This guarantees that new generated images have both variants before their workflow result is treated as ready. Splitting synchronous thumbnail creation from asynchronous preview creation is a future scalability optimization and is outside this design.

## 11. Observability

Frontend performance marks:

```txt
canvas-draft-ready
canvas-thumb-signing-start
canvas-thumb-signing-end
canvas-first-thumb-visible
canvas-visible-thumbs-90pct
canvas-preview-upgrade-visible
```

Backend structured fields:

```txt
requestedCount
uniqueAssetCount
assetLookupMs
signingMs
thumbHitCount
previewFallbackCount
originalFallbackCount
unavailableCount
```

Logs must not contain signed URLs, storage credentials, full authorization headers, or provider secrets.

## 12. Acceptance Criteria

Measure against a mainland China browser and a representative canvas containing approximately 12 visible image nodes.

- Cold canvas open sends at most one thumbnail signing batch for up to 100 unique visible assets.
- Asset and variant lookup uses one bulk database query rather than per-asset queries.
- Signed URL server processing time is below 100ms at P95, excluding public-network round-trip time.
- First thumbnail becomes visible within 1 second at P75 and 2 seconds at P95.
- Ninety percent of 12 visible thumbnails load within 1.5 seconds at P75 and 3 seconds at P95.
- Same-tab refresh with unexpired cache shows the first image within 500ms.
- Normal canvas opening does not download original image objects after backfill is complete.
- Required variant coverage exceeds 99% for supported available images.
- Individual thumbnail transfer size is below 300KB at P95.
- Total transfer for 12 representative thumbnails is below 2.5MB.
- One unavailable image does not delay or fail other images.
- Fullscreen, crop, repaint, annotate, editing, download, and generation-reference flows receive the required preview or original tier.
- No signed URL is persisted in authoritative graph JSON.

## 13. Testing

Required automated coverage:

- API schema tests for additive fallback fields and the 100-item limit.
- API service tests proving one bulk lookup, stable ordering, duplicate coalescing, mixed success/error responses, and per-item fallback.
- Tenant isolation tests proving cross-tenant IDs return only `ASSET_UNAVAILABLE`.
- Resolver tests for memory cache, session cache, expiry safety, batching, variant keys, one-item invalidation, and one controlled retry.
- Image-node tests proving `thumb` is requested for canvas display and `preview` is requested only for fullscreen/editing.
- Tests proving a failed preview upgrade retains the loaded thumbnail.
- Backfill tests for audit-only default, missing-one-variant selection, production guard, deterministic job IDs, and 640px/1024px output consistency.
- Worker tests for independent image variant concurrency configuration.
- Existing flow draft canonicalization tests proving transient URLs remain excluded.

Browser verification must inspect the network waterfall and confirm request count, served variant keys, absence of original downloads, image visibility, and no canvas overlap/regression at desktop and mobile viewports.

## 14. Rollout and Rollback

Rollout order:

1. Capture a production baseline without changing behavior.
2. Deploy the backward-compatible API bulk lookup and per-item response behavior.
3. Deploy the worker concurrency and backfill command improvements.
4. Run audit-only backfill and review counts.
5. Run a small applied batch and verify objects, database rows, worker load, and canvas display.
6. Complete the historical backfill in controlled batches.
7. Deploy the frontend thumbnail-first resolver and session cache.
8. Run mainland China browser smoke tests and compare metrics to the baseline.
9. Monitor fallback and error rates before removing compatibility observations.

No database migration is required.

Rollback order:

1. Roll back the frontend to requesting `preview` while leaving the additive API behavior deployed.
2. Stop new backfill enqueueing; already-created variants remain valid and do not need deletion.
3. Reduce image variant queue concurrency or pause that queue if worker CPU is affected.
4. Roll back the API only after all frontend clients use the older response contract.

Rollback does not delete assets, variants, billing records, workflow history, or flow drafts.

## 15. Deferred Work

The following are explicitly outside this phase:

- CDN configuration;
- dynamic resize-on-request services;
- public object bucket access;
- changing signed URL lifetime beyond the existing 15 minutes;
- storing signed URLs in authoritative drafts;
- a custom canvas image download scheduler;
- splitting thumbnail and preview generation into separate synchronous/asynchronous jobs.

These items should be reconsidered only after the acceptance metrics show which remaining layer is slow.
