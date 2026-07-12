import type { Pool, PoolClient } from "pg";

import {
  AiGatewayError,
  CredentialVault,
  DatabaseMediaRuntime,
  DatabaseTextGenerationRuntime,
  builtinAiPluginRegistry,
  createDefaultAiGateway,
  redactValue,
  type AiGatewayMediaResult,
  type AiGatewayTextResult,
  type AiPluginTestManifest,
} from "@aigc-flow/ai-gateway-core";
import { createPgPool, withTenantTransaction } from "@aigc-flow/db";

import type { RunRouteTestInput } from "./ai-route-tests.schemas.js";

type TenantContext = {
  ipHash?: string | null;
  requestId?: string | null;
  tenantId: string;
  traceId?: string | null;
  userAgent?: string | null;
  userId: string | null;
};

type RouteRecord = {
  api_mode: string | null;
  configuration_revision: number;
  connection_name: string | null;
  id: string;
  modality: "image" | "text" | "video";
  model_key: string | null;
  package_key: string | null;
  provider_key: string;
  route_label: string | null;
  route_key: string;
  upstream_model: string | null;
};

const DEFAULT_ROUTE_TEST_TIMEOUT_MS = 30_000;
const ROUTE_TEST_POLL_INTERVAL_MS = 1_000;

export type RouteTestResultView = {
  checkedAt: string;
  error: Record<string, unknown> | null;
  healthCheckId: string;
  latencyMs: number;
  requestSummary: Record<string, unknown>;
  responseSummary: Record<string, unknown>;
  routeId: string;
  routeKey: string;
  status: "failed" | "ok";
};

type MediaRuntimeForRouteTest = Omit<
  Pick<DatabaseMediaRuntime, "generateImage" | "generateVideo" | "pollTask">,
  "generateImage" | "pollTask"
> & {
  generateImage(
    context: Parameters<DatabaseMediaRuntime["generateImage"]>[0],
    request: Parameters<DatabaseMediaRuntime["generateImage"]>[1],
    metadata?: Parameters<DatabaseMediaRuntime["generateImage"]>[2] & {
      includeInactiveRoute?: boolean;
      routeId?: string | null;
    },
  ): ReturnType<DatabaseMediaRuntime["generateImage"]>;
  pollTask(
    context: Parameters<DatabaseMediaRuntime["pollTask"]>[0],
    modality: Parameters<DatabaseMediaRuntime["pollTask"]>[1],
    request: Parameters<DatabaseMediaRuntime["pollTask"]>[2],
    metadata?: Parameters<DatabaseMediaRuntime["pollTask"]>[3] & {
      includeInactiveRoute?: boolean;
      requestConfigOverride?: Record<string, unknown>;
    },
  ): ReturnType<DatabaseMediaRuntime["pollTask"]>;
};

export class AiRouteTestApiError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "AiRouteTestApiError";
    this.statusCode = statusCode;
  }
}

export class AiRouteTestService {
  readonly mediaRuntime: MediaRuntimeForRouteTest;
  readonly pool: Pool;
  readonly routeTestTimeoutMs: number;
  readonly textRuntime: Pick<DatabaseTextGenerationRuntime, "generateText">;

  constructor(options: {
    credentialVault: CredentialVault;
    mediaRuntime?: MediaRuntimeForRouteTest;
    pool?: Pool;
    routeTestTimeoutMs?: number;
    textRuntime?: Pick<DatabaseTextGenerationRuntime, "generateText">;
  }) {
    this.pool = options.pool ?? createPgPool();
    this.routeTestTimeoutMs = options.routeTestTimeoutMs ?? DEFAULT_ROUTE_TEST_TIMEOUT_MS;
    const aiGateway = createDefaultAiGateway();
    this.mediaRuntime = options.mediaRuntime ?? new DatabaseMediaRuntime({
      aiGateway,
      credentialVault: options.credentialVault,
      pool: this.pool,
    });
    this.textRuntime = options.textRuntime ?? new DatabaseTextGenerationRuntime({
      aiGateway,
      credentialVault: options.credentialVault,
      pool: this.pool,
    });
  }

  async runRouteTest(
    context: TenantContext,
    routeId: string,
    input: RunRouteTestInput,
  ): Promise<RouteTestResultView> {
    const route = await this.getTenantRoute(context, routeId);
    return this.testLoadedRoute(context, route, input);
  }

