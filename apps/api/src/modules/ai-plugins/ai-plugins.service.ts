import type { Pool, PoolClient } from "pg";

import {
  builtinAiPluginRegistry,
  CredentialVault,
  type AiPluginManifest,
} from "@aigc-flow/ai-gateway-core";
import {
  createPgPool,
  safeRecordAuditLog,
  withTenantTransaction,
} from "@aigc-flow/db";

import type { InstallPluginInput, ListPluginsQuery } from "./ai-plugins.schemas.js";

type TenantContext = {
  ipHash?: string | null;
  requestId?: string | null;
  tenantId: string;
  traceId?: string | null;
  userAgent?: string | null;
  userId: string | null;
};

const PLATFORM_TENANT_ID: string | null = null;

type PluginInstallRecord = {
  credential_id: string | null;
  disabled_at: string | null;
  id: string;
  installed_version: string;
  metadata: Record<string, unknown>;
  package_id: string;
  package_key: string;
  provider_id: string | null;
  published_at: string | null;
  status: string;
};

type ProviderConnectionRecord = {
  id: string;
};

type AiRouteInsertStatement = {
  sql: string;
  values: unknown[];
};

export type AiPluginSummaryView = {
  description: string;
  displayName: string;
  install: PluginInstallView | null;
  modality: AiPluginManifest["modality"];
  models: Array<{
    defaultRouteKey: string;
    displayName: string;
    modelFamily: string;
    modelKey: string;
  }>;
  packageKey: string;
  provider: {
    key: string;
    kind: string;
    name: string;
  };
  version: string;
};

export type PluginInstallView = {
  credentialId: string | null;
  disabledAt: string | null;
  id: string;
  installedVersion: string;
  metadata: Record<string, unknown>;
  packageId: string;
  packageKey: string;
  providerId: string | null;
  publishedAt: string | null;
  status: string;
};

export type InstalledPluginView = PluginInstallView & {
  catalogModelKeys: string[];
  routeKeys: string[];
};

export class AiPluginApiError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "AiPluginApiError";
    this.statusCode = statusCode;
  }
}

export class AiPluginService {
  readonly credentialVault: CredentialVault;
  readonly pool: Pool;

  constructor(options: {
    credentialVault: CredentialVault;
    pool?: Pool;
  }) {
    this.credentialVault = options.credentialVault;
    this.pool = options.pool ?? createPgPool();
  }

  async listPlugins(
    context: TenantContext,
    query: ListPluginsQuery = {},
  ): Promise<AiPluginSummaryView[]> {
    const manifests = builtinAiPluginRegistry.list({ modality: query.modality });
    const installs = await this.listInstallsByPackageKey(context);

    return manifests.map((manifest) => this.mapManifestSummary(manifest, installs.get(manifest.packageKey) ?? null));
  }

  async getPlugin(context: TenantContext, packageKey: string): Promise<AiPluginSummaryView> {
    const manifest = this.requireManifest(packageKey);
    const installs = await this.listInstallsByPackageKey(context);
    return this.mapManifestSummary(manifest, installs.get(manifest.packageKey) ?? null);
  }

  async installPlugin(
    context: TenantContext,
    packageKey: string,
    input: InstallPluginInput,
  ): Promise<InstalledPluginView> {
    const manifest = this.requireManifest(packageKey);
    return withTenantTransaction(context, async (client) => {
      const packageId = await this.upsertPluginPackage(client, manifest);
      const providerId = await this.upsertProvider(client, manifest, input.baseUrlOverride ?? undefined);
      const modelIdsByKey = await this.upsertModels(client, manifest, providerId);
      const existingInstall = await this.getInstallByPackageId(client, PLATFORM_TENANT_ID, packageId);
      const credentialId = await this.resolveCredentialId(
        client,
        context,
        manifest,
        providerId,
        existingInstall?.credential_id ?? null,
        input,
      );
      const status = input.publishImmediately ? "published" : "draft";
      const install = await this.upsertInstall(client, {
        context,
        credentialId,
        input,
        packageId,
        providerId,
        status,
        version: manifest.version,
      });
      const connectionId = await this.upsertProviderConnection(client, {
        context,
        credentialId,
        input,
        installId: install.id,
        manifest,
        providerId,
      });

      const routeKeys = await this.upsertRoutes(client, {
        connectionId,
        credentialId,
        input,
        installId: install.id,
        manifest,
        modelIdsByKey,
        providerId,
        status: status === "published" ? "active" : "inactive",
        tenantId: PLATFORM_TENANT_ID,
      });
      const catalogModelKeys = await this.upsertCatalog(client, {
        installId: install.id,
        manifest,
        modelIdsByKey,
        status: status === "published" ? "active" : "inactive",
        tenantId: PLATFORM_TENANT_ID,
      });
      await this.upsertPricing(client, manifest, input);

      await safeRecordAuditLog(
        {
          action: "ai.plugin.install",
          actorType: context.userId ? "user" : "system",
          actorUserId: context.userId,
          ipHash: context.ipHash,
          metadata: {
            packageKey: manifest.packageKey,
            published: status === "published",
            routeKeys,
            version: manifest.version,
          },
          requestId: context.requestId,
          resourceId: install.id,
          resourceType: "ai_plugin_install",
          tenantId: context.tenantId,
          traceId: context.traceId,
          userAgent: context.userAgent,
        },
        { pool: this.pool },
      );

      return {
        ...install,
        catalogModelKeys,
        routeKeys,
      };
    }, this.pool);
  }

