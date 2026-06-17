# Independent Image Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an independent `/workbench` image generation studio with desktop and mobile experiences, server-side history, existing AI Gateway execution, billing, and cloud asset persistence.

**Architecture:** Add a new tenant-scoped workbench domain instead of extending the project-scoped canvas workbench. The backend owns workbench history, billing reservation, generation execution, output asset persistence, and send-to-project insertion; the frontend owns responsive desktop/mobile composition and result interactions.

**Tech Stack:** PostgreSQL migrations, Fastify API modules, BullMQ queues, existing `DatabaseMediaRuntime`, existing `MediaAssetStore`, Vite + React + TypeScript, shared menu primitives, Vitest, React Testing Library.

---

## File Structure

Create backend database/runtime files:

- `packages/db/migrations/000025_workbench_generations.sql` - tenant-scoped workbench sessions, generations, results, and RLS policies.
- `apps/api/src/modules/workbench/workbench.schemas.ts` - Zod schemas for list/create/retry/send-to-project request contracts.
- `apps/api/src/modules/workbench/workbench.service.ts` - API service for history listing, generation creation, retry creation, status reads, and send-to-project.
- `apps/api/src/modules/workbench/workbench.routes.ts` - authenticated `/api/v2/workbench/*` routes.
- `apps/api/src/modules/workbench/workbench.service.test.ts` - service-level API tests with mocked database/queues.
- `apps/worker/src/processors/workbench-generate.processor.ts` - BullMQ processor that delegates to the workbench execution service.
- `apps/worker/src/workbench/workbench-generation.service.ts` - worker service that loads generation records, calls AI Gateway, persists assets, writes results, and settles/refunds billing.
- `apps/worker/src/workbench/workbench-generation.service.test.ts` - worker service tests with mocked media runtime, billing, and asset store.

Modify backend infrastructure:

- `packages/redis/src/queues.ts` - add `workbench.generate` queue and lightweight payload type.
- `apps/api/src/app.ts` - instantiate and decorate `WorkbenchService`; register workbench routes; create workbench queue.
- `apps/api/src/fastify.d.ts` - add `workbenchService` decoration.
- `apps/worker/src/queues/registry.ts` - register `workbench.generate` processor.
- `apps/worker/src/main.ts` - pass workbench generation service into queue registration.

Create frontend workbench files:

- `src/services/v2WorkbenchApi.ts` - typed frontend API client for `/api/v2/workbench/*`.
- `src/workbench/workbenchTypes.ts` - UI/domain types for composer state, history, results, and model parameter snapshots.
- `src/workbench/workbenchModelParams.ts` - model-aware parameter defaults and normalization for Nano Banana and GPT-Image-2.
- `src/workbench/useWorkbenchGenerations.ts` - hook for history loading, create/retry polling, and optimistic pending cards.
- `src/workbench/WorkbenchPage.tsx` - top-level `/workbench` page and responsive layout coordinator.
- `src/workbench/WorkbenchComposer.tsx` - shared desktop/mobile composer using shared menu controls.
- `src/workbench/WorkbenchResultFeed.tsx` - generation result feed cards.
- `src/workbench/WorkbenchResultSheet.tsx` - mobile result detail bottom sheet.
- `src/workbench/SendToProjectDialog.tsx` - project picker/quick-create dialog for secondary canvas insertion.
- `src/workbench/WorkbenchPage.test.tsx`
- `src/workbench/workbenchModelParams.test.ts`
- `src/workbench/useWorkbenchGenerations.test.tsx`

Modify frontend infrastructure:

- `src/app/routes.ts` - add `WORKBENCH_ROUTE` and include `/workbench` in product routes.
- `src/app/AppRouter.tsx` - render `<WorkbenchPage />` under `WorkspaceShell`.
- `src/app/WorkspaceShell.tsx` - add `工作台` nav item on desktop and mobile nav.
- `src/app/WorkspaceShell.test.tsx` - lock desktop/mobile workbench navigation.
- `PROJECT_RECORD.md` - record implementation progress after the feature is complete.

Do not use browser `localStorage` or IndexedDB for authoritative workbench history. Do not put raw provider credentials, base URLs, or upstream model names in frontend responses.

---

### Task 1: Database Migration For Workbench History

**Files:**

- Create: `packages/db/migrations/000025_workbench_generations.sql`

- [ ] **Step 1: Write the migration**

Create `packages/db/migrations/000025_workbench_generations.sql`:

```sql
CREATE TABLE IF NOT EXISTS workbench_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '工作台',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_workbench_sessions_tenant_updated
  ON workbench_sessions(tenant_id, updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS workbench_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id uuid NULL REFERENCES workbench_sessions(id) ON DELETE SET NULL,
  created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  prompt text NOT NULL,
  model_id text NOT NULL,
  route_key text NOT NULL,
  params_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  reference_asset_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  requested_count int NOT NULL DEFAULT 1 CHECK (requested_count BETWEEN 1 AND 8),
  display_mode text NOT NULL DEFAULT 'merged' CHECK (display_mode IN ('merged', 'separate')),
  estimated_credits numeric(12, 4) NOT NULL DEFAULT 0,
  charged_credits numeric(12, 4) NULL,
  reserved_credits numeric(12, 4) NOT NULL DEFAULT 0,
  billing_usage_event_id uuid NULL,
  reserve_ledger_id uuid NULL,
  settle_ledger_id uuid NULL,
  refund_ledger_id uuid NULL,
  provider_task_id text NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'running', 'waiting_provider', 'succeeded', 'failed', 'canceled')),
  error_json jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NULL,
  finished_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_workbench_generations_tenant_created
  ON workbench_generations(tenant_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_workbench_generations_tenant_session_created
  ON workbench_generations(tenant_id, session_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_workbench_generations_tenant_status
  ON workbench_generations(tenant_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS workbench_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  generation_id uuid NOT NULL REFERENCES workbench_generations(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (generation_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_workbench_results_tenant_generation_order
  ON workbench_results(tenant_id, generation_id, sort_order ASC, created_at ASC);

ALTER TABLE workbench_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workbench_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY workbench_sessions_select_current_tenant
  ON workbench_sessions
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY workbench_sessions_insert_current_tenant
  ON workbench_sessions
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY workbench_sessions_update_current_tenant
  ON workbench_sessions
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY workbench_sessions_delete_current_tenant
  ON workbench_sessions
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());

ALTER TABLE workbench_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE workbench_generations FORCE ROW LEVEL SECURITY;

CREATE POLICY workbench_generations_select_current_tenant
  ON workbench_generations
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY workbench_generations_insert_current_tenant
  ON workbench_generations
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY workbench_generations_update_current_tenant
  ON workbench_generations
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY workbench_generations_delete_current_tenant
  ON workbench_generations
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());

ALTER TABLE workbench_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE workbench_results FORCE ROW LEVEL SECURITY;

CREATE POLICY workbench_results_select_current_tenant
  ON workbench_results
  FOR SELECT
  USING (tenant_id = app.current_tenant_id());

CREATE POLICY workbench_results_insert_current_tenant
  ON workbench_results
  FOR INSERT
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY workbench_results_update_current_tenant
  ON workbench_results
  FOR UPDATE
  USING (tenant_id = app.current_tenant_id())
  WITH CHECK (tenant_id = app.current_tenant_id());

CREATE POLICY workbench_results_delete_current_tenant
  ON workbench_results
  FOR DELETE
  USING (tenant_id = app.current_tenant_id());
```

- [ ] **Step 2: Run DB package build**

Run:

```bash
npm run build --workspace @aigc-flow/db
```

Expected: TypeScript build passes. SQL migrations are loaded by the existing migrator and do not need TypeScript edits.

- [ ] **Step 3: Commit database migration**

```bash
git add packages/db/migrations/000025_workbench_generations.sql
git commit -m "feat: add workbench history tables"
```

---

### Task 2: Queue Contract For Workbench Generation

**Files:**

- Modify: `packages/redis/src/queues.ts`
- Test: use existing package build

- [ ] **Step 1: Add the queue name and payload type**

Modify `packages/redis/src/queues.ts`:

```ts
export const QUEUE_NAMES = {
  assetImageVariant: "asset.image-variant",
  assetIngest: "asset.ingest",
  auditFlush: "audit.flush",
  billingSettle: "billing.settle",
  emailSend: "email.send",
  nodeExecute: "node.execute",
  nodeExecuteDefault: "node.execute.default",
  nodeExecuteImage: "node.execute.image",
  nodeExecuteVideo: "node.execute.video",
  providerPoll: "provider.poll",
  workbenchGenerate: "workbench.generate",
  workflowStart: "workflow.start",
} as const;
```

Add below `ProviderPollJobPayload`:

```ts
export type WorkbenchGenerateJobPayload = BaseJobPayload & {
  generationId: string;
};
```

Add to `QueuePayloadMap`:

```ts
"workbench.generate": WorkbenchGenerateJobPayload;
```

- [ ] **Step 2: Run redis package build**

Run:

```bash
npm run build --workspace @aigc-flow/redis
```

Expected: build passes and the payload remains lightweight because it only contains `tenantId`, optional `traceId`, and `generationId`.

- [ ] **Step 3: Commit queue contract**

```bash
git add packages/redis/src/queues.ts
git commit -m "feat: add workbench generation queue"
```

---

### Task 3: API Schemas And Service Skeleton

**Files:**

- Create: `apps/api/src/modules/workbench/workbench.schemas.ts`
- Create: `apps/api/src/modules/workbench/workbench.service.ts`
- Create: `apps/api/src/modules/workbench/workbench.service.test.ts`

- [ ] **Step 1: Write schema tests through service validation**

Create `apps/api/src/modules/workbench/workbench.service.test.ts`:

```ts
import { describe, expect, test } from "vitest";

import { createWorkbenchGenerationSchema } from "./workbench.schemas.js";

describe("workbench schemas", () => {
  test("accepts a valid image generation request", () => {
    const parsed = createWorkbenchGenerationSchema.parse({
      displayMode: "merged",
      modelId: "pixellelabs.nano-banana-pro",
      params: { aspect_ratio: "1:1", size: "1K" },
      prompt: "产品海报，干净背景",
      referenceAssetIds: [],
      requestedCount: 2,
      routeKey: "image.nano-banana-pro",
    });

    expect(parsed.requestedCount).toBe(2);
    expect(parsed.displayMode).toBe("merged");
  });

  test("rejects empty prompt and unsafe count", () => {
    expect(() =>
      createWorkbenchGenerationSchema.parse({
        modelId: "gpt-image-2",
        params: {},
        prompt: " ",
        referenceAssetIds: [],
        requestedCount: 0,
        routeKey: "image.gpt-image-2",
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run failing API test**

Run:

```bash
npm run test --workspace @aigc-flow/api -- workbench.service.test.ts
```

Expected: fail because `workbench.schemas.ts` does not exist.

- [ ] **Step 3: Create schemas**

Create `apps/api/src/modules/workbench/workbench.schemas.ts`:

```ts
import { z } from "zod";

export const workbenchGenerationIdParamsSchema = z.object({
  generationId: z.string().uuid(),
});

export const workbenchResultIdParamsSchema = z.object({
  resultId: z.string().uuid(),
});

export const listWorkbenchGenerationsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const workbenchDisplayModeSchema = z.enum(["merged", "separate"]);

export const createWorkbenchGenerationSchema = z.object({
  displayMode: workbenchDisplayModeSchema.default("merged"),
  idempotencyKey: z.string().min(8).max(160).optional(),
  modelId: z.string().min(1).max(160),
  params: z.record(z.string(), z.unknown()).default({}),
  prompt: z.string().trim().min(1).max(8000),
  referenceAssetIds: z.array(z.string().uuid()).max(8).default([]),
  requestedCount: z.number().int().min(1).max(8).default(1),
  routeKey: z.string().min(1).max(200),
  sessionId: z.string().uuid().optional(),
});

export const sendWorkbenchResultToProjectSchema = z.object({
  projectId: z.string().uuid().optional(),
  projectName: z.string().trim().min(1).max(120).optional(),
});

