import { afterAll, describe, expect, test } from "vitest";
import { AiPluginRegistry, builtinAiPluginRegistry, CredentialVault } from "@aigc-flow/ai-gateway-core";
import { openAiGptImage2Manifest } from "../../../packages/ai-gateway-core/src/plugins/manifests/openai-gpt-image-2.js";
import { createPgPool } from "@aigc-flow/db";
import { runMigrations } from "../../../packages/db/src/migrator.js";
import { hasDatabaseEnv, withDatabase } from "../../../packages/db/test/helpers.js";

import {
  AiModelConfigurationApiError,
  AiModelConfigurationsService,
} from "../src/modules/ai-model-configurations/ai-model-configurations.service.js";

const originalDatabaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = hasDatabaseEnv() ? describe : describe.skip;
const context = { tenantId: "00000000-0000-0000-0000-000000000001", userId: null };

afterAll(() => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
});

function builtInDraft(suffix: string, overrides: Record<string, unknown> = {}) {
  return {
    packageKey: "pixellelabs.nano-banana-pro",
    connection: { mode: "create", name: `Connection ${suffix}`, baseUrl: "https://api.pixellelabs.com/", environment: "production" },
    credential: { mode: "create", name: `Credential ${suffix}`, secret: `secret-${suffix}` },
    pricing: { unit: "image_generation", unitCredits: 4, minChargeCredits: 4 },
    route: { routeLabel: `Line ${suffix}`, upstreamModel: "gemini-3-pro-image-preview" },
    ...overrides,
  } as never;
}

function resolveBuiltIn(input: ReturnType<typeof builtInDraft>, registry = builtinAiPluginRegistry) {
  const service = new AiModelConfigurationsService({ credentialVault: {} as never, pluginRegistry: registry, pool: {} as never });
  return (service as unknown as { resolveDefinition(value: typeof input): { model: { modelKey: string }; routeDefaults: { requestPath?: string } } }).resolveDefinition(input);
}

async function withService(run: (args: {
  adminPool: ReturnType<typeof createPgPool>;
  service: AiModelConfigurationsService;
}) => Promise<void>) {
  await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
    process.env.DATABASE_URL = databaseUrl;
    const adminPool = createPgPool();
    let appPool = createPgPool();
    try {
      await runMigrations(adminPool);
      appPool = createPgPool({ connectionString: await createAppDatabaseUrl() });
      const service = new AiModelConfigurationsService({
        credentialVault: new CredentialVault({ masterKey: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=" }),
        pluginRegistry: builtinAiPluginRegistry,
        pool: appPool,
      });
      await run({ adminPool, service });
    } finally {
      await appPool.end();
      await adminPool.end();
    }
  });
}

