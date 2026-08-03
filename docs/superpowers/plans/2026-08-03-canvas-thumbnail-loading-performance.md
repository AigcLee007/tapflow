# Canvas Thumbnail Loading Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make image nodes on a mainland-China canvas show lightweight thumbnails quickly, while preserving preview quality for fullscreen/editing and original bytes for download/model input.

**Architecture:** Keep the Los Angeles API responsible only for authenticated, tenant-scoped metadata lookup and local S3 URL signing; browsers continue downloading bytes directly from the private Ningbo bucket. Add one-query batch target resolution with per-item fallback, a variant-aware resolver with bounded per-session caching, thumbnail-first node rendering, and queue-based repair of historical variants.

**Tech Stack:** React 19, TypeScript, Vitest, `@xyflow/react`, Fastify, PostgreSQL, BullMQ/Redis, Sharp, S3-compatible object storage, Docker Compose v2.

---

## File Map

**API contract and bulk resolution**

- Modify `apps/api/src/modules/assets/assets.schemas.ts`: validate `thumb`/`preview` requests and the additive fallback flag.
- Modify `apps/api/src/modules/assets/assets.service.ts`: load originals and variants in one tenant-scoped query, resolve each request independently, sign concurrently, and return internal timings.
- Modify `apps/api/src/modules/assets/assets.routes.ts`: emit safe structured metrics and keep internal timings out of the HTTP body.
- Create `apps/api/test/assets-signed-url-schema.test.ts`: focused schema tests.
- Modify `apps/api/test/assets.test.ts`: integration coverage for fallback, ordering, isolation, duplicate work, and compatibility.

**Frontend URL resolution and rendering**

- Modify `src/assets/assetApi.ts`: expose typed request, success, and error items while preserving `variantKey`.
- Modify `src/assets/assetUrlCache.ts`: bounded memory plus tenant/user-scoped `sessionStorage` cache.
- Modify `src/assets/assetUrlCache.test.ts`: cache validation, expiry, scope, and eviction coverage.
- Modify `src/assets/assetPreviewResolver.ts`: variant-aware batching, per-item errors, and one bounded signing retry.
- Modify `src/assets/assetPreviewResolver.test.ts`: mixed success, fallback, coalescing, and exact-entry invalidation tests.
- Modify `src/auth/AuthProvider.tsx`: set/clear cache scope on session and logout changes.
- Modify `src/auth/AuthProvider.test.tsx`: assert session scope and logout clearing.
- Create `src/flowCanvas/nodes/useLayeredImageAssetUrls.ts`: own thumbnail resolution and optional preview upgrade state.
- Create `src/flowCanvas/nodes/useLayeredImageAssetUrls.test.tsx`: hook lifecycle and failure tests.
- Modify `src/flowCanvas/nodes/FlowNodes.tsx`: render thumb first, request preview on demand, use lazy loading, and refresh only the failed thumb.

**Performance instrumentation**

- Create `src/flowCanvas/performance/canvasThumbnailPerformance.ts`: aggregate draft, signing, first-visible, 90-percent, and preview-upgrade marks.
- Create `src/flowCanvas/performance/canvasThumbnailPerformance.test.ts`: deterministic mark/count tests.
- Modify `src/flowCanvas/hooks/useRemoteFlowProject.ts`: reset the tracker and mark draft readiness.

**Historical repair and worker isolation**

- Rewrite `scripts/backfill-asset-variants.ts`: audit by default and enqueue deterministic existing variant jobs only with `--apply`.
- Expand `scripts/backfill-asset-variants.test.ts`: argument, SQL selection, production guard, summary, and queue-job tests.
- Modify `apps/worker/src/config/env.ts`: add image-variant concurrency with default `2`.
- Modify `apps/worker/src/queues/registry.ts`: route the asset variant queue to that independent limit.
- Modify `apps/worker/src/main.ts`: pass and log the limit.
- Modify `apps/worker/test/worker.test.ts`: default, override, and queue wiring tests.
- Modify `docker-compose.staging.yml`, `docs/STAGING_ENV_TEMPLATE.md`, `docs/PRODUCTION_RUNBOOK.md`, and `docs/staging-runbook.md`: deployment variables, audit/apply commands, acceptance, and rollback.
- Modify `PROJECT_RECORD.md`: record completed behavior and validation evidence.

No database migration is required.

### Task 1: Lock the additive signed-URL contract

**Files:**

- Create: `apps/api/test/assets-signed-url-schema.test.ts`
- Modify: `apps/api/src/modules/assets/assets.schemas.ts`

- [ ] **Step 1: Write schema tests that preserve strict defaults and the 100-item limit**

```ts
import { describe, expect, test } from "vitest";

import { signedAssetUrlRequestSchema } from "../src/modules/assets/assets.schemas.js";

const assetId = "11111111-1111-4111-8111-111111111111";

describe("signedAssetUrlRequestSchema", () => {
  test("defaults fallback off for existing callers", () => {
    const parsed = signedAssetUrlRequestSchema.parse({
      requests: [{ assetId, variantKey: "preview" }],
    });
    expect(parsed.requests[0]).toEqual({
      assetId,
      allowVariantFallback: false,
      variantKey: "preview",
    });
  });

  test("accepts fallback for thumb and preview only", () => {
    expect(signedAssetUrlRequestSchema.parse({
      requests: [{ assetId, allowVariantFallback: true, variantKey: "thumb" }],
    }).requests[0]?.allowVariantFallback).toBe(true);
    expect(() => signedAssetUrlRequestSchema.parse({
      requests: [{ assetId, variantKey: "unknown" }],
    })).toThrow();
  });

  test("rejects more than one hundred items", () => {
    const requests = Array.from({ length: 101 }, () => ({ assetId }));
    expect(() => signedAssetUrlRequestSchema.parse({ requests })).toThrow();
  });
});
```

