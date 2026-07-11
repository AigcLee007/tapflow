import { randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";
import {
  builtinAiPluginRegistry,
  CredentialVault,
  type AiPluginManifest,
  type AiPluginRegistry,
} from "@aigc-flow/ai-gateway-core";
import { createPgPool, withTenantTransaction } from "@aigc-flow/db";

import type { SaveModelConfigurationDraftInput } from "./ai-model-configurations.schemas.js";

export type TenantContext = {
  tenantId: string;
  userId: string | null;
  requestId?: string | null;
  traceId?: string | null;
  ipHash?: string | null;
  userAgent?: string | null;
};

export type ModelConfigurationDraftView = {
  route: {
    id: string;
    key: string;
    status: string;
    configurationRevision: number;
    testedRevision: number | null;
  };
  model: { id: string; modelKey: string; displayName: string; modality: string; modelFamily: string };
  catalog: { id: string; status: string };
  connection: { id: string; name: string; baseUrl: string | null; environment: string; status: string };
  credential: { id: string; name: string; providerId: string; status: string; secretFingerprint: string };
  pricing: { unit: string; unitCredits: number; minChargeCredits: number; active: boolean };
};

export class AiModelConfigurationApiError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "AiModelConfigurationApiError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

type ResolvedDefinition = {
  provider: { key: string; name: string; kind: string; defaultBaseUrl?: string; capabilities?: Record<string, unknown> };
  model: { modelKey: string; displayName: string; modality: "text" | "image" | "video"; modelFamily: string; capabilities?: Record<string, unknown>; uiSchema?: Record<string, unknown>; sortOrder?: number; defaultRouteKey?: string };
  routeDefaults: { apiMode?: string; mode?: string; requestConfig?: Record<string, unknown>; requestPath?: string; timeoutMs?: number };
  manifest: AiPluginManifest | null;
};

type RefRow = { id: string; provider_id: string; tenant_id: string | null; name: string; status: string; base_url?: string | null; environment?: string; secret_fingerprint?: string };

export class AiModelConfigurationsService {
  readonly pool: Pool;
  readonly credentialVault: CredentialVault;
  readonly pluginRegistry: AiPluginRegistry;

  constructor(options: { pool?: Pool; credentialVault: CredentialVault; pluginRegistry?: AiPluginRegistry }) {
    this.pool = options.pool ?? createPgPool();
    this.credentialVault = options.credentialVault;
    this.pluginRegistry = options.pluginRegistry ?? builtinAiPluginRegistry;
  }

  async saveDraft(context: TenantContext, input: SaveModelConfigurationDraftInput): Promise<ModelConfigurationDraftView> {
    if (!input.pricing || input.pricing.unitCredits <= 0 || input.pricing.minChargeCredits <= 0) {
      throw new AiModelConfigurationApiError(400, "CONFIGURATION_PRICING_REQUIRED", "Positive pricing is required");
    }
    const definition = this.resolveDefinition(input);
    return withTenantTransaction(context, async (client) => {
      const providerId = await this.upsertProvider(client, definition);
      const modelId = await this.upsertModel(client, providerId, definition);
      const installId = definition.manifest
        ? await this.upsertPluginRecords(client, context, providerId, definition.manifest)
        : null;
      const catalogId = await this.upsertCatalog(client, modelId, installId, definition);
      const connection = await this.resolveConnection(client, context, providerId, definition, input);
      const credential = await this.resolveCredential(client, context, providerId, input);
      if (input.connection.mode === "create") {
        await client.query(
          `UPDATE ai_provider_connections SET credential_id=$2, updated_at=now() WHERE id=$1`,
          [connection.id, credential.id],
        );
      }
      if (installId) {
        await client.query(
          `UPDATE tenant_ai_plugin_installs SET credential_id=$2, updated_at=now() WHERE id=$1`,
          [installId, credential.id],
        );
      }
      const route = await this.saveRoute(client, providerId, modelId, installId, connection.id, credential.id, definition, input);
      await client.query(
        `INSERT INTO model_pricing (provider, model, route, unit, unit_credits, min_charge_credits, metadata, active)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,false)
         ON CONFLICT (provider,model,route,unit) DO UPDATE SET unit_credits=EXCLUDED.unit_credits,
           min_charge_credits=EXCLUDED.min_charge_credits, metadata=EXCLUDED.metadata, active=false`,
        [definition.provider.key, input.route.upstreamModel, route.route_key, input.pricing.unit,
          input.pricing.unitCredits, input.pricing.minChargeCredits, JSON.stringify({ configurationDraft: true })],
      );
      return {
        route: {
          id: route.id, key: route.route_key, status: route.status,
          configurationRevision: route.configuration_revision, testedRevision: route.tested_revision,
        },
        model: { id: modelId, modelKey: definition.model.modelKey, displayName: definition.model.displayName,
          modality: definition.model.modality, modelFamily: definition.model.modelFamily },
        catalog: { id: catalogId, status: "inactive" },
        connection: { id: connection.id, name: connection.name, baseUrl: connection.base_url ?? null,
          environment: connection.environment ?? "production", status: connection.status },
        credential: { id: credential.id, name: credential.name, providerId: credential.provider_id,
          status: credential.status, secretFingerprint: credential.secret_fingerprint ?? "" },
        pricing: { ...input.pricing, active: false },
      };
    }, this.pool);
  }

  private resolveDefinition(input: SaveModelConfigurationDraftInput): ResolvedDefinition {
    if ("packageKey" in input) {
      const manifest = this.pluginRegistry.require(input.packageKey);
      const model = manifest.models.find((candidate) => candidate.modelKey === input.route.upstreamModel);
      const route = model
        ? manifest.routes.find((candidate) => candidate.modelKey === model.modelKey)
        : undefined;
      if (!model || !route) {
        throw new AiModelConfigurationApiError(
          400,
          "CONFIGURATION_UPSTREAM_MODEL_UNSUPPORTED",
          "The selected upstream model is not supported by this plugin package",
        );
      }
      return { provider: manifest.provider, model, manifest, routeDefaults: {
        apiMode: this.stringValue(route.requestConfig, "apiMode") ?? route.mode,
        mode: route.mode, requestConfig: route.requestConfig, requestPath: route.path,
        timeoutMs: route.timeoutMs,
      } };
    }
    return { provider: input.custom.provider, model: { ...input.custom.model }, manifest: null, routeDefaults: input.custom.routeDefaults };
  }

  private async upsertProvider(client: PoolClient, definition: ResolvedDefinition): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO ai_providers (key,name,kind,status,default_base_url,capabilities)
       VALUES ($1,$2,$3,'active',$4,$5::jsonb) ON CONFLICT (key) DO UPDATE SET name=EXCLUDED.name,
       kind=EXCLUDED.kind, default_base_url=EXCLUDED.default_base_url, capabilities=EXCLUDED.capabilities, updated_at=now()
       RETURNING id::text AS id`,
      [definition.provider.key, definition.provider.name, definition.provider.kind,
        definition.provider.defaultBaseUrl ?? null, JSON.stringify(definition.provider.capabilities ?? {})],
    );
    return result.rows[0]!.id;
  }

  private async upsertModel(client: PoolClient, providerId: string, definition: ResolvedDefinition): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO ai_models (provider_id,model_key,display_name,modality,capabilities,status)
       VALUES ($1,$2,$3,$4,$5::jsonb,'active') ON CONFLICT (provider_id,model_key) DO UPDATE SET
       display_name=EXCLUDED.display_name, modality=EXCLUDED.modality, capabilities=EXCLUDED.capabilities, updated_at=now()
       RETURNING id::text AS id`,
      [providerId, definition.model.modelKey, definition.model.displayName, definition.model.modality,
        JSON.stringify(definition.model.capabilities ?? {})],
    );
    return result.rows[0]!.id;
  }

  private async upsertPluginRecords(client: PoolClient, context: TenantContext, providerId: string, manifest: AiPluginManifest): Promise<string> {
    const pkg = await client.query<{ id: string }>(
      `INSERT INTO ai_plugin_packages (package_key,display_name,provider_key,adapter_kind,modality,version,status,manifest_json)
       VALUES ($1,$2,$3,$4,$5,$6,'active',$7::jsonb) ON CONFLICT (package_key) DO UPDATE SET version=EXCLUDED.version,
       manifest_json=EXCLUDED.manifest_json, updated_at=now() RETURNING id::text AS id`,
      [manifest.packageKey, manifest.displayName, manifest.provider.key, manifest.provider.kind, manifest.modality,
        manifest.version, JSON.stringify(manifest)],
    );
    const install = await client.query<{ id: string }>(
      `INSERT INTO tenant_ai_plugin_installs (tenant_id,package_id,installed_version,status,provider_id,metadata,installed_by)
       VALUES (NULL,$1,$2,'draft',$3,'{}'::jsonb,$4) ON CONFLICT (package_id) WHERE tenant_id IS NULL
       DO UPDATE SET installed_version=EXCLUDED.installed_version, provider_id=EXCLUDED.provider_id, status='draft', updated_at=now()
       RETURNING id::text AS id`, [pkg.rows[0]!.id, manifest.version, providerId, context.userId]);
    return install.rows[0]!.id;
  }

  private async upsertCatalog(client: PoolClient, modelId: string, installId: string | null, definition: ResolvedDefinition): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO ai_model_catalog (tenant_id,plugin_install_id,model_id,model_key,display_name,modality,model_family,
       default_route_key,ui_schema,capabilities,sort_order,status) VALUES (NULL,$1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,'inactive')
       ON CONFLICT (model_key) WHERE tenant_id IS NULL DO UPDATE SET plugin_install_id=EXCLUDED.plugin_install_id,
       model_id=EXCLUDED.model_id, display_name=EXCLUDED.display_name, modality=EXCLUDED.modality,
       model_family=EXCLUDED.model_family, ui_schema=EXCLUDED.ui_schema, capabilities=EXCLUDED.capabilities,
       status='inactive', updated_at=now() RETURNING id::text AS id`,
      [installId, modelId, definition.model.modelKey, definition.model.displayName, definition.model.modality,
        definition.model.modelFamily, definition.model.defaultRouteKey ?? null, JSON.stringify(definition.model.uiSchema ?? {}),
        JSON.stringify(definition.model.capabilities ?? {}), definition.model.sortOrder ?? 100]);
    return result.rows[0]!.id;
  }

  private async resolveConnection(client: PoolClient, context: TenantContext, providerId: string, definition: ResolvedDefinition, input: SaveModelConfigurationDraftInput): Promise<RefRow> {
    if (input.connection.mode === "existing") {
      const result = await client.query<RefRow>(`SELECT id::text,provider_id::text,tenant_id::text,name,status,base_url,environment FROM ai_provider_connections WHERE id=$1 FOR UPDATE`, [input.connection.connectionId]);
      const row = result.rows[0];
      if (!row) throw new AiModelConfigurationApiError(404, "CONFIGURATION_CONNECTION_NOT_FOUND", "Provider connection not found");
      if (row.tenant_id !== null) throw new AiModelConfigurationApiError(400, "CONFIGURATION_SCOPE_MISMATCH", "Platform route requires a platform connection");
      if (row.provider_id !== providerId) throw new AiModelConfigurationApiError(400, "CONFIGURATION_CONNECTION_PROVIDER_MISMATCH", "Connection provider does not match model provider");
      if (row.status !== "active" && row.status !== "inactive") throw new AiModelConfigurationApiError(400, "CONFIGURATION_CONNECTION_INACTIVE", "Provider connection is unavailable");
      return row;
    }
    const result = await client.query<RefRow>(
      `INSERT INTO ai_provider_connections (tenant_id,provider_id,name,adapter_kind,base_url,environment,status,metadata,created_by)
       VALUES (NULL,$1,$2,$3,$4,$5,'inactive','{}'::jsonb,$6) RETURNING id::text,provider_id::text,tenant_id::text,name,status,base_url,environment`,
      [providerId,input.connection.name,definition.provider.kind,input.connection.baseUrl,input.connection.environment,context.userId]);
    return result.rows[0]!;
  }

  private async resolveCredential(client: PoolClient, context: TenantContext, providerId: string, input: SaveModelConfigurationDraftInput): Promise<RefRow> {
    if (input.credential.mode === "existing") {
      const result = await client.query<RefRow>(`SELECT id::text,provider_id::text,tenant_id::text,name,status,secret_fingerprint FROM api_credentials WHERE id=$1 FOR UPDATE`, [input.credential.credentialId]);
      const row = result.rows[0];
      if (!row) throw new AiModelConfigurationApiError(404, "CONFIGURATION_CREDENTIAL_NOT_FOUND", "Credential not found");
      if (row.tenant_id !== null) throw new AiModelConfigurationApiError(400, "CONFIGURATION_SCOPE_MISMATCH", "Platform route requires a platform credential");
      if (row.provider_id !== providerId) throw new AiModelConfigurationApiError(400, "CONFIGURATION_CREDENTIAL_PROVIDER_MISMATCH", "Credential provider does not match model provider");
      if (row.status !== "active") throw new AiModelConfigurationApiError(400, "CONFIGURATION_CREDENTIAL_INACTIVE", "Credential is inactive");
      return row;
    }
    const encrypted = this.credentialVault.createCredential(input.credential.secret);
    const result = await client.query<RefRow>(
      `INSERT INTO api_credentials (tenant_id,provider_id,name,encrypted_secret,nonce,auth_tag,key_version,secret_fingerprint,status,created_by)
       VALUES (NULL,$1,$2,$3,$4,$5,$6,$7,'active',$8)
       RETURNING id::text,provider_id::text,tenant_id::text,name,status,secret_fingerprint`,
      [providerId,input.credential.name,encrypted.encryptedSecret,encrypted.nonce,encrypted.authTag,
        encrypted.keyVersion,encrypted.secretFingerprint,context.userId]);
    return result.rows[0]!;
  }

  private async saveRoute(client: PoolClient, providerId: string, modelId: string, installId: string | null,
    connectionId: string, credentialId: string, definition: ResolvedDefinition, input: SaveModelConfigurationDraftInput) {
    const requestPath = input.route.requestPath ?? definition.routeDefaults.requestPath ?? this.stringValue(definition.routeDefaults.requestConfig, "path");
    const timeoutMs = input.route.timeoutMs ?? definition.routeDefaults.timeoutMs;
    const requestConfig = { ...(definition.routeDefaults.requestConfig ?? {}), ...(input.route.requestConfig ?? {}),
      ...(timeoutMs ? { timeoutMs } : {}), ...(requestPath ? { path: requestPath } : {}) };
    if (input.routeId) {
      const current = await client.query<{ route_key: string; configuration_revision: number }>(
        `SELECT route_key,configuration_revision FROM ai_routes WHERE id=$1 AND tenant_id IS NULL AND deleted_at IS NULL FOR UPDATE`, [input.routeId]);
      if (!current.rows[0] || current.rows[0].configuration_revision !== input.expectedRevision) {
        throw new AiModelConfigurationApiError(409, "MODEL_CONFIGURATION_CONFLICT", "Model configuration changed; reload and retry");
      }
      const updated = await client.query<any>(
        `UPDATE ai_routes SET provider_id=$2,model_id=$3,credential_id=$4,connection_id=$5,plugin_install_id=$6,
         modality=$7,priority=$8,weight=$9,fallback_group=$10,request_config=$11::jsonb,status='inactive',model_family=$12,
         route_label=$13,environment=$14,upstream_model=$15,api_mode=$16,request_path=$17,
         configuration_revision=configuration_revision+1,tested_revision=NULL,updated_at=now()
         WHERE id=$1 RETURNING id::text,route_key,status,configuration_revision,tested_revision`,
        [input.routeId,providerId,modelId,credentialId,connectionId,installId,definition.model.modality,
          input.route.priority ?? 100,input.route.weight ?? 100,input.route.fallbackGroup ?? null,JSON.stringify(requestConfig),
          definition.model.modelFamily,input.route.routeLabel,input.connection.mode === "create" ? input.connection.environment : "production",
          input.route.upstreamModel,input.route.apiMode ?? definition.routeDefaults.apiMode ?? definition.routeDefaults.mode ?? "sync",requestPath ?? null]);
      return updated.rows[0]!;
    }
    const routeKey = input.route.routeKey ?? `${definition.model.modality}.${definition.provider.key}.${definition.model.modelKey}.${randomUUID().slice(0,8)}`.toLowerCase().replace(/[^a-z0-9._-]/g,"-");
    const inserted = await client.query<any>(
      `INSERT INTO ai_routes (tenant_id,provider_id,model_id,credential_id,connection_id,route_key,modality,priority,weight,
       fallback_group,request_config,pricing,rate_limit,status,plugin_install_id,model_family,route_label,environment,
       upstream_model,api_mode,request_path,configuration_revision,tested_revision)
       VALUES (NULL,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,'{}'::jsonb,'inactive',$12,$13,$14,$15,$16,$17,$18,1,NULL)
       RETURNING id::text,route_key,status,configuration_revision,tested_revision`,
      [providerId,modelId,credentialId,connectionId,routeKey,definition.model.modality,input.route.priority ?? 100,
        input.route.weight ?? 100,input.route.fallbackGroup ?? null,JSON.stringify(requestConfig),JSON.stringify(input.pricing),installId,
        definition.model.modelFamily,input.route.routeLabel,input.connection.mode === "create" ? input.connection.environment : "production",
        input.route.upstreamModel,input.route.apiMode ?? definition.routeDefaults.apiMode ?? definition.routeDefaults.mode ?? "sync",requestPath ?? null]);
    return inserted.rows[0]!;
  }

  private stringValue(record: Record<string, unknown> | undefined, key: string): string | undefined {
    const value = record?.[key];
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }
}
