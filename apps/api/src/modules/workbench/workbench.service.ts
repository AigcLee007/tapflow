import { randomUUID } from "node:crypto";

import { BillingService, createPgPool, withTenantTransaction } from "@aigc-flow/db";
import type { Queue } from "bullmq";
import type { Pool, PoolClient } from "pg";
import type { StorageProvider } from "@aigc-flow/storage";

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
  batch_id: string | null;
  batch_index: number | null;
  batch_role: "single" | "parent" | "child";
  batch_total: number | null;
  charged_credits: string | null;
  created_at: string;
  display_mode: "merged" | "separate";
  error_json: unknown;
  estimated_credits: string;
  finished_at: string | null;
  id: string;
  model_id: string;
  params_json: Record<string, unknown>;
  parent_generation_id: string | null;
  prompt: string;
  reference_asset_ids: string[];
  reference_upload_ids: string[];
  requested_count: number;
  reserve_ledger_id: string | null;
  reserved_credits: string;
  route_key: string;
  session_id: string | null;
  started_at: string | null;
  status: string;
  updated_at: string;
};

type WorkbenchReferenceUploadRow = {
  created_at: string;
  expires_at: string;
  height: number | null;
  id: string;
  mime_type: string;
  original_filename: string | null;
  size_bytes: string;
  width: number | null;
};

type WorkbenchResultRow = {
  asset_id: string;
  asset_status: string;
  created_at: string;
  download_expires_at: string | null;
  download_url: string | null;
  height: number | null;
  id: string;
  metadata_json: Record<string, unknown>;
  mime_type: string;
  original_filename: string | null;
  preview_expires_at: string | null;
  preview_url: string | null;
  sort_order: number;
  width: number | null;
};

type AiRouteLookupRow = {
  min_charge_credits: string | null;
  route_id: string;
};

type AssetResultLookupRow = WorkbenchResultRow & {
  bucket?: string;
  object_key?: string;
  preview_bucket?: string;
  preview_mime_type?: string;
  preview_object_key?: string;
};

type FlowDraftRow = {
  graph_json: {
    edges?: unknown[];
    nodes?: Array<Record<string, unknown>>;
    viewport?: Record<string, unknown>;
  };
  id: string;
};