export type CreateWorkbenchGenerationInput = z.infer<typeof createWorkbenchGenerationSchema>;
export type ListWorkbenchGenerationsQuery = z.infer<typeof listWorkbenchGenerationsQuerySchema>;
export type SendWorkbenchResultToProjectInput = z.infer<typeof sendWorkbenchResultToProjectSchema>;
export type WorkbenchGenerationIdParams = z.infer<typeof workbenchGenerationIdParamsSchema>;
export type WorkbenchResultIdParams = z.infer<typeof workbenchResultIdParamsSchema>;
```

- [ ] **Step 4: Create service skeleton types**

Create `apps/api/src/modules/workbench/workbench.service.ts`:

```ts
import { BillingService, createPgPool, withTenantTransaction } from "@aigc-flow/db";
import type { Queue } from "bullmq";
import type { Pool } from "pg";

import type { WorkbenchGenerateJobPayload } from "@aigc-flow/redis";
import type {
  CreateWorkbenchGenerationInput,
  ListWorkbenchGenerationsQuery,
  SendWorkbenchResultToProjectInput,
} from "./workbench.schemas.js";

type WorkbenchContext = {
  tenantId: string;
  traceId?: string | null;
  userId: string | null;
};

type WorkbenchGenerationRow = {
  charged_credits: string | null;
  created_at: string;
  display_mode: "merged" | "separate";
  error_json: unknown;
  estimated_credits: string;
  finished_at: string | null;
  id: string;
  model_id: string;
  params_json: Record<string, unknown>;
  prompt: string;
  reference_asset_ids: string[];
  requested_count: number;
  route_key: string;
  session_id: string | null;
  started_at: string | null;
  status: string;
  updated_at: string;
};

type WorkbenchResultRow = {
  asset_id: string;
  created_at: string;
  id: string;
  metadata_json: Record<string, unknown>;
  sort_order: number;
};

export class WorkbenchApiError extends Error {
  readonly code: string;
  readonly details?: unknown;
  readonly statusCode: number;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = "WorkbenchApiError";
    this.statusCode = statusCode;
  }
}

export class WorkbenchService {
  readonly billingService: BillingService;
  readonly generationQueue: Pick<Queue<WorkbenchGenerateJobPayload>, "add"> | null;
  readonly pool: Pool;

  constructor(options: {
    billingService?: BillingService;
    generationQueue?: Pick<Queue<WorkbenchGenerateJobPayload>, "add"> | null;
    pool?: Pool;
  }) {
    this.billingService = options.billingService ?? new BillingService({ pool: options.pool });
    this.generationQueue = options.generationQueue ?? null;
    this.pool = options.pool ?? createPgPool();
  }

  async listGenerations(context: WorkbenchContext, query: ListWorkbenchGenerationsQuery) {
    return withTenantTransaction(context, async (client) => {
      const result = await client.query<WorkbenchGenerationRow>(
        `
          SELECT
            id::text AS id,
            session_id::text AS session_id,
            prompt,
            model_id,
            route_key,
            params_json,
            reference_asset_ids::text[] AS reference_asset_ids,
            requested_count,
            display_mode,
            estimated_credits::text AS estimated_credits,
            charged_credits::text AS charged_credits,
            status,
            error_json,
            created_at::text AS created_at,
            updated_at::text AS updated_at,
            started_at::text AS started_at,
            finished_at::text AS finished_at
          FROM workbench_generations
          WHERE tenant_id = $1::uuid
            AND ($2::timestamptz IS NULL OR created_at < $2::timestamptz)
          ORDER BY created_at DESC, id DESC
          LIMIT $3
        `,
        [context.tenantId, query.cursor ?? null, query.limit],
      );

      return {
        generations: await Promise.all(result.rows.map((row) => this.mapGenerationWithResults(context, row))),
        nextCursor: result.rows.length === query.limit ? result.rows[result.rows.length - 1]?.created_at ?? null : null,
      };
    }, this.pool);
  }

  async createGeneration(context: WorkbenchContext, input: CreateWorkbenchGenerationInput) {
    if (!this.generationQueue) {
      throw new WorkbenchApiError(503, "WORKBENCH_QUEUE_UNAVAILABLE", "Workbench generation queue is unavailable.");
    }

    return withTenantTransaction(context, async (client) => {
      await this.assertReferenceAssetsExist(client, context.tenantId, input.referenceAssetIds);
      await this.assertRouteIsActive(client, context.tenantId, input.routeKey);
      const estimatedCredits = await this.estimateCredits(client, context.tenantId, input.routeKey, input.params, input.requestedCount);
      const reservedCents = estimatedCredits;

      const reserveLedger = await this.billingService.reserveUsageWithClient(client, context.tenantId, {
        amountCents: reservedCents,
        description: "Workbench image generation reservation",
        idempotencyKey: input.idempotencyKey ?? `workbench:reserve:${context.tenantId}:${Date.now()}:${input.routeKey}`,
        metadata: {
          modelId: input.modelId,
          requestedCount: input.requestedCount,
          routeKey: input.routeKey,
          source: "workbench",
        },
      });

      const inserted = await client.query<{ id: string; status: string }>(
        `
          INSERT INTO workbench_generations (
            tenant_id,
            session_id,
            created_by,
            prompt,
            model_id,
            route_key,
            params_json,
            reference_asset_ids,
            requested_count,
            display_mode,
            estimated_credits,
            reserved_credits,
            reserve_ledger_id,
            status,
            updated_at
          )
          VALUES (
            $1::uuid,
            $2::uuid,
            $3::uuid,
            $4,
            $5,
            $6,
            $7::jsonb,
            $8::uuid[],
            $9::int,
            $10,
            $11::numeric,
            $11::numeric,
            $12::uuid,
            'queued',
            now()
          )
          RETURNING id::text AS id, status
        `,
        [
          context.tenantId,
          input.sessionId ?? null,
          context.userId,
          input.prompt,
          input.modelId,
          input.routeKey,
          JSON.stringify(input.params),
          input.referenceAssetIds,
          input.requestedCount,
          input.displayMode,
          estimatedCredits,
          reserveLedger.id,
        ],
      );

      const generationId = inserted.rows[0]!.id;
      await this.generationQueue.add(
        "workbench.generate",
        {
          generationId,
          tenantId: context.tenantId,
          traceId: context.traceId ?? undefined,
        },
        {
          jobId: input.idempotencyKey || `workbench:${generationId}`,
        },
      );

      return {
        estimatedCredits,
        generationId,
        status: inserted.rows[0]!.status,
      };
    }, this.pool);
  }

  async getGeneration(context: WorkbenchContext, generationId: string) {
    return withTenantTransaction(context, async (client) => {
      const result = await client.query<WorkbenchGenerationRow>(
        `
          SELECT
            id::text AS id,
            session_id::text AS session_id,
            prompt,
            model_id,
            route_key,
            params_json,
            reference_asset_ids::text[] AS reference_asset_ids,
            requested_count,
            display_mode,
            estimated_credits::text AS estimated_credits,
            charged_credits::text AS charged_credits,
            status,
            error_json,
            created_at::text AS created_at,
            updated_at::text AS updated_at,
            started_at::text AS started_at,
            finished_at::text AS finished_at
          FROM workbench_generations
          WHERE tenant_id = $1::uuid AND id = $2::uuid
          LIMIT 1
        `,
        [context.tenantId, generationId],
      );

      if (result.rowCount === 0) {
        throw new WorkbenchApiError(404, "WORKBENCH_GENERATION_NOT_FOUND", "Workbench generation not found.");
      }

      return this.mapGenerationWithResults(context, result.rows[0]!);
    }, this.pool);
  }

  async retryGeneration(context: WorkbenchContext, generationId: string) {
    const existing = await this.getGeneration(context, generationId);
    return this.createGeneration(context, {
      displayMode: existing.displayMode,
      modelId: existing.modelId,
      params: existing.params,
      prompt: existing.prompt,
      referenceAssetIds: existing.referenceAssetIds,
      requestedCount: existing.requestedCount,
      routeKey: existing.routeKey,
      sessionId: existing.sessionId ?? undefined,
    });
  }

  async sendResultToProject(_context: WorkbenchContext, _resultId: string, _input: SendWorkbenchResultToProjectInput) {
    throw new WorkbenchApiError(501, "SEND_TO_PROJECT_NOT_IMPLEMENTED", "Send to canvas is added by Task 11.");
  }

  private async mapGenerationWithResults(context: WorkbenchContext, row: WorkbenchGenerationRow) {
    const results = await withTenantTransaction(context, async (client) => {
      const result = await client.query<WorkbenchResultRow>(
        `
          SELECT
            id::text AS id,
            asset_id::text AS asset_id,
            sort_order,
            metadata_json,
            created_at::text AS created_at
          FROM workbench_results
          WHERE tenant_id = $1::uuid AND generation_id = $2::uuid
          ORDER BY sort_order ASC, created_at ASC
        `,
        [context.tenantId, row.id],
      );
      return result.rows.map((item) => ({
        assetId: item.asset_id,
        createdAt: item.created_at,
        id: item.id,
        metadata: item.metadata_json ?? {},
        sortOrder: item.sort_order,
      }));
    }, this.pool);

    return {
      chargedCredits: row.charged_credits === null ? null : Number(row.charged_credits),
      createdAt: row.created_at,
      displayMode: row.display_mode,
      error: row.error_json ?? null,
      estimatedCredits: Number(row.estimated_credits),
      finishedAt: row.finished_at,
      id: row.id,
      modelId: row.model_id,
      params: row.params_json ?? {},
      prompt: row.prompt,
      referenceAssetIds: row.reference_asset_ids ?? [],
      requestedCount: row.requested_count,
      results,
      routeKey: row.route_key,
      sessionId: row.session_id,
      startedAt: row.started_at,
      status: row.status,
      updatedAt: row.updated_at,
    };
  }

  private async assertReferenceAssetsExist(client: { query: Function }, tenantId: string, assetIds: string[]) {
    if (assetIds.length === 0) return;
    const result = await client.query(
      `SELECT id::text AS id FROM assets WHERE tenant_id = $1::uuid AND id = ANY($2::uuid[])`,
      [tenantId, assetIds],
    );
    if (result.rowCount !== assetIds.length) {
      throw new WorkbenchApiError(400, "REFERENCE_ASSET_NOT_FOUND", "One or more reference assets are not available.");
    }
  }

  private async assertRouteIsActive(client: { query: Function }, tenantId: string, routeKey: string) {
    const result = await client.query(
      `
        SELECT id::text AS id
        FROM ai_routes
        WHERE route_key = $1
          AND modality = 'image'
          AND status = 'active'
          AND (tenant_id IS NULL OR tenant_id = $2::uuid)
        ORDER BY CASE WHEN tenant_id IS NULL THEN 1 ELSE 0 END ASC, priority ASC
        LIMIT 1
      `,
      [routeKey, tenantId],
    );
    if (result.rowCount === 0) {
      throw new WorkbenchApiError(400, "ROUTE_NOT_AVAILABLE", "Selected image route is not available.");
    }
  }

