import type { Pool } from "pg";

import { createPgPool, withTenantTransaction } from "@aigc-flow/db";

import { AiGateway } from "./ai-gateway.js";
import { CredentialVault } from "./credential-vault.js";
import { AiGatewayError } from "./errors.js";
import { redactValue } from "./redaction.js";
import { RouteResolver } from "./route-resolver.js";
import type {
  AiGatewayMediaResult,
  ImageGenerationRequest,
  PollTaskRequest,
  ProviderTaskResult,
  ResolvedRoute,
  VideoGenerationRequest,
} from "./types.js";

type RuntimeLogger = {
  error: (fields: Record<string, unknown>, message: string) => void;
  info: (fields: Record<string, unknown>, message: string) => void;
};

type RuntimeContext = {
  tenantId: string;
  userId: string | null;
};

type RuntimeRouteRecord = {
  api_mode: string | null;
  auth_tag: Buffer | null;
  base_url_override: string | null;
  connection_adapter_kind: string | null;
  connection_base_url: string | null;
  connection_id: string | null;
  connection_name: string | null;
  credential_id: string | null;
  default_base_url: string | null;
  encrypted_secret: Buffer | null;
  model_id: string | null;
  model_key: string | null;
  nonce: Buffer | null;
  priority: number;
  provider_id: string;
  provider_capabilities: Record<string, unknown> | null;
  provider_key: string;
  provider_name: string;
  provider_kind: string;
  request_path: string | null;
  request_config: Record<string, unknown>;
  route_id: string;
  route_key: string;
  route_label: string | null;
  route_status: string;
  route_tenant_id: string | null;
  upstream_model: string | null;
  weight: number;
};

function buildRuntimeRequestConfig(row: RuntimeRouteRecord): Record<string, unknown> {
  return {
    ...(row.request_config ?? {}),
    ...(row.api_mode ? { apiMode: row.api_mode } : {}),
    ...(row.request_path ? { path: row.request_path } : {}),
    ...(row.upstream_model ? { model: row.upstream_model, upstreamModel: row.upstream_model } : {}),
  };
}

type AiCallLogInsertInput = {
  adapterKindSnapshot?: string | null;
  apiModeSnapshot?: string | null;
  connectionId?: string | null;
  connectionNameSnapshot?: string | null;
  error: Record<string, unknown> | null;
  inputTokens?: number | null;
  latencyMs?: number | null;
  modelId: string | null;
  nodeRunId?: string | null;
  outputTokens?: number | null;
  productModelKey?: string | null;
  providerId: string | null;
  providerKeySnapshot?: string | null;
  providerNameSnapshot?: string | null;
  requestSummary?: Record<string, unknown>;
  requestAssetId?: string | null;
  responseAssetId?: string | null;
  responseSummary?: Record<string, unknown>;
  routeId: string | null;
  routeKeySnapshot?: string | null;
  routeLabelSnapshot?: string | null;
  status: string;
  tenantId: string;
  upstreamModelSnapshot?: string | null;
  workflowRunId?: string | null;
};

type RuntimeLogMetadata = {
  generationId?: string | null;
  logger?: RuntimeLogger | null;
  nodeRunId?: string | null;
  requestConfigOverride?: Record<string, unknown>;
  traceId?: string | null;
  workflowRunId?: string | null;
};

function emitRuntimeLog(
  logger: RuntimeLogger | null | undefined,
  fields: Record<string, unknown>,
  message: string,
) {
  logger?.info(fields, message);
}

export class DatabaseMediaRuntime {
  readonly aiGateway: AiGateway;
  readonly credentialVault: CredentialVault;
  readonly pool: Pool;
  readonly routeResolver: RouteResolver;

  constructor(options: {
    aiGateway: AiGateway;
    credentialVault: CredentialVault;
    pool?: Pool;
    routeResolver?: RouteResolver;
  }) {
    this.aiGateway = options.aiGateway;
    this.credentialVault = options.credentialVault;
    this.pool = options.pool ?? createPgPool();
    this.routeResolver = options.routeResolver ?? new RouteResolver();
  }

