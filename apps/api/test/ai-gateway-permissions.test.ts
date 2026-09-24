import Fastify from "fastify";
import { describe, expect, test, vi } from "vitest";
import { registerAiGatewayAdminRoutes } from "../src/modules/ai-gateway/ai-gateway.routes.js";
import { registerAiPluginAdminRoutes } from "../src/modules/ai-plugins/ai-plugins.routes.js";
import { registerAiModelConfigurationRoutes } from "../src/modules/ai-model-configurations/ai-model-configurations.routes.js";
import { registerAiRouteTestRoutes } from "../src/modules/ai-route-tests/ai-route-tests.routes.js";
import { AiGatewayAdminService } from "../src/modules/ai-gateway/ai-gateway.service.js";
import { AiRouteTestService } from "../src/modules/ai-route-tests/ai-route-tests.service.js";
import { AiPluginService } from "../src/modules/ai-plugins/ai-plugins.service.js";
import { AiModelConfigurationsService } from "../src/modules/ai-model-configurations/ai-model-configurations.service.js";
import { resolvePlatformCapabilities } from "../src/modules/platform-access/platform-access.policy.js";

const id = "11111111-1111-4111-8111-111111111111";
const context = (role: string) => ({
  permissions: resolvePlatformCapabilities(role), roles: [role], userId: id, tenantId: id, sessionId: id,
  isAuthenticated: true, requestId: "test", traceId: "test", ipHash: null, userAgent: null,
});
const reads = ["connections", "providers", "models", "routes", "pricing"].map((name) => `/api/v2/admin/ai/${name}`)
  .concat("/api/v2/admin/credentials");
const sensitive = [
  ["POST", "/api/v2/admin/ai/providers"], ["POST", "/api/v2/admin/ai/models"],
  ["POST", "/api/v2/admin/ai/connections"], ["PATCH", `/api/v2/admin/ai/connections/${id}`],
  ["DELETE", `/api/v2/admin/ai/connections/${id}`], ["POST", "/api/v2/admin/credentials"],
  ["PATCH", `/api/v2/admin/credentials/${id}`], ["DELETE", `/api/v2/admin/credentials/${id}`],
  ["POST", `/api/v2/admin/credentials/${id}/rotate`], ["POST", "/api/v2/admin/ai/routes"],
  ["POST", `/api/v2/admin/ai/routes/${id}/duplicate`], ["DELETE", `/api/v2/admin/ai/routes/${id}`],
  ["PATCH", "/api/v2/admin/ai/pricing"], ["POST", "/api/v2/admin/ai/model-configurations/draft"],
  ["POST", "/api/v2/admin/ai/model-configurations/publish"],
  ["POST", "/api/v2/admin/ai/plugins/example/install"], ["POST", `/api/v2/admin/ai/plugins/${id}/publish`],
  ["POST", `/api/v2/admin/ai/plugins/${id}/disable`],
] as const;

async function appFor(role: string, realGateway?: AiGatewayAdminService, tenantId: string | null = id) {
  const app = Fastify({ logger: false });
  app.addHook("onRequest", async (request) => { request.ctx = { ...context(role), tenantId }; });
  const gateway = realGateway ?? Object.fromEntries([
    "listProviderConnections", "listProviders", "listModels", "listRoutes", "listPricing", "listCredentials",
    "updateRoute", "setDefaultRoute",
  ].map((name) => [name, vi.fn(async () => [])]));
  app.decorate("aiGatewayService", gateway as never);
  app.decorate("aiRouteTestService", { testAdminDraftRoute: vi.fn(async () => ({ status: "ok" })) } as never);
  registerAiGatewayAdminRoutes(app);
  registerAiPluginAdminRoutes(app);
  registerAiModelConfigurationRoutes(app);
  registerAiRouteTestRoutes(app);
  return app;
}