- [ ] **Step 2: Run the focused test and confirm the new fields fail first**

Run: `npm run test --workspace @aigc-flow/api -- assets-signed-url-schema.test.ts`

Expected: FAIL because `allowVariantFallback` is absent and arbitrary variant strings are still accepted.

- [ ] **Step 3: Make the schema additive and default fallback to false**

```ts
const signedAssetVariantKeySchema = z.enum(["thumb", "preview"]);

export const signedAssetUrlRequestSchema = z.object({
  requests: z.array(z.object({
    assetId: z.string().uuid(),
    allowVariantFallback: z.boolean().optional().default(false),
    variantKey: signedAssetVariantKeySchema.optional(),
  })).min(1).max(100),
});
```

- [ ] **Step 4: Re-run the focused test**

Run: `npm run test --workspace @aigc-flow/api -- assets-signed-url-schema.test.ts`

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit the contract**

```bash
git add apps/api/src/modules/assets/assets.schemas.ts apps/api/test/assets-signed-url-schema.test.ts
git commit -m "feat(api): define asset url fallback contract"
```

### Task 2: Replace per-item database lookup with one bulk query

**Files:**

- Modify: `apps/api/src/modules/assets/assets.service.ts`
- Modify: `apps/api/src/modules/assets/assets.routes.ts`
- Modify: `apps/api/test/assets.test.ts`

- [ ] **Step 1: Add integration tests for ordered mixed results and compatibility**

Extend the existing `signed-urls returns thumb urls in one request` section with a fixture containing: asset A with both variants, asset B with preview only, asset C with no variants, a missing ID, and an ID belonging to another tenant. Submit requests in the order C, A, B, missing, foreign, A and assert:

```ts
expect(response.statusCode).toBe(200);
const body = response.json();
expect(body.items.map((item: { assetId: string }) => item.assetId)).toEqual([
  originalOnlyAssetId,
  fullVariantAssetId,
  previewOnlyAssetId,
  fullVariantAssetId,
]);
expect(body.items.slice(0, 3)).toEqual([
  expect.objectContaining({
    assetId: originalOnlyAssetId,
    requestedVariantKey: "thumb",
    servedVariantKey: null,
    variantKey: null,
    status: "fallback",
  }),
  expect.objectContaining({
    assetId: fullVariantAssetId,
    requestedVariantKey: "thumb",
    servedVariantKey: "thumb",
    variantKey: "thumb",
    status: "ok",
  }),
  expect.objectContaining({
    assetId: previewOnlyAssetId,
    requestedVariantKey: "thumb",
    servedVariantKey: "preview",
    variantKey: "preview",
    status: "fallback",
  }),
]);
expect(body.errors).toEqual([
  { assetId: missingAssetId, code: "ASSET_UNAVAILABLE" },
  { assetId: foreignAssetId, code: "ASSET_UNAVAILABLE" },
]);
```

Also assert an omitted `allowVariantFallback` does not fall back and that the legacy `variantKey` is always identical to `servedVariantKey`. Use a spyable test client around the bulk loader and assert its asset/variant SELECT is called once for repeated asset IDs:

```ts
const query = vi.fn().mockResolvedValue({ rows: [] });
await __assetsServiceTestUtils.loadSignedAssetCandidates(
  { query } as never,
  tenantId,
  [assetId, assetId],
);
expect(query).toHaveBeenCalledTimes(1);
expect(query.mock.calls[0]?.[1]).toEqual([tenantId, [assetId]]);
```

- [ ] **Step 2: Run the API tests and confirm the current batch-wide behavior fails**

Run: `npm run test --workspace @aigc-flow/api -- assets.test.ts`

Expected: FAIL because the service performs sequential lookups, throws for a missing item, and does not return `errors`, `status`, or requested/served variant fields.

- [ ] **Step 3: Add one flat bulk-query loader**

Add a `BulkAssetStorageRow` and a loader used exactly once by `createSignedUrls`:

```ts
async function loadSignedAssetCandidates(
  client: PoolClient,
  tenantId: string,
  assetIds: string[],
): Promise<Map<string, { asset: AssetStorageTarget; variants: Map<string, AssetStorageTarget> }>> {
  const uniqueAssetIds = Array.from(new Set(assetIds));
  const result = await client.query<BulkAssetStorageRow>(`
    SELECT
      a.id::text AS asset_id,
      a.bucket AS asset_bucket,
      a.object_key AS asset_object_key,
      a.mime_type AS asset_mime_type,
      a.original_filename,
      a.status,
      a.deleted_at,
      av.variant_key,
      av.bucket AS variant_bucket,
      av.object_key AS variant_object_key,
      av.mime_type AS variant_mime_type
    FROM assets a
    LEFT JOIN asset_variants av
      ON av.tenant_id = a.tenant_id
     AND av.asset_id = a.id
     AND av.variant_key IN ('thumb', 'preview')
    WHERE a.tenant_id = $1::uuid
      AND a.id = ANY($2::uuid[])
    ORDER BY a.id, av.variant_key
  `, [tenantId, uniqueAssetIds]);

  return groupSignedAssetCandidates(result.rows);
}
```

Expose only this loader through `__assetsServiceTestUtils` so the one-query assertion does not require changing the public service API.

- [ ] **Step 4: Resolve every request independently and sign successes concurrently**

Use these exact public result shapes:

```ts
type SignedVariantKey = "thumb" | "preview";
type SignedUrlRequestItem = {
  assetId: string;
  allowVariantFallback: boolean;
  variantKey?: SignedVariantKey;
};

type SignedUrlSuccess = {
  assetId: string;
  expiresAt: string;
  method: "GET";
  requestedVariantKey: SignedVariantKey | null;
  servedVariantKey: SignedVariantKey | null;
  variantKey: SignedVariantKey | null;
  status: "ok" | "fallback";
  url: string;
};
```

