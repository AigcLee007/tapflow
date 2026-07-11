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
  test("requires the current revision to pass a route test before publish and rejects stale publishers", async () => {
    await withService(async ({ adminPool, service }) => {
      const draft = await service.saveDraft(context, builtInDraft("publish-guard"));

      await expect(service.publish(context, { routeId: draft.route.id, expectedRevision: 1 }))
        .rejects.toMatchObject({ code: "MODEL_CONFIGURATION_TEST_REQUIRED", statusCode: 409 });

      await adminPool.query(`UPDATE ai_routes SET tested_revision=configuration_revision,
        health_status='ok',last_health_checked_at=now() WHERE id=$1`, [draft.route.id]);
      await adminPool.query("UPDATE ai_provider_connections SET status='active' WHERE id=$1", [draft.connection.id]);
      await adminPool.query("UPDATE model_pricing SET active=true WHERE route=$1", [draft.route.key]);
      await expect(service.publish(context, { routeId: draft.route.id, expectedRevision: 99 }))
        .rejects.toMatchObject({ code: "MODEL_CONFIGURATION_CONFLICT", statusCode: 409 });

      const published = await service.publish(context, { routeId: draft.route.id, expectedRevision: 1 });
      expect(published.route).toMatchObject({ id: draft.route.id, status: "active", configurationRevision: 1, testedRevision: 1 });
      const state = await adminPool.query(`SELECT route.status,route.is_default,pricing.active,catalog.status AS catalog_status,
        catalog.default_route_key,install.status AS install_status FROM ai_routes route
        JOIN model_pricing pricing ON pricing.route=route.route_key
        JOIN ai_model_catalog catalog ON catalog.model_id=route.model_id
        JOIN tenant_ai_plugin_installs install ON install.id=route.plugin_install_id WHERE route.id=$1`, [draft.route.id]);
      expect(state.rows[0]).toMatchObject({ status: "active", is_default: true, active: true,
        catalog_status: "active", install_status: "published", default_route_key: draft.route.key });
    });
  });

  test("runtime changes invalidate certification and block publish until retested", async () => {
    await withService(async ({ adminPool, service }) => {
      const draft = await service.saveDraft(context, builtInDraft("retest"));
      await adminPool.query("UPDATE ai_routes SET tested_revision=configuration_revision WHERE id=$1", [draft.route.id]);
      const changed = await service.saveDraft(context, builtInDraft("ignored", {
        routeId: draft.route.id, expectedRevision: 1,
        connection: { mode: "existing", connectionId: draft.connection.id },
        credential: { mode: "existing", credentialId: draft.credential.id },
        route: { routeLabel: "Friendly only plus runtime", upstreamModel: "gemini-3-pro-image-preview", timeoutMs: 45000 },
      }));
      expect(changed.route).toMatchObject({ status: "inactive", configurationRevision: 2, testedRevision: null });
      await expect(service.publish(context, { routeId: draft.route.id, expectedRevision: 2 }))
        .rejects.toMatchObject({ code: "MODEL_CONFIGURATION_TEST_REQUIRED" });
    });
  });

  test.each([
    ["credential", "UPDATE api_credentials SET status='inactive' WHERE id=$1"],
    ["connection", "UPDATE ai_provider_connections SET status='inactive' WHERE id=$1"],
    ["upstream", "UPDATE ai_routes SET upstream_model=NULL WHERE id=$1"],
    ["pricing", "UPDATE model_pricing SET unit_credits=0 WHERE route=(SELECT route_key FROM ai_routes WHERE id=$1)"],
  ])("rejects incomplete publish when %s is unavailable", async (_case, sql) => {
    await withService(async ({ adminPool, service }) => {
      const draft = await service.saveDraft(context, builtInDraft(`incomplete-${_case}`));
      await adminPool.query("UPDATE ai_routes SET tested_revision=configuration_revision WHERE id=$1", [draft.route.id]);
      const target = _case === "credential" ? draft.credential.id : _case === "connection" ? draft.connection.id : draft.route.id;
      await adminPool.query(sql, [target]);
      const error = await service.publish(context, { routeId: draft.route.id, expectedRevision: 1 }).catch((value) => value);
      expect(error).toMatchObject({ code: "MODEL_CONFIGURATION_INCOMPLETE", statusCode: 400 });
      expect(JSON.stringify(error)).not.toContain(`secret-incomplete-${_case}`);
    });
  });

  test.each(["provider", "model", "catalog", "pricing-unit", "credential-provider", "connection-provider", "credential-scope", "connection-scope"])(
    "rejects incomplete publish for invalid %s linkage",
    async (invalid) => {
      await withService(async ({ adminPool, service }) => {
        const draft = await service.saveDraft(context, builtInDraft(`link-${invalid}`));
        await adminPool.query("UPDATE ai_routes SET tested_revision=configuration_revision WHERE id=$1", [draft.route.id]);
        await adminPool.query("UPDATE ai_provider_connections SET status='active' WHERE id=$1", [draft.connection.id]);
        await adminPool.query("UPDATE model_pricing SET active=true WHERE route=$1 AND unit='image_generation'", [draft.route.key]);
        if (invalid === "provider") await adminPool.query("UPDATE ai_providers SET status='inactive' WHERE id=(SELECT provider_id FROM ai_routes WHERE id=$1)", [draft.route.id]);
        if (invalid === "model") await adminPool.query("UPDATE ai_models SET status='inactive' WHERE id=$1", [draft.model.id]);
        if (invalid === "catalog") await adminPool.query("DELETE FROM ai_model_catalog WHERE id=$1", [draft.catalog.id]);
        if (invalid === "pricing-unit") await adminPool.query("UPDATE model_pricing SET unit='text_generation' WHERE route=$1", [draft.route.key]);
        if (invalid.includes("provider")) {
          const other = await adminPool.query<{ id: string }>("INSERT INTO ai_providers (key,name,kind,status) VALUES ($1,'Other','openai-compatible','active') RETURNING id::text", [`other-${invalid}`]);
          await adminPool.query(`UPDATE ${invalid.startsWith("credential") ? "api_credentials" : "ai_provider_connections"} SET provider_id=$2 WHERE id=$1`,
            [invalid.startsWith("credential") ? draft.credential.id : draft.connection.id, other.rows[0].id]);
        }
        if (invalid.includes("scope")) {
          const tenant = await adminPool.query<{ id: string }>("INSERT INTO tenants (name,slug) VALUES ($1,$2) RETURNING id::text", [`Tenant ${invalid}`, `tenant-${invalid}`]);
          await adminPool.query(`UPDATE ${invalid.startsWith("credential") ? "api_credentials" : "ai_provider_connections"} SET tenant_id=$2 WHERE id=$1`,
            [invalid.startsWith("credential") ? draft.credential.id : draft.connection.id, tenant.rows[0].id]);
        }
        await expect(service.publish(context, { routeId: draft.route.id, expectedRevision: 1 }))
          .rejects.toMatchObject({ code: "MODEL_CONFIGURATION_INCOMPLETE" });
      });
    },
  );

  test("publishing activates only exact records and preserves unrelated defaults", async () => {
    await withService(async ({ adminPool, service }) => {
      const unrelated = await service.saveDraft(context, builtInDraft("unrelated", {
        packageKey: "openai-compatible.gpt-image-2",
        route: { routeLabel: "Other model", upstreamModel: "gpt-image-2" },
      }));
      await adminPool.query("UPDATE ai_routes SET status='active',is_default=true,tested_revision=configuration_revision WHERE id=$1", [unrelated.route.id]);
      await adminPool.query("UPDATE ai_model_catalog SET status='active',default_route_key=$2 WHERE id=$1", [unrelated.catalog.id,unrelated.route.key]);
      const sameProduct = await service.saveDraft(context, builtInDraft("same-product"));
      await adminPool.query("UPDATE ai_routes SET status='active',is_default=true WHERE id=$1", [sameProduct.route.id]);
      const otherEnvironment = await service.saveDraft(context, builtInDraft("other-environment", {
        connection: { mode: "create", name: "Staging", baseUrl: "https://api.pixellelabs.com/", environment: "staging" },
      }));
      await adminPool.query("UPDATE ai_routes SET status='active',is_default=true WHERE id=$1", [otherEnvironment.route.id]);
      const draft = await service.saveDraft(context, builtInDraft("selected"));
      await adminPool.query("UPDATE ai_routes SET tested_revision=configuration_revision WHERE id=$1", [draft.route.id]);
      await adminPool.query("UPDATE ai_provider_connections SET status='active' WHERE id=$1", [draft.connection.id]);
      await adminPool.query("UPDATE model_pricing SET active=true WHERE route=$1 AND unit='image_generation'", [draft.route.key]);
      await adminPool.query(`INSERT INTO model_pricing (provider,model,route,unit,unit_credits,min_charge_credits,active)
        SELECT provider,model,route,'text_generation',2,2,false FROM model_pricing WHERE route=$1 AND unit='image_generation'`, [draft.route.key]);
      await service.publish(context, { routeId: draft.route.id, expectedRevision: 1 });
      const routes = await adminPool.query("SELECT id::text,status,is_default FROM ai_routes WHERE id=ANY($1::uuid[]) ORDER BY id",
        [[draft.route.id,sameProduct.route.id,otherEnvironment.route.id,unrelated.route.id]]);
      const byId = new Map(routes.rows.map((row) => [row.id,row]));
      expect(byId.get(draft.route.id)).toMatchObject({ status: "active", is_default: true });
      expect(byId.get(sameProduct.route.id)).toMatchObject({ status: "active", is_default: false });
      expect(byId.get(otherEnvironment.route.id)).toMatchObject({ status: "active", is_default: true });
      expect(byId.get(unrelated.route.id)).toMatchObject({ status: "active", is_default: true });
      const pricing = await adminPool.query("SELECT unit,active FROM model_pricing WHERE route=$1 ORDER BY unit", [draft.route.key]);
      expect(pricing.rows).toEqual([{ unit: "image_generation", active: true }, { unit: "text_generation", active: false }]);
      const records = await adminPool.query(`SELECT catalog.id::text AS catalog_id,catalog.status,catalog.default_route_key,
        install.id::text AS install_id,install.status AS install_status FROM ai_model_catalog catalog
        JOIN tenant_ai_plugin_installs install ON install.id=catalog.plugin_install_id WHERE catalog.id=$1`, [draft.catalog.id]);
      expect(records.rows[0]).toMatchObject({ catalog_id: draft.catalog.id, status: "active", default_route_key: draft.route.key,
        install_status: "published" });
      const unrelatedCatalog = await adminPool.query("SELECT status,default_route_key FROM ai_model_catalog WHERE id=$1", [unrelated.catalog.id]);
      expect(unrelatedCatalog.rows[0]).toMatchObject({ status: "active", default_route_key: unrelated.route.key });
    });
  });

  test("editing an active tested route deactivates route and pricing with submitted values", async () => {
    await withService(async ({ adminPool, service }) => {
      const first = await service.saveDraft(context, builtInDraft("edit-live"));
      await adminPool.query("UPDATE ai_routes SET status='active',tested_revision=configuration_revision WHERE id=$1", [first.route.id]);
      await adminPool.query("UPDATE model_pricing SET active=true,unit_credits=99,min_charge_credits=98,metadata='{\"live\":true}'::jsonb WHERE route=$1", [first.route.key]);
      const edited = await service.saveDraft(context, builtInDraft("edit-live-submit", {
        routeId: first.route.id, expectedRevision: 1,
        connection: { mode: "existing", connectionId: first.connection.id },
        credential: { mode: "existing", credentialId: first.credential.id },
        pricing: { unit: "image_generation", unitCredits: 7, minChargeCredits: 6 },
      }));
      expect(edited.route).toMatchObject({ status: "inactive", configurationRevision: 2, testedRevision: null });
      expect(edited.pricing).toMatchObject({ active: false, unitCredits: 7, minChargeCredits: 6 });
      const persisted = await adminPool.query(`SELECT route.status,route.tested_revision,pricing.active,
        pricing.unit_credits::text,pricing.min_charge_credits::text,pricing.metadata
        FROM ai_routes route JOIN model_pricing pricing ON pricing.route=route.route_key WHERE route.id=$1`, [first.route.id]);
      expect(persisted.rows[0]).toMatchObject({ status: "inactive", tested_revision: null, active: false,
        unit_credits: "7.0000", min_charge_credits: "6.0000", metadata: { configurationDraft: true } });
    });
  });

  test("rejects custom reuse of matching plugin-owned OpenAI model identity", async () => {
    await withService(async ({ service }) => {
      await service.saveDraft(context, builtInDraft("plugin-owned", {
        packageKey: "openai-compatible.gpt-image-2",
        route: { routeLabel: "Line one", upstreamModel: "gpt-image-2" },
      }));
      await expect(service.saveDraft(context, {
        connection: { mode: "create", name: "Plugin collision", baseUrl: "https://sub.siphonlab.cn/v1/", environment: "production" },
        credential: { mode: "create", name: "Plugin collision key", secret: "plugin-collision" },
        custom: { provider: { key: "openai-compatible", kind: "openai-compatible", name: "Same Kind" }, model: { displayName: "Same Model", modality: "image", modelFamily: "gpt-image-2", modelKey: "gpt-image-2" }, routeDefaults: {} },
        pricing: { unit: "image_generation", unitCredits: 1, minChargeCredits: 1 },
        route: { routeLabel: "Custom collision", upstreamModel: "gpt-image-2" },
      })).rejects.toMatchObject({ code: "CONFIGURATION_MODEL_IDENTITY_CONFLICT" });
    });
  });

  test("soft-deleted backup route keys remain occupied during line allocation", async () => {
    await withService(async ({ adminPool, service }) => {
      const first = await service.saveDraft(context, builtInDraft("soft-delete-one"));
      const second = await service.saveDraft(context, builtInDraft("soft-delete-two"));
      expect(second.route.key).toBe(`${first.route.key}.line2`);
      await adminPool.query("UPDATE ai_routes SET deleted_at=now() WHERE id=$1", [second.route.id]);
      const third = await service.saveDraft(context, builtInDraft("soft-delete-three"));
      expect(third.route.key).toBe(`${first.route.key}.line3`);
    });
  });

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
