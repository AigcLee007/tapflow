import { createPgPool, safeRecordAuditLog, withTenantTransaction } from "@aigc-flow/db";
import {
  AiGatewayError,
  DatabaseTextGenerationRuntime,
  CredentialVault,
  type AiGatewayTextResult,
  type CredentialResponseView,
  type ResolvedRoute,
  type TextGenerationRequest,
} from "@aigc-flow/ai-gateway-core";
import type { Pool, PoolClient } from "pg";

import type {
  CreateCredentialInput,
  CreateModelInput,
  CreateProviderConnectionInput,
  CreateProviderInput,
  CreateRouteInput,
  DuplicateRouteInput,
  ListRuntimeRoutesQuery,
  ListPricingQuery,
  UpsertPricingInput,
  UpdateCredentialInput,
  UpdateProviderConnectionInput,
  UpdateRouteInput,
} from "./ai-gateway.schemas.js";

type PgPool = Pool;

type TenantContext = {
  ipHash?: string | null;
  requestId?: string | null;
  tenantId: string;
  traceId?: string | null;
  userAgent?: string | null;
  userId: string | null;
};

const PLATFORM_TENANT_ID: string | null = null;

type ProviderRecord = {
  capabilities: Record<string, unknown>;
  created_at: string;
  default_base_url: string | null;
  id: string;
  key: string;
  kind: string;
  name: string;
  status: string;
  updated_at: string;
};

type ModelRecord = {
  capabilities: Record<string, unknown>;
  context_window: number | null;
  created_at: string;
  display_name: string;
  id: string;
  modality: string;
  model_key: string;
  provider_id: string;
  status: string;
  updated_at: string;
};

type ModelIdentityRecord = {
  id: string;
  modality?: string;
  provider_id?: string;
  model_key: string;
};

type RouteRecord = {
  admin_notes: string | null;
  api_mode: string | null;
  base_url_override: string | null;
  connection_id: string | null;
  created_at: string;
  credential_id: string | null;
  deleted_at: string | null;
  environment: string;
  fallback_group: string | null;
  health_status: string | null;
  id: string;
  internal_label: string | null;
  is_default: boolean;
  last_health_checked_at: string | null;
  modality: string;
  model_id: string | null;
  pricing: Record<string, unknown>;
  priority: number;
  plugin_install_id: string | null;
  provider_id: string;
  rate_limit: Record<string, unknown>;
  request_path: string | null;
  request_config: Record<string, unknown>;
  route_key: string;
  route_label: string | null;
  status: string;
  tenant_id: string | null;
  model_family: string | null;
  upstream_model: string | null;
  updated_at: string;
  weight: number;
};

type RuntimeRouteRecord = {
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
  provider_key: string;
  provider_kind: string;
  provider_name: string | null;
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

type RuntimeRouteListRecord = {
  modality: string;
  model_display_name: string | null;
  model_key: string | null;
  provider_key: string;
  provider_name: string;
  route_key: string;
};

type PricingRecord = {
  active: boolean;
  created_at: string;
  metadata: Record<string, unknown>;
  min_charge_credits: string;
  model: string;
  provider: string;
  route: string;
  unit: string;
  unit_credits: string;
};

type CredentialRecord = {
  auth_tag: Buffer;
  created_at: string;
  created_by: string | null;
  encrypted_secret: Buffer;
  id: string;
  key_version: string;
  last_used_at: string | null;
  name: string;
  nonce: Buffer;
  provider_id: string;
  rotated_at: string | null;
  secret_fingerprint: string;
  status: string;
  tenant_id: string | null;
  updated_at: string;
};

type ProviderConnectionRecord = {
  adapter_kind: string;
  base_url: string | null;
  created_at: string;
  created_by: string | null;
  credential_id: string | null;
  environment: string;
  id: string;
  last_health_checked_at: string | null;
  last_health_status: string | null;
  metadata: Record<string, unknown>;
  name: string;
  provider_id: string;
  status: string;
  tenant_id: string;
  updated_at: string;
};

type AiCallLogInsertInput = {
  error: Record<string, unknown> | null;
  inputTokens?: number | null;
  latencyMs?: number | null;
  modelId: string | null;
  outputTokens?: number | null;
  providerId: string | null;
  responseAssetId?: string | null;
  routeId: string | null;
  status: string;
  tenantId: string;
  workflowRunId?: string | null;
  requestAssetId?: string | null;
  nodeRunId?: string | null;
};

export type ProviderView = {
  capabilities: Record<string, unknown>;
  createdAt: string;
  defaultBaseUrl: string | null;
  id: string;
  key: string;
  kind: string;
  name: string;
  status: string;
  updatedAt: string;
};

export type ModelView = {
  capabilities: Record<string, unknown>;
  contextWindow: number | null;
  createdAt: string;
  displayName: string;
  id: string;
  modality: string;
  modelKey: string;
  providerId: string;
  status: string;
  updatedAt: string;
};

export type RouteView = {
  adminNotes: string | null;
  apiMode: string | null;
  baseUrlOverride: string | null;
  connectionId: string | null;
  createdAt: string;
  credentialId: string | null;
  deletedAt: string | null;
  environment: string;
  fallbackGroup: string | null;
  healthStatus: string | null;
  id: string;
  internalLabel: string | null;
  isDefault: boolean;
  lastHealthCheckedAt: string | null;
  modality: string;
  modelId: string | null;
  modelFamily: string | null;
  pricing: Record<string, unknown>;
  priority: number;
  pluginInstallId: string | null;
  providerId: string;
  rateLimit: Record<string, unknown>;
  requestPath: string | null;
  requestConfig: Record<string, unknown>;
  routeKey: string;
  routeLabel: string | null;
  status: string;
  tenantId: string | null;
  upstreamModel: string | null;
  updatedAt: string;
  weight: number;
};

export type RuntimeRouteListItemView = {
  estimatedCredits: number | null;
  minChargeCredits: number | null;
  modality: string;
  modelDisplayName: string | null;
  modelKey: string | null;
  providerKey: string;
  providerName: string;
  pricingUnit: string | null;
  routeKey: string;
};

export type GenerateTextResultView = {
  modelKey: string;
  outputText: string;
  providerKey: string;
  status: "succeeded";
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  };
};

export type PricingView = {
  active: boolean;
  metadata: Record<string, unknown>;
  minChargeCredits: number;
  model: string;
  provider: string;
  route: string;
  unit: string;
  unitCredits: number;
  updatedAt: string;
};

export type ProviderConnectionView = {
  adapterKind: string;
  baseUrl: string | null;
  createdAt: string;
  createdBy: string | null;
  credentialId: string | null;
  environment: string;
  id: string;
  lastHealthCheckedAt: string | null;
  lastHealthStatus: string | null;
  metadata: Record<string, unknown>;
  name: string;
  providerId: string;
  status: string;
  tenantId: string;
  updatedAt: string;
};

export class AiGatewayApiError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "AiGatewayApiError";
    this.statusCode = statusCode;
  }
}

function mapProvider(row: ProviderRecord): ProviderView {
  return {
    capabilities: row.capabilities ?? {},
    createdAt: row.created_at,
    defaultBaseUrl: row.default_base_url,
    id: row.id,
    key: row.key,
    kind: row.kind,
    name: row.name,
    status: row.status,
    updatedAt: row.updated_at,
  };
}

function mapModel(row: ModelRecord): ModelView {
  return {
    capabilities: row.capabilities ?? {},
    contextWindow: row.context_window,
    createdAt: row.created_at,
    displayName: row.display_name,
    id: row.id,
    modality: row.modality,
    modelKey: row.model_key,
    providerId: row.provider_id,
    status: row.status,
    updatedAt: row.updated_at,
  };
}

function mapRoute(row: RouteRecord): RouteView {
  return {
    adminNotes: row.admin_notes,
    apiMode: row.api_mode,
    baseUrlOverride: row.base_url_override,
    connectionId: row.connection_id,
    createdAt: row.created_at,
    credentialId: row.credential_id,
    deletedAt: row.deleted_at,
    environment: row.environment,
    fallbackGroup: row.fallback_group,
    healthStatus: row.health_status,
    id: row.id,
    internalLabel: row.internal_label,
    isDefault: row.is_default,
    lastHealthCheckedAt: row.last_health_checked_at,
    modality: row.modality,
    modelId: row.model_id,
    modelFamily: row.model_family,
    pricing: row.pricing ?? {},
    priority: row.priority,
    pluginInstallId: row.plugin_install_id,
    providerId: row.provider_id,
    rateLimit: row.rate_limit ?? {},
    requestPath: row.request_path,
    requestConfig: row.request_config ?? {},
    routeKey: row.route_key,
    routeLabel: row.route_label,
    status: row.status,
    tenantId: row.tenant_id,
    upstreamModel: row.upstream_model,
    updatedAt: row.updated_at,
    weight: row.weight,
  };
}

