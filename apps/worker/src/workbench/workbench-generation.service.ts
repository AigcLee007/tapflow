import { BillingService, createPgPool, withTenantTransaction } from "@aigc-flow/db";
import type {
  AssetReferenceInput,
  DatabaseMediaRuntime,
  MediaOutput,
  ProviderTaskResult,
} from "@aigc-flow/ai-gateway-core";
import type { Pool, PoolClient } from "pg";

import type { WorkerLogger } from "../logger.js";
import type { ProcessorResult } from "../processors/shared.js";
import { MediaAssetStore } from "../workflow-runtime/media-asset-store.js";

type WorkbenchGenerateJobPayload = {
  generationId: string;
  tenantId: string;
  traceId?: string;
};

type MediaRuntimeLike = Pick<DatabaseMediaRuntime, "generateImage" | "pollTask">;

type WorkbenchGenerationRecord = {
  batch_id: string | null;
  batch_index: number | null;
  batch_role: "single" | "parent" | "child";
  charged_credits: string | null;
  created_by: string | null;
  display_mode: "merged" | "separate";
  estimated_credits: string;
  id: string;
  model_id: string;
  params_json: Record<string, unknown>;
  parent_generation_id: string | null;
  prompt: string;
  provider_task_id: string | null;
  reference_asset_ids: string[];
  reference_upload_ids: string[];
  requested_count: number;
  reserve_ledger_id: string | null;
  reserved_credits: string;
  route_key: string;
  session_id: string | null;
  status: string;
  tenant_id: string;
  batch_total: number | null;
  updated_at: string;
};

type ReferenceAssetRecord = {
  asset_id: string;
  duration_ms: number | null;
  height: number | null;
  kind: string;
  mime_type: string;
  signed_url: string;
  width: number | null;
};

type ReferenceUploadRecord = {
  bytes_base64: string;
  height: number | null;
  id: string;
  mime_type: string;
  original_filename: string | null;
  size_bytes: string;
  width: number | null;
};

type PersistedResult = {
  assetId: string;
  createdAt: string;
  id: string;
  sortOrder: number;
};