describe("AiModelConfigurationsService", () => {
  test("exposes stable service error details without leaking input secrets", () => {
    const error = new AiModelConfigurationApiError(
      409,
      "MODEL_CONFIGURATION_CONFLICT",
      "Model configuration changed",
    );

    expect(error).toMatchObject({
      code: "MODEL_CONFIGURATION_CONFLICT",
      message: "Model configuration changed",
      statusCode: 409,
    });
    expect(JSON.stringify(error)).not.toContain("secret");
  });

  test("rejects missing positive pricing before opening a transaction", async () => {
    const service = new AiModelConfigurationsService({
      credentialVault: {} as never,
      pluginRegistry: {} as never,
      pool: {
        connect() {
          throw new Error("transaction must not start");
        },
      } as never,
    });

    await expect(service.saveDraft(
      { tenantId: "00000000-0000-0000-0000-000000000001", userId: null },
      {
        packageKey: "pixellelabs.nano-banana-pro",
        connection: { mode: "existing", connectionId: "00000000-0000-0000-0000-000000000002" },
        credential: { mode: "existing", credentialId: "00000000-0000-0000-0000-000000000003" },
        pricing: { unit: "image_generation", unitCredits: 0, minChargeCredits: 0 },
        route: { routeLabel: "Line one", upstreamModel: "gemini-3-pro-image-preview" },
      } as never,
    )).rejects.toMatchObject({ code: "CONFIGURATION_PRICING_REQUIRED", statusCode: 400 });
  });

  test("rejects an unsupported built-in upstream model before persistence", async () => {
    const service = new AiModelConfigurationsService({
      credentialVault: {} as never,
      pluginRegistry: builtinAiPluginRegistry,
      pool: { connect() { throw new Error("transaction must not start"); } } as never,
    });
    await expect(service.saveDraft(
      { tenantId: "00000000-0000-0000-0000-000000000001", userId: null },
      {
        packageKey: "pixellelabs.nano-banana-pro",
        connection: { mode: "existing", connectionId: "00000000-0000-0000-0000-000000000002" },
        credential: { mode: "existing", credentialId: "00000000-0000-0000-0000-000000000003" },
        pricing: { unit: "image_generation", unitCredits: 4, minChargeCredits: 4 },
        route: { routeLabel: "Line one", upstreamModel: "unsupported-model" },
      },
    )).rejects.toMatchObject({ code: "CONFIGURATION_UPSTREAM_MODEL_UNSUPPORTED", statusCode: 400 });
  });

  test("selects GPT-Image-2 line two for upstream gpt-5.5", () => {
    const resolved = resolveBuiltIn({
      ...builtInDraft("line-two"),
      packageKey: "openai-compatible.gpt-image-2",
      route: { routeLabel: "Line two", upstreamModel: "gpt-5.5" },
    } as never);
    expect(resolved).toMatchObject({ model: { modelKey: "gpt-image-2" }, routeDefaults: { requestPath: "/responses" } });
  });

  test("selects GPT-Image-2 line one for upstream gpt-image-2", () => {
    const resolved = resolveBuiltIn({
      ...builtInDraft("line-one"),
      packageKey: "openai-compatible.gpt-image-2",
      route: { routeLabel: "Line one", upstreamModel: "gpt-image-2" },
    } as never);
    expect(resolved.routeDefaults.requestPath).toBe("/images/generations");
  });

  test("uses explicit routeKey to disambiguate routes sharing a product model", () => {
    const resolved = resolveBuiltIn({
      ...builtInDraft("explicit"),
      packageKey: "openai-compatible.gpt-image-2",
      route: { routeKey: "image.gpt-image-2.line2", routeLabel: "Line two", upstreamModel: "gpt-5.5" },
    } as never);
    expect(resolved.routeDefaults.requestPath).toBe("/responses");
  });

  test("rejects ambiguous compatible built-in routes without routeKey", () => {
    const ambiguousManifest = {
      ...openAiGptImage2Manifest,
      packageKey: "test.ambiguous-gpt-image-2",
      routes: [
        ...openAiGptImage2Manifest.routes,
        { ...openAiGptImage2Manifest.routes[0], routeKey: "test.ambiguous.two" },
      ],
    };
    const registry = new AiPluginRegistry([ambiguousManifest]);
    expect(() => resolveBuiltIn({
      ...builtInDraft("ambiguous"),
      packageKey: ambiguousManifest.packageKey,
      route: { routeLabel: "Ambiguous", upstreamModel: "gpt-image-2" },
    } as never, registry)).toThrowError(expect.objectContaining({ code: "CONFIGURATION_ROUTE_AMBIGUOUS" }));
  });
});