function mapPricing(row: PricingRecord): PricingView {
  return {
    active: row.active,
    metadata: row.metadata ?? {},
    minChargeCredits: Number(row.min_charge_credits),
    model: row.model,
    provider: row.provider,
    route: row.route,
    unit: row.unit,
    unitCredits: Number(row.unit_credits),
    updatedAt: row.created_at,
  };
}

function mapProviderConnection(row: ProviderConnectionRecord): ProviderConnectionView {
  return {
    adapterKind: row.adapter_kind,
    baseUrl: row.base_url,
    createdAt: row.created_at,
    createdBy: row.created_by,
    credentialId: row.credential_id,
    environment: row.environment,
    id: row.id,
    lastHealthCheckedAt: row.last_health_checked_at,
    lastHealthStatus: row.last_health_status,
    metadata: row.metadata ?? {},
    name: row.name,
    providerId: row.provider_id,
    status: row.status,
    tenantId: row.tenant_id,
    updatedAt: row.updated_at,
  };
}

function buildNormalizedRouteRequestConfig(input: {
  apiMode?: string | null;
  connectionId?: string | null;
  requestConfig?: Record<string, unknown>;
  requestPath?: string | null;
  upstreamModel?: string | null;
}): Record<string, unknown> {
  const next = { ...(input.requestConfig ?? {}) };

  if (input.connectionId !== undefined) {
    if (input.connectionId) next.connectionId = input.connectionId;
    else delete next.connectionId;
  }
  if (input.upstreamModel !== undefined) {
    if (input.upstreamModel) next.model = input.upstreamModel;
    else delete next.model;
  }
  if (input.apiMode !== undefined) {
    if (input.apiMode) next.apiMode = input.apiMode;
    else delete next.apiMode;
  }
  if (input.requestPath !== undefined) {
    if (input.requestPath) next.path = input.requestPath;
    else delete next.path;
  }

  return next;
}

function buildDuplicatedRouteKey(routeKey: string): string {
  return routeKey.endsWith("-copy") ? `${routeKey}-2` : `${routeKey}-copy`;
}

export class AiGatewayAdminService {
  readonly credentialVault: CredentialVault;
  readonly pool: PgPool;
  readonly textRuntime: DatabaseTextGenerationRuntime;

  constructor(options: {
    credentialVault: CredentialVault;
    pool?: PgPool;
  }) {
    this.credentialVault = options.credentialVault;
    this.pool = options.pool ?? createPgPool();
    this.textRuntime = new DatabaseTextGenerationRuntime({
      credentialVault: this.credentialVault,
      pool: this.pool,
    });
  }

  async listProviders(): Promise<ProviderView[]> {
    const result = await this.pool.query<ProviderRecord>(
      `
        SELECT
          id::text AS id,
          key,
          name,
          kind,
          status,
          default_base_url,
          capabilities,
          created_at::text AS created_at,
          updated_at::text AS updated_at
        FROM ai_providers
        ORDER BY created_at ASC, id ASC
      `,
    );

    return result.rows.map(mapProvider);
  }

  async createProvider(context: TenantContext, input: CreateProviderInput): Promise<ProviderView> {
    try {
      const result = await this.pool.query<ProviderRecord>(
        `
          INSERT INTO ai_providers (
            key,
            name,
            kind,
            status,
            default_base_url,
            capabilities,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, now())
          RETURNING
            id::text AS id,
            key,
            name,
            kind,
            status,
            default_base_url,
            capabilities,
            created_at::text AS created_at,
            updated_at::text AS updated_at
        `,
        [
          input.key.trim(),
          input.name.trim(),
          input.kind.trim(),
          input.status?.trim() ?? "active",
          input.defaultBaseUrl?.trim() ?? null,
          JSON.stringify(input.capabilities ?? {}),
        ],
      );

      const provider = mapProvider(result.rows[0]);
      await safeRecordAuditLog(
        {
          action: "ai.provider.create",
          actorType: context.userId ? "user" : "system",
          actorUserId: context.userId,
          ipHash: context.ipHash,
          metadata: {
            key: provider.key,
            kind: provider.kind,
            status: provider.status,
          },
          requestId: context.requestId,
          resourceId: provider.id,
          resourceType: "ai_provider",
          tenantId: context.tenantId,
          traceId: context.traceId,
          userAgent: context.userAgent,
        },
        {
          pool: this.pool,
        },
      );
      return provider;
    } catch (error) {
      this.rethrowKnownDatabaseError(error, "Unable to create provider");
    }
  }

  async listProviderConnections(context: TenantContext): Promise<ProviderConnectionView[]> {
    return withTenantTransaction(context, async (client) => {
      const result = await client.query<ProviderConnectionRecord>(
        `
          SELECT
            id::text AS id,
            tenant_id::text AS tenant_id,
            provider_id::text AS provider_id,
            credential_id::text AS credential_id,
            name,
            adapter_kind,
            base_url,
            environment,
            status,
            metadata,
            last_health_status,
            last_health_checked_at::text AS last_health_checked_at,
            created_by::text AS created_by,
            created_at::text AS created_at,
            updated_at::text AS updated_at
          FROM ai_provider_connections
          WHERE tenant_id IS NULL OR tenant_id = $1::uuid
          ORDER BY
            CASE WHEN tenant_id IS NULL THEN 0 ELSE 1 END ASC,
            created_at ASC,
            id ASC
        `,
        [context.tenantId],
      );

      return result.rows.map(mapProviderConnection);
    }, this.pool);
  }

  async createProviderConnection(
    context: TenantContext,
    input: CreateProviderConnectionInput,
  ): Promise<ProviderConnectionView> {
    return withTenantTransaction(context, async (client) => {
      await this.ensureProviderExists(input.providerId, client);
      if (input.credentialId) {
        await this.ensurePlatformCredentialExists(input.credentialId, client);
      }

      try {
        const result = await client.query<ProviderConnectionRecord>(
          `
            INSERT INTO ai_provider_connections (
              tenant_id,
              provider_id,
              credential_id,
              name,
              adapter_kind,
              base_url,
              environment,
              status,
              metadata,
              created_by,
              updated_at
            )
            VALUES (
              $1::uuid,
              $2::uuid,
              $3::uuid,
              $4,
              $5,
              $6,
              $7,
              $8,
              $9::jsonb,
              $10::uuid,
              now()
            )
            RETURNING
              id::text AS id,
              tenant_id::text AS tenant_id,
              provider_id::text AS provider_id,
              credential_id::text AS credential_id,
              name,
              adapter_kind,
              base_url,
              environment,
              status,
              metadata,
              last_health_status,
              last_health_checked_at::text AS last_health_checked_at,
              created_by::text AS created_by,
              created_at::text AS created_at,
              updated_at::text AS updated_at
          `,
          [
            PLATFORM_TENANT_ID,
            input.providerId,
            input.credentialId ?? null,
            input.name.trim(),
            input.adapterKind.trim(),
            input.baseUrl?.trim() ?? null,
            input.environment?.trim() ?? "production",
            input.status?.trim() ?? "active",
            JSON.stringify(input.metadata ?? {}),
            context.userId,
          ],
        );

        const connection = mapProviderConnection(result.rows[0]);
        await safeRecordAuditLog(
          {
            action: "ai.provider_connection.create",
            actorType: context.userId ? "user" : "system",
            actorUserId: context.userId,
            ipHash: context.ipHash,
            metadata: {
              adapterKind: connection.adapterKind,
              connectionId: connection.id,
              credentialId: connection.credentialId,
              environment: connection.environment,
              providerId: connection.providerId,
              status: connection.status,
            },
            requestId: context.requestId,
            resourceId: connection.id,
            resourceType: "ai_provider_connection",
            tenantId: context.tenantId,
            traceId: context.traceId,
            userAgent: context.userAgent,
          },
          {
            pool: this.pool,
          },
        );
        return connection;
      } catch (error) {
        this.rethrowKnownDatabaseError(error, "Unable to create provider connection");
      }
    }, this.pool);
  }