  async generateImage(
    context: RuntimeContext,
    request: ImageGenerationRequest,
    metadata?: RuntimeLogMetadata,
  ): Promise<AiGatewayMediaResult> {
    return this.callGenerate(
      context,
      "image",
      request.routeKey ?? null,
      request,
      metadata,
      (selectedRoute, apiKey) =>
        this.aiGateway.generateImage({
          apiKey,
          request,
          route: selectedRoute,
        }),
    );
  }

  async generateVideo(
    context: RuntimeContext,
    request: VideoGenerationRequest,
    metadata?: RuntimeLogMetadata,
  ): Promise<AiGatewayMediaResult> {
    return this.callGenerate(
      context,
      "video",
      request.routeKey ?? null,
      request,
      metadata,
      (selectedRoute, apiKey) =>
        this.aiGateway.generateVideo({
          apiKey,
          request,
          route: selectedRoute,
        }),
    );
  }

  async pollTask(
    context: RuntimeContext,
    modality: "image" | "video",
    request: PollTaskRequest,
    metadata?: Omit<RuntimeLogMetadata, "requestConfigOverride">,
  ): Promise<ProviderTaskResult> {
    const selectedRoute = request.routeId
      ? await this.getRuntimeRouteById(context, request.routeId)
      : await this.resolveRoute(context, modality, request.routeKey ?? null);

    const apiKey = this.getApiKeyForRoute(selectedRoute);
    const startedAt = Date.now();

    emitRuntimeLog(
      metadata?.logger,
      {
        event: "media.poll.started",
        generationId: metadata?.generationId ?? null,
        modelId: selectedRoute.model.id,
        nodeRunId: metadata?.nodeRunId ?? null,
        providerTaskId: request.providerTaskId,
        routeKey: selectedRoute.routeKey,
        tenantId: context.tenantId,
        traceId: metadata?.traceId ?? null,
        workflowRunId: metadata?.workflowRunId ?? null,
      },
      "media poll started",
    );

    try {
      const result = await this.aiGateway.pollTask({
        apiKey,
        request,
        route: selectedRoute,
      });

      const normalizedStatus = result.status === "failed" ? "failed" : "succeeded";
      await this.insertAiCallLog({
        adapterKindSnapshot:
          selectedRoute.connection?.adapterKind ?? selectedRoute.provider.kind ?? null,
        apiModeSnapshot: selectedRoute.requestConfig.apiMode as string | null | undefined,
        connectionId: selectedRoute.connection?.id ?? null,
        connectionNameSnapshot: selectedRoute.connection?.name ?? null,
        error:
          result.status === "failed"
            ? {
                ...(result.error ?? {}),
                providerRequest: redactValue(result.providerRequest, [apiKey]),
                providerResponse: redactValue(result.providerResponse, [apiKey]),
              }
            : null,
        inputTokens: result.usage?.inputTokens ?? null,
        latencyMs: Date.now() - startedAt,
        modelId: selectedRoute.model.id,
        nodeRunId: metadata?.nodeRunId ?? null,
        outputTokens: result.usage?.outputTokens ?? null,
        productModelKey: request.model ?? selectedRoute.model.modelKey ?? null,
        providerId: selectedRoute.provider.id,
        providerKeySnapshot: selectedRoute.provider.key,
        providerNameSnapshot: selectedRoute.provider.name ?? null,
        requestSummary: {
          providerTaskId: request.providerTaskId,
          routeKey: selectedRoute.routeKey,
        },
        responseSummary: {
          outputCount: result.outputs?.length ?? 0,
          providerTaskId: result.providerTaskId ?? null,
          status: result.status,
        },
        routeId: selectedRoute.routeId,
        routeKeySnapshot: selectedRoute.routeKey,
        routeLabelSnapshot: selectedRoute.routeLabel ?? null,
        status: normalizedStatus,
        tenantId: context.tenantId,
        upstreamModelSnapshot: selectedRoute.upstreamModel ?? null,
        workflowRunId: metadata?.workflowRunId ?? null,
      });

      emitRuntimeLog(
        metadata?.logger,
        {
          durationMs: Date.now() - startedAt,
          event: "media.poll.finished",
          generationId: metadata?.generationId ?? null,
          modelId: selectedRoute.model.id,
          nodeRunId: metadata?.nodeRunId ?? null,
          outputCount: result.outputs?.length ?? 0,
          providerTaskId: result.providerTaskId ?? request.providerTaskId,
          routeKey: selectedRoute.routeKey,
          tenantId: context.tenantId,
          traceId: metadata?.traceId ?? null,
          workflowRunId: metadata?.workflowRunId ?? null,
        },
        "media poll finished",
      );

      return result;
    } catch (error) {
      const normalizedError = this.toAiGatewayError(error);
      await this.insertAiCallLog({
        adapterKindSnapshot:
          selectedRoute.connection?.adapterKind ?? selectedRoute.provider.kind ?? null,
        apiModeSnapshot: selectedRoute.requestConfig.apiMode as string | null | undefined,
        connectionId: selectedRoute.connection?.id ?? null,
        connectionNameSnapshot: selectedRoute.connection?.name ?? null,
        error: {
          code: normalizedError.code,
          message: normalizedError.message,
          providerRequest: redactValue(normalizedError.providerRequest, [apiKey]),
          providerResponse: redactValue(normalizedError.providerResponse, [apiKey]),
        },
        latencyMs: Date.now() - startedAt,
        modelId: selectedRoute.model.id,
        nodeRunId: metadata?.nodeRunId ?? null,
        productModelKey: request.model ?? selectedRoute.model.modelKey ?? null,
        providerId: selectedRoute.provider.id,
        providerKeySnapshot: selectedRoute.provider.key,
        providerNameSnapshot: selectedRoute.provider.name ?? null,
        requestSummary: {
          providerTaskId: request.providerTaskId,
          routeKey: selectedRoute.routeKey,
        },
        responseSummary: {
          status: "failed",
        },
        routeId: selectedRoute.routeId,
        routeKeySnapshot: selectedRoute.routeKey,
        routeLabelSnapshot: selectedRoute.routeLabel ?? null,
        status: normalizedError.code === "PROVIDER_TIMEOUT" ? "provider_result_unknown" : "failed",
        tenantId: context.tenantId,
        upstreamModelSnapshot: selectedRoute.upstreamModel ?? null,
        workflowRunId: metadata?.workflowRunId ?? null,
      });
      emitRuntimeLog(
        metadata?.logger,
        {
          durationMs: Date.now() - startedAt,
          errorCode: normalizedError.code,
          event: "media.poll.failed",
          generationId: metadata?.generationId ?? null,
          modelId: selectedRoute.model.id,
          nodeRunId: metadata?.nodeRunId ?? null,
          providerTaskId: request.providerTaskId,
          routeKey: selectedRoute.routeKey,
          tenantId: context.tenantId,
          traceId: metadata?.traceId ?? null,
          workflowRunId: metadata?.workflowRunId ?? null,
        },
        "media poll failed",
      );
      throw normalizedError;
    }
  }