  async testAdminDraftRoute(
    context: TenantContext,
    routeId: string,
    input: RunRouteTestInput,
  ): Promise<RouteTestResultView> {
    // The future HTTP caller must enforce system-admin before entering this platform-only boundary.
    const route = await this.getPlatformDraftRoute(context, routeId);
    return this.testLoadedRoute(context, route, input);
  }

  private async testLoadedRoute(
    context: TenantContext,
    route: RouteRecord,
    input: RunRouteTestInput,
  ): Promise<RouteTestResultView> {
    const defaultTest = this.findDefaultTest(route.package_key, route.route_key);
    const requestSummary = this.buildRequestSummary(route, defaultTest, input);
    const startedAt = Date.now();

    try {
      const initialResult = await this.callRuntime(context, route, defaultTest, input);
      const result = await this.waitForAsyncResult(context, route, input, initialResult);
      const latencyMs = Date.now() - startedAt;
      const responseSummary = this.summarizeSuccess(route, result);
      return this.recordHealthCheck({
        checkedBy: context.userId,
        context,
        error: null,
        latencyMs,
        requestSummary,
        responseSummary,
        route,
        status: "ok",
      });
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      const normalizedError = this.normalizeError(error);
      const responseSummary = {
        status: "failed",
      };
      return this.recordHealthCheck({
        checkedBy: context.userId,
        context,
        error: normalizedError,
        latencyMs,
        requestSummary,
        responseSummary,
        route,
        status: "failed",
      });
    }
  }

  private async getPlatformDraftRoute(context: TenantContext, routeId: string): Promise<RouteRecord> {
    return withTenantTransaction(context, async (client) => {
      const result = await client.query<RouteRecord>(
        `SELECT route.id::text AS id,route.route_key,route.route_label,route.modality,route.api_mode,
          route.upstream_model,route.configuration_revision,provider.key AS provider_key,model.model_key,
          connection.name AS connection_name,package.package_key
         FROM ai_routes route JOIN ai_providers provider ON provider.id=route.provider_id
         LEFT JOIN ai_models model ON model.id=route.model_id
         LEFT JOIN ai_provider_connections connection ON connection.id=route.connection_id
         LEFT JOIN tenant_ai_plugin_installs install ON install.id=route.plugin_install_id
         LEFT JOIN ai_plugin_packages package ON package.id=install.package_id
         WHERE route.id=$1::uuid AND route.tenant_id IS NULL AND route.deleted_at IS NULL
           AND provider.status='active' AND (route.model_id IS NULL OR model.status='active') LIMIT 1`,
        [routeId],
      );
      if (!result.rows[0]) {
        throw new AiRouteTestApiError(404, "ROUTE_NOT_FOUND", "Platform draft route not found");
      }
      return result.rows[0];
    }, this.pool);
  }

  private async getTenantRoute(context: TenantContext, routeId: string): Promise<RouteRecord> {
    return withTenantTransaction(context, async (client) => {
      const result = await client.query<RouteRecord>(
        `
          SELECT
            route.id::text AS id,
            route.route_key,
            route.route_label,
            route.modality,
            route.api_mode,
            route.upstream_model,
            route.configuration_revision,
            provider.key AS provider_key,
            model.model_key,
            connection.name AS connection_name,
            package.package_key
          FROM ai_routes AS route
          JOIN ai_providers AS provider
            ON provider.id = route.provider_id
          LEFT JOIN ai_models AS model
            ON model.id = route.model_id
          LEFT JOIN ai_provider_connections AS connection
            ON connection.id = route.connection_id
          LEFT JOIN tenant_ai_plugin_installs AS install
            ON install.id = route.plugin_install_id
          LEFT JOIN ai_plugin_packages AS package
            ON package.id = install.package_id
          WHERE route.id = $1::uuid
            AND route.tenant_id = $2::uuid
            AND route.status = 'active'
            AND provider.status = 'active'
            AND (route.model_id IS NULL OR model.status = 'active')
          LIMIT 1
        `,
        [routeId, context.tenantId],
      );

      const route = result.rows[0];
      if (!route) {
        throw new AiRouteTestApiError(404, "ROUTE_NOT_FOUND", "Route not found or is not active");
      }
      return route;
    }, this.pool);
  }