  async updateProviderConnection(
    context: TenantContext,
    connectionId: string,
    input: UpdateProviderConnectionInput,
  ): Promise<ProviderConnectionView> {
    return withTenantTransaction(context, async (client) => {
      const existing = await this.getProviderConnectionRow(client, connectionId);
      this.assertAdminManageableProviderConnection(existing, context.tenantId);
      if (input.credentialId) {
        if (!existing.tenant_id) {
          await this.ensurePlatformCredentialExists(input.credentialId, client);
        } else {
          await this.ensureCredentialExists(input.credentialId, client, context.tenantId);
        }
      }

      const result = await client.query<ProviderConnectionRecord>(
        `
          UPDATE ai_provider_connections
          SET
            credential_id = $2::uuid,
            name = $3,
            adapter_kind = $4,
            base_url = $5,
            environment = $6,
            status = $7,
            metadata = $8::jsonb,
            updated_at = now()
          WHERE id = $1::uuid
          RETURNING
            id::text AS id,
            tenant_id::text AS tenant_id,
            provider_id::text AS provider_id,
            credential_id::text AS credential_id,
            name,
            adapter_kind,
            base_url,
            environment,
            status,
            metadata,
            last_health_status,
            last_health_checked_at::text AS last_health_checked_at,
            created_by::text AS created_by,
            created_at::text AS created_at,
            updated_at::text AS updated_at
        `,
        [
          connectionId,
          input.credentialId === undefined ? existing.credential_id : input.credentialId,
          input.name?.trim() ?? existing.name,
          input.adapterKind?.trim() ?? existing.adapter_kind,
          input.baseUrl === undefined ? existing.base_url : (input.baseUrl?.trim() ?? null),
          input.environment?.trim() ?? existing.environment,
          input.status?.trim() ?? existing.status,
          JSON.stringify(input.metadata ?? existing.metadata ?? {}),
        ],
      );

      return mapProviderConnection(result.rows[0]);
    }, this.pool);
  }

  async listModels(): Promise<ModelView[]> {
    const result = await this.pool.query<ModelRecord>(
      `
        SELECT
          id::text AS id,
          provider_id::text AS provider_id,
          model_key,
          display_name,
          modality,
          capabilities,
          context_window,
          status,
          created_at::text AS created_at,
          updated_at::text AS updated_at
        FROM ai_models
        ORDER BY created_at ASC, id ASC
      `,
    );

    return result.rows.map(mapModel);
  }

  async createModel(context: TenantContext, input: CreateModelInput): Promise<ModelView> {
    await this.ensureProviderExists(input.providerId);

    try {
      const result = await this.pool.query<ModelRecord>(
        `
          INSERT INTO ai_models (
            provider_id,
            model_key,
            display_name,
            modality,
            capabilities,
            context_window,
            status,
            updated_at
          )
          VALUES ($1::uuid, $2, $3, $4, $5::jsonb, $6::int, $7, now())
          RETURNING
            id::text AS id,
            provider_id::text AS provider_id,
            model_key,
            display_name,
            modality,
            capabilities,
            context_window,
            status,
            created_at::text AS created_at,
            updated_at::text AS updated_at
        `,
        [
          input.providerId,
          input.modelKey.trim(),
          input.displayName.trim(),
          input.modality.trim(),
          JSON.stringify(input.capabilities ?? {}),
          input.contextWindow ?? null,
          input.status?.trim() ?? "active",
        ],
      );

      const model = mapModel(result.rows[0]);
      await safeRecordAuditLog(
        {
          action: "ai.model.create",
          actorType: context.userId ? "user" : "system",
          actorUserId: context.userId,
          ipHash: context.ipHash,
          metadata: {
            modality: model.modality,
            modelKey: model.modelKey,
            providerId: model.providerId,
            status: model.status,
          },
          requestId: context.requestId,
          resourceId: model.id,
          resourceType: "ai_model",
          tenantId: context.tenantId,
          traceId: context.traceId,
          userAgent: context.userAgent,
        },
        {
          pool: this.pool,
        },
      );
      return model;
    } catch (error) {
      this.rethrowKnownDatabaseError(error, "Unable to create model");
    }
  }

  async listRoutes(context: TenantContext): Promise<RouteView[]> {
    return withTenantTransaction(context, async (client) => {
      const result = await client.query<RouteRecord>(
        `
          SELECT
            id::text AS id,
            tenant_id::text AS tenant_id,
            provider_id::text AS provider_id,
            model_id::text AS model_id,
            plugin_install_id::text AS plugin_install_id,
            credential_id::text AS credential_id,
            connection_id::text AS connection_id,
            route_key,
            route_label,
            modality,
            model_family,
            environment,
            priority,
            weight,
            fallback_group,
            base_url_override,
            upstream_model,
            api_mode,
            request_path,
            internal_label,
            admin_notes,
            is_default,
            health_status,
            last_health_checked_at::text AS last_health_checked_at,
            deleted_at::text AS deleted_at,
            request_config,
            pricing,
            rate_limit,
            status,
            created_at::text AS created_at,
            updated_at::text AS updated_at
          FROM ai_routes
          WHERE tenant_id = $1::uuid OR tenant_id IS NULL
          ORDER BY route_key ASC, created_at ASC
        `,
        [context.tenantId],
      );

      return result.rows.map(mapRoute);
    }, this.pool);
  }

  async listRuntimeRoutesForUi(
    context: TenantContext,
    query: ListRuntimeRoutesQuery,
  ): Promise<RuntimeRouteListItemView[]> {
    return withTenantTransaction(context, async (client) => {
      const result = await client.query<RuntimeRouteListRecord & {
        min_charge_credits: string | null;
        pricing_unit: string | null;
      }>(
        `
          SELECT DISTINCT ON (route.route_key)
            route.route_key,
            route.modality,
            provider.key AS provider_key,
            provider.name AS provider_name,
            model.model_key,
            model.display_name AS model_display_name,
            pricing.min_charge_credits::text AS min_charge_credits,
            pricing.unit AS pricing_unit
          FROM ai_routes AS route
          JOIN ai_providers AS provider
            ON provider.id = route.provider_id
          LEFT JOIN ai_models AS model
            ON model.id = route.model_id
          LEFT JOIN LATERAL (
            SELECT mp.min_charge_credits, mp.unit
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
          WHERE route.status = 'active'
            AND provider.status = 'active'
            AND (route.model_id IS NULL OR model.status = 'active')
            AND route.modality = COALESCE($1::text, route.modality)
            AND (route.tenant_id = $2::uuid OR route.tenant_id IS NULL)
          ORDER BY
            route.route_key ASC,
            CASE WHEN route.tenant_id = $2::uuid THEN 0 ELSE 1 END ASC,
            route.updated_at DESC
        `,
        [query.modality?.trim() || null, context.tenantId],
      );

      return result.rows.map((row) => ({
        estimatedCredits: row.min_charge_credits === null ? null : Number(row.min_charge_credits),
        minChargeCredits: row.min_charge_credits === null ? null : Number(row.min_charge_credits),
        modality: row.modality,
        modelDisplayName: row.model_display_name ?? null,
        modelKey: row.model_key ?? null,
        providerKey: row.provider_key,
        providerName: row.provider_name,
        pricingUnit: row.pricing_unit ?? null,
        routeKey: row.route_key,
      }));
    }, this.pool);
  }

  async listPricing(context: TenantContext, query: ListPricingQuery): Promise<PricingView[]> {
    return withTenantTransaction(context, async (client) => {
      const result = await client.query<PricingRecord>(
        `
          SELECT
            mp.provider,
            mp.model,
            mp.route,
            mp.unit,
            mp.unit_credits::text AS unit_credits,
            mp.min_charge_credits::text AS min_charge_credits,
            mp.metadata,
            mp.active,
            mp.created_at::text AS created_at
          FROM model_pricing mp
          WHERE ($1::text IS NULL OR mp.unit = $1::text)
            AND (
              mp.route = 'default'
              OR EXISTS (
                SELECT 1
                FROM ai_routes r
                JOIN ai_providers p ON p.id = r.provider_id
                LEFT JOIN ai_models m ON m.id = r.model_id
                WHERE r.tenant_id = $2::uuid
                  AND r.route_key = mp.route
                  AND p.key = mp.provider
                  AND (m.model_key = mp.model OR mp.model = 'default')
              )
            )
          ORDER BY mp.provider ASC, mp.model ASC, mp.route ASC, mp.unit ASC
        `,
        [query.unit?.trim() || null, context.tenantId],
      );

      return result.rows.map(mapPricing);
    }, this.pool);
  }