describe("gateway platform capability guards", () => {
  test.each(reads)("operator can inspect %s", async (url) => {
    const app = await appFor("platform_operator");
    try { expect((await app.inject({ method: "GET", url })).statusCode).toBe(200); }
    finally { await app.close(); }
  });
  test.each(reads)("tenant administrator cannot inspect %s", async (url) => {
    const app = await appFor("tenant_admin");
    try { expect((await app.inject({ method: "GET", url })).statusCode).toBe(403); }
    finally { await app.close(); }
  });
  test.each(sensitive)("operator cannot use %s %s", async (method, url) => {
    const app = await appFor("platform_operator");
    try { expect((await app.inject({ method, url, payload: {} })).statusCode).toBe(403); }
    finally { await app.close(); }
  });
  test("operator can update friendly route properties and set default", async () => {
    const app = await appFor("platform_operator");
    try {
      expect((await app.inject({ method: "PATCH", url: `/api/v2/admin/ai/routes/${id}`, payload: { routeLabel: "线路二", priority: 1, weight: 20 } })).statusCode).toBe(200);
      expect((await app.inject({ method: "POST", url: `/api/v2/admin/ai/routes/${id}/set-default` })).statusCode).toBe(200);
    } finally { await app.close(); }
  });
  test("super administrator retains sensitive route access", async () => {
    const app = await appFor("platform_super_admin");
    try {
      expect((await app.inject({ method: "PATCH", url: `/api/v2/admin/ai/routes/${id}`, payload: { requestConfig: { timeoutMs: 2000 } } })).statusCode).toBe(200);
    } finally { await app.close(); }
  });
  test("rejects provider secrets embedded in route requestConfig", async () => {
    const app = await appFor("platform_super_admin");
    try {
      const response = await app.inject({
        method: "PATCH",
        url: `/api/v2/admin/ai/routes/${id}`,
        payload: { requestConfig: { headers: { Authorization: "unsafe", nested: { apiKey: "also-unsafe" } } } },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
      expect(response.body).not.toContain("unsafe");
    } finally { await app.close(); }
  });
  test("operators can test existing bindings but cannot override model or metadata", async () => {
    const app = await appFor("platform_operator");
    try {
      expect((await app.inject({ method: "POST", url: `/api/v2/admin/ai/routes/${id}/test`, payload: { prompt: "Test" } })).statusCode).toBe(200);
    } finally { await app.close(); }
  });
  test("operator can test an existing route without a selected creator workspace", async () => {
    const app = await appFor("platform_operator", undefined, null);
    try {
      expect((await app.inject({ method: "POST", url: `/api/v2/admin/ai/routes/${id}/test`, payload: { prompt: "Test" } })).statusCode).toBe(200);
    } finally { await app.close(); }
  });
});

const prohibited = {
  credentialId: id, connectionId: id, modelId: id, upstreamModel: "another", apiMode: "async",
  requestPath: "/other", baseUrlOverride: "https://example.com", pricing: { unitCredits: 1 },
  requestConfig: { headers: { Authorization: "unsafe" } }, rateLimit: {}, fallbackGroup: "other",
  internalLabel: "private", adminNotes: "private", metadata: { upstreamModel: "another" },
};

describe("gateway route service boundary", () => {
  test("sensitive service methods reject operators before DB access", async () => {
    const connect = vi.fn(async () => { throw new Error("must not connect"); });
    const query = vi.fn(async () => { throw new Error("must not query"); });
    const options = { credentialVault: {}, pool: { connect, query } } as never;
    const service = new AiGatewayAdminService(options);
    const plugins = new AiPluginService(options);
    const configurations = new AiModelConfigurationsService(options);
    const operator = context("platform_operator");
    const operations = [
      () => service.createProvider(operator, {} as never), () => service.createModel(operator, {} as never),
      () => service.createProviderConnection(operator, {} as never), () => service.updateProviderConnection(operator, id, {}),
      () => service.deleteProviderConnection(operator, id), () => service.createCredential(operator, {} as never),
      () => service.updateCredential(operator, id, {}), () => service.rotateCredential(operator, id, "secret"),
      () => service.deleteCredential(operator, id), () => service.createRoute(operator, {} as never),
      () => service.duplicateRoute(operator, id, {}), () => service.deleteRoute(operator, id),
      () => service.upsertPricing(operator, {} as never), () => plugins.installPlugin(operator, "example", {}),
      () => plugins.publishInstall(operator, id), () => plugins.disableInstall(operator, id),
      () => configurations.saveDraft(operator, {} as never), () => configurations.publish(operator, {} as never),
    ];
    for (const run of operations) await expect(run()).rejects.toMatchObject({ statusCode: 403 });
    expect(connect).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });
  test.each(["model", "metadata"])("operator route tests reject %s overrides before DB/runtime access", async (field) => {
    const connect = vi.fn(async () => { throw new Error("must not connect"); });
    const service = new AiRouteTestService({ credentialVault: {}, pool: { connect } } as never);
    await expect(service.testAdminDraftRoute(context("platform_operator"), id, { [field]: field === "model" ? "other" : {} }))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(connect).not.toHaveBeenCalled();
  });
  test.each(Object.entries(prohibited))("rejects operator %s changes before DB access", async (field, value) => {
    const connect = vi.fn(async () => { throw new Error("must not connect"); });
    const service = new AiGatewayAdminService({ credentialVault: {}, pool: { connect } } as never);
    await expect(service.updateRoute(context("platform_operator"), id, { routeLabel: "Allowed", [field]: value } as never))
      .rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect(connect).not.toHaveBeenCalled();
  });
  test("registered route rejects unknown metadata instead of silently dropping it", async () => {
    const connect = vi.fn(async () => { throw new Error("must not connect"); });
    const service = new AiGatewayAdminService({ credentialVault: {}, pool: { connect } } as never);
    const app = await appFor("platform_operator", service);
    try {
      const result = await app.inject({ method: "PATCH", url: `/api/v2/admin/ai/routes/${id}`, payload: { routeLabel: "Allowed", metadata: { model: "another" } } });
      expect(result.statusCode).toBe(400);
      expect(connect).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });
  test("missing capabilities cannot reach route service mutations", async () => {
    const connect = vi.fn(async () => { throw new Error("must not connect"); });
    const service = new AiGatewayAdminService({ credentialVault: {}, pool: { connect } } as never);
    await expect(service.updateRoute(context("tenant_admin"), id, { routeLabel: "Label" })).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.setDefaultRoute(context("tenant_admin"), id)).rejects.toMatchObject({ statusCode: 403 });
    expect(connect).not.toHaveBeenCalled();
  });
});

function dataHarness(overrides = {}, auditFailure = false) {
  const route = {
    id, tenant_id: null, provider_id: id, model_id: null, plugin_install_id: null, credential_id: id,
    connection_id: id, configuration_revision: 4, tested_revision: 4, route_key: "image.route", route_label: "线路一",
    modality: "image", model_family: "family", environment: "production", priority: 100, weight: 100,
    fallback_group: null, base_url_override: null, upstream_model: "upstream", api_mode: "sync",
    request_path: "/generate", internal_label: "internal", admin_notes: "notes", is_default: false,
    health_status: "ok", last_health_checked_at: null, deleted_at: null,
    request_config: { headers: { Authorization: "SECRET" } }, pricing: { cost: 1 }, rate_limit: {},
    status: "active", created_at: "now", updated_at: "now", ...overrides,
  };
  const query = vi.fn(async (sql: string, args?: unknown[]) => {
    if (sql.includes("app.current_platform_role()")) return { rows: [{ role_key: "platform_operator" }] };
    if (sql.includes("INSERT INTO audit_logs")) {
      if (auditFailure) throw new Error("audit unavailable");
      return { rows: [{ id, tenant_id: id, actor_type: "user", action: "ai.route.operate", resource_type: "ai_route", created_at: "now" }] };
    }
    if (sql.includes("UPDATE ai_routes SET route_label") && args) {
      Object.assign(route, { route_label: args[1], status: args[2], priority: args[3], weight: args[4], is_default: args[5] });
      return { rows: [] };
    }
    if (sql.includes("FROM model_pricing")) return { rows: [
      { active: true, provider: "provider", model: "model", route: "route", unit: "image_generation", unit_credits: "12", min_charge_credits: "12", metadata: { providerCost: "PRIVATE" }, created_at: "now" },
      { active: false, provider: "provider", model: "model", route: "draft", unit: "image_generation", unit_credits: "99", min_charge_credits: "99", metadata: {}, created_at: "now" },
    ] };
    if (sql.includes("FROM api_credentials")) return { rows: [{ id, provider_id: id, name: "key", status: "active", created_at: "now", last_used_at: null, rotated_at: null, encrypted_secret: "CIPHER", nonce: "NONCE", auth_tag: "TAG" }] };
    if (sql.includes("FROM ai_provider_connections")) return { rows: [{ ...route, metadata: { headers: { Authorization: "SECRET" } } }] };
    if (sql.includes("FROM ai_routes") || sql.includes("UPDATE ai_routes")) return { rows: [{ ...route }] };
    return { rows: [] };
  });
  const vault = { getSecretForProviderCall: vi.fn(() => { throw new Error("Must not decrypt for inspection"); }) };
  const pool = { connect: vi.fn(async () => ({ query, release: vi.fn() })), query };
  return { service: new AiGatewayAdminService({ credentialVault: vault, pool } as never), query, pool, vault };
}

describe("operator gateway safe data", () => {
  test("operational updates only write permitted columns, preserving sensitive bindings byte for byte", async () => {
    const { service, query } = dataHarness();
    const result = await service.updateRoute(context("platform_operator"), id, { routeLabel: "线路二", priority: 1, weight: 20 });
    const updates = query.mock.calls.map(([sql]) => sql).filter((sql) => sql.includes("UPDATE ai_routes"));
    expect(updates).toHaveLength(1);
    const set = updates[0].split("SET")[1].split("WHERE")[0];
    for (const column of ["credential_id", "connection_id", "model_id", "model_family", "environment", "request_config", "pricing", "upstream_model", "api_mode", "request_path"]) expect(set).not.toContain(column);
    expect(result.requestConfig).toEqual({});
    expect(result.pricing).toEqual({});
    expect(result).toMatchObject({ routeLabel: "线路二", priority: 1, weight: 20 });
    expect(query.mock.calls.some(([sql]) => sql.includes("FROM ai_routes") && sql.includes("FOR UPDATE"))).toBe(true);
    expect(query.mock.calls.filter(([sql]) => sql.includes("is_system_admin")).every(([, args]) => args?.[0] === "false")).toBe(true);
    const audit = query.mock.calls.find(([sql]) => sql.includes("INSERT INTO audit_logs"));
    expect(JSON.parse(String(audit?.[1]?.[10]))).toMatchObject({
      before: { routeLabel: "线路一", priority: 100, weight: 100 },
      after: { routeLabel: "线路二", priority: 1, weight: 20 },
    });
  });
  test("failed operational audit rolls back the route mutation", async () => {
    const { service, query } = dataHarness({}, true);
    await expect(service.updateRoute(context("platform_operator"), id, { routeLabel: "线路二" })).rejects.toThrow("audit unavailable");
    expect(query.mock.calls.some(([sql]) => sql === "ROLLBACK")).toBe(true);
    expect(query.mock.calls.some(([sql]) => sql === "COMMIT")).toBe(false);
  });
  test("a tested route can be reactivated without rewriting its binding", async () => {
    const { service } = dataHarness({ status: "inactive" });
    expect(await service.updateRoute(context("platform_operator"), id, { status: "active" })).toMatchObject({ status: "active" });
  });
  test("operator cannot reactivate an untested configuration", async () => {
    const { service } = dataHarness({ status: "inactive", tested_revision: null });
    await expect(service.updateRoute(context("platform_operator"), id, { status: "active" })).rejects.toMatchObject({ statusCode: 409, code: "ROUTE_TEST_REQUIRED" });
  });
  test("operator cannot choose an untested default", async () => {
    const { service } = dataHarness({ tested_revision: null });
    await expect(service.setDefaultRoute(context("platform_operator"), id)).rejects.toMatchObject({ statusCode: 409, code: "ROUTE_TEST_REQUIRED" });
  });
  test("operator inspection excludes route configuration, route costs, and connection metadata", async () => {
    const { service } = dataHarness();
    const routes = await service.listRoutes(context("platform_operator"));
    const connections = await service.listProviderConnections(context("platform_operator"));
    expect(routes[0].requestConfig).toEqual({});
    expect(routes[0].pricing).toEqual({});
    expect(connections[0].metadata).toEqual({});
    expect(JSON.stringify({ routes, connections })).not.toContain("SECRET");
  });
  test("operator receives published prices without private cost metadata", async () => {
    const { service, query } = dataHarness();
    const prices = await service.listPricing(context("platform_operator"), {});
    expect(prices).toHaveLength(1);
    expect(prices[0]).toMatchObject({ unitCredits: 12, metadata: {} });
    const sql = query.mock.calls.map(([sql]) => sql).find((sql) => sql.includes("FROM model_pricing"));
    expect(sql).toContain("mp.active = true");
    expect(query.mock.calls).toContainEqual(["SELECT set_config('app.platform_scope', $1, true)", ["platform:routes:read"]]);
    expect(JSON.stringify(prices)).not.toContain("PRIVATE");
  });
  test("credential inspection never loads or decrypts encrypted material", async () => {
    const { service, vault, query } = dataHarness();
    const result = await service.listCredentials(context("platform_operator"));
    expect(result).toEqual([expect.objectContaining({ id, maskedSecret: "••••••••" })]);
    expect(vault.getSecretForProviderCall).not.toHaveBeenCalled();
    const sql = query.mock.calls.map(([sql]) => sql).find((sql) => sql.includes("FROM api_credentials"));
    for (const column of ["encrypted_secret", "nonce", "auth_tag"]) expect(sql).not.toContain(column);
    expect(JSON.stringify(result)).not.toContain("CIPHER");
  });
});
