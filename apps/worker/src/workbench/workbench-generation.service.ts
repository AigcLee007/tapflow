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
  charged_credits: string | null;
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
  session_id: string | null;
  status: string;
  tenant_id: string;
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
  return {
    ...params,
    ...(generation.display_mode ? { displayMode: generation.display_mode } : {}),
    ...(generation.requested_count > 1 ? { n: generation.requested_count } : {}),
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
    await withTenantTransaction(
      { tenantId: input.tenantId, userId: null },
      async (client) => {
        const generation = await this.lockGeneration(client, input.tenantId, input.generationId);
        if (generation.status === "succeeded") {
          return;
        }
        if (generation.status === "running" || generation.status === "waiting_provider") {
          return;
        }

        await this.markGenerationRunning(client, input.tenantId, input.generationId);

        try {
          const referenceAssets = await this.loadReferenceAssets(
            client,
            input.tenantId,
            generation.reference_asset_ids,
          );
          const result = await this.mediaRuntime.generateImage(
            {
              tenantId: input.tenantId,
              userId: generation.created_by,
            },
            {
              inputAssets: referenceAssets,
              metadata: {
                params: buildMetadataParams(generation),
                referenceAssetIds: generation.reference_asset_ids,
                source: "workbench",
              },
              model: generation.model_id,
              prompt: generation.prompt,
              routeKey: generation.route_key,
            },
          );

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

          const assetRefs = await this.assetStore.persistOutputs(client, {
            kind: "image",
            nodeRunId: null,
            outputs,
            projectId: null,
            tenantId: input.tenantId,
            workflowRunId: null,
          });

          await this.insertResults(client, input.tenantId, generation.id, assetRefs);
          await this.settleGeneration(client, input.tenantId, generation, assetRefs.length);
          await this.markGenerationSucceeded(client, input.tenantId, generation.id);
        } catch (error) {
          await this.markGenerationFailed(client, input.tenantId, generation.id, error);
          await this.refundGeneration(client, input.tenantId, generation);
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
      },
      this.pool,
    );

    return {
      jobId: null,
      queueName: "workbench.generate",
      status: "ok",
      tenantId: input.tenantId,
      traceId: input.traceId ?? null,
    };
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
          reference_asset_ids::text[] AS reference_asset_ids,
          requested_count,
          display_mode,
          estimated_credits::text AS estimated_credits,
          charged_credits::text AS charged_credits,
          reserved_credits::text AS reserved_credits,
          reserve_ledger_id::text AS reserve_ledger_id,
          status
        FROM workbench_generations
        WHERE tenant_id = $1::uuid
          AND id = $2::uuid
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
  ): Promise<AssetReferenceInput[]> {
    if (assetIds.length === 0) {
      return [];
    }

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
    const hydrated: AssetReferenceInput[] = [];

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

    return hydrated;
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

    let lastPoll: ProviderTaskResult | null = null;
    for (const providerTaskId of providerTaskIds) {
      const polled = await this.mediaRuntime.pollTask(
        context,
        "image",
        {
          model: generation.model_id,
          providerTaskId,
          routeKey: generation.route_key,
        },
      );
      lastPoll = polled;
      if (polled.status === "failed") {
        throw new Error(polled.error?.message ? String(polled.error.message) : "Workbench provider task failed.");
      }
      if (polled.status === "pending" || polled.status === "running") {
        throw new Error("Workbench provider task did not finish in time.");
      }
    }

    return lastPoll ? normalizeTaskOutputs(lastPoll) : [];
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
        requestedCount: generation.requested_count,
        routeKey: generation.route_key,
        sessionId: generation.session_id,
        source: "workbench",
      },
      modality: "image",
      modelId: generation.model_id,
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
}