  async upsertPricing(context: TenantContext, input: UpsertPricingInput): Promise<PricingView> {
    return withTenantTransaction(context, async (client) => {
      const provider = input.provider.trim();
      const model = input.model.trim();
      const route = input.route.trim();
      const unit = input.unit.trim();

      const editableRoute = await client.query<{ route_key: string }>(
        `
          SELECT r.route_key
          FROM ai_routes r
          JOIN ai_providers p ON p.id = r.provider_id
          JOIN ai_models m ON m.id = r.model_id
          WHERE r.tenant_id = $1::uuid
            AND r.route_key = $2::text
            AND p.key = $3::text
            AND m.model_key = $4::text
          LIMIT 1
        `,
        [context.tenantId, route, provider, model],
      );

      if (!editableRoute.rows[0]?.route_key) {
        throw new AiGatewayApiError(403, "PRICING_SCOPE_FORBIDDEN", "Pricing update is not allowed for this route");
      }

      const result = await client.query<PricingRecord>(
        `
          INSERT INTO model_pricing (
            provider,
            model,
            route,
            unit,
            unit_credits,
            min_charge_credits,
            metadata,
            active
          )
          VALUES ($1, $2, $3, $4, $5::numeric, $6::numeric, $7::jsonb, $8::boolean)
          ON CONFLICT (provider, model, route, unit)
          DO UPDATE SET
            unit_credits = EXCLUDED.unit_credits,
            min_charge_credits = EXCLUDED.min_charge_credits,
            metadata = EXCLUDED.metadata,
            active = EXCLUDED.active
          RETURNING
            provider,
            model,
            route,
            unit,
            unit_credits::text AS unit_credits,
            min_charge_credits::text AS min_charge_credits,
            metadata,
            active,
            created_at::text AS created_at
        `,
        [
          provider,
          model,
          route,
          unit,
          input.unitCredits ?? input.minChargeCredits,
          input.minChargeCredits,
          JSON.stringify({
            source: "provider-settings-admin-ui",
            updatedByUserId: context.userId,
          }),
          input.active ?? true,
        ],
      );

      const row = result.rows[0];
      if (!row) {
        throw new AiGatewayApiError(500, "PRICING_UPSERT_FAILED", "Failed to upsert model pricing");
      }

      return mapPricing(row);
    }, this.pool);
  }

  async createRoute(context: TenantContext, input: CreateRouteInput): Promise<RouteView> {
    return withTenantTransaction(context, async (client) => {
      await this.ensureProviderExists(input.providerId, client);
      const model = input.modelId ? await this.getModelRow(client, input.modelId) : null;
      if (input.credentialId) {
        await this.ensurePlatformCredentialExists(input.credentialId, client);
      }
      let connection = null;
      if (input.connectionId) {
        connection = await this.getProviderConnectionRow(client, input.connectionId);
        if (connection.tenant_id) {
          throw new AiGatewayApiError(
            400,
            "PLATFORM_CONNECTION_REQUIRED",
            "Platform routes must use a platform-level provider connection",
          );
        }
        if (connection.provider_id !== input.providerId) {
          throw new AiGatewayApiError(
            400,
            "PROVIDER_CONNECTION_PROVIDER_MISMATCH",
            "Provider connection does not belong to the selected provider",
          );
        }
      }
      if (input.modelId && model?.provider_id !== input.providerId) {
        throw new AiGatewayApiError(
          400,
          "ROUTE_MODEL_PROVIDER_MISMATCH",
          "Selected model does not belong to the selected provider",
        );
      }

      const normalizedModelFamily = input.modelFamily?.trim() || model?.model_key || null;
      if (!normalizedModelFamily) {
        throw new AiGatewayApiError(
          400,
          "MODEL_FAMILY_REQUIRED",
          "Either modelId or modelFamily must be provided when creating a route",
        );
      }

      if (model?.modality && model.modality !== input.modality.trim()) {
        throw new AiGatewayApiError(
          400,
          "ROUTE_MODEL_MODALITY_MISMATCH",
          "Selected model modality does not match route modality",
        );
      }

      await this.ensureCatalogModelFamilyExists(client, {
        modality: input.modality.trim(),
        modelFamily: normalizedModelFamily,
        tenantId: PLATFORM_TENANT_ID,
      });

      const environment = connection?.environment ?? "production";
      const requestConfig = buildNormalizedRouteRequestConfig({
        apiMode: input.apiMode ?? null,
        connectionId: input.connectionId ?? null,
        requestConfig: input.requestConfig ?? {},
        requestPath: input.requestPath ?? null,
        upstreamModel: input.upstreamModel ?? null,
      });
      this.validateRouteConfig(requestConfig);

      try {
        const result = await client.query<RouteRecord>(
          `
            INSERT INTO ai_routes (
              tenant_id,
              provider_id,
              model_id,
              model_family,
              credential_id,
              connection_id,
              route_key,
              route_label,
              modality,
              environment,
              priority,
              weight,
              fallback_group,
              base_url_override,
              upstream_model,
              api_mode,
              request_path,
              internal_label,
              admin_notes,
              is_default,
              request_config,
              pricing,
              rate_limit,
              status,
              updated_at
            )
            VALUES (
              $1::uuid,
              $2::uuid,
              $3::uuid,
              $4,
              $5::uuid,
              $6::uuid,
              $7,
              $8,
              $9,
              $10::int,
              $11::int,
              $12,
              $13,
              $14,
              $15,
              $16,
              $17,
              $18,
              $19::boolean,
              $20::jsonb,
              $21::jsonb,
              $22::jsonb,
              $23,
              now()
            )
            RETURNING
              id::text AS id,
              tenant_id::text AS tenant_id,
              provider_id::text AS provider_id,
              model_id::text AS model_id,
              plugin_install_id::text AS plugin_install_id,
              credential_id::text AS credential_id,
              connection_id::text AS connection_id,
              route_key,
              route_label,
              modality,
              model_family,
              environment,
              priority,
              weight,
              fallback_group,
              base_url_override,
              upstream_model,
              api_mode,
              request_path,
              internal_label,
              admin_notes,
              is_default,
              health_status,
              last_health_checked_at::text AS last_health_checked_at,
              deleted_at::text AS deleted_at,
              request_config,
              pricing,
              rate_limit,
              status,
              created_at::text AS created_at,
              updated_at::text AS updated_at
          `,
          [
            PLATFORM_TENANT_ID,
            input.providerId,
            input.modelId ?? null,
            normalizedModelFamily,
            input.credentialId ?? null,
            input.connectionId ?? null,
            input.routeKey.trim(),
            input.routeLabel?.trim() ?? null,
            input.modality.trim(),
            environment,
            input.priority ?? 100,
            input.weight ?? 100,
            input.fallbackGroup?.trim() ?? null,
            input.baseUrlOverride?.trim() ?? null,
            input.upstreamModel?.trim() ?? null,
            input.apiMode?.trim() ?? null,
            input.requestPath?.trim() ?? null,
            input.internalLabel?.trim() ?? null,
            input.adminNotes?.trim() ?? null,
            input.isDefault ?? false,
            JSON.stringify(requestConfig),
            JSON.stringify(input.pricing ?? {}),
            JSON.stringify(input.rateLimit ?? {}),
            input.status?.trim() ?? "active",
          ],
        );

        const route = mapRoute(result.rows[0]);
        if (route.isDefault) {
          await this.applyDefaultRouteState(client, PLATFORM_TENANT_ID, route);
        }
        await safeRecordAuditLog(
          {
            action: "ai.route.create",
            actorType: context.userId ? "user" : "system",
            actorUserId: context.userId,
            ipHash: context.ipHash,
            metadata: {
              credentialId: route.credentialId,
              connectionId: route.connectionId,
              modality: route.modality,
              modelId: route.modelId,
              providerId: route.providerId,
              routeKey: route.routeKey,
              status: route.status,
            },
            requestId: context.requestId,
            resourceId: route.id,
            resourceType: "ai_route",
            tenantId: context.tenantId,
            traceId: context.traceId,
            userAgent: context.userAgent,
          },
          {
            pool: this.pool,
          },
        );
        return route;
      } catch (error) {
        this.rethrowKnownDatabaseError(error, "Unable to create route");
      }
    }, this.pool);
  }

