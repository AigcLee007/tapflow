import type { Pool, PoolClient } from "pg";

import { createPgPool, withTenantTransaction } from "@aigc-flow/db";

import { AiGateway } from "./ai-gateway.js";
import { AittcoTextRelayAdapter } from "./aittco-text-relay-adapter.js";
import { type CredentialResponseView, CredentialVault } from "./credential-vault.js";
import { AiGatewayError } from "./errors.js";
import { OpenAiCompatibleTextAdapter } from "./openai-compatible-text-adapter.js";
import { redactValue } from "./redaction.js";
import { RouteResolver } from "./route-resolver.js";
import type {
  AiGatewayTextResult,
  ResolvedRoute,
  TextGenerationRequest,
} from "./types.js";
import type { TextStreamEvent } from "./text-streaming-contract.js";

type RuntimeContext = {
  tenantId: string;
  userId: string | null;
};

type RuntimeRouteRecord = {
  api_mode: string | null;
  auth_tag: Buffer | null;
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
  request_config: Record<string, unknown>;
  route_id: string;
  route_key: string;
  route_label: string | null;
  route_status: string;
  route_tenant_id: string | null;
  upstream_model: string | null;
  weight: number;
  base_url_override: string | null;
};

function buildRuntimeRequestConfig(row: RuntimeRouteRecord): Record<string, unknown> {
  return {
    ...(row.request_config ?? {}),
    ...(row.api_mode ? { apiMode: row.api_mode } : {}),
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
  outputTokens?: number | null;
  productModelKey?: string | null;
  providerId: string | null;
  providerKeySnapshot?: string | null;
  providerNameSnapshot?: string | null;
  requestSummary?: Record<string, unknown>;
  responseAssetId?: string | null;
  responseSummary?: Record<string, unknown>;
  routeId: string | null;
  routeKeySnapshot?: string | null;
  routeLabelSnapshot?: string | null;
  status: string;
  tenantId: string;
  upstreamModelSnapshot?: string | null;
  workflowRunId?: string | null;
  requestAssetId?: string | null;
  nodeRunId?: string | null;
};

export class DatabaseTextGenerationRuntime {
  readonly aiGateway: AiGateway;
  readonly credentialVault: CredentialVault;
  readonly pool: Pool;
  readonly routeResolver: RouteResolver;

  constructor(options: {
    aiGateway?: AiGateway;
    credentialVault: CredentialVault;
    pool?: Pool;
    routeResolver?: RouteResolver;
  }) {
    this.aiGateway =
      options.aiGateway ??
      new AiGateway({
        "aittco-text-relay": new AittcoTextRelayAdapter(),
        openai: new OpenAiCompatibleTextAdapter(),
        "openai-compatible": new OpenAiCompatibleTextAdapter(),
      });
    this.credentialVault = options.credentialVault;
    this.pool = options.pool ?? createPgPool();
    this.routeResolver = options.routeResolver ?? new RouteResolver();
  }

  async generateText(
    context: RuntimeContext,
    request: TextGenerationRequest,
    metadata?: {
      nodeRunId?: string | null;
      workflowRunId?: string | null;
    },
  ): Promise<AiGatewayTextResult> {
    const routes = await this.listRuntimeRoutes(context, request.routeKey ?? null);
    const selectedRoute = this.routeResolver.resolveTextRoute({
      routeKey: request.routeKey ?? null,
      routes,
    });

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

    const apiKey = this.credentialVault.getSecretForProviderCall({
      authTag: selectedRoute.credential.authTag,
      encryptedSecret: selectedRoute.credential.encryptedSecret,
      nonce: selectedRoute.credential.nonce,
    });

    const startedAt = Date.now();

    try {
      const result = await this.aiGateway.generateText({
        apiKey,
        request,
        route: selectedRoute,
      });

      await this.insertAiCallLog({
        adapterKindSnapshot:
          selectedRoute.connection?.adapterKind ?? selectedRoute.provider.kind ?? null,
        apiModeSnapshot: selectedRoute.requestConfig.apiMode as string | null | undefined,
        connectionId: selectedRoute.connection?.id ?? null,
        connectionNameSnapshot: selectedRoute.connection?.name ?? null,
        error: null,
        inputTokens: result.usage.inputTokens,
        latencyMs: Date.now() - startedAt,
        modelId: selectedRoute.model.id,
        nodeRunId: metadata?.nodeRunId ?? null,
        outputTokens: result.usage.outputTokens,
        productModelKey: request.model ?? selectedRoute.model.modelKey ?? null,
        providerId: selectedRoute.provider.id,
        providerKeySnapshot: selectedRoute.provider.key,
        providerNameSnapshot: selectedRoute.provider.name ?? null,
        requestSummary: {
          maxTokens: request.maxTokens ?? null,
          messageCount: request.messages.length,
          routeKey: selectedRoute.routeKey,
          temperature: request.temperature ?? null,
        },
        responseSummary: {
          outputPreview: result.outputText.slice(0, 200),
          usage: result.usage,
        },
        routeId: selectedRoute.routeId,
        routeKeySnapshot: selectedRoute.routeKey,
        routeLabelSnapshot: selectedRoute.routeLabel ?? null,
        status: "succeeded",
        tenantId: context.tenantId,
        upstreamModelSnapshot: selectedRoute.upstreamModel ?? null,
        workflowRunId: metadata?.workflowRunId ?? null,
      });

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
          maxTokens: request.maxTokens ?? null,
          messageCount: request.messages.length,
          routeKey: selectedRoute.routeKey,
          temperature: request.temperature ?? null,
        },
        responseSummary: {
          status: "failed",
        },
        routeId: selectedRoute.routeId,
        routeKeySnapshot: selectedRoute.routeKey,
        routeLabelSnapshot: selectedRoute.routeLabel ?? null,
        status: "failed",
        tenantId: context.tenantId,
        upstreamModelSnapshot: selectedRoute.upstreamModel ?? null,
        workflowRunId: metadata?.workflowRunId ?? null,
      });
      throw normalizedError;
    }
  }

  /**
   * Resolve credentials and routes server-side before opening the Agent
   * control-plane stream. Provider frames and decrypted credentials never
   * cross this boundary; callers receive the normalized Gateway event union.
   */
  async *streamText(
    context: RuntimeContext,
    request: TextGenerationRequest,
  ): AsyncGenerator<TextStreamEvent> {
    const routes = await this.listRuntimeRoutes(context, request.routeKey ?? null);
    const selectedRoute = this.routeResolver.resolveTextRoute({
      routeKey: request.routeKey ?? null,
      routes,
    });
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
    const apiKey = this.credentialVault.getSecretForProviderCall({
      authTag: selectedRoute.credential.authTag,
      encryptedSecret: selectedRoute.credential.encryptedSecret,
      nonce: selectedRoute.credential.nonce,
    });
    yield* this.aiGateway.streamText({
      apiKey,
      request,
      route: selectedRoute,
    });
  }

  private async listRuntimeRoutes(
    context: RuntimeContext,
    routeKey: string | null,
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
          WHERE r.modality = 'text'
            AND r.status = 'active'
            AND p.status = 'active'
            AND (r.model_id IS NULL OR m.status = 'active')
            AND ($1::text IS NULL OR r.route_key = $1)
          ORDER BY
            CASE WHEN r.tenant_id IS NULL THEN 1 ELSE 0 END ASC,
            r.priority ASC,
            r.weight DESC,
            r.created_at ASC,
            r.id ASC
        `,
        [routeKey?.trim() || null],
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