  async publishInstall(context: TenantContext, installId: string): Promise<InstalledPluginView> {
    return this.updateInstallStatus(context, installId, "published");
  }

  async disableInstall(context: TenantContext, installId: string): Promise<InstalledPluginView> {
    return this.updateInstallStatus(context, installId, "disabled");
  }

  private async updateInstallStatus(
    context: TenantContext,
    installId: string,
    status: "disabled" | "published",
  ): Promise<InstalledPluginView> {
    return withTenantTransaction(context, async (client) => {
      const row = await this.getInstallById(client, PLATFORM_TENANT_ID, installId);
      const routeStatus = status === "published" ? "active" : "inactive";
      const catalogStatus = routeStatus;
      const result = await client.query<PluginInstallRecord>(
        `
          UPDATE tenant_ai_plugin_installs
          SET
            status = $3,
            published_at = CASE WHEN $3 = 'published' THEN now() ELSE published_at END,
            disabled_at = CASE WHEN $3 = 'disabled' THEN now() ELSE NULL END,
            updated_at = now()
          WHERE id = $1::uuid
            AND (
              ($2::uuid IS NULL AND tenant_id IS NULL)
              OR tenant_id = $2::uuid
            )
          RETURNING
            id::text AS id,
            package_id::text AS package_id,
            (SELECT package_key FROM ai_plugin_packages WHERE id = package_id) AS package_key,
            installed_version,
            status,
            provider_id::text AS provider_id,
            credential_id::text AS credential_id,
            metadata,
            published_at::text AS published_at,
            disabled_at::text AS disabled_at
        `,
        [installId, PLATFORM_TENANT_ID, status],
      );

      await client.query(
        `
          UPDATE ai_routes
          SET status = $2, updated_at = now()
          WHERE (
              ($1::uuid IS NULL AND tenant_id IS NULL)
              OR tenant_id = $1::uuid
            )
            AND plugin_install_id = $3::uuid
        `,
        [PLATFORM_TENANT_ID, routeStatus, installId],
      );
      await client.query(
        `
          UPDATE ai_model_catalog
          SET status = $2, updated_at = now()
          WHERE (
              ($1::uuid IS NULL AND tenant_id IS NULL)
              OR tenant_id = $1::uuid
            )
            AND plugin_install_id = $3::uuid
        `,
        [PLATFORM_TENANT_ID, catalogStatus, installId],
      );

      const view = this.mapInstall(result.rows[0] ?? row);
      return {
        ...view,
        catalogModelKeys: await this.listCatalogModelKeys(client, PLATFORM_TENANT_ID, installId),
        routeKeys: await this.listRouteKeys(client, PLATFORM_TENANT_ID, installId),
      };
    }, this.pool);
  }