  async updateRoute(
    context: TenantContext,
    routeId: string,
    input: UpdateRouteInput,
  ): Promise<RouteView> {
    return withTenantTransaction(context, async (client) => {
      const existing = await this.getRouteRow(client, routeId);
      this.assertAdminManageableRoute(existing, context.tenantId);
      const routeTenantId = existing.tenant_id ?? PLATFORM_TENANT_ID;
      const modelId = input.modelId !== undefined ? input.modelId : existing.model_id;
      const model = modelId ? await this.getModelRow(client, modelId) : null;
      if (input.credentialId) {
        if (!routeTenantId) {
          await this.ensurePlatformCredentialExists(input.credentialId, client);
        } else {
          await this.ensureCredentialExists(input.credentialId, client, routeTenantId);
        }
      }
      const nextConnectionId = input.connectionId !== undefined ? input.connectionId : existing.connection_id;
      let connection = null;
      if (nextConnectionId) {
        connection = await this.getProviderConnectionRow(client, nextConnectionId);
        if (!routeTenantId && connection.tenant_id) {
          throw new AiGatewayApiError(
            400,
            "PLATFORM_CONNECTION_REQUIRED",
            "Platform routes must use a platform-level provider connection",
          );
        }
        if (routeTenantId) {
          this.assertAdminManageableProviderConnection(connection, context.tenantId);
        }
      }
      const nextEnvironment = connection?.environment ?? existing.environment ?? "production";
      const nextModelFamily = model?.model_key ?? existing.model_family ?? null;
      const nextRequestConfig = buildNormalizedRouteRequestConfig({
        apiMode: input.apiMode === undefined ? existing.api_mode : input.apiMode,
        connectionId: nextConnectionId,
        requestConfig: input.requestConfig ?? existing.request_config ?? {},
        requestPath: input.requestPath === undefined ? existing.request_path : input.requestPath,
        upstreamModel: input.upstreamModel === undefined ? existing.upstream_model : input.upstreamModel,
      });
      this.validateRouteConfig(nextRequestConfig);

      const result = await client.query<RouteRecord>(
        `
          UPDATE ai_routes
          SET
            model_id = $2::uuid,
            model_family = $3,
            credential_id = $4::uuid,
            connection_id = $5::uuid,
            environment = $6,
            priority = $7::int,
            weight = $8::int,
            fallback_group = $9,
            base_url_override = $10,
            upstream_model = $11,
            api_mode = $12,
            request_path = $13,
            internal_label = $14,
            admin_notes = $15,
            is_default = $16::boolean,
            route_label = $17,
            request_config = $18::jsonb,
            pricing = $19::jsonb,
            rate_limit = $20::jsonb,
            status = $21,
            updated_at = now()
          WHERE id = $1::uuid
          RETURNING
            id::text AS id,
            tenant_id::text AS tenant_id,
            provider_id::text AS provider_id,
            model_id::text AS model_id,
            plugin_install_id::text AS plugin_install_id,
            credential_id::text AS credential_id,
            connection_id::text AS connection_id,
            route_key,
            route_label,
            modality,
            model_family,
            environment,
            priority,
            weight,
            fallback_group,
            base_url_override,
            upstream_model,
            api_mode,
            request_path,
            internal_label,
            admin_notes,
            is_default,
            health_status,
            last_health_checked_at::text AS last_health_checked_at,
            deleted_at::text AS deleted_at,
            request_config,
            pricing,
            rate_limit,
            status,
            created_at::text AS created_at,
            updated_at::text AS updated_at
        `,
        [
          routeId,
          modelId,
          nextModelFamily,
          input.credentialId !== undefined ? input.credentialId : existing.credential_id,
          nextConnectionId,
          nextEnvironment,
          input.priority ?? existing.priority,
          input.weight ?? existing.weight,
          input.fallbackGroup !== undefined ? input.fallbackGroup?.trim() ?? null : existing.fallback_group,
          input.baseUrlOverride !== undefined ? input.baseUrlOverride?.trim() ?? null : existing.base_url_override,
          input.upstreamModel !== undefined ? input.upstreamModel?.trim() ?? null : existing.upstream_model,
          input.apiMode !== undefined ? input.apiMode?.trim() ?? null : existing.api_mode,
          input.requestPath !== undefined ? input.requestPath?.trim() ?? null : existing.request_path,
          input.internalLabel !== undefined ? input.internalLabel?.trim() ?? null : existing.internal_label,
          input.adminNotes !== undefined ? input.adminNotes?.trim() ?? null : existing.admin_notes,
          input.isDefault ?? existing.is_default,
          input.routeLabel !== undefined ? input.routeLabel?.trim() ?? null : existing.route_label,
          JSON.stringify(nextRequestConfig),
          JSON.stringify(input.pricing ?? existing.pricing),
          JSON.stringify(input.rateLimit ?? existing.rate_limit),
          input.status?.trim() ?? existing.status,
        ],
      );

      const row = result.rows[0];
      if (!row) {
        throw new AiGatewayApiError(404, "ROUTE_NOT_FOUND", "Route not found");
      }

      const route = mapRoute(row);
      if (route.isDefault) {
        await this.applyDefaultRouteState(client, routeTenantId, route);
      } else if (existing.is_default && !route.isDefault) {
        await this.clearCatalogDefaultForRoute(client, routeTenantId, existing.route_key);
      }
      await safeRecordAuditLog(
        {
          action: "ai.route.update",
          actorType: context.userId ? "user" : "system",
          actorUserId: context.userId,
          ipHash: context.ipHash,
          metadata: {
            credentialId: route.credentialId,
            connectionId: route.connectionId,
            modality: route.modality,
            modelId: route.modelId,
            priority: route.priority,
            routeKey: route.routeKey,
            status: route.status,
            weight: route.weight,
          },
          requestId: context.requestId,
          resourceId: route.id,
          resourceType: "ai_route",
          tenantId: context.tenantId,
          traceId: context.traceId,
          userAgent: context.userAgent,
        },
        {
          pool: this.pool,
        },
      );
      return route;
    }, this.pool);
  }

  async duplicateRoute(
    context: TenantContext,
    routeId: string,
    input: DuplicateRouteInput = {},
  ): Promise<RouteView> {
    return withTenantTransaction(context, async (client) => {
      const existing = await this.getRouteRow(client, routeId);
      this.assertAdminManageableRoute(existing, context.tenantId);

      const duplicateInput: CreateRouteInput = {
        adminNotes: existing.admin_notes,
        apiMode: existing.api_mode,
        baseUrlOverride: existing.base_url_override,
        connectionId: existing.connection_id,
        credentialId: existing.credential_id,
        fallbackGroup: existing.fallback_group,
        internalLabel:
          input.internalLabel !== undefined
            ? input.internalLabel?.trim() ?? null
            : existing.internal_label
              ? `${existing.internal_label} Copy`
              : null,
        isDefault: input.isDefault ?? false,
        modality: existing.modality as CreateRouteInput["modality"],
        modelId: existing.model_id,
        pricing: existing.pricing ?? {},
        priority: existing.priority,
        providerId: existing.provider_id,
        rateLimit: existing.rate_limit ?? {},
        requestConfig: existing.request_config ?? {},
        requestPath: existing.request_path,
        routeKey: input.routeKey?.trim() ?? buildDuplicatedRouteKey(existing.route_key),
        routeLabel:
          input.routeLabel !== undefined
            ? input.routeLabel?.trim() ?? null
            : existing.route_label
              ? `${existing.route_label} Copy`
              : null,
        status: existing.status as CreateRouteInput["status"],
        upstreamModel: existing.upstream_model,
        weight: existing.weight,
      };

      return this.createRoute(context, duplicateInput);
    }, this.pool);
  }