Resolve candidates using:

```ts
const fallbackOrder = request.variantKey === "thumb"
  ? ["thumb", "preview", null] as const
  : request.variantKey === "preview"
    ? ["preview", null] as const
    : [null] as const;
const allowedOrder = request.allowVariantFallback
  ? fallbackOrder
  : [request.variantKey ?? null];
```

Unavailable, deleted, non-available, cross-tenant, and strict missing-variant requests become `{ assetId, code: "ASSET_UNAVAILABLE" }`. Preserve request order within `items` and within `errors`, deduplicate only the database/signing work, and use `Promise.all` for distinct target signatures. Set `variantKey: servedVariantKey` on every success.

- [ ] **Step 5: Log timings without exposing URLs**

Have the service return an internal `metrics` object alongside `items` and `errors`, then strip it in the route:

```ts
const { metrics, ...body } = await app.assetsService.createSignedUrls(
  getAssetContext(request),
  parsed.requests,
);
request.log.info(metrics, "asset signed-url batch resolved");
return reply.send(body);
```

The metrics object must contain only:

```ts
{
  requestedCount,
  uniqueAssetCount,
  assetLookupMs,
  signingMs,
  thumbHitCount,
  previewFallbackCount,
  originalFallbackCount,
  unavailableCount,
}
```

- [ ] **Step 6: Run API tests and build**

Run: `npm run test --workspace @aigc-flow/api -- assets-signed-url-schema.test.ts assets.test.ts`

Expected: PASS, including tenant isolation and the legacy alias assertion.

Run: `npm run build --workspace @aigc-flow/api`

Expected: PASS with no TypeScript errors.

- [ ] **Step 7: Commit the bulk API**

```bash
git add apps/api/src/modules/assets/assets.service.ts apps/api/src/modules/assets/assets.routes.ts apps/api/test/assets.test.ts
git commit -m "perf(api): bulk resolve signed asset urls"
```

### Task 3: Make the frontend API and resolver variant-aware

**Files:**

- Modify: `src/assets/assetApi.ts`
- Modify: `src/assets/assetPreviewResolver.ts`
- Modify: `src/assets/assetPreviewResolver.test.ts`

- [ ] **Step 1: Replace the batch-wide fallback test with per-item behavior tests**

Add tests that prove: mixed thumb/preview requests share one batch; canvas requests send `allowVariantFallback: true`; preview fallback does not affect a successful thumb; one `ASSET_UNAVAILABLE` rejects only that promise; a network rejection retries once after a fake-timer delay; and a second failure stops.

```ts
getAssetSignedUrlsMock.mockResolvedValue({
  items: [signedItem("asset-thumb", "thumb", "thumb", "ok")],
  errors: [{ assetId: "asset-missing", code: "ASSET_UNAVAILABLE" }],
});

const [thumb, missing] = await Promise.allSettled([
  resolveAssetUrl("asset-thumb", "thumb"),
  resolveAssetUrl("asset-missing", "thumb"),
]);

expect(thumb).toMatchObject({ status: "fulfilled" });
expect(missing).toMatchObject({ status: "rejected" });
expect(getAssetSignedUrlsMock).toHaveBeenCalledTimes(1);
```

- [ ] **Step 2: Run the resolver tests and confirm they fail**

Run: `npm test -- src/assets/assetPreviewResolver.test.ts`

Expected: FAIL because the resolver forces the whole batch through preview then original.

- [ ] **Step 3: Add typed API request and response models**

```ts
export type AssetSignedVariantKey = "thumb" | "preview";
export type AssetSignedUrlRequest = {
  assetId: string;
  allowVariantFallback?: boolean;
  variantKey?: AssetSignedVariantKey;
};
export type AssetSignedUrl = {
  assetId: string;
  expiresAt: string;
  method: "GET";
  requestedVariantKey: AssetSignedVariantKey | null;
  servedVariantKey: AssetSignedVariantKey | null;
  variantKey: AssetSignedVariantKey | null;
  status: "ok" | "fallback";
  url: string;
};
export type AssetSignedUrlError = {
  assetId: string;
  code: "ASSET_UNAVAILABLE";
};
```

Change `getAssetSignedUrls` to return `{ items: AssetSignedUrl[]; errors: AssetSignedUrlError[] }`.

- [ ] **Step 4: Add a canonical resolver and retain compatibility wrappers**

```ts
export type ResolvedAssetUrl = {
  assetId: string;
  expiresAt: string;
  requestedVariantKey: AssetSignedVariantKey;
  servedVariantKey: AssetSignedVariantKey | null;
  status: "ok" | "fallback";
  url: string;
};

export function resolveAssetUrl(
  assetId: string,
  variantKey: AssetSignedVariantKey,
): Promise<ResolvedAssetUrl>;

export async function resolveAssetPreviewUrl(
  assetId: string,
  variantKey: AssetSignedVariantKey = "preview",
): Promise<string> {
  return (await resolveAssetUrl(assetId, variantKey)).url;
}
```

Batch all queued keys up to 100, send each item's requested variant with `allowVariantFallback: true`, match successes by `assetId + requestedVariantKey`, and reject unmatched entries whose `assetId` appears in `errors`. Never issue an original retry batch. Retry only a rejected signing HTTP call once after `150ms`; do not retry an `ASSET_UNAVAILABLE` item.

- [ ] **Step 5: Add exact-entry invalidation and refresh**

```ts
export function invalidateAssetUrl(assetId: string, variantKey: AssetSignedVariantKey): void;
export function refreshAssetUrl(
  assetId: string,
  variantKey: AssetSignedVariantKey,
): Promise<ResolvedAssetUrl>;
```

Keep `invalidateAssetPreviewUrl` and `refreshAssetPreviewUrl` as preview-default wrappers for existing callers.

- [ ] **Step 6: Run resolver and frontend build checks**