  private async listInstallsByPackageKey(context: TenantContext): Promise<Map<string, PluginInstallView>> {
    return withTenantTransaction(context, async (client) => {
      const result = await client.query<PluginInstallRecord>(
        `
          SELECT
            install.id::text AS id,
            install.package_id::text AS package_id,
            package.package_key,
            install.installed_version,
            install.status,
            install.provider_id::text AS provider_id,
            install.credential_id::text AS credential_id,
            install.metadata,
            install.published_at::text AS published_at,
            install.disabled_at::text AS disabled_at
          FROM tenant_ai_plugin_installs AS install
          JOIN ai_plugin_packages AS package
            ON package.id = install.package_id
          WHERE install.tenant_id IS NULL
        `,
        [],
      );
      return new Map(result.rows.map((row) => [row.package_key, this.mapInstall(row)]));
    }, this.pool);
  }

  private requireManifest(packageKey: string): AiPluginManifest {
    const manifest = builtinAiPluginRegistry.get(packageKey);
    if (!manifest) {
      throw new AiPluginApiError(404, "PLUGIN_NOT_FOUND", "Plugin package not found");
    }
    return manifest;
  }

  private mapManifestSummary(
    manifest: AiPluginManifest,
    install: PluginInstallView | null,
  ): AiPluginSummaryView {
    return {
      description: manifest.description,
      displayName: manifest.displayName,
      install,
      modality: manifest.modality,
      models: manifest.models.map((model) => ({
        defaultRouteKey: model.defaultRouteKey,
        displayName: model.displayName,
        modelFamily: model.modelFamily,
        modelKey: model.modelKey,
      })),
      packageKey: manifest.packageKey,
      provider: {
        key: manifest.provider.key,
        kind: manifest.provider.kind,
        name: manifest.provider.name,
      },
      version: manifest.version,
    };
  }

  private mapInstall(row: PluginInstallRecord): PluginInstallView {
    return {
      credentialId: row.credential_id,
      disabledAt: row.disabled_at,
      id: row.id,
      installedVersion: row.installed_version,
      metadata: row.metadata ?? {},
      packageId: row.package_id,
      packageKey: row.package_key,
      providerId: row.provider_id,
      publishedAt: row.published_at,
      status: row.status,
    };
  }

  private async upsertPluginPackage(client: PoolClient, manifest: AiPluginManifest): Promise<string> {
    const result = await client.query<{ id: string }>(
      `
        INSERT INTO ai_plugin_packages (
          package_key,
          display_name,
          provider_key,
          adapter_kind,
          modality,
          version,
          status,
          manifest_json,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'active', $7::jsonb, now())
        ON CONFLICT (package_key)
        DO UPDATE SET
          display_name = EXCLUDED.display_name,
          provider_key = EXCLUDED.provider_key,
          adapter_kind = EXCLUDED.adapter_kind,
          modality = EXCLUDED.modality,
          version = EXCLUDED.version,
          status = 'active',
          manifest_json = EXCLUDED.manifest_json,
          updated_at = now()
        RETURNING id::text AS id
      `,
      [
        manifest.packageKey,
        manifest.displayName,
        manifest.provider.key,
        manifest.provider.kind,
        manifest.modality,
        manifest.version,
        JSON.stringify(manifest),
      ],
    );
    return result.rows[0].id;
  }