  private async estimateCredits(client: { query: Function }, tenantId: string, routeKey: string, params: Record<string, unknown>, requestedCount: number) {
    const size = typeof params.size === "string" ? params.size : typeof params.image_size === "string" ? params.image_size : null;
    const pricing = await client.query<{ price_cents: string; metadata: Record<string, unknown> | null }>(
      `
        SELECT
          mp.price_cents::text AS price_cents,
          mp.metadata
        FROM model_pricing mp
        JOIN ai_routes r
          ON r.model_id = mp.model_id
        WHERE r.route_key = $1
          AND r.modality = 'image'
          AND r.status = 'active'
          AND mp.status = 'active'
          AND (r.tenant_id IS NULL OR r.tenant_id = $2::uuid)
          AND (mp.tenant_id IS NULL OR mp.tenant_id = $2::uuid)
        ORDER BY
          CASE WHEN r.tenant_id IS NULL THEN 1 ELSE 0 END ASC,
          CASE WHEN mp.tenant_id IS NULL THEN 1 ELSE 0 END ASC,
          r.priority ASC
        LIMIT 1
      `,
      [routeKey, tenantId],
    );

    const row = pricing.rows[0];
    if (!row) {
      throw new WorkbenchApiError(400, "PRICING_NOT_FOUND", "No active pricing found for the selected workbench route.");
    }

    const sizeTiers = row.metadata?.sizeTiers;
    if (size && sizeTiers && typeof sizeTiers === "object" && !Array.isArray(sizeTiers)) {
      const tierPrice = (sizeTiers as Record<string, unknown>)[size];
      if (typeof tierPrice === "number" && Number.isFinite(tierPrice)) {
        return tierPrice * requestedCount;
      }
    }

    return Number(row.price_cents) * requestedCount;
  }
}
```

- [ ] **Step 5: Run schema/service tests**

Run:

```bash
npm run test --workspace @aigc-flow/api -- workbench.service.test.ts
```

Expected: schema tests pass. Database-backed service behavior is covered by the focused route/service tests added in Tasks 4, 5, and 11.

- [ ] **Step 6: Commit API service skeleton**

```bash
git add apps/api/src/modules/workbench/workbench.schemas.ts apps/api/src/modules/workbench/workbench.service.ts apps/api/src/modules/workbench/workbench.service.test.ts
git commit -m "feat: add workbench API service skeleton"
```

---

### Task 4: Workbench API Routes And App Registration

**Files:**

- Create: `apps/api/src/modules/workbench/workbench.routes.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/fastify.d.ts`
- Test: `apps/api/src/modules/workbench/workbench.routes.test.ts`

- [ ] **Step 1: Write route registration tests**

Create `apps/api/src/modules/workbench/workbench.routes.test.ts`:

```ts
import { describe, expect, test, vi } from "vitest";

import { registerWorkbenchRoutes } from "./workbench.routes.js";

function makeApp() {
  const routes: Array<{ method: string; path: string }> = [];
  return {
    get(path: string) {
      routes.push({ method: "GET", path });
    },
    post(path: string) {
      routes.push({ method: "POST", path });
    },
    routes,
    workbenchService: {},
  } as any;
}

describe("registerWorkbenchRoutes", () => {
  test("registers protected workbench endpoints", () => {
    const app = makeApp();
    registerWorkbenchRoutes(app);

    expect(app.routes).toEqual([
      { method: "GET", path: "/api/v2/workbench/generations" },
      { method: "POST", path: "/api/v2/workbench/generations" },
      { method: "GET", path: "/api/v2/workbench/generations/:generationId" },
      { method: "POST", path: "/api/v2/workbench/generations/:generationId/retry" },
      { method: "POST", path: "/api/v2/workbench/results/:resultId/send-to-project" },
    ]);
  });
});
```

- [ ] **Step 2: Run failing route test**

Run:

```bash
npm run test --workspace @aigc-flow/api -- workbench.routes.test.ts
```

Expected: fail because `workbench.routes.ts` does not exist.

- [ ] **Step 3: Create workbench routes**

Create `apps/api/src/modules/workbench/workbench.routes.ts`:

```ts
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

import { requireAuth, requirePermission, requireTenant } from "../../http/auth-middleware.js";
import {
  type CreateWorkbenchGenerationInput,
  type ListWorkbenchGenerationsQuery,
  type SendWorkbenchResultToProjectInput,
  type WorkbenchGenerationIdParams,
  type WorkbenchResultIdParams,
  createWorkbenchGenerationSchema,
  listWorkbenchGenerationsQuerySchema,
  sendWorkbenchResultToProjectSchema,
  workbenchGenerationIdParamsSchema,
  workbenchResultIdParamsSchema,
} from "./workbench.schemas.js";
import { WorkbenchApiError } from "./workbench.service.js";

function sendError(
  request: FastifyRequest,
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
) {
  return reply.code(statusCode).send({
    error: {
      code,
      details,
      message,
      requestId: request.ctx.requestId,
    },
  });
}

function parseBody<T>(request: FastifyRequest, schema: { parse: (value: unknown) => T }): T {
  return schema.parse(request.body);
}

function parseParams<T>(request: FastifyRequest, schema: { parse: (value: unknown) => T }): T {
  return schema.parse(request.params);
}

function parseQuery<T>(request: FastifyRequest, schema: { parse: (value: unknown) => T }): T {
  return schema.parse(request.query);
}

function getWorkbenchContext(request: FastifyRequest) {
  if (!request.ctx.tenantId) {
    throw new WorkbenchApiError(400, "TENANT_REQUIRED", "Current request is missing tenant context.");
  }
  return {
    tenantId: request.ctx.tenantId,
    traceId: request.ctx.traceId,
    userId: request.ctx.userId,
  };
}

function handleRouteError(error: unknown, request: FastifyRequest, reply: FastifyReply): FastifyReply {
  if (error instanceof ZodError) {
    return sendError(request, reply, 400, "VALIDATION_ERROR", "Request validation failed", error.issues);
  }
  if (error instanceof WorkbenchApiError) {
    return sendError(request, reply, error.statusCode, error.code, error.message, error.details);
  }
  request.log.error(
    {
      err: error,
      requestId: request.ctx.requestId,
      tenantId: request.ctx.tenantId,
      traceId: request.ctx.traceId,
      userId: request.ctx.userId,
    },
    "workbench route failed",
  );
  return sendError(request, reply, 500, "INTERNAL_ERROR", "Service is temporarily unavailable.");
}