function toNumber(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildMetadataParams(
  generation: WorkbenchGenerationRecord,
): Record<string, unknown> {
  const params = isRecord(generation.params_json) ? generation.params_json : {};
  const requestedCount = generation.batch_role === "child" ? 1 : generation.requested_count;
  return {
    ...params,
    ...(generation.display_mode ? { displayMode: generation.display_mode } : {}),
    ...(requestedCount > 1 ? { n: requestedCount } : {}),
  };
}

function normalizeTaskOutputs(taskResult: ProviderTaskResult): MediaOutput[] {
  if (Array.isArray(taskResult.outputs) && taskResult.outputs.length > 0) {
    return taskResult.outputs;
  }
  if (Array.isArray(taskResult.outputUrls) && taskResult.outputUrls.length > 0) {
    return taskResult.outputUrls.map((url) => ({ url }));
  }
  if (Array.isArray(taskResult.outputBase64) && taskResult.outputBase64.length > 0) {
    return taskResult.outputBase64.map((base64) => ({ base64 }));
  }
  return [];
}

export class WorkbenchGenerationService {
  readonly assetBucket: string;
  readonly assetStore: MediaAssetStore;
  readonly billingService: BillingService;
  readonly mediaRuntime: MediaRuntimeLike;
  readonly pool: Pool;

  constructor(options: {
    assetBucket: string;
    assetStore: MediaAssetStore;
    billingService?: BillingService;
    mediaRuntime: MediaRuntimeLike;
    pool?: Pool;
  }) {
    this.pool = options.pool ?? createPgPool();
    this.billingService = options.billingService ?? new BillingService({ pool: this.pool });
    this.mediaRuntime = options.mediaRuntime;
    this.assetStore = options.assetStore;
    this.assetBucket = options.assetBucket;
  }

  async executeGeneration(
    input: WorkbenchGenerateJobPayload,
    logger?: WorkerLogger,
  ): Promise<ProcessorResult> {
    const generation = await withTenantTransaction(
      { tenantId: input.tenantId, userId: null },
      async (client): Promise<WorkbenchGenerationRecord | null> => {
        const generation = await this.lockGeneration(client, input.tenantId, input.generationId);
        if (generation.status === "succeeded" || generation.status === "canceled") {
          return null;
        }
        if ((generation.status === "running" || generation.status === "waiting_provider") && !this.isStaleGeneration(generation)) {
          return null;
        }

        await this.markGenerationRunning(client, input.tenantId, input.generationId);
        return generation;
      },
      this.pool,
    );

    if (!generation) {
      return {
        jobId: null,
        queueName: "workbench.generate",
        status: "ok",
        tenantId: input.tenantId,
        traceId: input.traceId ?? null,
      };
    }

    if (generation.batch_role === "parent") {
      return {
        jobId: null,
        queueName: "workbench.generate",
        status: "ok",
        tenantId: input.tenantId,
        traceId: input.traceId ?? null,
      };
    }

    try {
      const result = generation.status === "waiting_provider" && generation.provider_task_id
        ? {
            providerTaskId: generation.provider_task_id,
            status: "waiting_provider" as const,
          }
        : await this.createProviderTask(input.tenantId, generation);

      const providerTaskId = result.providerTaskId || result.providerTaskIds?.[0] || null;
      if (result.status === "waiting_provider" && providerTaskId) {
        await this.markGenerationWaitingProvider(input.tenantId, generation.id, providerTaskId);
      }

      const outputs = await this.resolveOutputs(
        {
          tenantId: input.tenantId,
          userId: generation.created_by,
        },
        generation,
        result,
      );

      if (outputs.length === 0) {
        throw new Error("Workbench generation completed without any image outputs.");
      }

      await withTenantTransaction(
        { tenantId: input.tenantId, userId: null },
        async (client) => {
          const writable = await this.assertGenerationStillWritable(client, input.tenantId, generation.id);
          if (!writable) {
            return;
          }

          const assetRefs = await this.assetStore.persistOutputs(client, {
            kind: "image",
            nodeRunId: null,
            outputs,
            projectId: null,
            tenantId: input.tenantId,
            workflowRunId: null,
          });

          await this.insertResults(client, input.tenantId, generation.id, assetRefs);
          await this.markGenerationSucceeded(client, input.tenantId, generation.id);
          if (generation.batch_role === "child" && generation.parent_generation_id) {
            await this.refreshBatchParentStatus(client, input.tenantId, generation.parent_generation_id);
            await this.settleBatchParentIfComplete(client, input.tenantId, generation.parent_generation_id);
          } else {
            await this.settleGeneration(client, input.tenantId, generation, assetRefs.length);
          }
        },
        this.pool,
      );
    } catch (error) {
      await this.failGeneration(input.tenantId, generation, error);
      logger?.error(
        {
          err: error instanceof Error ? error.message : String(error),
          generationId: generation.id,
          queueName: "workbench.generate",
          tenantId: input.tenantId,
          traceId: input.traceId ?? null,
        },
        "workbench generation failed",
      );
      throw error;
    }

    return {
      jobId: null,
      queueName: "workbench.generate",
      status: "ok",
      tenantId: input.tenantId,
      traceId: input.traceId ?? null,
    };
  }

  private isStaleGeneration(generation: WorkbenchGenerationRecord) {
    const updatedAt = Date.parse(generation.updated_at);
    if (!Number.isFinite(updatedAt)) return true;
    return Date.now() - updatedAt > 10 * 60 * 1000;
  }

  private async lockGeneration(
    client: PoolClient,
    tenantId: string,
    generationId: string,
  ): Promise<WorkbenchGenerationRecord> {
    const result = await client.query<WorkbenchGenerationRecord>(
      `
        SELECT
          id::text AS id,
          tenant_id::text AS tenant_id,
          session_id::text AS session_id,
          created_by::text AS created_by,
          prompt,
          model_id,
          route_key,
          params_json,
          provider_task_id,
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
          updated_at::text AS updated_at
        FROM workbench_generations
        WHERE tenant_id = $1::uuid
          AND id = $2::uuid
          AND deleted_at IS NULL
        LIMIT 1
        FOR UPDATE
      `,
      [tenantId, generationId],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error(`Workbench generation not found: ${generationId}`);
    }
    return row;
  }

  private async assertGenerationStillWritable(
    client: PoolClient,
    tenantId: string,
    generationId: string,
  ): Promise<boolean> {
    const result = await client.query<{ id: string }>(
      `
        SELECT id::text AS id
        FROM workbench_generations
        WHERE tenant_id = $1::uuid
          AND id = $2::uuid
          AND deleted_at IS NULL
          AND status <> 'canceled'
        LIMIT 1
        FOR UPDATE
      `,
      [tenantId, generationId],
    );

    return result.rows.length > 0;
  }

  private async markGenerationRunning(client: PoolClient, tenantId: string, generationId: string) {
    await client.query(
      `
        UPDATE workbench_generations
        SET
          status = 'running',
          started_at = COALESCE(started_at, now()),
          updated_at = now(),
          error_json = NULL
        WHERE tenant_id = $1::uuid
          AND id = $2::uuid
      `,
      [tenantId, generationId],
    );
  }

  private async markGenerationWaitingProvider(tenantId: string, generationId: string, providerTaskId: string) {
    await withTenantTransaction(
      { tenantId, userId: null },
      async (client) => {
        await client.query(
          `
            UPDATE workbench_generations
            SET
              status = 'waiting_provider',
              provider_task_id = $3,
              updated_at = now()
            WHERE tenant_id = $1::uuid
              AND id = $2::uuid
          `,
          [tenantId, generationId, providerTaskId],
        );
      },
      this.pool,
    );
  }

  private async markGenerationSucceeded(client: PoolClient, tenantId: string, generationId: string) {
    await client.query(
      `
        UPDATE workbench_generations
        SET
          status = 'succeeded',
          finished_at = now(),
          updated_at = now(),
          error_json = NULL
        WHERE tenant_id = $1::uuid
          AND id = $2::uuid
      `,
      [tenantId, generationId],
    );
  }

  private async markGenerationFailed(
    client: PoolClient,
    tenantId: string,
    generationId: string,
    error: unknown,
  ) {
    const normalized = {
      code: error instanceof Error ? error.name || "WORKBENCH_GENERATION_FAILED" : "WORKBENCH_GENERATION_FAILED",
      message: error instanceof Error ? error.message : String(error),
    };

    await client.query(
      `
        UPDATE workbench_generations
        SET
          status = 'failed',
          finished_at = now(),
          updated_at = now(),
          error_json = $3::jsonb
        WHERE tenant_id = $1::uuid
          AND id = $2::uuid
      `,
      [tenantId, generationId, JSON.stringify(normalized)],
    );
  }

  private async loadReferenceAssets(
    client: PoolClient,
    tenantId: string,
    assetIds: string[],
    uploadIds: string[] = [],
  ): Promise<AssetReferenceInput[]> {
    const hydrated: AssetReferenceInput[] = [];

    if (assetIds.length > 0) {
      const result = await client.query<ReferenceAssetRecord>(
        `
          SELECT
            a.id::text AS asset_id,
            a.kind,
            a.mime_type,
            a.width,
            a.height,
            a.duration_ms,
            signed.url AS signed_url
          FROM assets a
          JOIN LATERAL (
            SELECT $3::text AS url
          ) AS signed ON true
          WHERE a.tenant_id = $1::uuid
            AND a.id = ANY($2::uuid[])
            AND a.deleted_at IS NULL
            AND a.status = 'available'
        `,
        [tenantId, assetIds, ""],
      );

      const records = new Map(result.rows.map((row) => [row.asset_id, row]));

      for (const assetId of assetIds) {
        const row = records.get(assetId);
        if (!row) {
          continue;
        }
        const signed = await this.assetStore.storageProvider.createPresignedGetUrl({
          bucket: this.assetBucket,
          expiresInSeconds: 15 * 60,
          key: await this.lookupAssetObjectKey(client, tenantId, assetId),
          responseContentType: row.mime_type,
        });
        hydrated.push({
          assetId,
          durationMs: row.duration_ms,
          height: row.height,
          kind: row.kind,
          metadata: {
            signedUrl: signed.url,
            url: signed.url,
          },
          mimeType: row.mime_type,
          width: row.width,
        });
      }
    }

    if (uploadIds.length > 0) {
      const uploadResult = await client.query<ReferenceUploadRecord>(
        `
          SELECT
            id::text AS id,
            original_filename,
            mime_type,
            size_bytes::text AS size_bytes,
            width,
            height,
            encode(bytes, 'base64') AS bytes_base64
          FROM workbench_reference_uploads
          WHERE tenant_id = $1::uuid
            AND id = ANY($2::uuid[])
            AND status IN ('active', 'used')
            AND expires_at > now()
        `,
        [tenantId, uploadIds],
      );
      const uploadRecords = new Map(uploadResult.rows.map((row) => [row.id, row]));

      for (const uploadId of uploadIds) {
        const row = uploadRecords.get(uploadId);
        if (!row?.bytes_base64) {
          continue;
        }
        const dataUrl = `data:${row.mime_type};base64,${row.bytes_base64}`;
        hydrated.push({
          assetId: uploadId,
          height: row.height,
          kind: "image",
          metadata: {
            base64: dataUrl,
            originalFilename: row.original_filename,
            source: "workbench-temp-upload",
            url: dataUrl,
          },
          mimeType: row.mime_type,
          width: row.width,
        });
      }
    }

    return hydrated;
  }

  private async loadReferenceAssetsForGeneration(
    tenantId: string,
    generation: WorkbenchGenerationRecord,
  ): Promise<AssetReferenceInput[]> {
    return withTenantTransaction(
      { tenantId, userId: null },
      (client) => this.loadReferenceAssets(client, tenantId, generation.reference_asset_ids, generation.reference_upload_ids),
      this.pool,
    );
  }

  private async createProviderTask(
    tenantId: string,
    generation: WorkbenchGenerationRecord,
  ): Promise<{
    outputs?: MediaOutput[] | null;
    providerTaskId?: string | null;
    providerTaskIds?: string[] | null;
    routeId?: string | null;
    status: "failed" | "succeeded" | "waiting_provider";
    usage?: { inputTokens: number | null; outputTokens: number | null; rawCost?: string | number | null; totalTokens: number | null } | null;
  }> {
    const referenceAssets = await this.loadReferenceAssetsForGeneration(tenantId, generation);
    return this.mediaRuntime.generateImage(
      {
        tenantId,
        userId: generation.created_by,
      },
      {
        inputAssets: referenceAssets,
        metadata: {
          params: buildMetadataParams(generation),
          referenceAssetIds: generation.reference_asset_ids,
          referenceUploadIds: generation.reference_upload_ids,
          source: "workbench",
        },
        model: generation.model_id,
        prompt: generation.prompt,
        routeKey: generation.route_key,
      },
    );
  }

  private async lookupAssetObjectKey(client: PoolClient, tenantId: string, assetId: string): Promise<string> {
    const result = await client.query<{ object_key: string }>(
      `
        SELECT object_key
        FROM assets
        WHERE tenant_id = $1::uuid
          AND id = $2::uuid
        LIMIT 1
      `,
      [tenantId, assetId],
    );
    const row = result.rows[0];
    if (!row?.object_key) {
      throw new Error(`Reference asset object key not found: ${assetId}`);
    }
    return row.object_key;
  }

  private async resolveOutputs(
    context: { tenantId: string; userId: string | null },
    generation: WorkbenchGenerationRecord,
    result: {
      outputs?: MediaOutput[] | null;
      providerTaskId?: string | null;
      providerTaskIds?: string[] | null;
      routeId?: string | null;
      status: "failed" | "succeeded" | "waiting_provider";
      usage?: { inputTokens: number | null; outputTokens: number | null; rawCost?: string | number | null; totalTokens: number | null } | null;
    },
  ): Promise<MediaOutput[]> {
    if (result.status === "succeeded") {
      return Array.isArray(result.outputs) ? result.outputs : [];
    }

    if (result.status === "failed") {
      throw new Error("Workbench generation provider returned failed status.");
    }

    const providerTaskIds = Array.isArray(result.providerTaskIds) && result.providerTaskIds.length > 0
      ? result.providerTaskIds
      : result.providerTaskId
        ? [result.providerTaskId]
        : [];

    if (providerTaskIds.length === 0) {
      throw new Error("Workbench generation is waiting for provider but no provider task id was returned.");
    }

    const outputs: MediaOutput[] = [];
    for (const providerTaskId of providerTaskIds) {
      let finished: ProviderTaskResult | null = null;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const polled = await this.mediaRuntime.pollTask(
          context,
          "image",
          {
            model: generation.model_id,
            providerTaskId,
            routeKey: generation.route_key,
          },
        );
        if (polled.status === "failed") {
          throw new Error(polled.error?.message ? String(polled.error.message) : "Workbench provider task failed.");
        }
        if (polled.status !== "pending" && polled.status !== "running") {
          finished = polled;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
      if (!finished) {
        throw new Error("Workbench provider task did not finish in time.");
      }
      outputs.push(...normalizeTaskOutputs(finished));
    }

    return outputs;
  }

  private async insertResults(
    client: PoolClient,
    tenantId: string,
    generationId: string,
    assetRefs: Array<{ assetId: string }>,
  ) {
    let sortOrder = 0;
    const inserted: PersistedResult[] = [];

    for (const assetRef of assetRefs) {
      const result = await client.query<PersistedResult>(
        `
          INSERT INTO workbench_results (
            tenant_id,
            generation_id,
            asset_id,
            sort_order,
            metadata_json
          )
          VALUES (
            $1::uuid,
            $2::uuid,
            $3::uuid,
            $4::int,
            '{}'::jsonb
          )
          ON CONFLICT (generation_id, asset_id) DO UPDATE
          SET sort_order = EXCLUDED.sort_order
          RETURNING
            id::text AS id,
            asset_id::text AS asset_id,
            sort_order,
            created_at::text AS created_at
        `,
        [tenantId, generationId, assetRef.assetId, sortOrder],
      );
      if (result.rows[0]) {
        inserted.push(result.rows[0]);
      }
      sortOrder += 1;
    }

    return inserted;
  }

  private async settleGeneration(
    client: PoolClient,
    tenantId: string,
    generation: WorkbenchGenerationRecord,
    units: number,
  ) {
    const reservedCredits = toNumber(generation.reserved_credits);
    const usageEvent = await this.billingService.recordUsageEventWithClient(client, tenantId, {
      billableCents: reservedCredits,
      eventType: "workbench.image.generate",
      idempotencyKey: `workbench:usage:${tenantId}:${generation.id}`,
      metadata: {
        displayMode: generation.display_mode,
        generationId: generation.id,
        modelKey: generation.model_id,
        productModelId: generation.model_id,
        requestedCount: generation.requested_count,
        routeKey: generation.route_key,
        sessionId: generation.session_id,
        source: "workbench",
      },
      modality: "image",
      modelId: null,
      routeId: null,
      unitType: "image_generation",
      units,
      workflowRunId: null,
    });

    const settleLedger = await this.billingService.settleUsageWithClient(client, tenantId, {
      amountCents: reservedCredits,
      description: "Workbench image generation settled",
      idempotencyKey: `workbench:settle:${tenantId}:${generation.id}`,
      metadata: {
        generationId: generation.id,
        reserveLedgerId: generation.reserve_ledger_id,
        source: "workbench",
      },
      reservedAmountCents: reservedCredits,
      usageEventId: usageEvent.id,
    });

    await client.query(
      `
        UPDATE workbench_generations
        SET
          charged_credits = $3::numeric,
          billing_usage_event_id = $4::uuid,
          settle_ledger_id = $5::uuid,
          refund_ledger_id = NULL,
          updated_at = now()
        WHERE tenant_id = $1::uuid
          AND id = $2::uuid
      `,
      [tenantId, generation.id, reservedCredits, usageEvent.id, settleLedger.id],
    );
  }

  private async refundGeneration(
    client: PoolClient,
    tenantId: string,
    generation: WorkbenchGenerationRecord,
  ) {
    const reservedCredits = toNumber(generation.reserved_credits);
    if (reservedCredits <= 0) {
      return;
    }

    const refundLedger = await this.billingService.refundUsageWithClient(client, tenantId, {
      amountCents: reservedCredits,
      description: "Workbench image generation reservation released",
      idempotencyKey: `workbench:refund:${tenantId}:${generation.id}`,
      metadata: {
        generationId: generation.id,
        reserveLedgerId: generation.reserve_ledger_id,
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

  private async loadGenerationById(
    client: PoolClient,
    tenantId: string,
    generationId: string,
  ): Promise<WorkbenchGenerationRecord | null> {
    const result = await client.query<WorkbenchGenerationRecord>(
      `
        SELECT
          id::text AS id,
          tenant_id::text AS tenant_id,
          session_id::text AS session_id,
          created_by::text AS created_by,
          prompt,
          model_id,
          route_key,
          params_json,
          provider_task_id,
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
          updated_at::text AS updated_at
        FROM workbench_generations
        WHERE tenant_id = $1::uuid
          AND id = $2::uuid
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [tenantId, generationId],
    );

    return result.rows[0] ?? null;
  }

  private async refreshBatchParentStatus(client: PoolClient, tenantId: string, parentGenerationId: string) {
    const result = await client.query<{
      canceled_count: number;
      child_count: number;
      failed_count: number;
      result_count: number;
      running_count: number;
      terminal_count: number;
    }>(
      `
        SELECT
          COUNT(DISTINCT wg.id)::int AS child_count,
          COUNT(DISTINCT wg.id) FILTER (WHERE wg.status = 'canceled')::int AS canceled_count,
          COUNT(DISTINCT wg.id) FILTER (WHERE wg.status = 'failed')::int AS failed_count,
          COUNT(DISTINCT wg.id) FILTER (WHERE wg.status IN ('pending', 'queued', 'running', 'waiting_provider'))::int AS running_count,
          COUNT(DISTINCT wg.id) FILTER (WHERE wg.status IN ('succeeded', 'failed', 'canceled'))::int AS terminal_count,
          COUNT(wr.id)::int AS result_count
        FROM workbench_generations wg
        LEFT JOIN workbench_results wr
          ON wr.tenant_id = wg.tenant_id
         AND wr.generation_id = wg.id
        WHERE wg.tenant_id = $1::uuid
          AND wg.parent_generation_id = $2::uuid
          AND wg.deleted_at IS NULL
      `,
      [tenantId, parentGenerationId],
    );

    const row = result.rows[0];
    if (!row || row.child_count === 0) return;

    const nextStatus =
      row.running_count > 0
        ? "running"
        : row.terminal_count === row.canceled_count
          ? "canceled"
          : row.result_count > 0
            ? "succeeded"
            : "failed";

    await client.query(
      `
        UPDATE workbench_generations
        SET
          status = $3,
          finished_at = CASE
            WHEN $3 IN ('succeeded', 'failed', 'canceled') THEN COALESCE(finished_at, now())
            ELSE finished_at
          END,
          updated_at = now()
        WHERE tenant_id = $1::uuid
          AND id = $2::uuid
          AND batch_role = 'parent'
      `,
      [tenantId, parentGenerationId, nextStatus],
    );
  }

  private async settleBatchParentIfComplete(
    client: PoolClient,
    tenantId: string,
    parentGenerationId: string,
  ) {
    const parent = await this.loadGenerationById(client, tenantId, parentGenerationId);
    if (!parent || parent.batch_role !== "parent" || parent.charged_credits !== null) {
      return;
    }

    const result = await client.query<{ result_count: number; running_count: number }>(
      `
        SELECT
          COUNT(wr.id)::int AS result_count,
          COUNT(DISTINCT wg.id) FILTER (WHERE wg.status IN ('pending', 'queued', 'running', 'waiting_provider'))::int AS running_count
        FROM workbench_generations wg
        LEFT JOIN workbench_results wr
          ON wr.tenant_id = wg.tenant_id
         AND wr.generation_id = wg.id
        WHERE wg.tenant_id = $1::uuid
          AND wg.parent_generation_id = $2::uuid
          AND wg.deleted_at IS NULL
      `,
      [tenantId, parentGenerationId],
    );

    const row = result.rows[0];
    if (!row || row.running_count > 0) {
      return;
    }

    if (row.result_count > 0) {
      await this.settleGeneration(client, tenantId, parent, row.result_count);
      return;
    }

    await this.refundGeneration(client, tenantId, parent);
  }

  private async failGeneration(tenantId: string, generation: WorkbenchGenerationRecord, error: unknown) {
    await withTenantTransaction(
      { tenantId, userId: null },
      async (client) => {
        await this.markGenerationFailed(client, tenantId, generation.id, error);
        if (generation.batch_role === "child" && generation.parent_generation_id) {
          await this.refreshBatchParentStatus(client, tenantId, generation.parent_generation_id);
          await this.settleBatchParentIfComplete(client, tenantId, generation.parent_generation_id);
        } else {
          await this.refundGeneration(client, tenantId, generation);
        }
      },
      this.pool,
    ).catch(() => {});
  }
}