  private async upsertProvider(
    client: PoolClient,
    manifest: AiPluginManifest,
    baseUrlOverride?: string,
  ): Promise<string> {
    const result = await client.query<{ id: string }>(
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
        VALUES ($1, $2, $3, 'active', $4, $5::jsonb, now())
        ON CONFLICT (key)
        DO UPDATE SET
          name = EXCLUDED.name,
          kind = EXCLUDED.kind,
          status = 'active',
          default_base_url = EXCLUDED.default_base_url,
          capabilities = EXCLUDED.capabilities,
          updated_at = now()
        RETURNING id::text AS id
      `,
      [
        manifest.provider.key,
        manifest.provider.name,
        manifest.provider.kind,
        baseUrlOverride ?? manifest.provider.defaultBaseUrl,
        JSON.stringify(manifest.provider.capabilities ?? {}),
      ],
    );
    return result.rows[0].id;
  }

  private async upsertModels(
    client: PoolClient,
    manifest: AiPluginManifest,
    providerId: string,
  ): Promise<Map<string, string>> {
    const modelIdsByKey = new Map<string, string>();
    for (const model of manifest.models) {
      const result = await client.query<{ id: string }>(
        `
          INSERT INTO ai_models (
            provider_id,
            model_key,
            display_name,
            modality,
            capabilities,
            status,
            updated_at
          )
          VALUES ($1::uuid, $2, $3, $4, $5::jsonb, 'active', now())
          ON CONFLICT (provider_id, model_key)
          DO UPDATE SET
            display_name = EXCLUDED.display_name,
            modality = EXCLUDED.modality,
            capabilities = EXCLUDED.capabilities,
            status = 'active',
            updated_at = now()
          RETURNING id::text AS id
        `,
        [
          providerId,
          model.modelKey,
          model.displayName,
          model.modality,
          JSON.stringify(model.capabilities ?? {}),
        ],
      );
      modelIdsByKey.set(model.modelKey, result.rows[0].id);
    }
    return modelIdsByKey;
  }

  private async resolveCredentialId(
    client: PoolClient,
    context: TenantContext,
    manifest: AiPluginManifest,
    providerId: string,
    existingCredentialId: string | null,
    input: InstallPluginInput,
  ): Promise<string | null> {
    const secret = input.credential?.secret?.trim();
    if (!secret) {
      return existingCredentialId;
    }

    const encrypted = this.credentialVault.createCredential(secret);
    const name = input.credential?.name?.trim() || `${manifest.displayName} API Key`;
    const result = await client.query<{ id: string }>(
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
          'active',
          $9::uuid,
          now()
        )
        ON CONFLICT (provider_id, name) WHERE tenant_id IS NULL
        DO UPDATE SET
          encrypted_secret = EXCLUDED.encrypted_secret,
          nonce = EXCLUDED.nonce,
          auth_tag = EXCLUDED.auth_tag,
          key_version = EXCLUDED.key_version,
          secret_fingerprint = EXCLUDED.secret_fingerprint,
          status = 'active',
          rotated_at = now(),
          updated_at = now()
        RETURNING id::text AS id
      `,
      [
        PLATFORM_TENANT_ID,
        providerId,
        name,
        encrypted.encryptedSecret,
        encrypted.nonce,
        encrypted.authTag,
        encrypted.keyVersion,
        encrypted.secretFingerprint,
        context.userId,
      ],
    );
    return result.rows[0].id;
  }

  private async upsertInstall(
    client: PoolClient,
    options: {
      context: TenantContext;
      credentialId: string | null;
      input: InstallPluginInput;
      packageId: string;
      providerId: string;
      status: string;
      version: string;
    },
  ): Promise<PluginInstallView> {
    const metadata = {
      baseUrlOverride: options.input.baseUrlOverride ?? null,
      pricingOverrides: options.input.pricingOverrides ?? [],
    };
    const result = await client.query<PluginInstallRecord>(
      `
        INSERT INTO tenant_ai_plugin_installs (
          tenant_id,
          package_id,
          installed_version,
          status,
          provider_id,
          credential_id,
          metadata,
          installed_by,
          published_at,
          disabled_at,
          updated_at
        )
        VALUES (
          $1::uuid,
          $2::uuid,
          $3,
          $4,
          $5::uuid,
          $6::uuid,
          $7::jsonb,
          $8::uuid,
          CASE WHEN $4 = 'published' THEN now() ELSE NULL END,
          NULL,
          now()
        )
        ON CONFLICT (package_id) WHERE tenant_id IS NULL
        DO UPDATE SET
          installed_version = EXCLUDED.installed_version,
          status = EXCLUDED.status,
          provider_id = EXCLUDED.provider_id,
          credential_id = COALESCE(EXCLUDED.credential_id, tenant_ai_plugin_installs.credential_id),
          metadata = EXCLUDED.metadata,
          installed_by = EXCLUDED.installed_by,
          published_at = CASE
            WHEN EXCLUDED.status = 'published' THEN COALESCE(tenant_ai_plugin_installs.published_at, now())
            ELSE tenant_ai_plugin_installs.published_at
          END,
          disabled_at = NULL,
          updated_at = now()
        RETURNING
          id::text AS id,
          package_id::text AS package_id,
          (SELECT package_key FROM ai_plugin_packages WHERE id = package_id) AS package_key,
          installed_version,
          status,
          provider_id::text AS provider_id,
          credential_id::text AS credential_id,
          metadata,
          published_at::text AS published_at,
          disabled_at::text AS disabled_at
      `,
      [
        PLATFORM_TENANT_ID,
        options.packageId,
        options.version,
        options.status,
        options.providerId,
        options.credentialId,
        JSON.stringify(metadata),
        options.context.userId,
      ],
    );
    return this.mapInstall(result.rows[0]);
  }