type CreateGenerationRowInput = {
  batchId: string | null;
  batchIndex: number | null;
  batchRole: "single" | "parent" | "child";
  batchTotal: number | null;
  context: WorkbenchContext;
  estimatedCredits: number;
  input: CreateWorkbenchGenerationInput;
  parentGenerationId: string | null;
  requestedCount: number;
  reserveLedgerId: string | null;
  reservedCredits: number;
  status: "queued";
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

function toNumber(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapResult(result: WorkbenchResultRow) {
  return {
    assetId: result.asset_id,
    createdAt: result.created_at,
    downloadUrl: result.download_url,
    downloadUrlExpiresAt: result.download_expires_at,
    height: result.height,
    id: result.id,
    metadata: result.metadata_json ?? {},
    mimeType: result.mime_type,
    originalFilename: result.original_filename,
    previewUrl: result.preview_url,
    previewUrlExpiresAt: result.preview_expires_at,
    sortOrder: result.sort_order,
    status: result.asset_status,
    width: result.width,
  };
}

function mapGeneration(row: WorkbenchGenerationRow, results: ReturnType<typeof mapResult>[]) {
  return {
    batch: null,
    batchId: row.batch_id,
    batchIndex: row.batch_index,
    batchRole: row.batch_role,
    batchTotal: row.batch_total,
    chargedCredits: row.charged_credits === null ? null : toNumber(row.charged_credits),
    createdAt: row.created_at,
    displayMode: row.display_mode,
    errorJson: row.error_json,
    estimatedCredits: toNumber(row.estimated_credits),
    finishedAt: row.finished_at,
    id: row.id,
    modelId: row.model_id,
    params: row.params_json ?? {},
    parentGenerationId: row.parent_generation_id,
    prompt: row.prompt,
    referenceAssetIds: row.reference_asset_ids ?? [],
    referenceUploadIds: row.reference_upload_ids ?? [],
    requestedCount: row.requested_count,
    reservedCredits: toNumber(row.reserved_credits),
    reserveLedgerId: row.reserve_ledger_id,
    results,
    routeKey: row.route_key,
    sessionId: row.session_id,
    startedAt: row.started_at,
    status: row.status,
    updatedAt: row.updated_at,
  };
}

function isSupportedReferenceMimeType(mimeType: string | null | undefined) {
  return Boolean(mimeType?.toLowerCase().startsWith("image/"));
}

function isBatchTerminalStatus(status: string) {
  return status === "succeeded" || status === "failed" || status === "canceled";
}

export class WorkbenchService {
  readonly billingService: BillingService;
  readonly generationQueue: Pick<Queue<WorkbenchGenerateJobPayload>, "add"> | null;
  readonly pool: Pool;
  readonly storageProvider?: StorageProvider;

  constructor(options?: {
    billingService?: BillingService;
    generationQueue?: Pick<Queue<WorkbenchGenerateJobPayload>, "add"> | null;
    pool?: Pool;
    storageProvider?: StorageProvider;
  }) {
    this.pool = options?.pool ?? createPgPool();
    this.billingService = options?.billingService ?? new BillingService({ pool: this.pool });
    this.generationQueue = options?.generationQueue ?? null;
    this.storageProvider = options?.storageProvider;
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
            reference_upload_ids::text[] AS reference_upload_ids,
            requested_count,
            display_mode,
            batch_id::text AS batch_id,
            parent_generation_id::text AS parent_generation_id,
            batch_role,
            batch_index,
            batch_total,
            estimated_credits::text AS estimated_credits,
            charged_credits::text AS charged_credits,
            reserved_credits::text AS reserved_credits,
            reserve_ledger_id::text AS reserve_ledger_id,
            status,
            error_json,
            created_at::text AS created_at,
            updated_at::text AS updated_at,
            started_at::text AS started_at,
            finished_at::text AS finished_at
          FROM workbench_generations
          WHERE tenant_id = $1::uuid
            AND deleted_at IS NULL
            AND batch_role IN ('single', 'parent')
            AND ($2::timestamptz IS NULL OR created_at < $2::timestamptz)
          ORDER BY created_at DESC, id DESC
          LIMIT $3::int
        `,
        [context.tenantId, query.cursor ?? null, query.limit],
      );

      const generations = await Promise.all(
        result.rows.map(async (row) => this.mapGenerationWithBatch(client, context, row)),
      );

      return {
        generations,
        nextCursor: result.rows.length === query.limit ? result.rows[result.rows.length - 1]?.created_at ?? null : null,
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
            reference_upload_ids::text[] AS reference_upload_ids,
            requested_count,
            display_mode,
            batch_id::text AS batch_id,
            parent_generation_id::text AS parent_generation_id,
            batch_role,
            batch_index,
            batch_total,
            estimated_credits::text AS estimated_credits,
            charged_credits::text AS charged_credits,
            reserved_credits::text AS reserved_credits,
            reserve_ledger_id::text AS reserve_ledger_id,
            status,
            error_json,
            created_at::text AS created_at,
            updated_at::text AS updated_at,
            started_at::text AS started_at,
            finished_at::text AS finished_at
          FROM workbench_generations
          WHERE tenant_id = $1::uuid
            AND id = $2::uuid
            AND deleted_at IS NULL
          LIMIT 1
        `,
        [context.tenantId, generationId],
      );

      const row = result.rows[0];
      if (!row) {
        throw new WorkbenchApiError(404, "WORKBENCH_GENERATION_NOT_FOUND", "Workbench generation not found.");
      }

      return this.mapGenerationWithBatch(client, context, row);
    }, this.pool);
  }

  async createReferenceUpload(
    context: WorkbenchContext,
    input: {
      body: Buffer;
      height?: number | null;
      mimeType: string;
      originalFilename?: string | null;
      sizeBytes?: number | null;
      width?: number | null;
    },
  ) {
    if (!isSupportedReferenceMimeType(input.mimeType)) {
      throw new WorkbenchApiError(400, "INVALID_REFERENCE_UPLOAD_TYPE", "Workbench reference upload must be an image.");
    }
    if (!Buffer.isBuffer(input.body) || input.body.length === 0) {
      throw new WorkbenchApiError(400, "INVALID_REFERENCE_UPLOAD_BODY", "Workbench reference upload body must be binary image data.");
    }

    return withTenantTransaction(context, async (client) => {
      const result = await client.query<WorkbenchReferenceUploadRow>(
        `
          INSERT INTO workbench_reference_uploads (
            tenant_id,
            created_by,
            original_filename,
            mime_type,
            size_bytes,
            width,
            height,
            bytes
          )
          VALUES (
            $1::uuid,
            $2::uuid,
            $3,
            $4,
            $5::bigint,
            $6::int,
            $7::int,
            $8::bytea
          )
          RETURNING
            id::text AS id,
            original_filename,
            mime_type,
            size_bytes::text AS size_bytes,
            width,
            height,
            created_at::text AS created_at,
            expires_at::text AS expires_at
        `,
        [
          context.tenantId,
          context.userId,
          input.originalFilename?.trim() || null,
          input.mimeType,
          input.sizeBytes ?? input.body.length,
          input.width ?? null,
          input.height ?? null,
          input.body,
        ],
      );
      const row = result.rows[0];
      if (!row?.id) {
        throw new WorkbenchApiError(500, "REFERENCE_UPLOAD_CREATE_FAILED", "Unable to create workbench reference upload.");
      }
      return {
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        height: row.height,
        id: row.id,
        mimeType: row.mime_type,
        originalFilename: row.original_filename,
        previewUrl: null,
        sizeBytes: toNumber(row.size_bytes),
        width: row.width,
      };
    }, this.pool);
  }

  async createGeneration(context: WorkbenchContext, input: CreateWorkbenchGenerationInput) {
    const generationQueue = this.generationQueue;
    if (!generationQueue) {
      throw new WorkbenchApiError(503, "WORKBENCH_QUEUE_UNAVAILABLE", "Workbench generation queue is unavailable.");
    }

    return withTenantTransaction(context, async (client) => {
      await this.assertReferenceAssetsExist(client, context.tenantId, input.referenceAssetIds);
      await this.assertReferenceUploadsExist(client, context.tenantId, input.referenceUploadIds);
      const pricing = await this.lookupRoutePricing(client, context.tenantId, input.routeKey);
      const estimatedCredits = Math.max(0, toNumber(pricing.min_charge_credits) * input.requestedCount);
      const idempotencySuffix = input.idempotencyKey ?? randomUUID();

      const reserveLedger = await this.billingService.reserveUsageWithClient(client, context.tenantId, {
        amountCents: estimatedCredits,
        description: "Workbench image generation reservation",
        idempotencyKey: `workbench:reserve:${context.tenantId}:${idempotencySuffix}`,
        metadata: {
          modelId: input.modelId,
          requestedCount: input.requestedCount,
          routeId: pricing.route_id,
          routeKey: input.routeKey,
          source: "workbench",
        },
      });

      if (input.requestedCount <= 1) {
        const generation = await this.insertGenerationRow(client, {
          batchId: null,
          batchIndex: null,
          batchRole: "single",
          batchTotal: null,
          context,
          estimatedCredits,
          input,
          parentGenerationId: null,
          requestedCount: input.requestedCount,
          reserveLedgerId: reserveLedger.id,
          reservedCredits: estimatedCredits,
          status: "queued",
        });

        await generationQueue.add("workbench.generate", {
          generationId: generation.id,
          tenantId: context.tenantId,
          traceId: context.traceId ?? undefined,
        });

        return mapGeneration(generation, []);
      }

      const parent = await this.insertGenerationRow(client, {
        batchId: null,
        batchIndex: null,
        batchRole: "parent",
        batchTotal: input.requestedCount,
        context,
        estimatedCredits,
        input,
        parentGenerationId: null,
        requestedCount: input.requestedCount,
        reserveLedgerId: reserveLedger.id,
        reservedCredits: estimatedCredits,
        status: "queued",
      });

      const batchId = parent.id;
      await client.query(
        `
          UPDATE workbench_generations
          SET batch_id = $3::uuid
          WHERE tenant_id = $1::uuid
            AND id = $2::uuid
        `,
        [context.tenantId, parent.id, batchId],
      );
      parent.batch_id = batchId;

      const children: WorkbenchGenerationRow[] = [];
      for (let index = 0; index < input.requestedCount; index += 1) {
        const child = await this.insertGenerationRow(client, {
          batchId,
          batchIndex: index,
          batchRole: "child",
          batchTotal: input.requestedCount,
          context,
          estimatedCredits: 0,
          input,
          parentGenerationId: parent.id,
          requestedCount: 1,
          reserveLedgerId: null,
          reservedCredits: 0,
          status: "queued",
        });
        children.push(child);
      }

      for (const child of children) {
        await generationQueue.add("workbench.generate", {
          generationId: child.id,
          tenantId: context.tenantId,
          traceId: context.traceId ?? undefined,
        });
      }

      return this.mapBatchGeneration(client, context, parent, children);
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
      referenceUploadIds: existing.referenceUploadIds,
      requestedCount: existing.requestedCount,
      routeKey: existing.routeKey,
      sessionId: existing.sessionId ?? undefined,
    });
  }

  async deleteGeneration(context: WorkbenchContext, generationId: string) {
    return withTenantTransaction(context, async (client) => {
      const result = await client.query<WorkbenchGenerationRow>(
        `
          UPDATE workbench_generations
          SET
            deleted_at = now(),
            deleted_by = $3::uuid,
            status = CASE
              WHEN status IN ('pending', 'queued', 'running', 'waiting_provider') THEN 'canceled'
              ELSE status
            END,
            finished_at = CASE
              WHEN status IN ('pending', 'queued', 'running', 'waiting_provider') THEN COALESCE(finished_at, now())
              ELSE finished_at
            END,
            error_json = CASE
              WHEN status IN ('pending', 'queued', 'running', 'waiting_provider') THEN '{"code":"WORKBENCH_GENERATION_DELETED","message":"Workbench generation was deleted by the user."}'::jsonb
              ELSE error_json
            END,
            updated_at = now()
          WHERE tenant_id = $1::uuid
            AND id = $2::uuid
            AND deleted_at IS NULL
          RETURNING
            id::text AS id,
            session_id::text AS session_id,
            prompt,
            model_id,
            route_key,
            params_json,
            reference_asset_ids::text[] AS reference_asset_ids,
            reference_upload_ids::text[] AS reference_upload_ids,
            requested_count,
            display_mode,
            batch_id::text AS batch_id,
            parent_generation_id::text AS parent_generation_id,
            batch_role,
            batch_index,
            batch_total,
            estimated_credits::text AS estimated_credits,
            charged_credits::text AS charged_credits,
            reserved_credits::text AS reserved_credits,
            reserve_ledger_id::text AS reserve_ledger_id,
            status,
            error_json,
            created_at::text AS created_at,
            updated_at::text AS updated_at,
            started_at::text AS started_at,
            finished_at::text AS finished_at
        `,
        [context.tenantId, generationId, context.userId],
      );

      const row = result.rows[0];
      if (!row?.id) {
        throw new WorkbenchApiError(404, "WORKBENCH_GENERATION_NOT_FOUND", "Workbench generation not found.");
      }

      if (row.batch_role === "parent") {
        await client.query(
          `
            UPDATE workbench_generations
            SET
              deleted_at = now(),
              deleted_by = $3::uuid,
              status = CASE
                WHEN status IN ('pending', 'queued', 'running', 'waiting_provider') THEN 'canceled'
                ELSE status
              END,
              finished_at = CASE
                WHEN status IN ('pending', 'queued', 'running', 'waiting_provider') THEN COALESCE(finished_at, now())
                ELSE finished_at
              END,
              error_json = CASE
                WHEN status IN ('pending', 'queued', 'running', 'waiting_provider') THEN '{"code":"WORKBENCH_GENERATION_DELETED","message":"Workbench generation was deleted by the user."}'::jsonb
                ELSE error_json
              END,
              updated_at = now()
            WHERE tenant_id = $1::uuid
              AND parent_generation_id = $2::uuid
              AND deleted_at IS NULL
          `,
          [context.tenantId, generationId, context.userId],
        );
      }

      if (["pending", "queued", "running", "waiting_provider", "canceled"].includes(row.status)) {
        await this.refundOpenReservation(client, context.tenantId, row);
      }

      return {
        deleted: true,
        generationId: row.id,
        ok: true,
      };
    }, this.pool);
  }

  async sendResultToProject(
    context: WorkbenchContext,
    resultId: string,
    input: SendWorkbenchResultToProjectInput,
  ) {
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

      const projectId = input.projectId ?? await this.createProjectForWorkbenchResult(
        client,
        context,
        input.projectName || "Workbench Result",
      );
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
              createdAt: Date.now(),
              generationStatus: "done",
              height: asset.height ? Math.min(asset.height, 360) : 360,
              kind: "image",
              mimeType: asset.mime_type,
              naturalHeight: asset.height,
              naturalWidth: asset.width,
              source: "workbench-result",
              status: "success",
              title: asset.original_filename || "Workbench Result",
              updatedAt: Date.now(),
              width: asset.width ? Math.min(asset.width, 360) : 360,
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

      return { nodeId, projectId };
    }, this.pool);
  }

  private async listResults(client: PoolClient, context: WorkbenchContext, generationId: string) {
    const rows = await client.query<AssetResultLookupRow>(
      `
        SELECT
          wr.id::text AS id,
          wr.asset_id::text AS asset_id,
          wr.sort_order,
          wr.metadata_json,
          wr.created_at::text AS created_at,
          a.status AS asset_status,
          a.mime_type,
          a.original_filename,
          a.width,
          a.height,
          COALESCE(av.bucket, a.bucket) AS preview_bucket,
          COALESCE(av.object_key, a.object_key) AS preview_object_key,
          COALESCE(av.mime_type, a.mime_type) AS preview_mime_type,
          a.bucket,
          a.object_key
        FROM workbench_results wr
        JOIN assets a
          ON a.id = wr.asset_id
         AND a.tenant_id = wr.tenant_id
        LEFT JOIN LATERAL (
          SELECT bucket, object_key, mime_type
          FROM asset_variants
          WHERE tenant_id = wr.tenant_id
            AND asset_id = wr.asset_id
            AND variant_key IN ('thumb', 'preview')
          ORDER BY CASE variant_key WHEN 'thumb' THEN 0 WHEN 'preview' THEN 1 ELSE 2 END
          LIMIT 1
        ) av ON true
        WHERE wr.tenant_id = $1::uuid
          AND wr.generation_id = $2::uuid
          AND a.deleted_at IS NULL
        ORDER BY wr.sort_order ASC, wr.created_at ASC
      `,
      [context.tenantId, generationId],
    );

    return Promise.all(rows.rows.map(async (row) => {
      let downloadUrl: string | null = null;
      let downloadExpiresAt: string | null = null;
      let previewUrl: string | null = null;
      let previewExpiresAt: string | null = null;

      if (this.storageProvider && row.asset_status === "available" && row.bucket && row.object_key) {
        const signedDownload = await this.storageProvider.createPresignedGetUrl({
          bucket: row.bucket,
          expiresInSeconds: 900,
          key: row.object_key,
          responseContentDisposition: `inline; filename="${row.original_filename?.trim() || `asset-${row.asset_id}`}"`,
          responseContentType: row.mime_type,
        });
        downloadUrl = signedDownload.url;
        downloadExpiresAt = signedDownload.expiresAt;

        const signedPreview = await this.storageProvider.createPresignedGetUrl({
          bucket: row.preview_bucket || row.bucket,
          expiresInSeconds: 900,
          key: row.preview_object_key || row.object_key,
          responseContentDisposition: `inline; filename="${row.original_filename?.trim() || `asset-${row.asset_id}`}"`,
          responseContentType: row.preview_mime_type || row.mime_type,
        });
        previewUrl = signedPreview.url;
        previewExpiresAt = signedPreview.expiresAt;
      }

      return mapResult({
        ...row,
        download_expires_at: downloadExpiresAt,
        download_url: downloadUrl,
        preview_expires_at: previewExpiresAt,
        preview_url: previewUrl,
      });
    }));
  }

  private async refundOpenReservation(client: PoolClient, tenantId: string, generation: WorkbenchGenerationRow) {
    const reservedCredits = toNumber(generation.reserved_credits);
    if (reservedCredits <= 0 || generation.charged_credits !== null) {
      return;
    }

    const refundLedger = await this.billingService.refundUsageWithClient(client, tenantId, {
      amountCents: reservedCredits,
      description: "Workbench image generation reservation released after deletion",
      idempotencyKey: `workbench:delete-refund:${tenantId}:${generation.id}`,
      metadata: {
        generationId: generation.id,
        source: "workbench",
      },
      usageEventId: null,
    });

    await client.query(
      `
        UPDATE workbench_generations
        SET
          charged_credits = 0,
          refund_ledger_id = $3::uuid,
          updated_at = now()
        WHERE tenant_id = $1::uuid
          AND id = $2::uuid
      `,
      [tenantId, generation.id, refundLedger.id],
    );
  }

  private async insertGenerationRow(
    client: PoolClient,
    input: CreateGenerationRowInput,
  ): Promise<WorkbenchGenerationRow> {
    const inserted = await client.query<WorkbenchGenerationRow>(
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
          reference_upload_ids,
          requested_count,
          display_mode,
          estimated_credits,
          reserved_credits,
          reserve_ledger_id,
          batch_id,
          parent_generation_id,
          batch_role,
          batch_index,
          batch_total,
          status
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
          $9::uuid[],
          $10::int,
          $11,
          $12::numeric,
          $13::numeric,
          $14::uuid,
          $15::uuid,
          $16::uuid,
          $17,
          $18::int,
          $19::int,
          $20
        )
        RETURNING
          id::text AS id,
          session_id::text AS session_id,
          prompt,
          model_id,
          route_key,
          params_json,
          reference_asset_ids::text[] AS reference_asset_ids,
          reference_upload_ids::text[] AS reference_upload_ids,
          requested_count,
          display_mode,
          batch_id::text AS batch_id,
          parent_generation_id::text AS parent_generation_id,
          batch_role,
          batch_index,
          batch_total,
          estimated_credits::text AS estimated_credits,
          charged_credits::text AS charged_credits,
          reserved_credits::text AS reserved_credits,
          reserve_ledger_id::text AS reserve_ledger_id,
          status,
          error_json,
          created_at::text AS created_at,
          updated_at::text AS updated_at,
          started_at::text AS started_at,
          finished_at::text AS finished_at
      `,
      [
        input.context.tenantId,
        input.input.sessionId ?? null,
        input.context.userId,
        input.input.prompt.trim(),
        input.input.modelId.trim(),
        input.input.routeKey.trim(),
        JSON.stringify(input.input.params ?? {}),
        input.input.referenceAssetIds,
        input.input.referenceUploadIds,
        input.requestedCount,
        input.input.displayMode,
        input.estimatedCredits,
        input.reservedCredits,
        input.reserveLedgerId,
        input.batchId,
        input.parentGenerationId,
        input.batchRole,
        input.batchIndex,
        input.batchTotal,
        input.status,
      ],
    );

    const row = inserted.rows[0];
    if (!row?.id) {
      throw new WorkbenchApiError(500, "WORKBENCH_GENERATION_CREATE_FAILED", "Unable to create workbench generation.");
    }
    return row;
  }

  private async listBatchChildren(
    client: PoolClient,
    context: WorkbenchContext,
    parentGenerationId: string,
  ) {
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
          reference_upload_ids::text[] AS reference_upload_ids,
          requested_count,
          display_mode,
          batch_id::text AS batch_id,
          parent_generation_id::text AS parent_generation_id,
          batch_role,
          batch_index,
          batch_total,
          estimated_credits::text AS estimated_credits,
          charged_credits::text AS charged_credits,
          reserved_credits::text AS reserved_credits,
          reserve_ledger_id::text AS reserve_ledger_id,
          status,
          error_json,
          created_at::text AS created_at,
          updated_at::text AS updated_at,
          started_at::text AS started_at,
          finished_at::text AS finished_at
        FROM workbench_generations
        WHERE tenant_id = $1::uuid
          AND parent_generation_id = $2::uuid
          AND deleted_at IS NULL
        ORDER BY batch_index ASC, created_at ASC
      `,
      [context.tenantId, parentGenerationId],
    );

    return result.rows;
  }

  private async mapBatchGeneration(
    client: PoolClient,
    context: WorkbenchContext,
    parent: WorkbenchGenerationRow,
    children?: WorkbenchGenerationRow[],
  ) {
    const batchChildren = children ?? await this.listBatchChildren(client, context, parent.id);
    const childViews = await Promise.all(
      batchChildren.map(async (child) => ({
        batchIndex: child.batch_index ?? 0,
        chargedCredits: child.charged_credits === null ? null : toNumber(child.charged_credits),
        errorJson: child.error_json as Record<string, unknown> | null,
        finishedAt: child.finished_at,
        generationId: child.id,
        results: await this.listResults(client, context, child.id),
        startedAt: child.started_at,
        status: child.status,
        updatedAt: child.updated_at,
      })),
    );

    const flattenedResults = childViews.flatMap((child) =>
      child.results.map((result, index) => ({
        ...result,
        metadata: {
          ...result.metadata,
          batchIndex: child.batchIndex,
          childGenerationId: child.generationId,
        },
        sortOrder: child.batchIndex * 100 + index,
      })),
    );

    const completedCount = childViews.filter((child) => child.results.length > 0).length;
    const failedCount = childViews.filter((child) => child.status === "failed").length;
    const runningCount = childViews.filter((child) => !isBatchTerminalStatus(child.status)).length;

    return {
      ...mapGeneration(parent, flattenedResults),
      batch: {
        batchId: parent.batch_id ?? parent.id,
        children: childViews,
        completedCount,
        failedCount,
        parentGenerationId: parent.id,
        pendingCount: Math.max(0, batchChildren.length - completedCount - failedCount - runningCount),
        runningCount,
        totalCount: parent.batch_total ?? batchChildren.length,
      },
    };
  }

  private async mapGenerationWithBatch(
    client: PoolClient,
    context: WorkbenchContext,
    row: WorkbenchGenerationRow,
  ) {
    if (row.batch_role === "parent") {
      return this.mapBatchGeneration(client, context, row);
    }
    return mapGeneration(row, await this.listResults(client, context, row.id));
  }

  private async assertReferenceAssetsExist(client: PoolClient, tenantId: string, assetIds: string[]) {
    if (assetIds.length === 0) {
      return;
    }

    const result = await client.query<{ id: string }>(
      `
        SELECT id::text AS id
        FROM assets
        WHERE tenant_id = $1::uuid
          AND id = ANY($2::uuid[])
          AND deleted_at IS NULL
        ORDER BY id ASC
      `,
      [tenantId, assetIds],
    );

    if (result.rows.length !== assetIds.length) {
      throw new WorkbenchApiError(404, "WORKBENCH_REFERENCE_ASSET_NOT_FOUND", "One or more reference assets were not found.");
    }
  }

  private async assertReferenceUploadsExist(client: PoolClient, tenantId: string, uploadIds: string[]) {
    if (uploadIds.length === 0) {
      return;
    }

    const result = await client.query<{ id: string }>(
      `
        SELECT id::text AS id
        FROM workbench_reference_uploads
        WHERE tenant_id = $1::uuid
          AND id = ANY($2::uuid[])
          AND status IN ('active', 'used')
          AND expires_at > now()
        ORDER BY id ASC
      `,
      [tenantId, uploadIds],
    );

    if (result.rows.length !== uploadIds.length) {
      throw new WorkbenchApiError(404, "WORKBENCH_REFERENCE_UPLOAD_NOT_FOUND", "One or more temporary reference uploads were not found.");
    }
  }

  private async lookupRoutePricing(client: PoolClient, tenantId: string, routeKey: string) {
    const result = await client.query<AiRouteLookupRow>(
      `
        SELECT
          route.id::text AS route_id,
          pricing.min_charge_credits::text AS min_charge_credits
        FROM ai_routes AS route
        JOIN ai_providers AS provider
          ON provider.id = route.provider_id
        LEFT JOIN ai_models AS model
          ON model.id = route.model_id
        LEFT JOIN LATERAL (
          SELECT mp.min_charge_credits
          FROM model_pricing AS mp
          WHERE mp.active = true
            AND mp.unit = CASE route.modality
              WHEN 'image' THEN 'image_generation'
              WHEN 'video' THEN 'video_generation'
              WHEN 'text' THEN 'text_generation'
              ELSE route.modality || '_generation'
            END
            AND (
              (mp.provider = provider.key AND mp.model = COALESCE(model.model_key, 'default') AND mp.route = route.route_key)
              OR (mp.provider = provider.key AND mp.model = COALESCE(model.model_key, 'default') AND mp.route = 'default')
              OR (mp.provider = provider.key AND mp.model = 'default' AND mp.route = 'default')
              OR (mp.provider = 'default' AND mp.model = 'default' AND mp.route = 'default')
            )
          ORDER BY
            CASE
              WHEN mp.provider = provider.key AND mp.model = COALESCE(model.model_key, 'default') AND mp.route = route.route_key THEN 1
              WHEN mp.provider = provider.key AND mp.model = COALESCE(model.model_key, 'default') AND mp.route = 'default' THEN 2
              WHEN mp.provider = provider.key AND mp.model = 'default' AND mp.route = 'default' THEN 3
              ELSE 4
            END ASC
          LIMIT 1
        ) AS pricing ON true
        WHERE (route.tenant_id = $1::uuid OR route.tenant_id IS NULL)
          AND route.status = 'active'
          AND route.route_key = $2::text
          AND route.modality = 'image'
        ORDER BY CASE WHEN route.tenant_id = $1::uuid THEN 0 ELSE 1 END ASC
        LIMIT 1
      `,
      [tenantId, routeKey],
    );

    const row = result.rows[0];
    if (!row?.route_id) {
      throw new WorkbenchApiError(404, "WORKBENCH_ROUTE_NOT_FOUND", "The selected workbench route is not available.");
    }
    if (row.min_charge_credits === null) {
      throw new WorkbenchApiError(400, "PRICING_NOT_FOUND", "The selected workbench route does not have pricing configured.");
    }
    return row;
  }

  private async createProjectForWorkbenchResult(client: PoolClient, context: WorkbenchContext, projectName: string): Promise<string> {
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
      [context.tenantId, projectName.trim() || "Workbench Result", context.userId],
    );
    return created.rows[0]!.id;
  }

  private async getOrCreatePrimaryFlow(client: PoolClient, context: WorkbenchContext, projectId: string): Promise<{ id: string }> {
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
        VALUES ($1::uuid, $2::uuid, 'Workbench Canvas', NULL, 'draft', $3::uuid, $3::uuid, now())
        RETURNING id::text AS id
      `,
      [context.tenantId, projectId, context.userId],
    );
    return created.rows[0]!;
  }

  private async getOrCreateFlowDraft(
    client: PoolClient,
    context: WorkbenchContext,
    flowId: string,
    projectId: string,
  ): Promise<FlowDraftRow> {
    const existing = await client.query<FlowDraftRow>(
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

    const created = await client.query<FlowDraftRow>(
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
}