  private async callGenerate(
    context: RuntimeContext,
    modality: "image" | "video",
    routeKey: string | null,
    request: ImageGenerationRequest | VideoGenerationRequest,
    metadata: RuntimeLogMetadata | undefined,
    caller: (selectedRoute: ResolvedRoute, apiKey: string) => Promise<AiGatewayMediaResult>,
  ): Promise<AiGatewayMediaResult> {
    const selectedRoute = await this.resolveRoute(context, modality, routeKey);
    const routeForCall = metadata?.requestConfigOverride
      ? {
          ...selectedRoute,
          requestConfig: {
            ...selectedRoute.requestConfig,
            ...metadata.requestConfigOverride,
          },
        }
      : selectedRoute;
    const apiKey = this.getApiKeyForRoute(selectedRoute);
    const startedAt = Date.now();

    emitRuntimeLog(
      metadata?.logger,
      {
        event: "media.generate.started",
        generationId: metadata?.generationId ?? null,
        inputAssetCount: request.inputAssets?.length ?? 0,
        modelId: selectedRoute.model.id,
        nodeRunId: metadata?.nodeRunId ?? null,
        routeKey: selectedRoute.routeKey,
        tenantId: context.tenantId,
        traceId: metadata?.traceId ?? null,
        workflowRunId: metadata?.workflowRunId ?? null,
      },
      "media generate started",
    );

    try {
      const result = await caller(routeForCall, apiKey);

      await this.insertAiCallLog({
        adapterKindSnapshot:
          selectedRoute.connection?.adapterKind ?? selectedRoute.provider.kind ?? null,
        apiModeSnapshot: selectedRoute.requestConfig.apiMode as string | null | undefined,
        connectionId: selectedRoute.connection?.id ?? null,
        connectionNameSnapshot: selectedRoute.connection?.name ?? null,
        error: null,
        inputTokens: result.usage?.inputTokens ?? null,
        latencyMs: Date.now() - startedAt,
        modelId: selectedRoute.model.id,
        nodeRunId: metadata?.nodeRunId ?? null,
        outputTokens: result.usage?.outputTokens ?? null,
        productModelKey: request.model ?? selectedRoute.model.modelKey ?? null,
        providerId: selectedRoute.provider.id,
        providerKeySnapshot: selectedRoute.provider.key,
        providerNameSnapshot: selectedRoute.provider.name ?? null,
        requestSummary: {
          assetCount: request.inputAssets?.length ?? 0,
          hasMetadata: Boolean(request.metadata && Object.keys(request.metadata).length > 0),
          promptPreview: request.prompt.slice(0, 200),
          routeKey: selectedRoute.routeKey,
        },
        responseSummary: {
          outputCount: result.outputs?.length ?? 0,
          providerTaskId: result.providerTaskId ?? null,
          status: result.status,
        },
        routeId: selectedRoute.routeId,
        routeKeySnapshot: selectedRoute.routeKey,
        routeLabelSnapshot: selectedRoute.routeLabel ?? null,
        status: result.status === "failed" ? "failed" : "succeeded",
        tenantId: context.tenantId,
        upstreamModelSnapshot: selectedRoute.upstreamModel ?? null,
        workflowRunId: metadata?.workflowRunId ?? null,
      });

      emitRuntimeLog(
        metadata?.logger,
        {
          durationMs: Date.now() - startedAt,
          event: "media.generate.finished",
          generationId: metadata?.generationId ?? null,
          inputAssetCount: request.inputAssets?.length ?? 0,
          modelId: selectedRoute.model.id,
          nodeRunId: metadata?.nodeRunId ?? null,
          outputCount: result.outputs?.length ?? 0,
          providerTaskId: result.providerTaskId ?? null,
          routeKey: selectedRoute.routeKey,
          tenantId: context.tenantId,
          traceId: metadata?.traceId ?? null,
          workflowRunId: metadata?.workflowRunId ?? null,
        },
        "media generate finished",
      );

      return result;
    } catch (error) {
      const normalizedError = this.toAiGatewayError(error);
      await this.insertAiCallLog({
        adapterKindSnapshot:
          selectedRoute.connection?.adapterKind ?? selectedRoute.provider.kind ?? null,
        apiModeSnapshot: selectedRoute.requestConfig.apiMode as string | null | undefined,
        connectionId: selectedRoute.connection?.id ?? null,
        connectionNameSnapshot: selectedRoute.connection?.name ?? null,
        error: {
          code: normalizedError.code,
          message: normalizedError.message,
          providerRequest: redactValue(normalizedError.providerRequest, [apiKey]),
          providerResponse: redactValue(normalizedError.providerResponse, [apiKey]),
        },
        latencyMs: Date.now() - startedAt,
        modelId: selectedRoute.model.id,
        nodeRunId: metadata?.nodeRunId ?? null,
        productModelKey: request.model ?? selectedRoute.model.modelKey ?? null,
        providerId: selectedRoute.provider.id,
        providerKeySnapshot: selectedRoute.provider.key,
        providerNameSnapshot: selectedRoute.provider.name ?? null,
        requestSummary: {
          assetCount: request.inputAssets?.length ?? 0,
          hasMetadata: Boolean(request.metadata && Object.keys(request.metadata).length > 0),
          promptPreview: request.prompt.slice(0, 200),
          routeKey: selectedRoute.routeKey,
        },
        responseSummary: {
          status: "failed",
        },
        routeId: selectedRoute.routeId,
        routeKeySnapshot: selectedRoute.routeKey,
        routeLabelSnapshot: selectedRoute.routeLabel ?? null,
        status: normalizedError.code === "PROVIDER_TIMEOUT" ? "provider_result_unknown" : "failed",
        tenantId: context.tenantId,
        upstreamModelSnapshot: selectedRoute.upstreamModel ?? null,
        workflowRunId: metadata?.workflowRunId ?? null,
      });
      emitRuntimeLog(
        metadata?.logger,
        {
          durationMs: Date.now() - startedAt,
          errorCode: normalizedError.code,
          event: "media.generate.failed",
          generationId: metadata?.generationId ?? null,
          inputAssetCount: request.inputAssets?.length ?? 0,
          modelId: selectedRoute.model.id,
          nodeRunId: metadata?.nodeRunId ?? null,
          routeKey: selectedRoute.routeKey,
          tenantId: context.tenantId,
          traceId: metadata?.traceId ?? null,
          workflowRunId: metadata?.workflowRunId ?? null,
        },
        "media generate failed",
      );
      throw normalizedError;
    }
  }

