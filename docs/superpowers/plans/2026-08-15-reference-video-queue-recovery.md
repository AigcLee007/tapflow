# Reference Video Queue Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** Make uploaded oversized reference videos reliably enter the BullMQ preparation queue and recover existing `pending` assets without re-uploading.

**Architecture:** Add one safe, deterministic Job ID helper in `@aigc-flow/redis`, then use it in both the API upload-completion path and the Worker reconciler. Keep the upload durable when queue submission has an idempotent duplicate, but emit structured diagnostics for unexpected queue failures; the existing reconciler remains the recovery mechanism. No database migration or synchronous transcoding is included.

**Tech Stack:** TypeScript, BullMQ, Redis, Fastify/Pino logging, PostgreSQL-backed assets, Vitest, npm workspaces, Docker Compose staging.

---

### Task 1: Add A Safe Shared Job ID Helper

**Files:**
- Modify: `packages/redis/src/queues.ts`
- Modify: `packages/redis/src/index.ts` to re-export the helper from the package barrel
- Test: `packages/redis/test/redis.test.ts`

- [ ] **Step 1: Write the failing helper test**

Add a unit test beside the queue-name tests:

```ts
test("builds a BullMQ-safe reference video variant job ID", () => {
  const jobId = buildAssetVideoReferenceVariantJobId("  asset-1:legacy  ");

  expect(jobId).toBe("reference-720p-asset-1-legacy");
  expect(jobId).not.toContain(":");
  expect(jobId).toMatch(/^[A-Za-z0-9-]+$/);
});
```

Import `buildAssetVideoReferenceVariantJobId` from `../src/index.js` in the test import list.

- [ ] **Step 2: Run the focused Redis test and verify it fails**

Run: `npm run test --workspace @aigc-flow/redis -- redis.test.ts`

Expected: FAIL because the helper is not exported yet.

- [ ] **Step 3: Implement the minimal helper and export**

Add this function near the stable queue constants in `packages/redis/src/queues.ts`:

```ts
export function buildAssetVideoReferenceVariantJobId(assetId: string): string {
  const normalizedAssetId = assetId.trim().replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!normalizedAssetId) throw new Error("ASSET_VIDEO_REFERENCE_VARIANT_ASSET_ID_REQUIRED");
  return `reference-720p-${normalizedAssetId}`;
}
```

Export it from `packages/redis/src/index.ts` if that barrel does not already export `queues.ts` symbols.

- [ ] **Step 4: Run the focused Redis tests**

Run: `npm run test --workspace @aigc-flow/redis -- redis.test.ts`

Expected: all non-integration Redis tests pass; Redis integration tests may remain skipped when `REDIS_URL` is absent.

- [ ] **Step 5: Commit the shared helper**

```bash
git add packages/redis/src/queues.ts packages/redis/src/index.ts packages/redis/test/redis.test.ts
git commit -m "fix(redis): generate BullMQ-safe reference video job ids"
```

### Task 2: Use The Shared ID In API Enqueueing

**Files:**
- Modify: `apps/api/src/modules/assets/assets.service.ts:33-39,477-500`
- Test: `apps/api/test/assets.test.ts:280-335`

- [ ] **Step 1: Update the API test expectation before implementation**

Change the existing enqueue expectation from `video-asset:reference-720p` to `reference-720p-video-asset`. Add an unexpected-error test whose queue throws `new Error("Redis unavailable")`; assert the helper resolves without throwing and the test logger receives the asset ID, tenant ID, queue name, and sanitized error message.

- [ ] **Step 2: Run the focused API asset test and verify the ID assertion fails**

Run: `npm run test --workspace @aigc-flow/api -- assets.test.ts`

Expected: FAIL only on the old colon-based Job ID assertion.

- [ ] **Step 3: Pass a structured logger into the asset service**

Extend `AssetsService` construction with a narrow logger dependency:

```ts
type AssetQueueLogger = {
  error: (bindings: Record<string, unknown>, message: string) => void;
};
```

Store `assetQueueLogger` on `AssetsService`, defaulting to a no-op logger in direct unit construction. In `apps/api/src/app.ts`, pass an adapter that delegates to the Fastify application logger. Keep the dependency narrow so asset service tests can supply a spy without constructing Fastify.

- [ ] **Step 4: Use the helper and narrow enqueue error handling**

Import `buildAssetVideoReferenceVariantJobId` from `@aigc-flow/redis` and replace the inline ID with:

```ts
jobId: buildAssetVideoReferenceVariantJobId(input.asset.id),
```

Catch queue errors only to preserve durable upload completion, and emit:

```ts
this.assetQueueLogger.error(
  {
    assetId: input.asset.id,
    queueName: QUEUE_NAMES.assetVideoReferenceVariant,
    tenantId: input.context.tenantId,
    traceId: input.context.traceId ?? null,
    err: error,
  },
  "failed to enqueue asset video reference variant job",
);
```

Do not log URLs, headers, media bytes, or credentials. The existing `pending` metadata remains the reconciler retry signal.

- [ ] **Step 5: Run the API asset tests**

Run: `npm run test --workspace @aigc-flow/api -- assets.test.ts`

Expected: all asset tests pass, including the safe Job ID and unexpected enqueue logging cases.