  async setDefaultRoute(context: TenantContext, routeId: string): Promise<RouteView> {
    return withTenantTransaction(context, async (client) => {
      const route = await this.getRouteRow(client, routeId);
      this.assertAdminManageableRoute(route, context.tenantId);
      const routeTenantId = route.tenant_id ?? PLATFORM_TENANT_ID;
      if (route.deleted_at) {
        throw new AiGatewayApiError(409, "ROUTE_DELETED", "Route has been deleted");
      }
      if (route.status !== "active") {
        throw new AiGatewayApiError(409, "ROUTE_NOT_ACTIVE", "Only active routes can be set as default");
      }

      const updated = await client.query<RouteRecord>(
        `
          UPDATE ai_routes
          SET
            is_default = true,
            updated_at = now()
          WHERE id = $1::uuid
          RETURNING
            id::text AS id,
            tenant_id::text AS tenant_id,
            provider_id::text AS provider_id,
            model_id::text AS model_id,
            plugin_install_id::text AS plugin_install_id,
            credential_id::text AS credential_id,
            connection_id::text AS connection_id,
            route_key,
            route_label,
            modality,
            model_family,
            environment,
            priority,
            weight,
            fallback_group,
            base_url_override,
            upstream_model,
            api_mode,
            request_path,
            internal_label,
            admin_notes,
            is_default,
            health_status,
            last_health_checked_at::text AS last_health_checked_at,
            deleted_at::text AS deleted_at,
            request_config,
            pricing,
            rate_limit,
            status,
            created_at::text AS created_at,
            updated_at::text AS updated_at
        `,
        [routeId],
      );

      const nextRoute = mapRoute(updated.rows[0]);
      await this.applyDefaultRouteState(client, routeTenantId, nextRoute);
      return nextRoute;
    }, this.pool);
  }

  async deleteRoute(context: TenantContext, routeId: string): Promise<{ ok: true }> {
    return withTenantTransaction(context, async (client) => {
      const existing = await this.getRouteRow(client, routeId);
      this.assertAdminManageableRoute(existing, context.tenantId);
      const routeTenantId = existing.tenant_id ?? PLATFORM_TENANT_ID;

      if (existing.is_default) {
        throw new AiGatewayApiError(
          409,
          "DEFAULT_ROUTE_DELETE_FORBIDDEN",
          "Default route must be reassigned before deletion",
        );
      }

      await client.query(
        `
          UPDATE ai_routes
          SET
            status = 'inactive',
            deleted_at = now(),
            updated_at = now()
          WHERE id = $1::uuid
        `,
        [routeId],
      );

      await this.clearCatalogDefaultForRoute(client, routeTenantId, existing.route_key);
      await safeRecordAuditLog(
        {
          action: "ai.route.delete",
          actorType: context.userId ? "user" : "system",
          actorUserId: context.userId,
          ipHash: context.ipHash,
          metadata: {
            routeId,
            routeKey: existing.route_key,
          },
          requestId: context.requestId,
          resourceId: routeId,
          resourceType: "ai_route",
          tenantId: context.tenantId,
          traceId: context.traceId,
          userAgent: context.userAgent,
        },
        {
          pool: this.pool,
        },
      );

      return { ok: true as const };
    }, this.pool);
  }

  async listCredentials(context: TenantContext): Promise<CredentialResponseView[]> {
    return withTenantTransaction(context, async (client) => {
      const result = await client.query<CredentialRecord>(
        `
          SELECT
            id::text AS id,
            tenant_id::text AS tenant_id,
            provider_id::text AS provider_id,
            name,
            encrypted_secret,
            nonce,
            auth_tag,
            key_version,
            secret_fingerprint,
            status,
            last_used_at::text AS last_used_at,
            rotated_at::text AS rotated_at,
            created_by::text AS created_by,
            created_at::text AS created_at,
            updated_at::text AS updated_at
          FROM api_credentials
          WHERE status <> 'deleted'
            AND (tenant_id IS NULL OR tenant_id = $1::uuid)
          ORDER BY
            CASE WHEN tenant_id IS NULL THEN 0 ELSE 1 END ASC,
            created_at ASC,
            id ASC
        `,
        [context.tenantId],
      );

      return result.rows.map((row) => this.mapCredential(row));
    }, this.pool);
  }

  async createCredential(
    context: TenantContext,
    input: CreateCredentialInput,
  ): Promise<CredentialResponseView> {
    return withTenantTransaction(context, async (client) => {
      await this.ensureProviderExists(input.providerId, client);
      const encrypted = this.credentialVault.createCredential(input.secret);

      try {
        const result = await client.query<CredentialRecord>(
          `
            INSERT INTO api_credentials (
              tenant_id,
              provider_id,
              name,
              encrypted_secret,
              nonce,
              auth_tag,
              key_version,
              secret_fingerprint,
              status,
              created_by,
              updated_at
            )
            VALUES (
              $1::uuid,
              $2::uuid,
              $3,
              $4::bytea,
              $5::bytea,
              $6::bytea,
              $7,
              $8,
              $9,
              $10::uuid,
              now()
            )
            RETURNING
              id::text AS id,
              tenant_id::text AS tenant_id,
              provider_id::text AS provider_id,
              name,
              encrypted_secret,
              nonce,
              auth_tag,
              key_version,
              secret_fingerprint,
              status,
              last_used_at::text AS last_used_at,
              rotated_at::text AS rotated_at,
              created_by::text AS created_by,
              created_at::text AS created_at,
              updated_at::text AS updated_at
          `,
          [
            PLATFORM_TENANT_ID,
            input.providerId,
            input.name.trim(),
            encrypted.encryptedSecret,
            encrypted.nonce,
            encrypted.authTag,
            encrypted.keyVersion,
            encrypted.secretFingerprint,
            input.status?.trim() ?? "active",
            context.userId,
          ],
        );

        const credential = this.mapCredential(result.rows[0]);
        await safeRecordAuditLog(
          {
            action: "credential.create",
            actorType: context.userId ? "user" : "system",
            actorUserId: context.userId,
            ipHash: context.ipHash,
            metadata: {
              credentialId: credential.id,
              maskedSecret: credential.maskedSecret,
              providerId: credential.providerId,
              status: credential.status,
            },
            requestId: context.requestId,
            resourceId: credential.id,
            resourceType: "credential",
            tenantId: context.tenantId,
            traceId: context.traceId,
            userAgent: context.userAgent,
          },
          {
            pool: this.pool,
          },
        );
        return credential;
      } catch (error) {
        this.rethrowKnownDatabaseError(error, "Unable to create credential");
      }
    }, this.pool);
  }

  async updateCredential(
    context: TenantContext,
    credentialId: string,
    input: UpdateCredentialInput,
  ): Promise<CredentialResponseView> {
    return withTenantTransaction(context, async (client) => {
      const existing = await this.getCredentialRow(client, credentialId);
      this.assertAdminManageableCredential(existing, context.tenantId);
      const result = await client.query<CredentialRecord>(
        `
          UPDATE api_credentials
          SET
            name = $2,
            status = $3,
            updated_at = now()
          WHERE id = $1::uuid
          RETURNING
            id::text AS id,
            tenant_id::text AS tenant_id,
            provider_id::text AS provider_id,
            name,
            encrypted_secret,
            nonce,
            auth_tag,
            key_version,
            secret_fingerprint,
            status,
            last_used_at::text AS last_used_at,
            rotated_at::text AS rotated_at,
            created_by::text AS created_by,
            created_at::text AS created_at,
            updated_at::text AS updated_at
        `,
        [
          credentialId,
          input.name?.trim() ?? existing.name,
          input.status?.trim() ?? existing.status,
        ],
      );

      return this.mapCredential(result.rows[0]);
    }, this.pool);
  }

  async rotateCredential(
    context: TenantContext,
    credentialId: string,
    secret: string,
  ): Promise<CredentialResponseView> {
    return withTenantTransaction(context, async (client) => {
      const existing = await this.getCredentialRow(client, credentialId);
      this.assertAdminManageableCredential(existing, context.tenantId);
      const encrypted = this.credentialVault.rotateCredential(secret);
      const result = await client.query<CredentialRecord>(
        `
          UPDATE api_credentials
          SET
            encrypted_secret = $2::bytea,
            nonce = $3::bytea,
            auth_tag = $4::bytea,
            key_version = $5,
            secret_fingerprint = $6,
            rotated_at = now(),
            status = 'active',
            updated_at = now()
          WHERE id = $1::uuid
          RETURNING
            id::text AS id,
            tenant_id::text AS tenant_id,
            provider_id::text AS provider_id,
            name,
            encrypted_secret,
            nonce,
            auth_tag,
            key_version,
            secret_fingerprint,
            status,
            last_used_at::text AS last_used_at,
            rotated_at::text AS rotated_at,
            created_by::text AS created_by,
            created_at::text AS created_at,
            updated_at::text AS updated_at
        `,
        [
          credentialId,
          encrypted.encryptedSecret,
          encrypted.nonce,
          encrypted.authTag,
          encrypted.keyVersion,
          encrypted.secretFingerprint,
        ],
      );

      const credential = this.mapCredential(result.rows[0]);
      await safeRecordAuditLog(
        {
          action: "credential.rotate",
          actorType: context.userId ? "user" : "system",
          actorUserId: context.userId,
          ipHash: context.ipHash,
          metadata: {
            credentialId: credential.id,
            maskedSecret: credential.maskedSecret,
            providerId: credential.providerId,
            rotatedAt: credential.rotatedAt,
            status: credential.status,
          },
          requestId: context.requestId,
          resourceId: credential.id,
          resourceType: "credential",
          tenantId: context.tenantId,
          traceId: context.traceId,
          userAgent: context.userAgent,
        },
        {
          pool: this.pool,
        },
      );
      return credential;
    }, this.pool);
  }