  private getApiKeyForRoute(selectedRoute: ResolvedRoute): string {
    if (
      !selectedRoute.credential.id ||
      !selectedRoute.credential.encryptedSecret ||
      !selectedRoute.credential.nonce ||
      !selectedRoute.credential.authTag
    ) {
      throw new AiGatewayError({
        code: "CREDENTIAL_REQUIRED",
        message: "The selected route does not have a usable credential",
        statusCode: 400,
      });
    }

    return this.credentialVault.getSecretForProviderCall({
      authTag: selectedRoute.credential.authTag,
      encryptedSecret: selectedRoute.credential.encryptedSecret,
      nonce: selectedRoute.credential.nonce,
    });
  }

  private async resolveRoute(
    context: RuntimeContext,
    modality: "image" | "video",
    routeKey: string | null,
  ): Promise<ResolvedRoute> {
    const routes = await this.listRuntimeRoutes(context, modality, {
      routeKey,
    });

    return this.routeResolver.resolveMediaRoute({
      routeKey,
      routes,
    });
  }

  private async getRuntimeRouteById(
    context: RuntimeContext,
    routeId: string,
  ): Promise<ResolvedRoute> {
    const routes = await this.listRuntimeRoutes(context, null, {
      routeId,
    });
    const route = routes[0];
    if (!route) {
      throw new AiGatewayError({
        code: "ROUTE_NOT_FOUND",
        message: "The provider task route is no longer available",
        statusCode: 404,
      });
    }

    return route;
  }