  private async upsertRoutes(
    client: PoolClient,
    options: {
      connectionId: string | null;
      credentialId: string | null;
      input: InstallPluginInput;
      installId: string;
      manifest: AiPluginManifest;
      modelIdsByKey: Map<string, string>;
      providerId: string;
      status: string;
      tenantId: string | null;
    },
  ): Promise<string[]> {
    const routeKeys: string[] = [];
    for (const route of options.manifest.routes) {
      const modelId = options.modelIdsByKey.get(route.modelKey);
      if (!modelId) {
        throw new AiPluginApiError(400, "PLUGIN_MODEL_NOT_FOUND", `Route ${route.routeKey} references missing model`);
      }
      const requestConfig = {
        ...route.requestConfig,
        mode: route.mode,
        path: route.path ?? route.requestConfig.path,
        timeoutMs: route.timeoutMs,
      };
      const statement = this.buildRouteInsertStatement({
        baseUrlOverride: options.input.baseUrlOverride ?? route.baseUrl ?? null,
        connectionId: options.connectionId,
        credentialId: options.credentialId,
        installId: options.installId,
        modelId,
        providerId: options.providerId,
        requestConfig,
        route,
        status: options.status,
        tenantId: options.tenantId,
      });
      await client.query(statement.sql, statement.values);
      routeKeys.push(route.routeKey);
    }
    return routeKeys;
  }

  private buildRouteInsertStatement(options: {
    baseUrlOverride: string | null;
    connectionId: string | null;
    credentialId: string | null;
    installId: string;
    modelId: string;
    providerId: string;
    requestConfig: Record<string, unknown>;
    route: AiPluginManifest["routes"][number];
    status: string;
    tenantId: string | null;
  }): AiRouteInsertStatement {
    return {
      sql:
        `
          INSERT INTO ai_routes (
            tenant_id,
            provider_id,
            model_id,
            credential_id,
            connection_id,
            route_key,
            modality,
            priority,
            weight,
            base_url_override,
            request_config,
            rate_limit,
            status,
            plugin_install_id,
            model_family,
            route_label,
            environment,
            upstream_model,
            api_mode,
            request_path,
            updated_at
          )
          VALUES (
            $1::uuid,
            $2::uuid,
            $3::uuid,
            $4::uuid,
            $5::uuid,
            $6,
            $7,
            100,
            $8,
            $9,
            $10::jsonb,
            $11::jsonb,
            $12,
            $13,
            $14::uuid,
            $15,
            $16,
            $17,
            $18,
            $19,
            now()
          )
          ON CONFLICT (route_key) WHERE tenant_id IS NULL
          DO UPDATE SET
            provider_id = EXCLUDED.provider_id,
            model_id = EXCLUDED.model_id,
            credential_id = COALESCE(EXCLUDED.credential_id, ai_routes.credential_id),
            connection_id = COALESCE(EXCLUDED.connection_id, ai_routes.connection_id),
            modality = EXCLUDED.modality,
            priority = EXCLUDED.priority,
            base_url_override = EXCLUDED.base_url_override,
            request_config = EXCLUDED.request_config,
            rate_limit = EXCLUDED.rate_limit,
            status = EXCLUDED.status,
            plugin_install_id = EXCLUDED.plugin_install_id,
            model_family = EXCLUDED.model_family,
            route_label = EXCLUDED.route_label,
            environment = EXCLUDED.environment,
            upstream_model = EXCLUDED.upstream_model,
            api_mode = EXCLUDED.api_mode,
            request_path = EXCLUDED.request_path,
            updated_at = now()
        `,
      values: [
        options.tenantId,
        options.providerId,
        options.modelId,
        options.credentialId,
        options.connectionId,
        options.route.routeKey,
        options.route.modality,
        options.route.priority,
        options.baseUrlOverride,
        JSON.stringify(options.requestConfig),
        JSON.stringify(options.route.rateLimit ?? {}),
        options.status,
        options.installId,
        options.route.modelFamily,
        options.route.routeLabel,
        (options.route.requestConfig.environment as string | undefined) ?? "production",
        options.route.modelKey,
        this.resolveRouteApiMode(options.route),
        options.route.path ?? this.readRouteRequestConfigString(options.route.requestConfig, "path"),
      ],
    };
  }