  private findDefaultTest(packageKey: string | null, routeKey: string): AiPluginTestManifest | null {
    if (!packageKey) {
      return null;
    }
    const manifest = builtinAiPluginRegistry.get(packageKey);
    return manifest?.tests.find((test) => test.routeKey === routeKey) ?? null;
  }

  private async callRuntime(
    context: TenantContext,
    route: RouteRecord,
    defaultTest: AiPluginTestManifest | null,
    input: RunRouteTestInput,
  ): Promise<AiGatewayMediaResult | AiGatewayTextResult> {
    if (route.modality === "text") {
      return this.textRuntime.generateText(context, {
        maxTokens: input.maxTokens ?? null,
        messages:
          input.messages ??
          defaultTest?.request.messages ?? [
            {
              content: input.prompt ?? defaultTest?.request.prompt ?? "Return a short route test response.",
              role: "user",
            },
          ],
        model: input.model ?? route.model_key,
        routeKey: route.route_key,
        temperature: input.temperature ?? null,
      });
    }

    const prompt = input.prompt ?? defaultTest?.request.prompt ?? "A simple route test image.";
    const metadata = {
      ...(defaultTest?.request.metadata ?? {}),
      ...(input.metadata ?? {}),
    };

    if (route.modality === "image") {
      return this.mediaRuntime.generateImage(context, {
        metadata,
        model: input.model ?? route.model_key,
        prompt,
        routeKey: route.route_key,
      }, {
        includeInactiveRoute: true,
        requestConfigOverride: {
          timeoutMs: this.routeTestTimeoutMs,
        },
        routeId: route.id,
      });
    }

    return this.mediaRuntime.generateVideo(context, {
      metadata,
      model: input.model ?? route.model_key,
      prompt,
      routeKey: route.route_key,
    }, {
      requestConfigOverride: {
        timeoutMs: this.routeTestTimeoutMs,
      },
    });
  }

  private async waitForAsyncResult(
    context: TenantContext,
    route: RouteRecord,
    input: RunRouteTestInput,
    result: AiGatewayMediaResult | AiGatewayTextResult,
  ): Promise<AiGatewayMediaResult | AiGatewayTextResult> {
    if (
      route.modality === "text" ||
      !("providerTaskId" in result) ||
      result.status !== "waiting_provider" ||
      !result.providerTaskId
    ) {
      return result;
    }

    const deadline = Date.now() + this.routeTestTimeoutMs;
    while (true) {
      const polled = await this.mediaRuntime.pollTask(
        context,
        route.modality,
        {
          model: input.model ?? route.model_key,
          providerTaskId: result.providerTaskId,
          routeId: route.id,
          routeKey: route.route_key,
        },
        {
          includeInactiveRoute: true,
          requestConfigOverride: { timeoutMs: this.routeTestTimeoutMs },
        },
      );
      if (polled.status === "succeeded") {
        return polled as AiGatewayMediaResult;
      }
      if (polled.status === "failed") {
        throw new AiRouteTestApiError(502, "PROVIDER_TASK_FAILED", "Provider task failed during route test");
      }
      if (Date.now() >= deadline) {
        throw new AiRouteTestApiError(504, "PROVIDER_TASK_TIMEOUT", "Provider task did not finish during route test");
      }
      await new Promise((resolve) => setTimeout(resolve, ROUTE_TEST_POLL_INTERVAL_MS));
    }
  }

  private buildRequestSummary(
    route: RouteRecord,
    defaultTest: AiPluginTestManifest | null,
    input: RunRouteTestInput,
  ): Record<string, unknown> {
    const prompt = input.prompt ?? defaultTest?.request.prompt ?? null;
    return {
      hasCustomInput: Object.keys(input).length > 0,
      messageCount: input.messages?.length ?? defaultTest?.request.messages?.length ?? null,
      metadataKeys: Object.keys({
        ...(defaultTest?.request.metadata ?? {}),
        ...(input.metadata ?? {}),
      }),
      modelKey: input.model ?? route.model_key,
      routeLabel: route.route_label,
      connectionName: route.connection_name,
      apiMode: route.api_mode,
      packageKey: route.package_key,
      promptPreview: typeof prompt === "string" ? prompt.slice(0, 200) : null,
      providerKey: route.provider_key,
      routeKey: route.route_key,
      testKey: defaultTest?.key ?? null,
      timeoutMs: this.routeTestTimeoutMs,
      upstreamModel: route.upstream_model,
    };
  }