Run: `npm test -- src/assets/assetPreviewResolver.test.ts`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 7: Commit resolver behavior**

```bash
git add src/assets/assetApi.ts src/assets/assetPreviewResolver.ts src/assets/assetPreviewResolver.test.ts
git commit -m "perf(frontend): resolve asset variants per item"
```

### Task 4: Add a bounded session cache and clear it at auth boundaries

**Files:**

- Modify: `src/assets/assetUrlCache.ts`
- Modify: `src/assets/assetUrlCache.test.ts`
- Modify: `src/auth/AuthProvider.tsx`
- Modify: `src/auth/AuthProvider.test.tsx`

- [ ] **Step 1: Write cache tests before changing storage**

Cover valid same-tab restoration, malformed JSON, invalid item shape, non-finite/near expiry, exact requested-variant keys, earliest-expiring eviction after 200 entries, and scope switch. In `AuthProvider.test.tsx`, mock the cache module, load a session, assert the tenant/user scope, invoke logout through the context harness, and assert cache clearing occurs before the auth client call.

```ts
setAssetUrlCacheScope({ tenantId: "tenant-a", userId: "user-a" });
setCachedAssetUrl({
  assetId: "asset-1",
  expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  requestedVariantKey: "thumb",
  servedVariantKey: "preview",
  status: "fallback",
  url: "https://storage.test/preview.webp?signature=temporary",
});
clearAssetUrlMemoryCache();
expect(getCachedAssetUrl("asset-1", "thumb")?.servedVariantKey).toBe("preview");
```

The auth assertions are:

```ts
await waitFor(() => expect(setAssetUrlCacheScopeMock).toHaveBeenCalledWith({
  tenantId: session.currentTenant.id,
  userId: session.user.id,
}));
await act(() => authValue.logout());
expect(clearAssetUrlCacheMock).toHaveBeenCalledTimes(1);
expect(clearAssetUrlCacheMock.mock.invocationCallOrder[0]).toBeLessThan(
  logoutMock.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
);
```

- [ ] **Step 2: Run cache tests and verify session restoration fails**

Run: `npm test -- src/assets/assetUrlCache.test.ts src/auth/AuthProvider.test.tsx`

Expected: FAIL because the cache is memory-only and has no auth scope.

- [ ] **Step 3: Implement scoped, validated storage**

Use `tapflow.asset-url-cache.v1:<tenantId>:<userId>` as the session key, `MAX_CACHE_ENTRIES = 200`, and the existing 60-second safety window. Export:

```ts
export function setAssetUrlCacheScope(
  scope: { tenantId: string; userId: string } | null,
): void;
export function clearAssetUrlMemoryCache(): void;
export function clearAssetUrlCache(): void;
```

`setAssetUrlCacheScope` must clear memory before hydrating a different scope. Parse stored JSON inside `try/catch`, accept only HTTPS URLs, same-origin relative URLs, or HTTP URLs on localhost during development; also require finite future expiry, non-empty asset ID, `thumb|preview` requested key, `thumb|preview|null` served key, and `ok|fallback` status. Expiry and explicit invalidation remove the entry from memory and session storage. On every write, sort by parsed expiry ascending and remove the earliest entries until 200 remain. `clearAssetUrlCache` removes both memory and the active session key.

- [ ] **Step 4: Connect cache scope to authentication**

In `AuthProvider`, add:

```ts
useEffect(() => {
  if (!session?.currentTenant?.id || !session.user?.id) {
    setAssetUrlCacheScope(null);
    return;
  }
  setAssetUrlCacheScope({
    tenantId: session.currentTenant.id,
    userId: session.user.id,
  });
}, [session?.currentTenant?.id, session?.user?.id]);
```

Call `clearAssetUrlCache()` immediately before `v2AuthClient.logout()`. This clears signed URLs even if the logout request fails but its `finally` clears auth tokens.

- [ ] **Step 5: Run cache, auth, and resolver tests**

Run: `npm test -- src/assets/assetUrlCache.test.ts src/assets/assetPreviewResolver.test.ts src/auth/AuthProvider.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit session caching**

```bash
git add src/assets/assetUrlCache.ts src/assets/assetUrlCache.test.ts src/auth/AuthProvider.tsx src/auth/AuthProvider.test.tsx
git commit -m "perf(frontend): cache signed asset urls per session"
```

### Task 5: Render thumb first and upgrade preview only on demand

**Files:**

- Create: `src/flowCanvas/nodes/useLayeredImageAssetUrls.ts`
- Create: `src/flowCanvas/nodes/useLayeredImageAssetUrls.test.tsx`
- Modify: `src/flowCanvas/nodes/FlowNodes.tsx`

- [ ] **Step 1: Write the layered hook tests**

Use `renderHook` and a mocked resolver to prove the hook requests `thumb` for every mounted asset, deduplicates IDs, requests no preview while `previewRequested` is false, requests preview only for `previewAssetId` after selection/fullscreen/edit activation, keeps the thumb if preview fails, retries when a later preview intent changes the request key, replaces the thumb only after preview succeeds, refreshes one failed thumb once, and ignores late completion after unmount.

```ts
const { result, rerender } = renderHook(
  (props) => useLayeredImageAssetUrls(props),
  { initialProps: {
    assetIds: ["asset-a", "asset-a", "asset-b"],
    previewAssetId: "asset-a",
    previewRequestKey: "idle",
    previewRequested: false,
  } },
);

expect(resolveAssetUrlMock).toHaveBeenCalledWith("asset-a", "thumb");
expect(resolveAssetUrlMock).toHaveBeenCalledWith("asset-b", "thumb");
expect(resolveAssetUrlMock).not.toHaveBeenCalledWith("asset-a", "preview");