  private async listRuntimeRoutes(
    context: RuntimeContext,
    modality: "image" | "video" | null,
    options: {
      routeId?: string | null;
      routeKey?: string | null;
    },
  ): Promise<ResolvedRoute[]> {
    return withTenantTransaction(context, async (client) => {
      const result = await client.query<RuntimeRouteRecord>(
        `
          SELECT
            r.id::text AS route_id,
            r.tenant_id::text AS route_tenant_id,
            r.route_key,
            r.route_label,
            r.status AS route_status,
            r.priority,
            r.weight,
            r.connection_id::text AS connection_id,
            r.api_mode,
            r.upstream_model,
            r.base_url_override,
            r.request_config,
            p.id::text AS provider_id,
            p.key AS provider_key,
            p.name AS provider_name,
            p.kind AS provider_kind,
            p.capabilities AS provider_capabilities,
            p.default_base_url,
            m.id::text AS model_id,
            m.model_key,
            pc.adapter_kind AS connection_adapter_kind,
            pc.base_url AS connection_base_url,
            pc.name AS connection_name,
            c.id::text AS credential_id,
            c.encrypted_secret,
            c.nonce,
            c.auth_tag
          FROM ai_routes r
          JOIN ai_providers p
            ON p.id = r.provider_id
          LEFT JOIN ai_models m
            ON m.id = r.model_id
          LEFT JOIN ai_provider_connections pc
            ON pc.id = r.connection_id
          LEFT JOIN api_credentials c
            ON c.id = COALESCE(r.credential_id, pc.credential_id)
           AND c.status <> 'deleted'
          WHERE ($1::text IS NULL OR r.modality = $1)
            AND r.status = 'active'
            AND p.status = 'active'
            AND ($2::uuid IS NULL OR r.id = $2::uuid)
            AND ($3::text IS NULL OR r.route_key = $3)
            AND (r.model_id IS NULL OR m.status = 'active')
          ORDER BY
            CASE WHEN r.tenant_id IS NULL THEN 1 ELSE 0 END ASC,
            r.priority ASC,
            r.weight DESC,
            r.created_at ASC,
            r.id ASC
        `,
        [modality, options.routeId ?? null, options.routeKey?.trim() || null],
      );

      return result.rows.map((row) => {
        const baseUrl =
          row.base_url_override?.trim() ||
          row.connection_base_url?.trim() ||
          row.default_base_url?.trim() ||
          "";
        if (!baseUrl) {
          throw new AiGatewayError({
            code: "PROVIDER_BAD_REQUEST",
            message: `Route ${row.route_key} does not have a provider base URL configured`,
            statusCode: 400,
          });
        }

        return {
          baseUrl,
          credential: {
            authTag: row.auth_tag,
            encryptedSecret: row.encrypted_secret,
            id: row.credential_id,
            nonce: row.nonce,
          },
          connection: {
            adapterKind: row.connection_adapter_kind,
            id: row.connection_id,
            name: row.connection_name,
          },
          model: {
            id: row.model_id,
            modelKey: row.model_key,
          },
          priority: row.priority,
          provider: {
            capabilities: row.provider_capabilities ?? null,
            defaultBaseUrl: row.default_base_url,
            id: row.provider_id,
            key: row.provider_key,
            kind: row.provider_kind,
            name: row.provider_name,
          },
          requestConfig: buildRuntimeRequestConfig(row),
          routeId: row.route_id,
          routeKey: row.route_key,
          routeLabel: row.route_label,
          status: row.route_status,
          tenantId: row.route_tenant_id,
          upstreamModel: row.upstream_model,
          weight: row.weight,
        } satisfies ResolvedRoute;
      });
    }, this.pool);
  }

