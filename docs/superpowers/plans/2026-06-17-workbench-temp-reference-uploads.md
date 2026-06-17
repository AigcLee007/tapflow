# Workbench Temp Reference Uploads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let workbench reference images upload through a workbench-only temporary API, without creating `assets` records, without entering the asset library, and without browser direct OSS upload.

**Architecture:** Add tenant-scoped `workbench_reference_uploads` rows that store temporary image bytes in Postgres `bytea` with an expiry timestamp. Workbench generation requests accept `referenceUploadIds` alongside legacy `referenceAssetIds`; the worker hydrates both sources into `inputAssets`, using base64 data URLs for temporary uploads.

**Tech Stack:** Vite React frontend, Fastify API, Postgres migrations/RLS, BullMQ worker, Vitest.

---

### Task 1: Database Shape

**Files:**
- Create: `packages/db/migrations/000026_workbench_reference_uploads.sql`

- [ ] **Step 1: Create a tenant-scoped temp upload table**

```sql
CREATE TABLE IF NOT EXISTS workbench_reference_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  original_filename text NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  width int NULL,
  height int NULL,
  bytes bytea NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  used_at timestamptz NULL
);
```

- [ ] **Step 2: Add generation linkage and indexes**

```sql
ALTER TABLE workbench_generations
  ADD COLUMN IF NOT EXISTS reference_upload_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[];

CREATE INDEX IF NOT EXISTS idx_workbench_reference_uploads_tenant_created
  ON workbench_reference_uploads(tenant_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_workbench_reference_uploads_tenant_expires
  ON workbench_reference_uploads(tenant_id, expires_at ASC)
  WHERE status = 'active';
```

- [ ] **Step 3: Add RLS policies**

```sql
ALTER TABLE workbench_reference_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE workbench_reference_uploads FORCE ROW LEVEL SECURITY;

CREATE POLICY workbench_reference_uploads_select_current_tenant
  ON workbench_reference_uploads
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY workbench_reference_uploads_insert_current_tenant
  ON workbench_reference_uploads
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY workbench_reference_uploads_update_current_tenant
  ON workbench_reference_uploads
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY workbench_reference_uploads_delete_current_tenant
  ON workbench_reference_uploads
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());
```

### Task 2: API Contract

**Files:**
- Modify: `apps/api/src/modules/workbench/workbench.schemas.ts`
- Modify: `apps/api/src/modules/workbench/workbench.routes.ts`
- Modify: `apps/api/src/modules/workbench/workbench.service.ts`
- Test: `apps/api/test/workbench.test.ts`

- [ ] **Step 1: Add failing schema tests**

```ts
test("accepts temporary reference upload ids on generation requests", () => {
  const parsed = createWorkbenchGenerationSchema.parse({
    modelId: "pixellelabs.nano-banana-pro",
    params: {},
    prompt: "use @å›? as reference",
    referenceAssetIds: [],
    referenceUploadIds: ["00000000-0000-4000-8000-000000000031"],
    requestedCount: 1,
    routeKey: "image.pixellelabs.nano-banana-pro",
  });

  expect(parsed.referenceUploadIds).toEqual(["00000000-0000-4000-8000-000000000031"]);
});
```

- [ ] **Step 2: Extend schemas**

Add `referenceUploadIds: z.array(z.string().uuid()).max(8).default([])` to `createWorkbenchGenerationSchema`.

- [ ] **Step 3: Add upload route**

Add `POST /api/v2/workbench/reference-uploads` with `requireAuth`, `requireTenant`, and `requirePermission("flow:run")`. It accepts a raw image body, validates `content-type` starts with `image/`, limits size through Fastify body limit, and returns `{ id, previewUrl, mimeType, sizeBytes, originalFilename, expiresAt }`.

- [ ] **Step 4: Persist generation upload ids**

Include `reference_upload_ids` in `workbench_generations` inserts, list/get mapping, retry requests, and generation responses.

### Task 3: Worker Hydration

**Files:**
- Modify: `apps/worker/src/workbench/workbench-generation.service.ts`
- Test: `apps/worker/test/workbench-generation.service.test.ts`

- [ ] **Step 1: Add failing worker test**

Test that `createProviderTask` combines persisted assets and temp uploads, and that temp uploads are sent as `metadata.base64`/`metadata.url` data URLs to `mediaRuntime.generateImage`.

- [ ] **Step 2: Load temp uploads**

Query active, unexpired `workbench_reference_uploads` rows by tenant and ids. Return `AssetReferenceInput[]` with `assetId`, `mimeType`, dimensions, and `metadata: { base64: dataUrl, url: dataUrl, source: "workbench-temp-upload" }`.

- [ ] **Step 3: Mark used uploads**

After successful provider task creation, update selected rows to `used` and set `used_at = now()`.

### Task 4: Frontend Upload Flow

**Files:**
- Modify: `src/services/v2WorkbenchApi.ts`
- Modify: `src/workbench/workbenchTypes.ts`
- Modify: `src/workbench/workbenchModelParams.ts`
- Modify: `src/workbench/useWorkbenchGenerations.ts`
- Modify: `src/workbench/WorkbenchComposer.tsx`
- Test: `src/workbench/WorkbenchPage.test.tsx`

- [ ] **Step 1: Add failing frontend tests**

Update existing upload tests to expect `uploadWorkbenchReferenceFile` instead of `uploadAssetFile`, and expect generation payloads to include `referenceUploadIds`.

- [ ] **Step 2: Add API client**

Add `uploadWorkbenchReferenceFile(file)` that POSTs the file to `/workbench/reference-uploads` with image content type headers.

- [ ] **Step 3: Switch composer state**

Rename the workbench-only reference state to upload ids while keeping local preview URLs. The reference strip should not call asset download APIs for temp uploads.

- [ ] **Step 4: Submit upload ids**

`useWorkbenchGenerations.submit` should send filtered `referenceUploadIds` from prompt `@å›¾N` references and keep legacy `referenceAssetIds` for historical reuse only.

### Task 5: Validation and Records

**Files:**
- Modify: `PROJECT_RECORD.md`

- [ ] **Step 1: Update project record**

Add a dated entry documenting temporary workbench references, no asset-library pollution, and validation commands.

- [ ] **Step 2: Run validation**

Run:

```bash
npm run test -- apps/api/test/workbench.test.ts
npm run test --workspace @aigc-flow/worker -- workbench-generation.service.test.ts
npm run test -- src/workbench/WorkbenchPage.test.tsx src/workbench/workbenchReferences.test.ts
npm run build
```

- [ ] **Step 3: Commit and push**

Stage only files touched by this task, commit with `feat: add temporary workbench references`, and push `main`.