rerender({ assetIds: ["asset-a", "asset-b"], previewAssetId: "asset-a", previewRequestKey: "selected", previewRequested: true });
expect(resolveAssetUrlMock).toHaveBeenCalledWith("asset-a", "preview");
```

- [ ] **Step 2: Run the hook test and confirm the module is missing**

Run: `npm test -- src/flowCanvas/nodes/useLayeredImageAssetUrls.test.tsx`

Expected: FAIL because `useLayeredImageAssetUrls.ts` does not exist.

- [ ] **Step 3: Implement the hook as the state boundary**

Expose this interface:

```ts
export function useLayeredImageAssetUrls(input: {
  assetIds: string[];
  previewAssetId?: string | null;
  previewRequestKey: string;
  previewRequested: boolean;
}): {
  displayUrlFor: (assetId: string) => string;
  previewUrl: string;
  refreshThumb: (assetId: string) => Promise<string>;
  thumbUrlsByAssetId: Record<string, string>;
};
```

Resolve thumbs in a cancellable `Promise.allSettled` effect. Resolve only `previewAssetId` in a second cancellable effect when `previewRequested` becomes true. Include `previewRequestKey` in that effect's dependencies without storing a failed intent, so opening fullscreen or an editing tool can retry a failed selection prefetch. `displayUrlFor` returns a loaded preview only for its matching asset; otherwise it returns that asset's loaded thumb.

- [ ] **Step 4: Replace preview-first state in `FlowNodes.tsx`**

Compute `previewRequested` from existing node state:

```ts
const previewRequested = Boolean(
  selected || fullscreenOpen || (activeImageTool?.nodeId === id),
);
const previewRequestKey = fullscreenOpen
  ? "fullscreen"
  : activeImageTool?.nodeId === id
    ? `tool:${activeImageTool.tool}`
    : selected
      ? "selected"
      : "idle";
const layeredUrls = useLayeredImageAssetUrls({
  assetIds: previewAssetIds,
  previewAssetId: activeDisplayAssetId || assetId || runtimePrimaryAssetId,
  previewRequestKey,
  previewRequested,
});
```

Use `layeredUrls.thumbUrlsByAssetId` for result strips and normal canvas cards. Use `layeredUrls.previewUrl || effectiveThumbnailUrl` for `ImageFullscreenOverlay`. Keep `resolveEditableImageSource({ variantKey: "preview" })` for editing and keep the original-only download helper unchanged. Do not write resolved URLs through `updateNodeData` or into draft JSON.

- [ ] **Step 5: Change browser loading priority and one-item refresh**

For both canvas image `<img>` elements:

```tsx
<img
  decoding="async"
  fetchPriority={selected ? "high" : "auto"}
  loading="lazy"
  onError={onImageError}
  onLoad={onImageLoad}
  src={displayThumbnailUrl}