describeWithDatabase("AiModelConfigurationsService database drafts", () => {
  test("preserves published install active catalog route and pricing when adding a backup draft", async () => {
    await withService(async ({ adminPool, service }) => {
      const live = await service.saveDraft(context, builtInDraft("live"));
      await adminPool.query("UPDATE tenant_ai_plugin_installs SET status='published' WHERE id=(SELECT plugin_install_id FROM ai_routes WHERE id=$1)", [live.route.id]);
      await adminPool.query("UPDATE ai_model_catalog SET status='active',default_route_key='legacy.default',sort_order=999 WHERE id=$1", [live.catalog.id]);
      await adminPool.query("UPDATE ai_routes SET status='active' WHERE id=$1", [live.route.id]);
      await adminPool.query("UPDATE model_pricing SET active=true,unit_credits=9 WHERE route=$1", [live.route.key]);

      const backup = await service.saveDraft(context, builtInDraft("backup"));
      expect(backup.route.key).toBe(`${live.route.key}.line2`);
      const state = await adminPool.query(`SELECT install.status AS install_status,catalog.status AS catalog_status,
        catalog.default_route_key,catalog.sort_order,route.status AS route_status,pricing.active,pricing.unit_credits::text
        FROM ai_routes route JOIN tenant_ai_plugin_installs install ON install.id=route.plugin_install_id
        JOIN ai_model_catalog catalog ON catalog.model_id=route.model_id
        JOIN model_pricing pricing ON pricing.route=route.route_key WHERE route.id=$1`, [live.route.id]);
      expect(state.rows[0]).toMatchObject({ install_status: "published", catalog_status: "active", route_status: "active", active: true, unit_credits: "9.0000" });
      expect(state.rows[0].default_route_key).toBe("image.pixellelabs.nano-banana-pro");
      expect(state.rows[0].sort_order).toBe(10);
      const backupPricing = await adminPool.query("SELECT active FROM model_pricing WHERE route=$1", [backup.route.key]);
      expect(backupPricing.rows[0].active).toBe(false);
    });
  });

  test("rejects custom provider and model identity collisions without overwriting built-ins", async () => {
    await withService(async ({ adminPool, service }) => {
      await service.saveDraft(context, builtInDraft("identity-seed"));
      await expect(service.saveDraft(context, {
        connection: { mode: "create", name: "Collision", baseUrl: "https://evil.example/", environment: "production" },
        credential: { mode: "create", name: "Collision key", secret: "collision-secret" },
        custom: { provider: { key: "pixellelabs", kind: "openai-compatible", name: "Replacement" }, model: { displayName: "Replacement", modality: "text", modelFamily: "replacement", modelKey: "gemini-3-pro-image-preview" }, routeDefaults: {} },
        pricing: { unit: "text_generation", unitCredits: 1, minChargeCredits: 1 },
        route: { routeLabel: "Collision", upstreamModel: "gemini-3-pro-image-preview" },
      })).rejects.toMatchObject({ code: "CONFIGURATION_PROVIDER_IDENTITY_CONFLICT" });
      const provider = await adminPool.query("SELECT kind,default_base_url FROM ai_providers WHERE key='pixellelabs'");
      expect(provider.rows[0]).toMatchObject({ kind: "pixellelabs-gemini-image", default_base_url: "https://api.pixellelabs.com" });
    });
  });

  test("rejects an incompatible custom model identity on a compatible provider", async () => {
    await withService(async ({ service }) => {
      const base = {
        connection: { mode: "create" as const, name: "Custom identity one", baseUrl: "https://custom.example/", environment: "production" },
        credential: { mode: "create" as const, name: "Custom identity key one", secret: "custom-one" },
        custom: { provider: { key: "custom-identity", kind: "openai-compatible" as const, name: "Custom Identity" }, model: { displayName: "Shared", modality: "image" as const, modelFamily: "image-family", modelKey: "shared-model" }, routeDefaults: {} },
        pricing: { unit: "image_generation" as const, unitCredits: 1, minChargeCredits: 1 },
        route: { routeLabel: "Custom one", upstreamModel: "shared-model" },
      };
      await service.saveDraft(context, base);
      await expect(service.saveDraft(context, {
        ...base,
        connection: { ...base.connection, name: "Custom identity two" },
        credential: { ...base.credential, name: "Custom identity key two" },
        custom: { ...base.custom, model: { ...base.custom.model, modality: "text", modelFamily: "text-family" } },
        pricing: { unit: "text_generation", unitCredits: 1, minChargeCredits: 1 },
      })).rejects.toMatchObject({ code: "CONFIGURATION_MODEL_IDENTITY_CONFLICT" });
    });
  });

  test("persists updated pricing JSON and selected connection environment", async () => {
    await withService(async ({ adminPool, service }) => {
      const first = await service.saveDraft(context, builtInDraft("environment", {
        connection: { mode: "create", name: "Staging connection", baseUrl: "https://api.pixellelabs.com/", environment: "staging" },
      }));
      const updated = await service.saveDraft(context, builtInDraft("environment-update", {
        routeId: first.route.id, expectedRevision: 1,
        connection: { mode: "existing", connectionId: first.connection.id },
        credential: { mode: "existing", credentialId: first.credential.id },
        pricing: { unit: "image_generation", unitCredits: 7, minChargeCredits: 6 },
      }));
      const row = await adminPool.query("SELECT environment,pricing FROM ai_routes WHERE id=$1", [updated.route.id]);
      expect(row.rows[0]).toMatchObject({ environment: "staging", pricing: { unitCredits: 7, minChargeCredits: 6, unit: "image_generation" } });
    });
  });

  test("allocates deterministic unique line keys for repeated same-line drafts", async () => {
    await withService(async ({ service }) => {
      const first = await service.saveDraft(context, builtInDraft("same-line-one"));
      const second = await service.saveDraft(context, builtInDraft("same-line-two"));
      const third = await service.saveDraft(context, builtInDraft("same-line-three"));
      expect([first.route.key, second.route.key, third.route.key]).toEqual([
        "image.pixellelabs.nano-banana-pro",
        "image.pixellelabs.nano-banana-pro.line2",
        "image.pixellelabs.nano-banana-pro.line3",
      ]);
    });
  });

  test("built-in draft creates complete inactive records and returns a sanitized nested view", async () => {
    await withService(async ({ adminPool, service }) => {
      const draft = await service.saveDraft(context, builtInDraft("complete"));
      expect(draft.route).toMatchObject({ status: "inactive", configurationRevision: 1, testedRevision: null });
      expect(draft.route.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(JSON.stringify(draft)).not.toContain("secret-complete");
      expect(draft.credential.secretFingerprint).toHaveLength(64);
      for (const table of ["ai_providers", "ai_models", "ai_plugin_packages", "tenant_ai_plugin_installs", "ai_model_catalog", "ai_provider_connections", "api_credentials", "ai_routes", "model_pricing"]) {
        const result = await adminPool.query(`SELECT count(*)::int AS count FROM ${table}`);
        expect(result.rows[0].count, table).toBeGreaterThan(0);
      }
      expect(draft.pricing.active).toBe(false);
    });
  });

  test("same provider routes can create distinct credentials", async () => {
    await withService(async ({ service }) => {
      const first = await service.saveDraft(context, builtInDraft("distinct-a", {
        packageKey: "openai-compatible.gpt-image-2",
        route: { routeLabel: "Line one", upstreamModel: "gpt-image-2" },
      }));
      const second = await service.saveDraft(context, builtInDraft("distinct-b", {
        packageKey: "openai-compatible.gpt-image-2",
        route: { routeLabel: "Line two", upstreamModel: "gpt-5.5" },
      }));
      expect(first.credential.id).not.toBe(second.credential.id);
      expect(first.route.id).not.toBe(second.route.id);
    });
  });

  test("multiple routes can explicitly share one existing credential", async () => {
    await withService(async ({ service }) => {
      const first = await service.saveDraft(context, builtInDraft("shared-a", {
        packageKey: "openai-compatible.gpt-image-2",
        route: { routeLabel: "Line one", upstreamModel: "gpt-image-2" },
      }));
      const second = await service.saveDraft(context, builtInDraft("shared-b", {
        packageKey: "openai-compatible.gpt-image-2",
        credential: { mode: "existing", credentialId: first.credential.id },
        route: { routeLabel: "Line two", upstreamModel: "gpt-5.5" },
      }));
      expect(second.credential.id).toBe(first.credential.id);
    });
  });

  test("rejects a credential whose provider does not match the selected model", async () => {
    await withService(async ({ service }) => {
      const custom = await service.saveDraft(context, {
        connection: { mode: "create", name: "Other connection", baseUrl: "https://example.com/", environment: "production" },
        credential: { mode: "create", name: "Other credential", secret: "other-secret" },
        custom: { provider: { key: "other-provider", kind: "openai-compatible", name: "Other" }, model: { displayName: "Other", modality: "image", modelFamily: "other", modelKey: "other-model" }, routeDefaults: {} },
        pricing: { unit: "image_generation", unitCredits: 1, minChargeCredits: 1 },
        route: { routeLabel: "Other", upstreamModel: "other-model" },
      });
      await expect(service.saveDraft(context, builtInDraft("provider-mismatch", {
        credential: { mode: "existing", credentialId: custom.credential.id },
      }))).rejects.toMatchObject({ code: "CONFIGURATION_CREDENTIAL_PROVIDER_MISMATCH" });
    });
  });

  test("rejects tenant-scoped connection or credential for a platform route", async () => {
    await withService(async ({ adminPool, service }) => {
      await service.saveDraft(context, builtInDraft("scope-seed"));
      const tenant = await adminPool.query<{ id: string }>("INSERT INTO tenants (name,slug) VALUES ('Scoped','scoped') RETURNING id::text");
      const provider = await adminPool.query<{ id: string }>("SELECT id::text FROM ai_providers WHERE key='pixellelabs'");
      const encrypted = new CredentialVault({ masterKey: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=" }).createCredential("tenant-secret");
      const credential = await adminPool.query<{ id: string }>(`INSERT INTO api_credentials
        (tenant_id,provider_id,name,encrypted_secret,nonce,auth_tag,key_version,secret_fingerprint,status)
        VALUES ($1,$2,'Tenant key',$3,$4,$5,$6,$7,'active') RETURNING id::text`,
        [tenant.rows[0].id,provider.rows[0].id,encrypted.encryptedSecret,encrypted.nonce,encrypted.authTag,encrypted.keyVersion,encrypted.secretFingerprint]);
      await expect(service.saveDraft({ tenantId: tenant.rows[0].id, userId: null }, builtInDraft("scope", {
        credential: { mode: "existing", credentialId: credential.rows[0].id },
      }))).rejects.toMatchObject({ code: "CONFIGURATION_SCOPE_MISMATCH" });
    });
  });

  test("rejects an inactive credential", async () => {
    await withService(async ({ adminPool, service }) => {
      const first = await service.saveDraft(context, builtInDraft("inactive-source"));
      await adminPool.query("UPDATE api_credentials SET status='inactive' WHERE id=$1", [first.credential.id]);
      await expect(service.saveDraft(context, builtInDraft("inactive-target", {
        credential: { mode: "existing", credentialId: first.credential.id },
      }))).rejects.toMatchObject({ code: "CONFIGURATION_CREDENTIAL_INACTIVE" });
    });
  });

  test("rolls back all partial records when downstream pricing persistence fails", async () => {
    await withService(async ({ adminPool, service }) => {
      await expect(service.saveDraft(context, builtInDraft("atomic", {
        pricing: { unit: "image_generation", unitCredits: 1e30, minChargeCredits: 1e30 },
      }))).rejects.toBeTruthy();
      const provider = await adminPool.query("SELECT id FROM ai_providers WHERE key='pixellelabs'");
      const credential = await adminPool.query("SELECT id FROM api_credentials WHERE name='Credential atomic'");
      const connection = await adminPool.query("SELECT id FROM ai_provider_connections WHERE name='Connection atomic'");
      expect(provider.rowCount).toBe(0);
      expect(credential.rowCount).toBe(0);
      expect(connection.rowCount).toBe(0);
    });
  });

  test("matching update increments revision and clears tested revision while stale update conflicts", async () => {
    await withService(async ({ adminPool, service }) => {
      const first = await service.saveDraft(context, builtInDraft("revision"));
      await adminPool.query("UPDATE ai_routes SET tested_revision=1 WHERE id=$1", [first.route.id]);
      const updated = await service.saveDraft(context, builtInDraft("ignored", {
        routeId: first.route.id,
        expectedRevision: 1,
        connection: { mode: "existing", connectionId: first.connection.id },
        credential: { mode: "existing", credentialId: first.credential.id },
        route: { routeLabel: "Updated line", upstreamModel: "gemini-3-pro-image-preview", timeoutMs: 12345 },
      }));
      expect(updated.route).toMatchObject({ id: first.route.id, key: first.route.key, configurationRevision: 2, testedRevision: null });
      await expect(service.saveDraft(context, builtInDraft("stale", {
        routeId: first.route.id, expectedRevision: 1,
        connection: { mode: "existing", connectionId: first.connection.id },
        credential: { mode: "existing", credentialId: first.credential.id },
      }))).rejects.toMatchObject({ code: "MODEL_CONFIGURATION_CONFLICT" });
    });
  });
});