  private summarizeSuccess(
    route: RouteRecord,
    result: AiGatewayMediaResult | AiGatewayTextResult,
  ): Record<string, unknown> {
    if (route.modality === "text" && "outputText" in result) {
      return {
        apiMode: route.api_mode,
        connectionName: route.connection_name,
        modelKey: result.modelKey,
        outputPreview: result.outputText.slice(0, 200),
        providerKey: result.providerKey,
        routeLabel: route.route_label,
        status: result.status,
        upstreamModel: route.upstream_model,
        usage: result.usage,
      };
    }

    const mediaResult = result as AiGatewayMediaResult;
    return {
      apiMode: route.api_mode,
      connectionName: route.connection_name,
      hasProviderTaskId: Boolean(mediaResult.providerTaskId),
      modelKey: mediaResult.modelKey,
      outputCount: mediaResult.outputs?.length ?? 0,
      outputs: (mediaResult.outputs ?? []).slice(0, 5).map((output) => ({
        durationMs: output.durationMs ?? null,
        hasBase64: Boolean(output.base64),
        hasUrl: Boolean(output.url),
        height: output.height ?? null,
        mimeType: output.mimeType ?? null,
        width: output.width ?? null,
      })),
      providerKey: mediaResult.providerKey,
      routeLabel: route.route_label,
      status: mediaResult.status,
      upstreamModel: route.upstream_model,
      usage: mediaResult.usage ?? null,
    };
  }

  private normalizeError(error: unknown): Record<string, unknown> {
    if (error instanceof AiRouteTestApiError) {
      return {
        code: error.code,
        message: error.message,
      };
    }

    if (error instanceof AiGatewayError) {
      return {
        code: error.code,
        details: redactValue(error.details),
        message: error.message,
        providerRequest: redactValue(error.providerRequest),
        providerResponse: redactValue(error.providerResponse),
      };
    }

    return {
      code: "INTERNAL_ERROR",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  private async recordHealthCheck(options: {
    checkedBy: string | null;
    context: TenantContext;
    error: Record<string, unknown> | null;
    latencyMs: number;
    requestSummary: Record<string, unknown>;
    responseSummary: Record<string, unknown>;
    route: RouteRecord;
    status: "failed" | "ok";
  }): Promise<RouteTestResultView> {
    return withTenantTransaction(options.context, async (client: PoolClient) => {
      const result = await client.query<{
        created_at: string;
        id: string;
      }>(
        `
          INSERT INTO ai_route_health_checks (
            tenant_id,
            route_id,
            status,
            latency_ms,
            request_summary,
            response_summary,
            error,
            checked_by
          )
          VALUES (
            $1::uuid,
            $2::uuid,
            $3,
            $4,
            $5::jsonb,
            $6::jsonb,
            $7::jsonb,
            $8::uuid
          )
          RETURNING id::text AS id, created_at::text AS created_at
        `,
        [
          options.context.tenantId,
          options.route.id,
          options.status,
          options.latencyMs,
          JSON.stringify(options.requestSummary),
          JSON.stringify(options.responseSummary),
          options.error ? JSON.stringify(options.error) : null,
          options.checkedBy,
        ],
      );

      if (options.status === "ok") {
        await client.query(
          `UPDATE ai_routes SET tested_revision=$2,health_status='ok',last_health_checked_at=now(),updated_at=now()
           WHERE id=$1 AND configuration_revision=$2`,
          [options.route.id, options.route.configuration_revision],
        );
      } else {
        await client.query(
          `UPDATE ai_routes SET health_status='failed',last_health_checked_at=now(),
             tested_revision=NULL,updated_at=now()
           WHERE id=$1 AND configuration_revision=$2`,
          [options.route.id, options.route.configuration_revision],
        );
      }

      const row = result.rows[0];
      return {
        checkedAt: row.created_at,
        error: options.error,
        healthCheckId: row.id,
        latencyMs: options.latencyMs,
        requestSummary: options.requestSummary,
        responseSummary: options.responseSummary,
        routeId: options.route.id,
        routeKey: options.route.route_key,
        status: options.status,
      };
    }, this.pool);
  }
}