/>
```

Pass `selected` into `ImageNodeCard`. Update `handleImagePreviewError` to key retries by `assetId + thumb URL`, call `layeredUrls.refreshThumb(failedAssetId)`, and stop after one failed refresh. A preview upgrade failure must never set the visible thumb state to error.

- [ ] **Step 6: Run focused flow tests and canonicalization coverage**

Run: `npm test -- src/flowCanvas/nodes/useLayeredImageAssetUrls.test.tsx src/flowCanvas/utils/editableImageSource.test.ts src/flowCanvas/utils/canonicalGraph.test.ts`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 7: Commit layered rendering**

```bash
git add src/flowCanvas/nodes/useLayeredImageAssetUrls.ts src/flowCanvas/nodes/useLayeredImageAssetUrls.test.tsx src/flowCanvas/nodes/FlowNodes.tsx
git commit -m "perf(canvas): render image thumbnails before previews"
```

### Task 6: Add canvas thumbnail performance marks

**Files:**

- Create: `src/flowCanvas/performance/canvasThumbnailPerformance.ts`
- Create: `src/flowCanvas/performance/canvasThumbnailPerformance.test.ts`
- Modify: `src/flowCanvas/hooks/useRemoteFlowProject.ts`
- Modify: `src/flowCanvas/nodes/useLayeredImageAssetUrls.ts`
- Modify: `src/flowCanvas/nodes/FlowNodes.tsx`

- [ ] **Step 1: Write deterministic tracker tests**

Inject `markNow`, `markMeasure`, and `clearPerformanceMeasure` helpers. Assert exact once-only marks for draft ready, signing start/end, first thumb, 90 percent of 12 unique expected IDs (11 loaded), and preview upgrade.

```ts
tracker.reset("project-1");
tracker.markDraftReady();
tracker.beginSigning(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"]);
tracker.endSigning();
["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"].forEach((id) => tracker.markThumbVisible(id));

expect(markNow).toHaveBeenCalledWith("canvas-first-thumb-visible");
expect(markNow).toHaveBeenCalledWith("canvas-visible-thumbs-90pct");
expect(markNow).toHaveBeenCalledWith("canvas-thumb-signing-start");
expect(markNow).toHaveBeenCalledWith("canvas-thumb-signing-end");
```

- [ ] **Step 2: Run the tracker test and confirm the module is missing**

Run: `npm test -- src/flowCanvas/performance/canvasThumbnailPerformance.test.ts`

Expected: FAIL because the tracker module does not exist.

- [ ] **Step 3: Implement a small singleton tracker using existing mark helpers**

Export `createCanvasThumbnailPerformanceTracker` for tests and `canvasThumbnailPerformance` for app code. `reset(projectId)` clears expected/loaded ID sets, the pending signing-group counter, and once-only flags. `beginSigning` adds unique IDs, increments the pending group count, and marks signing start once; `endSigning` decrements the counter and marks signing end only when it reaches zero; `markThumbVisible` marks first visibility and the 90-percent threshold using `Math.ceil(expected.size * 0.9)`; `markPreviewVisible` marks `canvas-preview-upgrade-visible` once. Measure draft-ready-to-first-thumb and signing-start-to-end with `markMeasure`.

- [ ] **Step 4: Wire lifecycle marks**

At the beginning of a new project load, call `reset(projectId)`. Immediately after `loadProject(...)` has applied the canonical server draft, call `markDraftReady()`. In the layered hook, call `beginSigning(uniqueAssetIds)` before thumb resolution and `endSigning()` after `Promise.allSettled`. In the card's image `onLoad`, call `markThumbVisible(activeDisplayAssetId)`; when a loaded preview URL becomes the displayed URL, call `markPreviewVisible(activeDisplayAssetId)`.

- [ ] **Step 5: Run performance and flow tests**

Run: `npm test -- src/flowCanvas/performance/canvasThumbnailPerformance.test.ts src/flowCanvas/nodes/useLayeredImageAssetUrls.test.tsx src/performance/performanceMarks.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit instrumentation**

```bash
git add src/flowCanvas/performance/canvasThumbnailPerformance.ts src/flowCanvas/performance/canvasThumbnailPerformance.test.ts src/flowCanvas/hooks/useRemoteFlowProject.ts src/flowCanvas/nodes/useLayeredImageAssetUrls.ts src/flowCanvas/nodes/FlowNodes.tsx
git commit -m "feat(canvas): measure thumbnail loading milestones"
```

### Task 7: Convert historical repair to audit-first queue enqueueing

**Files:**

- Modify: `scripts/backfill-asset-variants.ts`
- Modify: `scripts/backfill-asset-variants.test.ts`

- [ ] **Step 1: Write parser, selection, safety, and enqueue tests**

Test these exact defaults and flags:

```ts
expect(parseBackfillArgs([])).toEqual({
  apply: false,
  batchSize: 25,
  limit: 500,
  missing: "any",
  tenantId: null,
});
expect(parseBackfillArgs([
  "--apply",
  "--batch-size=10",
  "--limit=80",
  "--missing=thumb",
  "--tenant-id=11111111-1111-4111-8111-111111111111",
])).toMatchObject({ apply: true, batchSize: 10, limit: 80, missing: "thumb" });
```

Also assert that audit mode never calls `queue.add`, missing-one-variant rows are selected for `any`, the production guard rejects an unscoped apply without acknowledgement, scoped production apply is allowed, job IDs are deterministic, and output summaries contain counts/bytes but no bucket or object key.

- [ ] **Step 2: Run the script tests and confirm old mutation semantics fail**

Run: `npm test -- scripts/backfill-asset-variants.test.ts`

Expected: FAIL because the current script mutates unless `--dry-run`, processes S3 objects directly, and misses assets with exactly one absent variant.

- [ ] **Step 3: Replace the duplicated Sharp/S3 pipeline with queue dependencies**

Remove `S3Client`, `S3StorageProvider`, `sharp`, `createImageVariants`, and object-body reads from the script. Import:

```ts
import { createPgPool } from "@aigc-flow/db";
import {
  closeRedisConnection,
  createQueueFactory,
  createRedisConnection,
  QUEUE_NAMES,
  resolveQueuePrefix,
  resolveRedisUrl,
} from "@aigc-flow/redis";
```

Define `BackfillArgs` with `apply`, `batchSize`, `limit`, `missing`, and `tenantId`. Validate tenant IDs as UUIDs, integers as positive values, `batchSize <= 100`, and `missing` as `thumb|preview|any`. Keep `--dry-run` accepted as a deprecated audit-only alias so old runbooks cannot accidentally mutate.

- [ ] **Step 4: Select assets missing either required variant**

Use a query shaped as:

```sql
SELECT
  a.id::text AS id,
  a.tenant_id::text AS tenant_id,
  COALESCE(a.size_bytes, 0)::text AS original_size_bytes,
  (thumb.asset_id IS NULL) AS missing_thumb,
  (preview.asset_id IS NULL) AS missing_preview
FROM assets a
LEFT JOIN asset_variants thumb
  ON thumb.tenant_id = a.tenant_id
 AND thumb.asset_id = a.id
 AND thumb.variant_key = 'thumb'
LEFT JOIN asset_variants preview
  ON preview.tenant_id = a.tenant_id
 AND preview.asset_id = a.id
 AND preview.variant_key = 'preview'
WHERE a.kind = 'image'
  AND a.status = 'available'
  AND a.deleted_at IS NULL
  AND ($1::uuid IS NULL OR a.tenant_id = $1::uuid)
  AND CASE $2::text
    WHEN 'thumb' THEN thumb.asset_id IS NULL
    WHEN 'preview' THEN preview.asset_id IS NULL
    ELSE thumb.asset_id IS NULL OR preview.asset_id IS NULL
  END
ORDER BY a.created_at, a.id
LIMIT $3
```

Aggregate selected count, missing-thumb count, missing-preview count, and original bytes in process memory. Never select or print bucket names, object keys, or signed URLs.

- [ ] **Step 5: Require explicit apply and enqueue existing jobs**

Audit mode prints the aggregate and exits without connecting to Redis. Apply mode connects using existing `REDIS_URL` and `QUEUE_PREFIX`, batches rows by `batchSize`, and adds:

```ts
await queue.add(
  "asset.image-variants.create",
  { assetId: row.id, tenantId: row.tenant_id },
  { jobId: `asset-image-variant-${row.id}-v1` },
);
```

Use hyphens because BullMQ custom job IDs must not contain `:`. Existing queue defaults provide three attempts and exponential backoff. If `NODE_ENV=production`, an unscoped `--apply` requires `ASSET_VARIANT_BACKFILL_PRODUCTION_ACK=enqueue-all-tenants`; a tenant-scoped apply remains allowed. Close the queue, Redis connection, and pool in `finally`.

- [ ] **Step 6: Run backfill and runtime variant tests**

Run: `npm test -- scripts/backfill-asset-variants.test.ts`

Expected: PASS.

Run: `npm run test --workspace @aigc-flow/worker -- media-variants.test.ts`

Expected: PASS and confirm runtime output remains thumb 640px/WebP quality 80 and preview 1024px/WebP quality 78.

- [ ] **Step 7: Commit audit-first repair**

```bash
git add scripts/backfill-asset-variants.ts scripts/backfill-asset-variants.test.ts
git commit -m "fix(assets): enqueue audit-first variant backfill"
```

### Task 8: Isolate image-variant worker concurrency

**Files:**

- Modify: `apps/worker/src/config/env.ts`
- Modify: `apps/worker/src/queues/registry.ts`
- Modify: `apps/worker/src/main.ts`
- Modify: `apps/worker/test/worker.test.ts`
- Modify: `docker-compose.staging.yml`
- Modify: `docs/STAGING_ENV_TEMPLATE.md`

- [ ] **Step 1: Change worker tests to require independent concurrency**

Add `assetImageVariantConcurrency` to every explicit `WorkerEnv` fixture. In the env test assert default `2` and override `5`. In the queue-registration test change:

```ts
expect(workerOptions.get(QUEUE_NAMES.assetImageVariant)?.concurrency).toBe(2);
```

while general queues remain at their existing expected values.

- [ ] **Step 2: Run worker tests and confirm the missing field fails**

Run: `npm run test --workspace @aigc-flow/worker -- worker.test.ts`

Expected: FAIL because the env and queue concurrency types do not contain `assetImageVariantConcurrency`.

- [ ] **Step 3: Parse, pass, and log the new setting**

In `getWorkerEnv` parse:

```ts
const assetImageVariantConcurrency = parsePositiveIntegerEnv(
  "ASSET_IMAGE_VARIANT_CONCURRENCY",
  process.env.ASSET_IMAGE_VARIANT_CONCURRENCY,
  2,
);
```

Add `assetImageVariant: number` to `WorkerQueueConcurrency`, return it when `queueName === QUEUE_NAMES.assetImageVariant`, pass `env.assetImageVariantConcurrency` from `main.ts`, and include it in the startup log. Do not change `WORKER_IMAGE_VARIANTS_MODE`; first rollout remains `sync`.

- [ ] **Step 4: Expose the variable to the container and staging template**

Add to `x-tapflow-env`:

```yaml
ASSET_IMAGE_VARIANT_CONCURRENCY: ${ASSET_IMAGE_VARIANT_CONCURRENCY:-2}
WORKER_IMAGE_VARIANTS_MODE: ${WORKER_IMAGE_VARIANTS_MODE:-sync}
```

Document staging values as `ASSET_IMAGE_VARIANT_CONCURRENCY = 2` and `WORKER_IMAGE_VARIANTS_MODE = sync`.

- [ ] **Step 5: Run worker tests and build**

Run: `npm run test --workspace @aigc-flow/worker -- worker.test.ts media-variants.test.ts`

Expected: PASS.

Run: `npm run build --workspace @aigc-flow/worker`

Expected: PASS.

- [ ] **Step 6: Commit worker isolation**

```bash
git add apps/worker/src/config/env.ts apps/worker/src/queues/registry.ts apps/worker/src/main.ts apps/worker/test/worker.test.ts docker-compose.staging.yml docs/STAGING_ENV_TEMPLATE.md
git commit -m "perf(worker): isolate image variant concurrency"
```

### Task 9: Document rollout, repair, acceptance, and rollback

**Files:**

- Modify: `docs/PRODUCTION_RUNBOOK.md`
- Modify: `docs/staging-runbook.md`
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Replace mutation-by-default backfill commands**

Use the production image's existing `tsx`-backed npm script. The audit command is:

```bash
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm tapflow-worker npm run assets:backfill-variants -- --limit=500 --batch-size=25 --missing=any
```

First list active tenants with the approved read-only database session:

```sql
SELECT id::text, name, slug
FROM tenants
WHERE status = 'active'
ORDER BY name, id;
```

Then read the approved UUID into a task-specific shell variable and run the first scoped applied batch:

```bash
read -r -p "Approved tenant UUID: " TAPFLOW_VARIANT_TENANT_ID
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm tapflow-worker npm run assets:backfill-variants -- --apply --tenant-id="${TAPFLOW_VARIANT_TENANT_ID}" --limit=20 --batch-size=5 --missing=any
```

The unscoped production command must pass `-e ASSET_VARIANT_BACKFILL_PRODUCTION_ACK=enqueue-all-tenants` and may run only after the scoped batch succeeds.

- [ ] **Step 2: Add operational gates**

Document this order: capture baseline; deploy backward-compatible API; deploy worker/script; audit; enqueue 20 scoped assets; inspect queue failures, CPU, storage objects, and `asset_variants`; enqueue controlled batches until audit returns zero; deploy frontend; run mainland-China browser checks. Keep `WORKER_IMAGE_VARIANTS_MODE=sync` and concurrency `2` during the rollout.

- [ ] **Step 3: Add acceptance queries and thresholds**

Document this read-only variant coverage query:

```sql
SELECT
  count(*) AS supported_assets,
  count(*) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM asset_variants v
      WHERE v.tenant_id = a.tenant_id AND v.asset_id = a.id AND v.variant_key = 'thumb'
    )
    AND EXISTS (
      SELECT 1 FROM asset_variants v
      WHERE v.tenant_id = a.tenant_id AND v.asset_id = a.id AND v.variant_key = 'preview'
    )
  ) AS fully_covered_assets,
  round(100.0 * count(*) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM asset_variants v
      WHERE v.tenant_id = a.tenant_id AND v.asset_id = a.id AND v.variant_key = 'thumb'
    )
    AND EXISTS (
      SELECT 1 FROM asset_variants v
      WHERE v.tenant_id = a.tenant_id AND v.asset_id = a.id AND v.variant_key = 'preview'
    )
  ) / NULLIF(count(*), 0), 2) AS coverage_percent
FROM assets a
WHERE a.kind = 'image'
  AND a.status = 'available'
  AND a.deleted_at IS NULL;
```

The approved gates are: over 99 percent variant coverage, API signing P95 below 100ms excluding public RTT, first thumb P75 below 1s/P95 below 2s, 90 percent of 12 thumbs P75 below 1.5s/P95 below 3s, same-tab refresh first image below 500ms, thumb P95 below 300KB, 12-thumb transfer below 2.5MB, and no original downloads after backfill.

- [ ] **Step 4: Add rollback instructions**

Document: roll frontend back to preview requests first; stop new backfill enqueueing; leave generated variants intact; reduce `ASSET_IMAGE_VARIANT_CONCURRENCY` or stop the worker before changing queue behavior; roll API back last; do not delete assets, variants, drafts, workflow history, or billing records.

- [ ] **Step 5: Update the project record**

Add a dated entry summarizing the API bulk lookup, thumb-first rendering, bounded session cache, queue-based repair, independent concurrency, tests run, and whether live Ningbo/mainland metrics have been collected. Do not claim live thresholds passed until the production measurements exist.

- [ ] **Step 6: Search docs for obsolete commands and commit**

Run: `rg -n "assets:backfill-variants.*(--dry-run|--limit)" docs docker-compose.staging.yml`

Expected: only audit-default and explicit `--apply` instructions remain.

```bash
git add docs/PRODUCTION_RUNBOOK.md docs/staging-runbook.md PROJECT_RECORD.md
git commit -m "docs: add thumbnail rollout and rollback runbook"
```

### Task 10: Full verification and mainland-China browser acceptance

**Files:**

- Verify all files changed in Tasks 1-9.

- [ ] **Step 1: Run focused frontend tests**

Run:

```bash
npm test -- src/assets/assetUrlCache.test.ts src/assets/assetPreviewResolver.test.ts src/flowCanvas/nodes/useLayeredImageAssetUrls.test.tsx src/flowCanvas/performance/canvasThumbnailPerformance.test.ts src/performance/performanceMarks.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run backend and worker tests**

Run:

```bash
npm run test --workspace @aigc-flow/api -- assets-signed-url-schema.test.ts assets.test.ts
npm run test --workspace @aigc-flow/worker -- worker.test.ts media-variants.test.ts
npm test -- scripts/backfill-asset-variants.test.ts
```

Expected: PASS. If local Postgres/Redis infrastructure is absent, start `npm run dev:infra`, run `npm run db:migrate`, repeat, and record any remaining external-infrastructure failure exactly.

- [ ] **Step 3: Run the complete required checks**

Run:

```bash
npm run build
npm test
npm run build --workspace @aigc-flow/api
npm run build --workspace @aigc-flow/worker
```

Expected: all commands PASS. If an unrelated historical test fails, verify it against `docs/CODEX_HANDOFF.md`, record the exact test and failure, and do not hide it.

- [ ] **Step 4: Inspect persistence safety**

Run:

```bash
rg -n "signedUrl|expiresAt|servedVariantKey|requestedVariantKey" src/flowCanvas/store src/flowCanvas/services src/flowCanvas/utils/canonicalGraph.ts
```

Expected: no new write of signed URL metadata into authoritative node data or `flow_drafts.graph_json`.

- [ ] **Step 5: Run local real-browser smoke before deployment**

Start `npm run dev:api`, `npm run dev:worker`, and `npm run dev` in separate terminals. In a real browser, sign in, open a QA project containing 12 image nodes, fit them into view, and verify desktop `1440x900` and mobile `390x844` layouts have no overlap or blank image regressions. In DevTools Network, disable cache for the cold run and confirm one `/api/v2/assets/signed-urls` POST for up to 100 mounted unique IDs, `thumb` responses, lazy image requests, and no original object request. Re-enable normal cache and refresh the same tab to validate session restoration.

- [ ] **Step 6: Capture performance evidence**

In the browser console run:

```js
performance.getEntriesByType("mark")
  .filter((entry) => entry.name.startsWith("canvas-"))
  .map(({ name, startTime }) => ({ name, startTime }));
performance.getEntriesByType("measure")
  .filter((entry) => entry.name.startsWith("canvas-"))
  .map(({ duration, name }) => ({ duration, name }));
```

Record cold and same-tab-refresh results plus Network transferred bytes. Verify one unavailable asset produces only its compact failure state while the other eleven load.

- [ ] **Step 7: Deploy in the approved Docker Compose v2 order when authorized**

```bash
cd /opt/aittco/tapflow
git fetch --all --prune
git pull --ff-only origin main
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml build
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml stop tapflow-worker
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm tapflow-api node packages/db/dist/cli.js
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml up -d tapflow-redis tapflow-api tapflow-worker tapflow-frontend
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml ps
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml logs --tail=100 tapflow-api tapflow-worker
```

No new migration is expected, but the standard migration command remains in the safe deployment sequence.

- [ ] **Step 8: Run the Ningbo/mainland acceptance pass**

Repeat Steps 5-6 from a mainland-China browser against the deployed environment. Accept only when the thresholds in Task 9 pass, variant fallback counts are near zero after backfill, unavailable items do not delay successful ones, fullscreen/editing use preview quality, downloads use original bytes, and logs contain metrics but no signed URLs or secrets.

- [ ] **Step 9: Commit only verification record updates**

If live results add evidence to `PROJECT_RECORD.md` or the runbook, commit only those files:

```bash
git add PROJECT_RECORD.md docs/PRODUCTION_RUNBOOK.md
git commit -m "docs: record thumbnail performance verification"
```

Do not create an empty commit when no verification document changed.