export function registerWorkbenchRoutes(app: FastifyInstance): void {
  const authHandlers = [requireAuth, requireTenant, requirePermission("flow:read")];

  app.get(
    "/api/v2/workbench/generations",
    { preHandler: authHandlers },
    async (request, reply) => {
      try {
        const query = parseQuery<ListWorkbenchGenerationsQuery>(request, listWorkbenchGenerationsQuerySchema);
        return reply.send(await app.workbenchService.listGenerations(getWorkbenchContext(request), query));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    "/api/v2/workbench/generations",
    { preHandler: authHandlers },
    async (request, reply) => {
      try {
        const body = parseBody<CreateWorkbenchGenerationInput>(request, createWorkbenchGenerationSchema);
        return reply.code(201).send(await app.workbenchService.createGeneration(getWorkbenchContext(request), body));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.get(
    "/api/v2/workbench/generations/:generationId",
    { preHandler: authHandlers },
    async (request, reply) => {
      try {
        const params = parseParams<WorkbenchGenerationIdParams>(request, workbenchGenerationIdParamsSchema);
        return reply.send(await app.workbenchService.getGeneration(getWorkbenchContext(request), params.generationId));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    "/api/v2/workbench/generations/:generationId/retry",
    { preHandler: authHandlers },
    async (request, reply) => {
      try {
        const params = parseParams<WorkbenchGenerationIdParams>(request, workbenchGenerationIdParamsSchema);
        return reply.code(201).send(await app.workbenchService.retryGeneration(getWorkbenchContext(request), params.generationId));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );

  app.post(
    "/api/v2/workbench/results/:resultId/send-to-project",
    { preHandler: authHandlers },
    async (request, reply) => {
      try {
        const params = parseParams<WorkbenchResultIdParams>(request, workbenchResultIdParamsSchema);
        const body = parseBody<SendWorkbenchResultToProjectInput>(request, sendWorkbenchResultToProjectSchema);
        return reply.code(201).send(await app.workbenchService.sendResultToProject(getWorkbenchContext(request), params.resultId, body));
      } catch (error) {
        return handleRouteError(error, request, reply);
      }
    },
  );
}
```

- [ ] **Step 4: Register the API service in app**

Modify `apps/api/src/app.ts` imports:

```ts
import { registerWorkbenchRoutes } from "./modules/workbench/workbench.routes.js";
import { WorkbenchService } from "./modules/workbench/workbench.service.js";
```

Add queue setup near existing queue creation:

```ts
const workbenchGenerateQueue = appQueueFactory?.createQueue(QUEUE_NAMES.workbenchGenerate);
```

Create the service after queues exist:

```ts
const workbenchService = new WorkbenchService({
  generationQueue: workbenchGenerateQueue ?? null,
  pool,
});
```

Decorate and register:

```ts
app.decorate("workbenchService", workbenchService);
registerWorkbenchRoutes(app);
```

Close the queue in `onClose` with other owned workflow queues:

```ts
workbenchGenerateQueue?.close(),
```

- [ ] **Step 5: Add Fastify decoration type**

Modify `apps/api/src/fastify.d.ts`:

```ts
import type { WorkbenchService } from "./modules/workbench/workbench.service.js";
```

Add to `FastifyInstance`:

```ts
workbenchService: WorkbenchService;
```

- [ ] **Step 6: Run API tests and build**

Run:

```bash
npm run test --workspace @aigc-flow/api -- workbench.routes.test.ts workbench.service.test.ts
npm run build --workspace @aigc-flow/api
```

Expected: tests pass and API builds.

- [ ] **Step 7: Commit API routes**

```bash
git add apps/api/src/app.ts apps/api/src/fastify.d.ts apps/api/src/modules/workbench/workbench.routes.ts apps/api/src/modules/workbench/workbench.routes.test.ts
git commit -m "feat: add workbench API routes"
```

---

### Task 5: Worker Generation Execution

**Files:**

- Create: `apps/worker/src/workbench/workbench-generation.service.ts`
- Create: `apps/worker/src/processors/workbench-generate.processor.ts`
- Create: `apps/worker/src/workbench/workbench-generation.service.test.ts`
- Modify: `apps/worker/src/queues/registry.ts`
- Modify: `apps/worker/src/main.ts`

- [ ] **Step 1: Write worker service tests**

Create `apps/worker/src/workbench/workbench-generation.service.test.ts`:

```ts
import { describe, expect, test, vi } from "vitest";

import { WorkbenchGenerationService } from "./workbench-generation.service.js";

describe("WorkbenchGenerationService", () => {
  test("marks a generation failed when the record is missing", async () => {
    const service = new WorkbenchGenerationService({
      assetStore: {} as never,
      billingService: {} as never,
      mediaRuntime: {} as never,
      pool: {
        connect: vi.fn(),
        query: vi.fn(async () => ({ rowCount: 0, rows: [] })),
      } as never,
    });

    await expect(
      service.processGeneration({
        generationId: "00000000-0000-0000-0000-000000000001",
        tenantId: "00000000-0000-0000-0000-000000000002",
      }),
    ).rejects.toThrow("Workbench generation not found");
  });
});
```

- [ ] **Step 2: Run failing worker test**

Run:

```bash
npm run test --workspace @aigc-flow/worker -- workbench-generation.service.test.ts
```

Expected: fail because service file does not exist.

- [ ] **Step 3: Add workbench-compatible asset persistence**

Modify `apps/worker/src/workflow-runtime/media-asset-store.ts` so `persistOutputs` accepts nullable workflow/node IDs for non-canvas generated assets.

Change the input type:

```ts
async persistOutputs(
  client: PoolClient,
  input: {
    kind: "image" | "video";
    nodeRunId: string | null;
    outputs: MediaOutput[];
    projectId: string | null;
    tenantId: string;
    workflowRunId: string | null;
  },
): Promise<AssetRef[]> {
```

Keep object storage metadata sparse:

```ts
metadata: {
  ...(input.nodeRunId ? { nodeRunId: input.nodeRunId } : {}),
  ...(input.workflowRunId ? { workflowRunId: input.workflowRunId } : {}),
},
```

Keep the `assets` insert nullable fields:

```ts
input.workflowRunId,
input.nodeRunId,
```

Keep asset metadata source explicit:

```ts
JSON.stringify({
  measuredHeight: measuredDimensions.height,
  measuredWidth: measuredDimensions.width,
  providerHeight: output.height ?? null,
  providerWidth: output.width ?? null,
  source: input.workflowRunId ? "workflow-runner" : "workbench",
}),
```

Expected: canvas workflow calls still pass real IDs; workbench calls pass `null` and create normal asset records without fake workflow/node rows.

- [ ] **Step 4: Create worker generation service**

Create `apps/worker/src/workbench/workbench-generation.service.ts`:

```ts
import { createPgPool, BillingService, withTenantTransaction } from "@aigc-flow/db";
import type { DatabaseMediaRuntime, ImageGenerationRequest, MediaOutput, PollTaskRequest } from "@aigc-flow/ai-gateway-core";
import type { Pool } from "pg";

import type { MediaAssetStore } from "../workflow-runtime/media-asset-store.js";

type GenerationRow = {
  created_by: string | null;
  display_mode: "merged" | "separate";
  estimated_credits: string;
  id: string;
  model_id: string;
  params_json: Record<string, unknown>;
  prompt: string;
  reference_asset_ids: string[];
  requested_count: number;
  reserve_ledger_id: string | null;
  reserved_credits: string;
  route_key: string;
  status: string;
  tenant_id: string;
};

type ProcessGenerationInput = {
  generationId: string;
  tenantId: string;
  traceId?: string | null;
};

function normalizeInputAssets(referenceAssetIds: string[]) {
  return referenceAssetIds.map((assetId) => ({ assetId, kind: "image" }));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class WorkbenchGenerationService {
  readonly assetStore: Pick<MediaAssetStore, "persistOutputs">;
  readonly billingService: BillingService;
  readonly mediaRuntime: Pick<DatabaseMediaRuntime, "generateImage" | "pollTask">;
  readonly pool: Pool;

  constructor(options: {
    assetStore: Pick<MediaAssetStore, "persistOutputs">;
    billingService?: BillingService;
    mediaRuntime: Pick<DatabaseMediaRuntime, "generateImage" | "pollTask">;
    pool?: Pool;
  }) {
    this.assetStore = options.assetStore;
    this.billingService = options.billingService ?? new BillingService({ pool: options.pool });
    this.mediaRuntime = options.mediaRuntime;
    this.pool = options.pool ?? createPgPool();
  }

  async processGeneration(input: ProcessGenerationInput) {
    const generation = await this.loadGeneration(input);
    await this.markRunning(input);

    try {
      const request: ImageGenerationRequest = {
        inputAssets: normalizeInputAssets(generation.reference_asset_ids),
        metadata: {
          ...generation.params_json,
          displayMode: generation.display_mode,
          requestedCount: generation.requested_count,
          source: "workbench",
        },
        model: generation.model_id,
        prompt: generation.prompt,
        routeKey: generation.route_key,
      };

      const result = await this.mediaRuntime.generateImage(
        {
          tenantId: generation.tenant_id,
          userId: generation.created_by,
        },
        request,
        {
          workflowRunId: null,
        },
      );

      const outputs = result.status === "waiting_provider"
        ? await this.pollProviderTask(generation, result.providerTaskId ?? null)
        : result.outputs ?? [];

      if (result.status !== "succeeded" && result.status !== "waiting_provider") {
        await this.markFailed(input, {
          code: "WORKBENCH_EMPTY_PROVIDER_OUTPUT",
          message: "Provider did not return image outputs.",
        });
        return { status: "failed" as const };
      }

      if (!outputs.length) {
        await this.markFailed(input, {
          code: "WORKBENCH_EMPTY_PROVIDER_OUTPUT",
          message: "Provider did not return image outputs.",
        });
        await this.refundReservation(generation, input, "Provider did not return image outputs.");
        return { status: "failed" as const };
      }

      await withTenantTransaction(
        { tenantId: input.tenantId, userId: generation.created_by },
        async (client) => {
          const assetRefs = await this.assetStore.persistOutputs(client, {
            kind: "image",
            nodeRunId: null,
            outputs,
            projectId: null,
            tenantId: input.tenantId,
            workflowRunId: null,
          });

          for (let index = 0; index < assetRefs.length; index += 1) {
            const asset = assetRefs[index];
            if (!asset) continue;
            await client.query(
              `
                INSERT INTO workbench_results (
                  tenant_id,
                  generation_id,
                  asset_id,
                  sort_order,
                  metadata_json
                )
                VALUES ($1::uuid, $2::uuid, $3::uuid, $4::int, $5::jsonb)
                ON CONFLICT (generation_id, asset_id) DO NOTHING
              `,
              [
                input.tenantId,
                input.generationId,
                asset.assetId,
                index,
                JSON.stringify({
                  height: asset.height ?? null,
                  mimeType: asset.mimeType,
                  width: asset.width ?? null,
                }),
              ],
            );
          }

          await client.query(
            `
              UPDATE workbench_generations
              SET status = 'succeeded',
                  charged_credits = estimated_credits,
                  updated_at = now(),
                  finished_at = now()
              WHERE tenant_id = $1::uuid AND id = $2::uuid
            `,
            [input.tenantId, input.generationId],
          );

          const usageEvent = await this.billingService.recordUsageEventWithClient(client, input.tenantId, {
            billableCents: Number(generation.estimated_credits),
            eventType: "workbench.image.generate",
            idempotencyKey: `workbench:usage:${input.tenantId}:${input.generationId}`,
            metadata: {
              generationId: input.generationId,
              routeKey: generation.route_key,
              source: "workbench",
            },
            modality: "image",
            modelId: null,
            nodeRunId: null,
            rawCost: null,
            routeId: null,
            workflowRunId: null,
          });
          const settleLedger = await this.billingService.settleUsageWithClient(client, input.tenantId, {
            amountCents: Number(generation.estimated_credits),
            description: "Workbench image generation settled",
            idempotencyKey: `workbench:settle:${input.tenantId}:${input.generationId}`,
            metadata: {
              generationId: input.generationId,
              source: "workbench",
            },
            reservedAmountCents: Number(generation.reserved_credits),
            usageEventId: usageEvent.id,
          });
          await client.query(
            `
              UPDATE workbench_generations
              SET billing_usage_event_id = $3::uuid,
                  settle_ledger_id = $4::uuid
              WHERE tenant_id = $1::uuid AND id = $2::uuid
            `,
            [input.tenantId, input.generationId, usageEvent.id, settleLedger.id],
          );
        },
        this.pool,
      );

      return { status: "succeeded" as const };
    } catch (error) {
      await this.markFailed(input, {
        code: "WORKBENCH_GENERATION_FAILED",
        message: error instanceof Error ? error.message : String(error),
      });
      await this.refundReservation(generation, input, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  private async pollProviderTask(generation: GenerationRow, providerTaskId: string | null): Promise<MediaOutput[]> {
    if (!providerTaskId) {
      throw new Error("Provider returned waiting_provider without providerTaskId");
    }

    const pollRequest: PollTaskRequest = {
      model: generation.model_id,
      providerTaskId,
      routeKey: generation.route_key,
    };

    for (let attempt = 0; attempt < 60; attempt += 1) {
      const poll = await this.mediaRuntime.pollTask(
        {
          tenantId: generation.tenant_id,
          userId: generation.created_by,
        },
        "image",
        pollRequest,
        { workflowRunId: null },
      );
      if (poll.status === "succeeded") {
        return poll.outputs ?? [];
      }
      if (poll.status === "failed") {
        throw new Error(poll.error?.message ? String(poll.error.message) : "Provider async task failed");
      }
      await sleep(Math.min(2_000 + attempt * 500, 8_000));
    }

    throw new Error("Provider async task did not finish before the workbench polling timeout");
  }

  private async loadGeneration(input: ProcessGenerationInput): Promise<GenerationRow> {
    const result = await withTenantTransaction(
      { tenantId: input.tenantId, userId: null },
      async (client) =>
        client.query<GenerationRow>(
          `
            SELECT
              id::text AS id,
              tenant_id::text AS tenant_id,
              created_by::text AS created_by,
              prompt,
              model_id,
              route_key,
              params_json,
              reference_asset_ids::text[] AS reference_asset_ids,
              requested_count,
              reserve_ledger_id::text AS reserve_ledger_id,
              reserved_credits::text AS reserved_credits,
              display_mode,
              estimated_credits::text AS estimated_credits,
              status
            FROM workbench_generations
            WHERE tenant_id = $1::uuid AND id = $2::uuid
            LIMIT 1
          `,
          [input.tenantId, input.generationId],
        ),
      this.pool,
    );

    if (result.rowCount === 0) {
      throw new Error("Workbench generation not found");
    }

    return result.rows[0]!;
  }

  private async markRunning(input: ProcessGenerationInput) {
    await withTenantTransaction(
      { tenantId: input.tenantId, userId: null },
      async (client) => {
        await client.query(
          `
            UPDATE workbench_generations
            SET status = 'running', started_at = COALESCE(started_at, now()), updated_at = now()
            WHERE tenant_id = $1::uuid AND id = $2::uuid
          `,
          [input.tenantId, input.generationId],
        );
      },
      this.pool,
    );
  }

  private async markFailed(input: ProcessGenerationInput, error: Record<string, unknown>) {
    await withTenantTransaction(
      { tenantId: input.tenantId, userId: null },
      async (client) => {
        await client.query(
          `
            UPDATE workbench_generations
            SET status = 'failed',
                error_json = $3::jsonb,
                updated_at = now(),
                finished_at = now()
            WHERE tenant_id = $1::uuid AND id = $2::uuid
          `,
          [input.tenantId, input.generationId, JSON.stringify(error)],
        );
      },
      this.pool,
    );
  }

  private async refundReservation(generation: GenerationRow, input: ProcessGenerationInput, reason: string) {
    const reservedCents = Number(generation.reserved_credits);
    if (!Number.isFinite(reservedCents) || reservedCents <= 0) return;

    await withTenantTransaction(
      { tenantId: input.tenantId, userId: generation.created_by },
      async (client) => {
        const refundLedger = await this.billingService.refundUsageWithClient(client, input.tenantId, {
          amountCents: reservedCents,
          description: "Workbench image generation refunded",
          idempotencyKey: `workbench:refund:${input.tenantId}:${input.generationId}`,
          metadata: {
            generationId: input.generationId,
            reason,
            source: "workbench",
          },
        });
        await client.query(
          `
            UPDATE workbench_generations
            SET refund_ledger_id = $3::uuid
            WHERE tenant_id = $1::uuid AND id = $2::uuid
              AND refund_ledger_id IS NULL
          `,
          [input.tenantId, input.generationId, refundLedger.id],
        );
      },
      this.pool,
    );
  }
}
```

- [ ] **Step 5: Create processor**

Create `apps/worker/src/processors/workbench-generate.processor.ts`:

```ts
import type { Job } from "bullmq";
import type { WorkbenchGenerateJobPayload } from "@aigc-flow/redis";

import type { WorkerLogger } from "../logger.js";
import type { ProcessorResult } from "./shared.js";
import type { WorkbenchGenerationService } from "../workbench/workbench-generation.service.js";

export async function processWorkbenchGenerateJob(
  job: Job<WorkbenchGenerateJobPayload>,
  logger: WorkerLogger,
  options: {
    generationService?: WorkbenchGenerationService;
  },
): Promise<ProcessorResult> {
  if (!options.generationService) {
    throw new Error("generationService is required for workbench generation jobs");
  }

  logger.info(
    {
      generationId: job.data.generationId,
      jobId: job.id ?? null,
      tenantId: job.data.tenantId,
      traceId: job.data.traceId ?? null,
    },
    "processing workbench.generate job",
  );

  const result = await options.generationService.processGeneration(job.data);

  return {
    jobId: job.id ?? null,
    queueName: job.queueName,
    status: result.status,
    tenantId: job.data.tenantId,
    traceId: job.data.traceId ?? null,
  };
}
```

- [ ] **Step 6: Register worker queue**

Modify `apps/worker/src/queues/registry.ts`:

```ts
import { processWorkbenchGenerateJob } from "../processors/workbench-generate.processor.js";
import type { WorkbenchGenerationService } from "../workbench/workbench-generation.service.js";
```

Add `QUEUE_NAMES.workbenchGenerate` to `WORKER_QUEUE_NAMES`.

Add `workbenchGenerationService?: WorkbenchGenerationService;` to `registerWorkerQueues` options.

Add processor branch before the default billing branch:

```ts
: queueName === QUEUE_NAMES.workbenchGenerate
  ? (job: unknown) =>
      processWorkbenchGenerateJob(job as never, options.logger, {
        generationService: options.workbenchGenerationService,
      })
```

- [ ] **Step 7: Wire service in worker main**

Modify `apps/worker/src/main.ts` by constructing `WorkbenchGenerationService` with the same pool/media runtime/asset store dependencies used by workflow runtime. Pass it into `registerWorkerQueues({ workbenchGenerationService })`.

The concrete implementation should reuse the existing `DatabaseMediaRuntime`, `CredentialVault`, storage provider, and `MediaAssetStore` setup already present in `main.ts`.

- [ ] **Step 8: Run worker tests and build**

Run:

```bash
npm run test --workspace @aigc-flow/worker -- workbench-generation.service.test.ts
npm run build --workspace @aigc-flow/worker
```

Expected: tests pass and worker builds.

- [ ] **Step 9: Commit worker generation path**

```bash
git add apps/worker/src/workflow-runtime/media-asset-store.ts apps/worker/src/workbench/workbench-generation.service.ts apps/worker/src/workbench/workbench-generation.service.test.ts apps/worker/src/processors/workbench-generate.processor.ts apps/worker/src/queues/registry.ts apps/worker/src/main.ts
git commit -m "feat: process workbench image generations"
```

---

### Task 6: Frontend API Client And Model Parameter Helpers

**Files:**

- Create: `src/services/v2WorkbenchApi.ts`
- Create: `src/workbench/workbenchTypes.ts`
- Create: `src/workbench/workbenchModelParams.ts`
- Create: `src/workbench/workbenchModelParams.test.ts`

- [ ] **Step 1: Write parameter helper tests**

Create `src/workbench/workbenchModelParams.test.ts`:

```ts
import { describe, expect, test } from "vitest";

import {
  getDefaultWorkbenchDraft,
  normalizeWorkbenchDraftForModel,
  shouldShowMultiResultDisplayMode,
} from "./workbenchModelParams";

describe("workbenchModelParams", () => {
  test("defaults to an image-ready Nano Banana draft", () => {
    expect(getDefaultWorkbenchDraft()).toMatchObject({
      aspectRatio: "1:1",
      displayMode: "merged",
      requestedCount: 1,
      size: "1K",
    });
  });

  test("shows display mode only for multi-result generations", () => {
    expect(shouldShowMultiResultDisplayMode({ requestedCount: 1 })).toBe(false);
    expect(shouldShowMultiResultDisplayMode({ requestedCount: 2 })).toBe(true);
  });

  test("keeps GPT-Image-2 specific options when switching models", () => {
    const draft = normalizeWorkbenchDraftForModel({
      ...getDefaultWorkbenchDraft(),
      modelId: "gpt-image-2",
      outputFormat: "webp",
      quality: "high",
      routeKey: "image.gpt-image-2",
    });

    expect(draft.outputFormat).toBe("webp");
    expect(draft.quality).toBe("high");
  });
});
```

- [ ] **Step 2: Run failing helper tests**

Run:

```bash
npm test -- src/workbench/workbenchModelParams.test.ts
```

Expected: fail because helper files do not exist.

- [ ] **Step 3: Create types**

Create `src/workbench/workbenchTypes.ts`:

```ts
export type WorkbenchDisplayMode = "merged" | "separate";
export type WorkbenchGenerationStatus = "pending" | "queued" | "running" | "waiting_provider" | "succeeded" | "failed" | "canceled";

export type WorkbenchDraft = {
  aspectRatio: string;
  displayMode: WorkbenchDisplayMode;
  modelId: string;
  outputFormat: "jpeg" | "png" | "webp";
  prompt: string;
  quality: "auto" | "high" | "medium" | "low";
  referenceAssetIds: string[];
  requestedCount: number;
  routeKey: string;
  safety: "auto" | "low" | "medium" | "high";
  size: string;
};

export type WorkbenchResult = {
  assetId: string;
  createdAt: string;
  id: string;
  metadata: Record<string, unknown>;
  previewUrl?: string;
  sortOrder: number;
};

export type WorkbenchGeneration = {
  chargedCredits: number | null;
  createdAt: string;
  displayMode: WorkbenchDisplayMode;
  error: unknown;
  estimatedCredits: number;
  finishedAt: string | null;
  id: string;
  modelId: string;
  params: Record<string, unknown>;
  prompt: string;
  referenceAssetIds: string[];
  requestedCount: number;
  results: WorkbenchResult[];
  routeKey: string;
  sessionId: string | null;
  startedAt: string | null;
  status: WorkbenchGenerationStatus;
  updatedAt: string;
};
```

- [ ] **Step 4: Create model parameter helpers**

Create `src/workbench/workbenchModelParams.ts`:

```ts
import type { WorkbenchDraft } from "./workbenchTypes";

export const WORKBENCH_ASPECT_RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"] as const;
export const WORKBENCH_SIZE_OPTIONS = ["Auto", "1K", "2K", "4K"] as const;
export const WORKBENCH_QUANTITY_OPTIONS = [1, 2, 3, 4] as const;

export const WORKBENCH_MODEL_OPTIONS = [
  {
    id: "pixellelabs.nano-banana-pro",
    label: "Nano Banana Pro",
    routeKey: "image.pixellelabs.nano-banana-pro",
  },
  {
    id: "pixellelabs.nano-banana-2",
    label: "Nano Banana 2",
    routeKey: "image.pixellelabs.nano-banana-2",
  },
  {
    id: "gpt-image-2",
    label: "GPT-Image-2",
    routeKey: "image.gpt-image-2",
  },
] as const;

export function getDefaultWorkbenchDraft(): WorkbenchDraft {
  return {
    aspectRatio: "1:1",
    displayMode: "merged",
    modelId: WORKBENCH_MODEL_OPTIONS[0].id,
    outputFormat: "png",
    prompt: "",
    quality: "auto",
    referenceAssetIds: [],
    requestedCount: 1,
    routeKey: WORKBENCH_MODEL_OPTIONS[0].routeKey,
    safety: "auto",
    size: "1K",
  };
}

export function shouldShowMultiResultDisplayMode(input: Pick<WorkbenchDraft, "requestedCount">): boolean {
  return input.requestedCount > 1;
}

export function normalizeWorkbenchDraftForModel(draft: WorkbenchDraft): WorkbenchDraft {
  const model = WORKBENCH_MODEL_OPTIONS.find((item) => item.id === draft.modelId);
  const nextRouteKey = model?.routeKey ?? draft.routeKey;
  if (draft.modelId === "gpt-image-2") {
    return {
      ...draft,
      routeKey: nextRouteKey,
      size: draft.size || "Auto",
    };
  }

  return {
    ...draft,
    outputFormat: "png",
    quality: "auto",
    routeKey: nextRouteKey,
    safety: "auto",
    size: draft.size === "Auto" ? "1K" : draft.size,
  };
}

export function buildWorkbenchGenerationParams(draft: WorkbenchDraft): Record<string, unknown> {
  return {
    aspect_ratio: draft.aspectRatio,
    display_mode: draft.displayMode,
    image_size: draft.size,
    moderation: draft.safety,
    output_format: draft.outputFormat,
    quality: draft.quality,
    size: draft.size,
  };
}
```

- [ ] **Step 5: Create frontend API client**

Create `src/services/v2WorkbenchApi.ts`:

```ts
import { apiGet, apiPost } from "./v2HttpClient";
import type { WorkbenchDisplayMode, WorkbenchGeneration } from "../workbench/workbenchTypes";

export type ListWorkbenchGenerationsResponse = {
  generations: WorkbenchGeneration[];
  nextCursor: string | null;
};

export type CreateWorkbenchGenerationRequest = {
  displayMode: WorkbenchDisplayMode;
  idempotencyKey?: string;
  modelId: string;
  params: Record<string, unknown>;
  prompt: string;
  referenceAssetIds: string[];
  requestedCount: number;
  routeKey: string;
  sessionId?: string;
};

export type CreateWorkbenchGenerationResponse = {
  estimatedCredits: number;
  generationId: string;
  status: string;
};

export function listWorkbenchGenerations(input: { cursor?: string | null; limit?: number } = {}) {
  const params = new URLSearchParams();
  if (input.cursor) params.set("cursor", input.cursor);
  if (input.limit) params.set("limit", String(input.limit));
  return apiGet<ListWorkbenchGenerationsResponse>(
    `/workbench/generations${params.toString() ? `?${params.toString()}` : ""}`,
  );
}

export function createWorkbenchGeneration(input: CreateWorkbenchGenerationRequest) {
  return apiPost<CreateWorkbenchGenerationResponse>("/workbench/generations", input);
}

export function getWorkbenchGeneration(generationId: string) {
  return apiGet<WorkbenchGeneration>(`/workbench/generations/${encodeURIComponent(generationId)}`);
}

export function retryWorkbenchGeneration(generationId: string) {
  return apiPost<CreateWorkbenchGenerationResponse>(`/workbench/generations/${encodeURIComponent(generationId)}/retry`);
}

export function sendWorkbenchResultToProject(resultId: string, input: { projectId?: string; projectName?: string }) {
  return apiPost<{ projectId: string; nodeId: string }>(
    `/workbench/results/${encodeURIComponent(resultId)}/send-to-project`,
    input,
  );
}
```

- [ ] **Step 6: Run helper tests**

Run:

```bash
npm test -- src/workbench/workbenchModelParams.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit frontend API foundations**

```bash
git add src/services/v2WorkbenchApi.ts src/workbench/workbenchTypes.ts src/workbench/workbenchModelParams.ts src/workbench/workbenchModelParams.test.ts
git commit -m "feat: add workbench frontend API foundations"
```

---

### Task 7: Workbench Route And Navigation

**Files:**

- Modify: `src/app/routes.ts`
- Modify: `src/app/AppRouter.tsx`
- Modify: `src/app/WorkspaceShell.tsx`
- Create: `src/workbench/WorkbenchPage.tsx`
- Test: `src/app/WorkspaceShell.test.tsx`
- Test: `src/workbench/WorkbenchPage.test.tsx`

- [ ] **Step 1: Write route smoke test**

Create `src/workbench/WorkbenchPage.test.tsx`:

```tsx
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { AppRouter } from "../app/AppRouter";

vi.mock("../auth/AuthGate", () => ({
  AuthGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("WorkbenchPage route", () => {
  test("renders independent workbench at /workbench", async () => {
    window.history.replaceState(null, "", "/workbench");
    render(<AppRouter />);
    expect(await screen.findByTestId("workbench-page")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run failing route test**

Run:

```bash
npm test -- src/workbench/WorkbenchPage.test.tsx
```

Expected: fail because route/page does not exist.

- [ ] **Step 3: Add route constant**

Modify `src/app/routes.ts`:

```ts
export const WORKBENCH_ROUTE = "/workbench";
```

Add `WORKBENCH_ROUTE` to `PRODUCT_ROUTES`.

- [ ] **Step 4: Create page shell**

Create `src/workbench/WorkbenchPage.tsx`:

```tsx
import React from "react";

export function WorkbenchPage() {
  return (
    <main data-testid="workbench-page" className="min-h-[calc(100vh-160px)] text-white">
      <div data-testid="workbench-layout">工作台</div>
    </main>
  );
}
```

- [ ] **Step 5: Wire AppRouter**

Modify `src/app/AppRouter.tsx`:

```ts
import { WorkbenchPage } from "../workbench/WorkbenchPage";
import { WORKBENCH_ROUTE } from "./routes";
```

Add before project route branch in `ProtectedRoutes`:

```tsx
if (pathname === WORKBENCH_ROUTE || pathname.startsWith(`${WORKBENCH_ROUTE}/`)) {
  return <WorkbenchPage />;
}
```

- [ ] **Step 6: Add nav item**

Modify `src/app/WorkspaceShell.tsx`:

```ts
import { Sparkles } from "lucide-react";
import { WORKBENCH_ROUTE } from "./routes";
```

Add to `navItems` between home and workspace:

```ts
{ icon: Sparkles, label: "工作台", path: WORKBENCH_ROUTE },
```

Update mobile nav grid from `grid-cols-4` to match the new item count:

```tsx
<nav className="grid grid-cols-5 border-t border-white/8 md:hidden">
```

- [ ] **Step 7: Run route/nav tests**

Run:

```bash
npm test -- src/workbench/WorkbenchPage.test.tsx src/app/WorkspaceShell.test.tsx
```

Expected: route test passes. Update `WorkspaceShell.test.tsx` assertions if they rely on exactly four nav items.

- [ ] **Step 8: Commit route and nav**

```bash
git add src/app/routes.ts src/app/AppRouter.tsx src/app/WorkspaceShell.tsx src/workbench/WorkbenchPage.tsx src/workbench/WorkbenchPage.test.tsx src/app/WorkspaceShell.test.tsx
git commit -m "feat: add independent workbench route"
```

---

### Task 8: Workbench History Hook And Result Feed

**Files:**

- Create: `src/workbench/useWorkbenchGenerations.ts`
- Create: `src/workbench/useWorkbenchGenerations.test.tsx`
- Create: `src/workbench/WorkbenchResultFeed.tsx`
- Modify: `src/workbench/WorkbenchPage.tsx`

- [ ] **Step 1: Write hook tests**

Create `src/workbench/useWorkbenchGenerations.test.tsx`:

```tsx
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { useWorkbenchGenerations } from "./useWorkbenchGenerations";

vi.mock("../services/v2WorkbenchApi", () => ({
  listWorkbenchGenerations: vi.fn(async () => ({
    generations: [
      {
        chargedCredits: null,
        createdAt: "2026-06-17T00:00:00.000Z",
        displayMode: "merged",
        error: null,
        estimatedCredits: 2,
        finishedAt: null,
        id: "generation-1",
        modelId: "gpt-image-2",
        params: { size: "1K" },
        prompt: "城市夜景",
        referenceAssetIds: [],
        requestedCount: 1,
        results: [],
        routeKey: "image.gpt-image-2",
        sessionId: null,
        startedAt: null,
        status: "queued",
        updatedAt: "2026-06-17T00:00:00.000Z",
      },
    ],
    nextCursor: null,
  })),
}));

describe("useWorkbenchGenerations", () => {
  test("loads generations from the API", async () => {
    const { result } = renderHook(() => useWorkbenchGenerations());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.generations[0]?.prompt).toBe("城市夜景");
  });
});
```

- [ ] **Step 2: Run failing hook test**

Run:

```bash
npm test -- src/workbench/useWorkbenchGenerations.test.tsx
```

Expected: fail because hook does not exist.

- [ ] **Step 3: Implement history hook**

Create `src/workbench/useWorkbenchGenerations.ts`:

```ts
import { useCallback, useEffect, useState } from "react";

import {
  createWorkbenchGeneration,
  getWorkbenchGeneration,
  listWorkbenchGenerations,
  retryWorkbenchGeneration,
} from "../services/v2WorkbenchApi";
import type { WorkbenchDraft, WorkbenchGeneration } from "./workbenchTypes";
import { buildWorkbenchGenerationParams } from "./workbenchModelParams";

export function useWorkbenchGenerations() {
  const [generations, setGenerations] = useState<WorkbenchGeneration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listWorkbenchGenerations({ limit: 30 });
      setGenerations(result.generations);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create = useCallback(async (draft: WorkbenchDraft) => {
    const created = await createWorkbenchGeneration({
      displayMode: draft.displayMode,
      modelId: draft.modelId,
      params: buildWorkbenchGenerationParams(draft),
      prompt: draft.prompt,
      referenceAssetIds: draft.referenceAssetIds,
      requestedCount: draft.requestedCount,
      routeKey: draft.routeKey,
    });
    const generation = await getWorkbenchGeneration(created.generationId);
    setGenerations((current) => [generation, ...current.filter((item) => item.id !== generation.id)]);
    return generation;
  }, []);

  const retry = useCallback(async (generationId: string) => {
    const created = await retryWorkbenchGeneration(generationId);
    const generation = await getWorkbenchGeneration(created.generationId);
    setGenerations((current) => [generation, ...current]);
    return generation;
  }, []);

  return {
    create,
    error,
    generations,
    loading,
    reload,
    retry,
  };
}
```

- [ ] **Step 4: Create result feed**

Create `src/workbench/WorkbenchResultFeed.tsx`:

```tsx
import React from "react";
import { RotateCcw, SlidersHorizontal } from "lucide-react";

import type { WorkbenchGeneration } from "./workbenchTypes";

type Props = {
  generations: WorkbenchGeneration[];
  loading: boolean;
  onReuseParams: (generation: WorkbenchGeneration) => void;
  onRetry: (generation: WorkbenchGeneration) => void;
};

export function WorkbenchResultFeed({ generations, loading, onReuseParams, onRetry }: Props) {
  if (loading) {
    return <section data-testid="workbench-result-feed" className="grid min-h-[420px] place-items-center text-sm text-slate-500">正在加载...</section>;
  }

  if (generations.length === 0) {
    return (
      <section data-testid="workbench-result-feed" className="grid min-h-[420px] place-items-center text-center text-slate-400">
        <div>
          <div className="text-base font-semibold text-white">开始一次创作</div>
          <div className="mt-2 text-sm">输入提示词后，结果会出现在这里。</div>
        </div>
      </section>
    );
  }

  return (
    <section data-testid="workbench-result-feed" className="grid gap-4">
      {generations.map((generation) => (
        <article key={generation.id} className="rounded-[18px] border border-white/10 bg-white/[0.045] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-white">{generation.prompt}</div>
              <div className="mt-1 text-xs text-slate-400">
                {generation.modelId} · {generation.requestedCount} 张 · {generation.status}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button className="grid h-9 w-9 place-items-center rounded-full bg-white/[0.08] text-slate-200 hover:bg-white/[0.12]" onClick={() => onRetry(generation)} type="button" aria-label="再次生成">
                <RotateCcw size={16} />
              </button>
              <button className="grid h-9 w-9 place-items-center rounded-full bg-white/[0.08] text-slate-200 hover:bg-white/[0.12]" onClick={() => onReuseParams(generation)} type="button" aria-label="复用参数">
                <SlidersHorizontal size={16} />
              </button>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
            {generation.results.length === 0 ? (
              <div className="col-span-full grid min-h-[180px] place-items-center rounded-xl bg-black/20 text-xs text-slate-500">{generation.status}</div>
            ) : (
              generation.results.map((result) => (
                <div key={result.id} className="aspect-square rounded-xl bg-black/30" data-asset-id={result.assetId} />
              ))
            )}
          </div>
        </article>
      ))}
    </section>
  );
}
```

- [ ] **Step 5: Render feed in page**

Modify `src/workbench/WorkbenchPage.tsx`:

```tsx
import { useWorkbenchGenerations } from "./useWorkbenchGenerations";
import { WorkbenchResultFeed } from "./WorkbenchResultFeed";

export function WorkbenchPage() {
  const history = useWorkbenchGenerations();
  return (
    <main data-testid="workbench-page" className="min-h-[calc(100vh-160px)] text-white">
      <WorkbenchResultFeed
        generations={history.generations}
        loading={history.loading}
        onRetry={(generation) => void history.retry(generation.id)}
        onReuseParams={() => undefined}
      />
    </main>
  );
}
```

- [ ] **Step 6: Run hook/page tests**

Run:

```bash
npm test -- src/workbench/useWorkbenchGenerations.test.tsx src/workbench/WorkbenchPage.test.tsx
```

Expected: tests pass.

- [ ] **Step 7: Commit history feed**

```bash
git add src/workbench/useWorkbenchGenerations.ts src/workbench/useWorkbenchGenerations.test.tsx src/workbench/WorkbenchResultFeed.tsx src/workbench/WorkbenchPage.tsx
git commit -m "feat: add workbench result feed"
```

---

### Task 9: Desktop Composer And Layout

**Files:**

- Create: `src/workbench/WorkbenchComposer.tsx`
- Modify: `src/workbench/WorkbenchPage.tsx`
- Test: `src/workbench/WorkbenchPage.test.tsx`

- [ ] **Step 1: Add desktop layout test**

Append to `src/workbench/WorkbenchPage.test.tsx`:

```tsx
test("renders composer and result feed regions", async () => {
  window.history.replaceState(null, "", "/workbench");
  render(<AppRouter />);
  expect(await screen.findByTestId("workbench-composer")).toBeTruthy();
  expect(screen.getByTestId("workbench-result-feed")).toBeTruthy();
});
```

- [ ] **Step 2: Run failing layout test**

Run:

```bash
npm test -- src/workbench/WorkbenchPage.test.tsx
```

Expected: fail because composer is missing.

- [ ] **Step 3: Create composer**

Create `src/workbench/WorkbenchComposer.tsx`:

```tsx
import React from "react";
import { ImagePlus, Send } from "lucide-react";

import { MenuSelect } from "../components/menu/MenuSelect";
import {
  WORKBENCH_ASPECT_RATIOS,
  WORKBENCH_MODEL_OPTIONS,
  WORKBENCH_QUANTITY_OPTIONS,
  WORKBENCH_SIZE_OPTIONS,
  normalizeWorkbenchDraftForModel,
  shouldShowMultiResultDisplayMode,
} from "./workbenchModelParams";
import type { WorkbenchDraft } from "./workbenchTypes";

type Props = {
  draft: WorkbenchDraft;
  generating: boolean;
  onChange: (patch: Partial<WorkbenchDraft>) => void;
  onGenerate: () => void;
};

export function WorkbenchComposer({ draft, generating, onChange, onGenerate }: Props) {
  const update = (patch: Partial<WorkbenchDraft>) => onChange(patch);
  const canGenerate = draft.prompt.trim().length > 0 && !generating;

  return (
    <aside data-testid="workbench-composer" className="flex min-h-0 flex-col border-r border-white/8 bg-[#101014]">
      <div className="flex items-center gap-3 border-b border-white/8 px-5 py-4">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.08] text-white">
          <ImagePlus size={19} />
        </span>
        <div>
          <div className="text-sm font-bold text-white">工作台</div>
          <div className="text-xs text-slate-500">独立生图</div>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
        <label className="grid gap-2">
          <span className="text-xs font-bold text-slate-300">提示词</span>
          <textarea
            aria-label="提示词"
            className="min-h-[150px] resize-none rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-white outline-none focus:border-white/25"
            onChange={(event) => update({ prompt: event.target.value })}
            placeholder="描述你想生成的画面"
            value={draft.prompt}
          />
        </label>

        <MenuSelect
          ariaLabel="模型"
          label="模型"
          onChange={(modelId) => update(normalizeWorkbenchDraftForModel({ ...draft, modelId }))}
          options={WORKBENCH_MODEL_OPTIONS.map((model) => ({ label: model.label, value: model.id }))}
          value={draft.modelId}
        />

        <MenuSelect
          ariaLabel="比例"
          label="比例"
          onChange={(aspectRatio) => update({ aspectRatio })}
          options={WORKBENCH_ASPECT_RATIOS.map((ratio) => ({ label: ratio, value: ratio }))}
          value={draft.aspectRatio}
        />

        <div className="grid grid-cols-2 gap-3">
          <MenuSelect
            ariaLabel="画质"
            label="画质"
            onChange={(size) => update({ size })}
            options={WORKBENCH_SIZE_OPTIONS.map((size) => ({ label: size, value: size }))}
            value={draft.size}
          />
          <MenuSelect
            ariaLabel="数量"
            label="数量"
            onChange={(value) => update({ requestedCount: Number(value) })}
            options={WORKBENCH_QUANTITY_OPTIONS.map((count) => ({ label: `${count} 张`, value: String(count) }))}
            value={String(draft.requestedCount)}
          />
        </div>

        {shouldShowMultiResultDisplayMode(draft) ? (
          <MenuSelect
            ariaLabel="显示方式"
            label="显示方式"
            onChange={(displayMode) => update({ displayMode: displayMode as WorkbenchDraft["displayMode"] })}
            options={[
              { label: "合并显示", value: "merged" },
              { label: "多卡显示", value: "separate" },
            ]}
            value={draft.displayMode}
          />
        ) : null}
      </div>
      <div className="border-t border-white/8 p-5">
        <button
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-black text-black transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canGenerate}
          onClick={onGenerate}
          type="button"
        >
          <Send size={17} />
          {generating ? "生成中" : "开始生成"}
        </button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Compose desktop layout**

Modify `src/workbench/WorkbenchPage.tsx`:

```tsx
import React from "react";
import { getDefaultWorkbenchDraft } from "./workbenchModelParams";
import type { WorkbenchDraft, WorkbenchGeneration } from "./workbenchTypes";
import { WorkbenchComposer } from "./WorkbenchComposer";
```

Inside component:

```tsx
const [draft, setDraft] = React.useState<WorkbenchDraft>(() => getDefaultWorkbenchDraft());
const [generating, setGenerating] = React.useState(false);

const reuseParams = (generation: WorkbenchGeneration) => {
  setDraft((current) => ({
    ...current,
    displayMode: generation.displayMode,
    modelId: generation.modelId,
    prompt: generation.prompt,
    referenceAssetIds: generation.referenceAssetIds,
    requestedCount: generation.requestedCount,
    routeKey: generation.routeKey,
    ...generation.params,
  }));
};

const generate = async () => {
  setGenerating(true);
  try {
    await history.create(draft);
  } finally {
    setGenerating(false);
  }
};
```

Render:

```tsx
<main data-testid="workbench-page" className="min-h-[calc(100vh-160px)] text-white">
  <div className="grid h-[calc(100vh-160px)] min-h-[640px] grid-cols-[390px_minmax(0,1fr)] overflow-hidden rounded-[26px] border border-white/8 bg-[#0b0b0f]">
    <WorkbenchComposer
      draft={draft}
      generating={generating}
      onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
      onGenerate={() => void generate()}
    />
    <div className="min-h-0 overflow-y-auto p-5">
      <WorkbenchResultFeed
        generations={history.generations}
        loading={history.loading}
        onRetry={(generation) => void history.retry(generation.id)}
        onReuseParams={reuseParams}
      />
    </div>
  </div>
</main>
```

- [ ] **Step 5: Run page tests**

Run:

```bash
npm test -- src/workbench/WorkbenchPage.test.tsx src/workbench/workbenchModelParams.test.ts
```

Expected: tests pass.

- [ ] **Step 6: Commit desktop composer**

```bash
git add src/workbench/WorkbenchComposer.tsx src/workbench/WorkbenchPage.tsx src/workbench/WorkbenchPage.test.tsx
git commit -m "feat: add workbench desktop composer"
```

---

### Task 10: Mobile Result-First Composer

**Files:**

- Modify: `src/workbench/WorkbenchPage.tsx`
- Modify: `src/workbench/WorkbenchComposer.tsx`
- Create: `src/workbench/WorkbenchMobileComposer.tsx`
- Test: `src/workbench/WorkbenchPage.test.tsx`

- [ ] **Step 1: Add mobile structure test**

Append to `src/workbench/WorkbenchPage.test.tsx`:

```tsx
test("renders mobile bottom input entry", async () => {
  window.history.replaceState(null, "", "/workbench");
  render(<AppRouter />);
  expect(await screen.findByTestId("workbench-mobile-entry")).toBeTruthy();
});
```

- [ ] **Step 2: Run failing mobile test**

Run:

```bash
npm test -- src/workbench/WorkbenchPage.test.tsx
```

Expected: fail because mobile entry does not exist.

- [ ] **Step 3: Create mobile composer wrapper**

Create `src/workbench/WorkbenchMobileComposer.tsx`:

```tsx
import React from "react";
import { Sparkles } from "lucide-react";

import { WorkbenchComposer } from "./WorkbenchComposer";
import type { WorkbenchDraft } from "./workbenchTypes";

type Props = {
  draft: WorkbenchDraft;
  generating: boolean;
  onChange: (patch: Partial<WorkbenchDraft>) => void;
  onGenerate: () => void;
};

export function WorkbenchMobileComposer(props: Props) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <button
        className="workbench-mobile-entry fixed bottom-4 left-4 right-4 z-40 flex h-14 items-center justify-between rounded-full border border-white/12 bg-[#15151a]/95 px-5 text-left shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur-xl md:hidden"
        data-testid="workbench-mobile-entry"
        onClick={() => setOpen(true)}
        type="button"
      >
        <span className="truncate text-sm text-slate-300">{props.draft.prompt || "描述你想生成的画面"}</span>
        <span className="grid h-9 w-9 place-items-center rounded-full bg-white text-black">
          <Sparkles size={16} />
        </span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button className="absolute inset-0 bg-black/55" aria-label="关闭工作台输入" onClick={() => setOpen(false)} type="button" />
          <div className="absolute bottom-0 left-0 right-0 max-h-[88vh] overflow-hidden rounded-t-[26px] border border-white/10 bg-[#101014] shadow-[0_-22px_70px_rgba(0,0,0,0.6)]">
            <WorkbenchComposer {...props} compact onAfterGenerate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </>
  );
}
```

- [ ] **Step 4: Add compact props to composer**

Modify `src/workbench/WorkbenchComposer.tsx` props:

```ts
compact?: boolean;
onAfterGenerate?: () => void;
```

Use `compact` to adjust the root classes:

```tsx
<aside data-testid="workbench-composer" className={`${compact ? "max-h-[88vh]" : ""} flex min-h-0 flex-col border-r border-white/8 bg-[#101014]`}>
```

Wrap generate click:

```tsx
onClick={() => {
  onGenerate();
  onAfterGenerate?.();
}}
```

- [ ] **Step 5: Compose responsive page**

Modify `src/workbench/WorkbenchPage.tsx`:

```tsx
import { WorkbenchMobileComposer } from "./WorkbenchMobileComposer";
```

Add mobile classes:

```tsx
<div className="relative grid h-[calc(100vh-160px)] min-h-[640px] grid-cols-[390px_minmax(0,1fr)] overflow-hidden rounded-[26px] border border-white/8 bg-[#0b0b0f] md:grid">
  <div className="hidden md:block">
    <WorkbenchComposer ... />
  </div>
  <div className="min-h-0 overflow-y-auto p-5 pb-28 md:pb-5">
    <WorkbenchResultFeed ... />
  </div>
  <WorkbenchMobileComposer ... />
</div>
```

Ensure the mobile layout does not show the desktop left composer by default:

```tsx
className="relative block h-[calc(100vh-160px)] min-h-[640px] overflow-hidden rounded-[26px] border border-white/8 bg-[#0b0b0f] md:grid md:grid-cols-[390px_minmax(0,1fr)]"
```

- [ ] **Step 6: Run mobile tests**

Run:

```bash
npm test -- src/workbench/WorkbenchPage.test.tsx
```

Expected: tests pass.

- [ ] **Step 7: Commit mobile composer**

```bash
git add src/workbench/WorkbenchPage.tsx src/workbench/WorkbenchComposer.tsx src/workbench/WorkbenchMobileComposer.tsx src/workbench/WorkbenchPage.test.tsx
git commit -m "feat: add mobile workbench composer"
```

---

### Task 11: Result Detail Sheet And Send-To-Project

**Files:**

- Create: `src/workbench/WorkbenchResultSheet.tsx`
- Create: `src/workbench/SendToProjectDialog.tsx`
- Modify: `src/workbench/WorkbenchResultFeed.tsx`
- Modify: `src/workbench/WorkbenchPage.tsx`
- Modify: `apps/api/src/modules/workbench/workbench.service.ts`
- Test: `src/workbench/WorkbenchPage.test.tsx`

- [ ] **Step 1: Add result action test**

Append to `src/workbench/WorkbenchPage.test.tsx`:

```tsx
test("result actions include retry and reuse controls", async () => {
  window.history.replaceState(null, "", "/workbench");
  render(<AppRouter />);
  expect(await screen.findByLabelText("再次生成")).toBeTruthy();
  expect(screen.getByLabelText("复用参数")).toBeTruthy();
});
```

- [ ] **Step 2: Create result sheet**

Create `src/workbench/WorkbenchResultSheet.tsx`:

```tsx
import React from "react";
import { Download, Send, X } from "lucide-react";

import type { WorkbenchResult } from "./workbenchTypes";

type Props = {
  onClose: () => void;
  onSendToProject: (result: WorkbenchResult) => void;
  result: WorkbenchResult | null;
};

export function WorkbenchResultSheet({ onClose, onSendToProject, result }: Props) {
  if (!result) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button aria-label="关闭结果详情" className="absolute inset-0 bg-black/55" onClick={onClose} type="button" />
      <section className="absolute bottom-0 left-0 right-0 rounded-t-[26px] border border-white/10 bg-[#101014] p-4 text-white shadow-[0_-22px_70px_rgba(0,0,0,0.6)] md:left-auto md:right-8 md:top-24 md:w-[380px] md:rounded-[22px]">
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold">结果详情</div>
          <button className="grid h-9 w-9 place-items-center rounded-full bg-white/[0.08]" onClick={onClose} type="button" aria-label="关闭">
            <X size={16} />
          </button>
        </div>
        <div className="mt-4 aspect-square rounded-2xl bg-black/30" data-asset-id={result.assetId} />
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white/[0.08] text-sm font-bold" type="button">
            <Download size={16} />
            下载
          </button>
          <button className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white text-sm font-black text-black" onClick={() => onSendToProject(result)} type="button">
            <Send size={16} />
            发送到画布
          </button>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Create send-to-project dialog**

Create `src/workbench/SendToProjectDialog.tsx`:

```tsx
import React from "react";

type Props = {
  onClose: () => void;
  onConfirm: (input: { projectName?: string }) => void;
  open: boolean;
};

export function SendToProjectDialog({ onClose, onConfirm, open }: Props) {
  const [projectName, setProjectName] = React.useState("工作台结果");
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/55 p-4">
      <section className="w-full max-w-[420px] rounded-[22px] border border-white/10 bg-[#101014] p-5 text-white shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
        <div className="text-base font-black">发送到画布</div>
        <label className="mt-4 grid gap-2">
          <span className="text-xs font-bold text-slate-400">新项目名称</span>
          <input className="h-11 rounded-xl border border-white/10 bg-black/20 px-3 text-sm outline-none" value={projectName} onChange={(event) => setProjectName(event.target.value)} />
        </label>
        <div className="mt-5 flex justify-end gap-3">
          <button className="h-10 rounded-full px-4 text-sm text-slate-300" onClick={onClose} type="button">取消</button>
          <button className="h-10 rounded-full bg-white px-5 text-sm font-black text-black" onClick={() => onConfirm({ projectName })} type="button">确认</button>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Wire result selection**

Modify `WorkbenchResultFeed` to accept:

```ts
onSelectResult?: (result: WorkbenchResult) => void;
```

When rendering results, turn each thumbnail into a button:

```tsx
<button key={result.id} className="aspect-square rounded-xl bg-black/30" data-asset-id={result.assetId} onClick={() => onSelectResult?.(result)} type="button" />
```

- [ ] **Step 5: Wire dialogs in page**

Modify `WorkbenchPage.tsx` state:

```ts
const [selectedResult, setSelectedResult] = React.useState<WorkbenchResult | null>(null);
const [sendDialogOpen, setSendDialogOpen] = React.useState(false);
```

Render:

```tsx
<WorkbenchResultSheet
  result={selectedResult}
  onClose={() => setSelectedResult(null)}
  onSendToProject={() => setSendDialogOpen(true)}
/>
<SendToProjectDialog
  open={sendDialogOpen}
  onClose={() => setSendDialogOpen(false)}
  onConfirm={() => setSendDialogOpen(false)}
/>
```

- [ ] **Step 6: Implement backend send-to-project**

Modify `apps/api/src/modules/workbench/workbench.service.ts` `sendResultToProject` with this concrete flow:

```ts
async sendResultToProject(context: WorkbenchContext, resultId: string, input: SendWorkbenchResultToProjectInput) {
  return withTenantTransaction(context, async (client) => {
    const result = await client.query<{
      asset_id: string;
      height: number | null;
      mime_type: string;
      original_filename: string | null;
      width: number | null;
    }>(
      `
        SELECT
          a.id::text AS asset_id,
          a.mime_type,
          a.original_filename,
          a.width,
          a.height
        FROM workbench_results wr
        JOIN assets a
          ON a.id = wr.asset_id
         AND a.tenant_id = wr.tenant_id
        WHERE wr.tenant_id = $1::uuid
          AND wr.id = $2::uuid
          AND a.deleted_at IS NULL
        LIMIT 1
      `,
      [context.tenantId, resultId],
    );

    const asset = result.rows[0];
    if (!asset) {
      throw new WorkbenchApiError(404, "WORKBENCH_RESULT_NOT_FOUND", "Workbench result not found.");
    }

    const projectId = input.projectId ?? await this.createProjectForWorkbenchResult(client, context, input.projectName || "工作台结果");
    const flow = await this.getOrCreatePrimaryFlow(client, context, projectId);
    const draft = await this.getOrCreateFlowDraft(client, context, flow.id, projectId);
    const nodeId = `workbench-${resultId.slice(0, 8)}-${Date.now().toString(36)}`;
    const nextGraph = {
      ...draft.graph_json,
      nodes: [
        ...(Array.isArray(draft.graph_json?.nodes) ? draft.graph_json.nodes : []),
        {
          id: nodeId,
          type: "image",
          position: { x: 120, y: 120 },
          data: {
            assetId: asset.asset_id,
            assetIds: [asset.asset_id],
            generationStatus: "done",
            kind: "image",
            mimeType: asset.mime_type,
            source: "workbench-result",
            status: "success",
            title: asset.original_filename || "工作台结果",
            ...(asset.width ? { naturalWidth: asset.width, width: Math.min(asset.width, 360) } : {}),
            ...(asset.height ? { naturalHeight: asset.height, height: Math.min(asset.height, 360) } : {}),
          },
        },
      ],
      edges: Array.isArray(draft.graph_json?.edges) ? draft.graph_json.edges : [],
      viewport: draft.graph_json?.viewport || { x: 0, y: 0, zoom: 1 },
    };

    await client.query(
      `
        UPDATE flow_drafts
        SET graph_json = $3::jsonb,
            revision = revision + 1,
            last_saved_by = $4::uuid,
            updated_at = now()
        WHERE tenant_id = $1::uuid
          AND id = $2::uuid
      `,
      [context.tenantId, draft.id, JSON.stringify(nextGraph), context.userId],
    );

    return { projectId, nodeId };
  }, this.pool);
}
```

Add these private helpers in the same service:

```ts
private async createProjectForWorkbenchResult(client: { query: Function }, context: WorkbenchContext, projectName: string): Promise<string> {
  const created = await client.query<{ id: string }>(
    `
      INSERT INTO projects (
        tenant_id,
        name,
        description,
        created_by,
        updated_at
      )
      VALUES ($1::uuid, $2, NULL, $3::uuid, now())
      RETURNING id::text AS id
    `,
    [context.tenantId, projectName.trim() || "工作台结果", context.userId],
  );
  return created.rows[0]!.id;
}

private async getOrCreatePrimaryFlow(client: { query: Function }, context: WorkbenchContext, projectId: string): Promise<{ id: string }> {
  const existing = await client.query<{ id: string }>(
    `
      SELECT id::text AS id
      FROM flows
      WHERE tenant_id = $1::uuid
        AND project_id = $2::uuid
        AND deleted_at IS NULL
      ORDER BY created_at ASC, id ASC
      LIMIT 1
    `,
    [context.tenantId, projectId],
  );
  if (existing.rows[0]?.id) return existing.rows[0];

  const created = await client.query<{ id: string }>(
    `
      INSERT INTO flows (
        tenant_id,
        project_id,
        title,
        description,
        status,
        created_by,
        updated_by,
        updated_at
      )
      VALUES ($1::uuid, $2::uuid, '工作台画布', NULL, 'draft', $3::uuid, $3::uuid, now())
      RETURNING id::text AS id
    `,
    [context.tenantId, projectId, context.userId],
  );
  return created.rows[0]!;
}

private async getOrCreateFlowDraft(
  client: { query: Function },
  context: WorkbenchContext,
  flowId: string,
  projectId: string,
): Promise<{ graph_json: { edges?: unknown[]; nodes?: unknown[]; viewport?: unknown }; id: string }> {
  const existing = await client.query<{ graph_json: { edges?: unknown[]; nodes?: unknown[]; viewport?: unknown }; id: string }>(
    `
      SELECT id::text AS id, graph_json
      FROM flow_drafts
      WHERE tenant_id = $1::uuid
        AND flow_id = $2::uuid
      LIMIT 1
    `,
    [context.tenantId, flowId],
  );
  if (existing.rows[0]?.id) return existing.rows[0];

  const created = await client.query<{ graph_json: { edges?: unknown[]; nodes?: unknown[]; viewport?: unknown }; id: string }>(
    `
      INSERT INTO flow_drafts (
        tenant_id,
        project_id,
        flow_id,
        graph_json,
        revision,
        last_saved_by,
        updated_at
      )
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4::jsonb, 1, $5::uuid, now())
      RETURNING id::text AS id, graph_json
    `,
    [
      context.tenantId,
      projectId,
      flowId,
      JSON.stringify({ edges: [], nodes: [], viewport: { x: 0, y: 0, zoom: 1 } }),
      context.userId,
    ],
  );
  return created.rows[0]!;
}
```

This implementation keeps all writes tenant-scoped and stores only `assetId` in canvas draft data.

- [ ] **Step 7: Run frontend and API builds**

Run:

```bash
npm test -- src/workbench/WorkbenchPage.test.tsx
npm run build --workspace @aigc-flow/api
npm run build
```

Expected: tests pass and builds pass.

- [ ] **Step 8: Commit result actions**

```bash
git add src/workbench/WorkbenchResultSheet.tsx src/workbench/SendToProjectDialog.tsx src/workbench/WorkbenchResultFeed.tsx src/workbench/WorkbenchPage.tsx src/workbench/WorkbenchPage.test.tsx apps/api/src/modules/workbench/workbench.service.ts
git commit -m "feat: add workbench result actions"
```

---

### Task 12: Cleanup Old Project-Scoped Workbench Entry And Final Verification

**Files:**

- Modify: `src/app/routes.ts`
- Modify: `src/app/AppRouter.tsx`
- Modify: `src/flowCanvas/FlowProjectPage.tsx`
- Modify: `PROJECT_RECORD.md`
- Modify/remove when needed: `src/flowCanvas/workbench/*`

- [ ] **Step 1: Decide compatibility handling**

Keep `/projects/:projectId/workbench` as a compatibility redirect for one release:

```tsx
if (getProjectMode(pathname) === "workbench") {
  return <Redirect to="/workbench" />;
}
```

Do not expose project-scoped workbench in navigation.

- [ ] **Step 2: Remove mobile auto-redirect to project workbench**

Modify `src/flowCanvas/FlowProjectPage.tsx` so mobile project opening no longer automatically redirects to `/projects/:projectId/workbench`.

Expected behavior:

- `/projects/:projectId` opens project canvas.
- `/projects/:projectId/canvas` opens project canvas.
- `/projects/:projectId/workbench` redirects to `/workbench`.
- `/workbench` opens independent workbench.

- [ ] **Step 3: Run route regression tests**

Run:

```bash
npm test -- src/workbench/WorkbenchPage.test.tsx src/flowCanvas/workbench/ImageWorkbenchPage.test.tsx src/app/WorkspaceShell.test.tsx
```

Expected: update old project workbench tests so they assert compatibility redirect or remove obsolete expectations.

- [ ] **Step 4: Update project record**

Append to `PROJECT_RECORD.md`:

```md
## 2026-06-17 - Independent Image Workbench Implementation

- Added the independent `/workbench` image generation studio with desktop left-parameter layout and mobile result-first bottom composer.
- Added tenant-scoped workbench history tables and API routes for generation history, create, retry, and send-to-project.
- Added a lightweight `workbench.generate` queue and worker execution path using the existing AI Gateway, billing, and cloud asset pipeline.
- Kept `发送到画布` explicit and secondary instead of automatically creating project nodes for every workbench result.
- Removed project-scoped workbench as the promoted mobile path; `/workbench` is now the standalone creator workbench entry.
```

- [ ] **Step 5: Run focused backend tests**

Run:

```bash
npm run test --workspace @aigc-flow/api -- workbench
npm run test --workspace @aigc-flow/worker -- workbench
npm run build --workspace @aigc-flow/redis
npm run build --workspace @aigc-flow/db
npm run build --workspace @aigc-flow/api
npm run build --workspace @aigc-flow/worker
```

Expected: focused workbench tests pass and backend packages build.

- [ ] **Step 6: Run frontend tests and full build**

Run:

```bash
npm test -- src/workbench src/app/WorkspaceShell.test.tsx
npm run build
```

Expected: frontend tests and full Vite build pass.

- [ ] **Step 7: Manual UI check**

Run the frontend locally:

```bash
npm run dev -- --host 127.0.0.1 --port 5188 --strictPort
```

Open:

```txt
http://127.0.0.1:5188/workbench
```

Check desktop at `1440px`:

- left composer is stable at about `390px`
- right result feed scrolls
- controls use shared menu styling
- quantity greater than `1` reveals display mode cleanly

Check mobile at `390px`:

- result feed is visible first
- short bottom input bar is reachable
- expanded composer is not a squeezed desktop sidebar
- generate button stays visible in thumb zone

- [ ] **Step 8: Commit final cleanup**

```bash
git add PROJECT_RECORD.md src/app/routes.ts src/app/AppRouter.tsx src/flowCanvas/FlowProjectPage.tsx src/flowCanvas/workbench src/workbench
git commit -m "feat: complete independent image workbench"
```

---

## Self-Review

Spec coverage:

- `/workbench` top-level route: Tasks 7 and 12.
- Desktop left-parameters plus right-result-flow UI: Task 9.
- Mobile result-first feed and bottom composer: Task 10.
- Server-side authoritative history: Task 1.
- API for history/create/retry/send-to-project: Tasks 3, 4, and 11.
- Queue and worker execution through AI Gateway: Tasks 2 and 5.
- Cloud asset persistence: Task 5 reuses `MediaAssetStore`.
- Billing reserve/settle/refund: Tasks 3 and 5 wire `BillingService.reserveUsageWithClient`, `recordUsageEventWithClient`, `settleUsageWithClient`, and `refundUsageWithClient`.
- Model-aware controls: Tasks 6 and 9.
- Multi-result display preference: Tasks 6 and 9.
- Result actions `再次生成` and `复用参数`: Tasks 8 and 9.
- `发送到画布` secondary action: Task 11.
- Old project-scoped workbench migration: Task 12.

Execution requirements:

- Task 3 reserves credits before enqueueing.
- Task 5 polls async provider tasks to terminal state, persists assets with nullable workflow/node IDs, records usage events, settles on success, and refunds on failure.
- Task 11 sends results to a project by writing only asset-backed node data into `flow_drafts`.

Placeholder scan:

- Deferred implementation placeholders were scanned and removed from the task body.

Type consistency:

- Frontend uses `displayMode: "merged" | "separate"`.
- Backend stores `display_mode` with the same values.
- API request fields match `CreateWorkbenchGenerationRequest` and `createWorkbenchGenerationSchema`.
- Queue payload uses `generationId`, `tenantId`, and optional `traceId`.