  private async upsertProviderConnection(
    client: PoolClient,
    options: {
      context: TenantContext;
      credentialId: string | null;
      input: InstallPluginInput;
      installId: string;
      manifest: AiPluginManifest;
      providerId: string;
    },
  ): Promise<string | null> {
    const firstRoute = options.manifest.routes[0];
    if (!firstRoute) {
      return null;
    }

    const adapterKind = this.resolveRouteApiMode(firstRoute);
    const environment = this.readRouteRequestConfigString(firstRoute.requestConfig, "environment") ?? "production";
    const baseUrl =
      options.input.baseUrlOverride?.trim() ||
      firstRoute.baseUrl?.trim() ||
      options.manifest.provider.defaultBaseUrl ||
      null;

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
          'active',
          $8::jsonb,
          $9::uuid,
          now()
        )
        ON CONFLICT (name) WHERE tenant_id IS NULL
        DO UPDATE SET
          provider_id = EXCLUDED.provider_id,
          credential_id = COALESCE(EXCLUDED.credential_id, ai_provider_connections.credential_id),
          adapter_kind = EXCLUDED.adapter_kind,
          base_url = EXCLUDED.base_url,
          environment = EXCLUDED.environment,
          status = 'active',
          metadata = EXCLUDED.metadata,
          updated_at = now()
        RETURNING id::text AS id
      `,
      [
        PLATFORM_TENANT_ID,
        options.providerId,
        options.credentialId,
        `${options.manifest.displayName} Connection`,
        adapterKind,
        baseUrl,
        environment,
        JSON.stringify({
          baseUrlOverride: options.input.baseUrlOverride ?? null,
          generatedBy: "template-install",
          installId: options.installId,
          packageKey: options.manifest.packageKey,
        }),
        options.context.userId,
      ],
    );

    return result.rows[0]?.id ?? null;
  }

  private async upsertCatalog(
    client: PoolClient,
    options: {
      installId: string;
      manifest: AiPluginManifest;
      modelIdsByKey: Map<string, string>;
      status: string;
      tenantId: string | null;
    },
  ): Promise<string[]> {
    const modelKeys: string[] = [];
    for (const model of options.manifest.models) {
      const modelId = options.modelIdsByKey.get(model.modelKey);
      if (!modelId) {
        throw new AiPluginApiError(400, "PLUGIN_MODEL_NOT_FOUND", `Catalog references missing model ${model.modelKey}`);
      }
      await client.query(
        `
          INSERT INTO ai_model_catalog (
            tenant_id,
            plugin_install_id,
            model_id,
            model_key,
            display_name,
            modality,
            model_family,
            default_route_key,
            ui_schema,
            capabilities,
            sort_order,
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
            $7,
            $8,
            $9::jsonb,
            $10::jsonb,
            $11,
            $12,
            now()
          )
          ON CONFLICT (model_key) WHERE tenant_id IS NULL
          DO UPDATE SET
            plugin_install_id = EXCLUDED.plugin_install_id,
            model_id = EXCLUDED.model_id,
            display_name = EXCLUDED.display_name,
            modality = EXCLUDED.modality,
            model_family = EXCLUDED.model_family,
            default_route_key = EXCLUDED.default_route_key,
            ui_schema = EXCLUDED.ui_schema,
            capabilities = EXCLUDED.capabilities,
            sort_order = EXCLUDED.sort_order,
            status = EXCLUDED.status,
            updated_at = now()
        `,
        [
          options.tenantId,
          options.installId,
          modelId,
          model.modelKey,
          model.displayName,
          model.modality,
          model.modelFamily,
          model.defaultRouteKey,
          JSON.stringify(model.uiSchema ?? {}),
          JSON.stringify(model.capabilities ?? {}),
          model.sortOrder ?? 100,
          options.status,
        ],
      );
      modelKeys.push(model.modelKey);
    }
    return modelKeys;
  }

  private async upsertPricing(
    client: PoolClient,
    manifest: AiPluginManifest,
    input: InstallPluginInput,
  ): Promise<void> {
    for (const pricing of manifest.pricing) {
      const override = input.pricingOverrides?.find(
        (candidate) => candidate.modelKey === pricing.model && candidate.routeKey === pricing.route,
      );
      await client.query(
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
          VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, true)
          ON CONFLICT (provider, model, route, unit)
          DO UPDATE SET
            unit_credits = EXCLUDED.unit_credits,
            min_charge_credits = EXCLUDED.min_charge_credits,
            metadata = EXCLUDED.metadata,
            active = true
        `,
        [
          pricing.provider,
          pricing.model,
          pricing.route,
          pricing.unit,
          override?.unitCredits ?? pricing.unitCredits,
          override?.minChargeCredits ?? pricing.minChargeCredits,
          JSON.stringify({
            ...(pricing.metadata ?? {}),
            pluginPackageKey: manifest.packageKey,
          }),
        ],
      );
    }
  }

  private async getInstallByPackageId(
    client: PoolClient,
    tenantId: string | null,
    packageId: string,
  ): Promise<PluginInstallRecord | null> {
    const result = await client.query<PluginInstallRecord>(
      `
        SELECT
          install.id::text AS id,
          install.package_id::text AS package_id,
          package.package_key,
          install.installed_version,
          install.status,
          install.provider_id::text AS provider_id,
          install.credential_id::text AS credential_id,
          install.metadata,
          install.published_at::text AS published_at,
          install.disabled_at::text AS disabled_at
        FROM tenant_ai_plugin_installs AS install
        JOIN ai_plugin_packages AS package
          ON package.id = install.package_id
        WHERE (
            ($1::uuid IS NULL AND install.tenant_id IS NULL)
            OR install.tenant_id = $1::uuid
          )
          AND install.package_id = $2::uuid
        LIMIT 1
      `,
      [tenantId, packageId],
    );
    return result.rows[0] ?? null;
  }

  private async getInstallById(
    client: PoolClient,
    tenantId: string | null,
    installId: string,
  ): Promise<PluginInstallRecord> {
    const result = await client.query<PluginInstallRecord>(
      `
        SELECT
          install.id::text AS id,
          install.package_id::text AS package_id,
          package.package_key,
          install.installed_version,
          install.status,
          install.provider_id::text AS provider_id,
          install.credential_id::text AS credential_id,
          install.metadata,
          install.published_at::text AS published_at,
          install.disabled_at::text AS disabled_at
        FROM tenant_ai_plugin_installs AS install
        JOIN ai_plugin_packages AS package
          ON package.id = install.package_id
        WHERE (
            ($1::uuid IS NULL AND install.tenant_id IS NULL)
            OR install.tenant_id = $1::uuid
          )
          AND install.id = $2::uuid
        LIMIT 1
      `,
      [tenantId, installId],
    );
    const row = result.rows[0];
    if (!row) {
      throw new AiPluginApiError(404, "PLUGIN_INSTALL_NOT_FOUND", "Plugin install not found");
    }
    return row;
  }

  private async listRouteKeys(client: PoolClient, tenantId: string | null, installId: string): Promise<string[]> {
    const result = await client.query<{ route_key: string }>(
      `
        SELECT route_key
        FROM ai_routes
        WHERE (
            ($1::uuid IS NULL AND tenant_id IS NULL)
            OR tenant_id = $1::uuid
          )
          AND plugin_install_id = $2::uuid
        ORDER BY route_key ASC
      `,
      [tenantId, installId],
    );
    return result.rows.map((row) => row.route_key);
  }

  private async listCatalogModelKeys(client: PoolClient, tenantId: string | null, installId: string): Promise<string[]> {
    const result = await client.query<{ model_key: string }>(
      `
        SELECT model_key
        FROM ai_model_catalog
        WHERE (
            ($1::uuid IS NULL AND tenant_id IS NULL)
            OR tenant_id = $1::uuid
          )
          AND plugin_install_id = $2::uuid
        ORDER BY sort_order ASC, model_key ASC
      `,
      [tenantId, installId],
    );
    return result.rows.map((row) => row.model_key);
  }

  private resolveRouteApiMode(route: AiPluginManifest["routes"][number]): string {
    const configuredMode = this.readRouteRequestConfigString(route.requestConfig, "apiMode");
    if (configuredMode) {
      return configuredMode;
    }
    return route.mode;
  }

  private readRouteRequestConfigString(
    requestConfig: Record<string, unknown> | undefined,
    key: string,
  ): string | null {
    const value = requestConfig?.[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }
}