  async deleteCredential(context: TenantContext, credentialId: string): Promise<{ ok: true }> {
    return withTenantTransaction(context, async (client) => {
      const existing = await this.getCredentialRow(client, credentialId);
      this.assertAdminManageableCredential(existing, context.tenantId);
      const result = await client.query<{ id: string }>(
        `
          UPDATE api_credentials
          SET status = 'deleted', updated_at = now()
          WHERE id = $1::uuid
            AND status <> 'deleted'
          RETURNING id::text AS id
        `,
        [credentialId],
      );

      if (!result.rows[0]?.id) {
        throw new AiGatewayApiError(404, "CREDENTIAL_NOT_FOUND", "Credential not found");
      }

      await safeRecordAuditLog(
        {
          action: "credential.delete",
          actorType: context.userId ? "user" : "system",
          actorUserId: context.userId,
          ipHash: context.ipHash,
          metadata: {
            credentialId,
          },
          requestId: context.requestId,
          resourceId: credentialId,
          resourceType: "credential",
          tenantId: context.tenantId,
          traceId: context.traceId,
          userAgent: context.userAgent,
        },
        {
          pool: this.pool,
        },
      );
      return { ok: true as const };
    }, this.pool);
  }

  async deleteProviderConnection(
    context: TenantContext,
    connectionId: string,
  ): Promise<{ ok: true }> {
    return withTenantTransaction(context, async (client) => {
      const existing = await this.getProviderConnectionRow(client, connectionId);
      this.assertAdminManageableProviderConnection(existing, context.tenantId);

      const inUse = await client.query<{ id: string }>(
        `
          SELECT id::text AS id
          FROM ai_routes
          WHERE (tenant_id IS NULL OR tenant_id = $1::uuid)
            AND (
              connection_id = $2::uuid
              OR request_config->>'connectionId' = $2::text
            )
            AND deleted_at IS NULL
          LIMIT 1
        `,
        [context.tenantId, connectionId],
      );

      if (inUse.rows[0]?.id) {
        throw new AiGatewayApiError(
          409,
          "PROVIDER_CONNECTION_IN_USE",
          "Provider connection is still referenced by at least one route",
        );
      }

      await client.query(
        `
          DELETE FROM ai_provider_connections
          WHERE id = $1::uuid
        `,
        [connectionId],
      );

      await safeRecordAuditLog(
        {
          action: "ai.provider_connection.delete",
          actorType: context.userId ? "user" : "system",
          actorUserId: context.userId,
          ipHash: context.ipHash,
          metadata: {
            connectionId,
          },
          requestId: context.requestId,
          resourceId: connectionId,
          resourceType: "ai_provider_connection",
          tenantId: context.tenantId,
          traceId: context.traceId,
          userAgent: context.userAgent,
        },
        {
          pool: this.pool,
        },
      );
      return { ok: true as const };
    }, this.pool);
  }

  async generateText(
    context: TenantContext,
    request: TextGenerationRequest,
  ): Promise<GenerateTextResultView> {
    return this.mapGenerateTextResult(await this.textRuntime.generateText(context, request));
  }

  private async ensureProviderExists(providerId: string, client?: PoolClient): Promise<void> {
    const executor = client ?? this.pool;
    const result = await executor.query<{ id: string }>(
      `
        SELECT id::text AS id
        FROM ai_providers
        WHERE id = $1::uuid
        LIMIT 1
      `,
      [providerId],
    );

    if (!result.rows[0]?.id) {
      throw new AiGatewayApiError(404, "PROVIDER_NOT_FOUND", "Provider not found");
    }
  }

  private async ensureModelExists(modelId: string, client: PoolClient): Promise<void> {
    const result = await client.query<{ id: string }>(
      `
        SELECT id::text AS id
        FROM ai_models
        WHERE id = $1::uuid
        LIMIT 1
      `,
      [modelId],
    );

    if (!result.rows[0]?.id) {
      throw new AiGatewayApiError(404, "MODEL_NOT_FOUND", "Model not found");
    }
  }

  private async getModelRow(client: PoolClient, modelId: string): Promise<ModelIdentityRecord> {
    const result = await client.query<ModelIdentityRecord>(
      `
        SELECT
          id::text AS id,
          provider_id::text AS provider_id,
          modality,
          model_key
        FROM ai_models
        WHERE id = $1::uuid
        LIMIT 1
      `,
      [modelId],
    );

    const row = result.rows[0];
    if (!row) {
      throw new AiGatewayApiError(404, "MODEL_NOT_FOUND", "Model not found");
    }

    return row;
  }

  private async ensureCatalogModelFamilyExists(
    client: PoolClient,
    input: {
      modality: string;
      modelFamily: string;
      tenantId: string | null;
    },
  ): Promise<void> {
    const result = await client.query<{ id: string }>(
      `
        SELECT id::text AS id
        FROM ai_model_catalog
        WHERE (
            ($1::uuid IS NULL AND tenant_id IS NULL)
            OR tenant_id = $1::uuid
            OR tenant_id IS NULL
          )
          AND modality = $2::text
          AND model_family = $3::text
          AND status = 'active'
        ORDER BY CASE WHEN tenant_id = $1::uuid THEN 0 ELSE 1 END ASC
        LIMIT 1
      `,
      [input.tenantId, input.modality, input.modelFamily],
    );

    if (!result.rows[0]?.id) {
      throw new AiGatewayApiError(
        404,
        "MODEL_FAMILY_NOT_FOUND",
        "No active product model exists for the provided model family",
      );
    }
  }

  private async ensureCredentialExists(
    credentialId: string,
    client: PoolClient,
    tenantId?: string | null,
  ): Promise<void> {
    const result = await client.query<{ id: string }>(
      `
        SELECT id::text AS id
        FROM api_credentials
        WHERE id = $1::uuid
          AND status <> 'deleted'
          AND ($2::uuid IS NULL OR tenant_id = $2::uuid)
        LIMIT 1
      `,
      [credentialId, tenantId ?? null],
    );

    if (!result.rows[0]?.id) {
      throw new AiGatewayApiError(404, "CREDENTIAL_NOT_FOUND", "Credential not found");
    }
  }

  private async ensurePlatformCredentialExists(
    credentialId: string,
    client: PoolClient,
  ): Promise<void> {
    const result = await client.query<{ id: string }>(
      `
        SELECT id::text AS id
        FROM api_credentials
        WHERE id = $1::uuid
          AND tenant_id IS NULL
          AND status <> 'deleted'
        LIMIT 1
      `,
      [credentialId],
    );

    if (!result.rows[0]?.id) {
      throw new AiGatewayApiError(
        404,
        "PLATFORM_CREDENTIAL_NOT_FOUND",
        "Platform routes must use a platform-level credential",
      );
    }
  }

  private async getRouteRow(client: PoolClient, routeId: string): Promise<RouteRecord> {
    const result = await client.query<RouteRecord>(
      `
        SELECT
          id::text AS id,
          tenant_id::text AS tenant_id,
          provider_id::text AS provider_id,
          model_id::text AS model_id,
          plugin_install_id::text AS plugin_install_id,
          model_family,
          credential_id::text AS credential_id,
          connection_id::text AS connection_id,
          route_key,
          route_label,
          modality,
          environment,
          priority,
          weight,
          fallback_group,
          base_url_override,
          upstream_model,
          api_mode,
          request_path,
          internal_label,
          admin_notes,
          is_default,
          health_status,
          last_health_checked_at::text AS last_health_checked_at,
          deleted_at::text AS deleted_at,
          request_config,
          pricing,
          rate_limit,
          status,
          created_at::text AS created_at,
          updated_at::text AS updated_at
        FROM ai_routes
        WHERE id = $1::uuid
        LIMIT 1
      `,
      [routeId],
    );

    const row = result.rows[0];
    if (!row) {
      throw new AiGatewayApiError(404, "ROUTE_NOT_FOUND", "Route not found");
    }

    return row;
  }