- [ ] **Step 6: Commit the API change**

```bash
git add apps/api/src/app.ts apps/api/src/modules/assets/assets.service.ts apps/api/test/assets.test.ts
git commit -m "fix(api): observe and safely enqueue reference video jobs"
```

### Task 3: Use The Shared ID In Worker Reconciliation

**Files:**
- Modify: `apps/worker/src/workflow-runtime/reference-video-variant-reconciler.ts:1-75`
- Test: `apps/worker/test/reference-video-variant-reconciler.test.ts`

- [ ] **Step 1: Update the reconciler test expectation before implementation**

Change both expected Job IDs to `reference-720p-asset-pending` and `reference-720p-asset-legacy`. Add a logger spy to the reconciler constructor and a queue rejection test with this shape:

```ts
const logger = { error: vi.fn() };
const queue = {
  add: vi.fn()
    .mockRejectedValueOnce(new Error("Redis unavailable"))
    .mockResolvedValueOnce({}),
};
const reconciler = new ReferenceVideoVariantReconciler({ logger, pool: pool as never, queue });

await expect(reconciler.reconcile()).resolves.toBe(1);
expect(logger.error).toHaveBeenCalledWith(
  expect.objectContaining({ assetId: "asset-pending", tenantId: "tenant-1" }),
  expect.stringContaining("reference video variant"),
);
```

- [ ] **Step 2: Run the focused Worker test and verify the old ID assertion fails**

Run: `npm run test --workspace @aigc-flow/worker -- reference-video-variant-reconciler.test.ts`

Expected: FAIL on the colon-based Job ID assertions.

- [ ] **Step 3: Replace the inline ID and add per-candidate diagnostics**

Add the reconciler dependency type `{ error: (bindings: Record<string, unknown>, message: string) => void }`, default it to a no-op logger for direct tests, and inject the shared helper. Keep the existing SQL marking behavior, but wrap each `queue.add` in a per-candidate `try/catch` that calls `logger.error({ assetId, tenantId, queueName: "asset.video-reference-variant", err: error }, "reference video variant reconciliation failed")`, then continues the batch. Increment the returned `queued` count only after a successful `queue.add`.

- [ ] **Step 4: Run the focused Worker test**

Run: `npm run test --workspace @aigc-flow/worker -- reference-video-variant-reconciler.test.ts`

Expected: all reconciler tests pass and the invalid-colon error is absent.

- [ ] **Step 5: Commit the Worker change**

```bash
git add apps/worker/src/workflow-runtime/reference-video-variant-reconciler.ts apps/worker/test/reference-video-variant-reconciler.test.ts
git commit -m "fix(worker): recover pending reference video jobs"
```

### Task 4: Full Focused Verification And Project Record

**Files:**
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Record the incident resolution**

Add a dated entry stating that the root cause was BullMQ rejecting colon-containing custom IDs, that API and reconciler now share a safe ID, that unexpected enqueue failures are logged, and that no database migration was required.

- [ ] **Step 2: Run focused tests across all changed boundaries**

Run:

```bash
npm run test --workspace @aigc-flow/redis -- redis.test.ts
npm run test --workspace @aigc-flow/api -- assets.test.ts
npm run test --workspace @aigc-flow/worker -- reference-video-variant-reconciler.test.ts video-reference-variant-processor.test.ts
```

Expected: all runnable tests pass; Redis/database integration tests may be skipped only when their required infrastructure is unavailable.

- [ ] **Step 3: Run builds and diff validation**

Run:

```bash
npm run build --workspace @aigc-flow/redis
npm run build --workspace @aigc-flow/api
npm run build --workspace @aigc-flow/worker
npm run build
git diff --check
```

Expected: all builds pass and `git diff --check` reports no whitespace errors.

- [ ] **Step 4: Commit the record and final verification**

```bash
git add PROJECT_RECORD.md
git commit -m "docs: record reference video queue recovery"
git status --short
```

Expected: only unrelated pre-existing files, if any, remain outside the isolated worktree changes.

### Task 5: Merge, Push, And Deploy Verification

- [ ] **Step 1: Rebase the branch onto the latest `origin/main`**

```bash
git fetch origin --prune
git rebase origin/main
```

- [ ] **Step 2: Fast-forward the root `main` checkout without staging unrelated files**

From `D:\tapnow-flow`, run:

```bash
git merge --ff-only codex/reference-video-queue-recovery
git push origin main
```

- [ ] **Step 3: Deploy with the v2 Compose order**

```bash
cd /opt/aittco/tapflow
git fetch --all --prune
git pull --ff-only origin main
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml build
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml stop tapflow-worker
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml run --rm tapflow-api node packages/db/dist/cli.js
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml up -d tapflow-redis tapflow-api tapflow-worker tapflow-frontend
docker compose --env-file /opt/aittco/env/tapflow.staging.env -f docker-compose.staging.yml logs --tail=100 tapflow-worker
```

No migration is expected for this patch; running the standard migration command remains part of the deployment safety sequence and should report no pending schema change.

- [ ] **Step 4: Validate production recovery**

Confirm that Worker logs no longer contain `Custom Id cannot contain :`, the reconciler enqueues existing pending assets within 60 seconds, and one oversized reference video reaches `ready` with a persisted `reference-720p` variant.