  private async insertAiCallLog(input: AiCallLogInsertInput): Promise<void> {
    await withTenantTransaction(
      { tenantId: input.tenantId, userId: null },
      async (client) => {
        await client.query(
          `
            INSERT INTO ai_call_logs (
              tenant_id,
              workflow_run_id,
              node_run_id,
              provider_id,
              model_id,
              route_id,
              status,
              request_asset_id,
              response_asset_id,
              product_model_key,
              route_key_snapshot,
              route_label_snapshot,
              provider_key_snapshot,
              provider_name_snapshot,
              connection_id,
              connection_name_snapshot,
              adapter_kind_snapshot,
              api_mode_snapshot,
              upstream_model_snapshot,
              request_summary,
              response_summary,
              error,
              latency_ms,
              input_tokens,
              output_tokens
            )
            VALUES (
              $1::uuid,
              $2::uuid,
              $3::uuid,
              $4::uuid,
              $5::uuid,
              $6::uuid,
              $7,
              $8::uuid,
              $9::uuid,
              $10,
              $11,
              $12,
              $13,
              $14,
              $15::uuid,
              $16,
              $17,
              $18,
              $19,
              $20::jsonb,
              $21::jsonb,
              $22::jsonb,
              $23::int,
              $24::int,
              $25::int
            )
          `,
          [
            input.tenantId,
            input.workflowRunId ?? null,
            input.nodeRunId ?? null,
            input.providerId,
            input.modelId,
            input.routeId,
            input.status,
            input.requestAssetId ?? null,
            input.responseAssetId ?? null,
            input.productModelKey ?? null,
            input.routeKeySnapshot ?? null,
            input.routeLabelSnapshot ?? null,
            input.providerKeySnapshot ?? null,
            input.providerNameSnapshot ?? null,
            input.connectionId ?? null,
            input.connectionNameSnapshot ?? null,
            input.adapterKindSnapshot ?? null,
            input.apiModeSnapshot ?? null,
            input.upstreamModelSnapshot ?? null,
            JSON.stringify(input.requestSummary ?? {}),
            JSON.stringify(input.responseSummary ?? {}),
            input.error ? JSON.stringify(input.error) : null,
            input.latencyMs ?? null,
            input.inputTokens ?? null,
            input.outputTokens ?? null,
          ],
        );
      },
      this.pool,
    );
  }

  private toAiGatewayError(error: unknown): AiGatewayError {
    if (error instanceof AiGatewayError) {
      return error;
    }

    return new AiGatewayError({
      code: "PROVIDER_INTERNAL_ERROR",
      details: error instanceof Error ? error.message : String(error),
      message: "The provider call failed unexpectedly",
      statusCode: 502,
    });
  }
}