  private async applyDefaultRouteState(
    client: PoolClient,
    tenantId: string | null,
    route: RouteView,
  ): Promise<void> {
    if (!route.modelFamily) {
      return;
    }

    await client.query(
      `
        UPDATE ai_routes
        SET
          is_default = CASE WHEN id = $4::uuid THEN true ELSE false END,
          updated_at = CASE WHEN id = $4::uuid THEN updated_at ELSE now() END
        WHERE (
            ($1::uuid IS NULL AND tenant_id IS NULL)
            OR tenant_id = $1::uuid
          )
          AND modality = $2::text
          AND model_family = $3::text
          AND environment = $5::text
          AND deleted_at IS NULL
      `,
      [tenantId, route.modality, route.modelFamily, route.id, route.environment],
    );

    await client.query(
      `
        UPDATE ai_model_catalog
        SET
          default_route_key = $3::text,
          updated_at = now()
        WHERE (
            ($1::uuid IS NULL AND tenant_id IS NULL)
            OR tenant_id = $1::uuid
          )
          AND modality = $2::text
          AND model_family = $4::text
      `,
      [tenantId, route.modality, route.routeKey, route.modelFamily],
    );
  }

  private async clearCatalogDefaultForRoute(
    client: PoolClient,
    tenantId: string | null,
    routeKey: string,
  ): Promise<void> {
    await client.query(
      `
        UPDATE ai_model_catalog
        SET
          default_route_key = NULL,
          updated_at = now()
        WHERE (
            ($1::uuid IS NULL AND tenant_id IS NULL)
            OR tenant_id = $1::uuid
          )
          AND default_route_key = $2::text
      `,
      [tenantId, routeKey],
    );
  }

  private async getCredentialRow(
    client: PoolClient,
    credentialId: string,
  ): Promise<CredentialRecord> {
    const result = await client.query<CredentialRecord>(
      `
        SELECT
          id::text AS id,
          tenant_id::text AS tenant_id,
          provider_id::text AS provider_id,
          name,
          encrypted_secret,
          nonce,
          auth_tag,
          key_version,
          secret_fingerprint,
          status,
          last_used_at::text AS last_used_at,
          rotated_at::text AS rotated_at,
          created_by::text AS created_by,
          created_at::text AS created_at,
          updated_at::text AS updated_at
        FROM api_credentials
        WHERE id = $1::uuid
          AND status <> 'deleted'
        LIMIT 1
      `,
      [credentialId],
    );

    const row = result.rows[0];
    if (!row) {
      throw new AiGatewayApiError(404, "CREDENTIAL_NOT_FOUND", "Credential not found");
    }

    return row;
  }

  private async getProviderConnectionRow(
    client: PoolClient,
    connectionId: string,
  ): Promise<ProviderConnectionRecord> {
    const result = await client.query<ProviderConnectionRecord>(
      `
        SELECT
          id::text AS id,
          tenant_id::text AS tenant_id,
          provider_id::text AS provider_id,
          credential_id::text AS credential_id,
          name,
          adapter_kind,
          base_url,
          environment,
          status,
          metadata,
          last_health_status,
          last_health_checked_at::text AS last_health_checked_at,
          created_by::text AS created_by,
          created_at::text AS created_at,
          updated_at::text AS updated_at
        FROM ai_provider_connections
        WHERE id = $1::uuid
        LIMIT 1
      `,
      [connectionId],
    );

    const row = result.rows[0];
    if (!row) {
      throw new AiGatewayApiError(404, "PROVIDER_CONNECTION_NOT_FOUND", "Provider connection not found");
    }

    return row;
  }

  private mapCredential(row: CredentialRecord): CredentialResponseView {
    const secret = this.credentialVault.getSecretForProviderCall({
      authTag: row.auth_tag,
      encryptedSecret: row.encrypted_secret,
      nonce: row.nonce,
    });

    return this.credentialVault.maskCredentialForResponse({
      createdAt: row.created_at,
      id: row.id,
      lastUsedAt: row.last_used_at,
      name: row.name,
      providerId: row.provider_id,
      rotatedAt: row.rotated_at,
      secret,
      status: row.status,
    });
  }

  private mapGenerateTextResult(result: AiGatewayTextResult): GenerateTextResultView {
    return {
      modelKey: result.modelKey,
      outputText: result.outputText,
      providerKey: result.providerKey,
      status: result.status,
      usage: result.usage,
    };
  }

  private assertTenantOwnedRoute(route: RouteRecord, tenantId: string): void {
    if (!route.tenant_id || route.tenant_id !== tenantId) {
      throw new AiGatewayApiError(404, "ROUTE_NOT_FOUND", "Route not found");
    }
  }

  private assertAdminManageableRoute(route: RouteRecord, tenantId: string): void {
    if (route.tenant_id && route.tenant_id !== tenantId) {
      throw new AiGatewayApiError(404, "ROUTE_NOT_FOUND", "Route not found");
    }
  }

  private assertTenantOwnedCredential(row: CredentialRecord, tenantId: string): void {
    if (!row.tenant_id || row.tenant_id !== tenantId) {
      throw new AiGatewayApiError(404, "CREDENTIAL_NOT_FOUND", "Credential not found");
    }
  }

  private assertAdminManageableCredential(row: CredentialRecord, tenantId: string): void {
    if (row.tenant_id && row.tenant_id !== tenantId) {
      throw new AiGatewayApiError(404, "CREDENTIAL_NOT_FOUND", "Credential not found");
    }
  }

  private assertTenantOwnedProviderConnection(
    row: ProviderConnectionRecord,
    tenantId: string,
  ): void {
    if (!row.tenant_id || row.tenant_id !== tenantId) {
      throw new AiGatewayApiError(404, "PROVIDER_CONNECTION_NOT_FOUND", "Provider connection not found");
    }
  }

  private assertAdminManageableProviderConnection(
    row: ProviderConnectionRecord,
    tenantId: string,
  ): void {
    if (row.tenant_id && row.tenant_id !== tenantId) {
      throw new AiGatewayApiError(404, "PROVIDER_CONNECTION_NOT_FOUND", "Provider connection not found");
    }
  }

  private validateRouteConfig(config: Record<string, unknown>): void {
    const timeoutCandidate = config.timeoutMs;
    if (timeoutCandidate === undefined || timeoutCandidate === null) {
      return;
    }

    const timeoutMs =
      typeof timeoutCandidate === "number"
        ? timeoutCandidate
        : typeof timeoutCandidate === "string"
          ? Number(timeoutCandidate)
          : Number.NaN;

    if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 300000) {
      throw new AiGatewayApiError(
        400,
        "VALIDATION_ERROR",
        "requestConfig.timeoutMs must be an integer between 1000 and 300000",
      );
    }
  }

  private async listRuntimeRoutes(
    context: TenantContext,
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
            CASE WHEN r.tenant_id IS NULL THEN 0 ELSE 1 END ASC,
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
            defaultBaseUrl: row.default_base_url,
            id: row.provider_id,
            key: row.provider_key,
            kind: row.provider_kind,
            name: row.provider_name,
          },
          requestConfig: row.request_config ?? {},
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
              $10::jsonb,
              $11::int,
              $12::int,
              $13::int
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

    if (error instanceof AiGatewayApiError) {
      return new AiGatewayError({
        code: "PROVIDER_INTERNAL_ERROR",
        details: error.code,
        message: error.message,
        statusCode: error.statusCode,
      });
    }

    return new AiGatewayError({
      code: "PROVIDER_INTERNAL_ERROR",
      details: error instanceof Error ? error.message : String(error),
      message: "The provider call failed unexpectedly",
      statusCode: 502,
    });
  }

  private rethrowKnownDatabaseError(error: unknown, fallbackMessage: string): never {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      throw new AiGatewayApiError(409, "CONFLICT", "已存在相同的唯一记录，请更换后重试");
    }

    if (error instanceof AiGatewayApiError) {
      throw error;
    }

    if (error instanceof AiGatewayError) {
      throw error;
    }

    throw new Error(fallbackMessage);
  }
}
