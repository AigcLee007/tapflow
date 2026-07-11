import { describe, expect, test, vi } from "vitest";

import { AiGatewayAdminService } from "../src/modules/ai-gateway/ai-gateway.service.js";

const routeId = "44444444-4444-4444-4444-444444444444";
const providerId = "33333333-3333-3333-3333-333333333333";
const modelId = "55555555-5555-5555-5555-555555555555";
const credentialId = "22222222-2222-2222-2222-222222222222";
const connectionId = "66666666-6666-6666-6666-666666666666";

function routeUpdateHarness() {
  let updateArgs: unknown[] = [];
  const existing = {
    id: routeId, tenant_id: null, provider_id: providerId, model_id: null, plugin_install_id: null,
    credential_id: null, connection_id: null, configuration_revision: 4, tested_revision: 4,
    route_key: "image.route", route_label: "Line", modality: "image", model_family: "family",
    environment: "production", priority: 100, weight: 100, fallback_group: null, base_url_override: null,
    upstream_model: "upstream", api_mode: "sync", request_path: "/generate", internal_label: null,
    admin_notes: null, is_default: false, health_status: "ok", last_health_checked_at: null,
    deleted_at: null, request_config: { path: "/generate", model: "upstream", apiMode: "sync" },
    pricing: { unitCredits: 4 }, rate_limit: {}, status: "active", created_at: "now", updated_at: "now",
  };
  const client = {
    query: vi.fn(async (sql: string, args?: unknown[]) => {
      if (sql.includes("FROM ai_routes") && sql.includes("WHERE id = $1::uuid")) return { rows: [existing] };
      if (sql.includes("FROM ai_models")) return { rows: [{ id: modelId, provider_id: providerId, model_key: "new-family", modality: "image" }] };
      if (sql.includes("FROM api_credentials")) return { rows: [{ id: credentialId }] };
      if (sql.includes("FROM ai_provider_connections")) return { rows: [{
        id: connectionId, tenant_id: null, provider_id: providerId, credential_id: null, name: "Connection",
        adapter_kind: "openai-compatible", base_url: "https://new.example", environment: "staging", status: "active",
        metadata: {}, last_health_status: null, last_health_checked_at: null, created_by: null, created_at: "now", updated_at: "now",
      }] };
      if (sql.includes("UPDATE ai_routes") && sql.includes("configuration_revision")) {
        updateArgs = args ?? [];
        const invalidates = updateArgs.at(-1) === true;
        return { rows: [{ ...existing, status: invalidates ? "inactive" : existing.status,
          configuration_revision: invalidates ? 5 : 4, tested_revision: invalidates ? null : 4 }] };
      }
      return { rows: [] };
    }), release: vi.fn(),
  };
  const pool = { connect: async () => client, query: vi.fn(async () => ({ rows: [] })) };
  return { service: new AiGatewayAdminService({ credentialVault: {}, pool } as never), getUpdateArgs: () => updateArgs };
}

test.each([
  ["model", { modelId }], ["credential", { credentialId }], ["connection/environment", { connectionId }],
  ["base URL", { baseUrlOverride: "https://override.example" }], ["upstream", { upstreamModel: "new-upstream" }],
  ["API mode", { apiMode: "async" }], ["request path", { requestPath: "/new" }],
  ["request config", { requestConfig: { timeoutMs: 2000 } }], ["pricing", { pricing: { unitCredits: 8 } }],
  ["priority", { priority: 1 }], ["weight", { weight: 50 }], ["fallback group", { fallbackGroup: "backup" }],
  ["default", { isDefault: true }], ["rate limit", { rateLimit: { requests: 3 } }], ["status", { status: "inactive" }],
])("invalidates tested revision for runtime update: %s", async (_label, input) => {
  const harness = routeUpdateHarness();
  const route = await harness.service.updateRoute({ tenantId: "11111111-1111-1111-1111-111111111111", userId: null }, routeId, input as never);
  expect(harness.getUpdateArgs().at(-1)).toBe(true);
  expect(route.status).toBe("inactive");
});

test("preserves tested revision for labels and admin notes only", async () => {
  const harness = routeUpdateHarness();
  const route = await harness.service.updateRoute({ tenantId: "11111111-1111-1111-1111-111111111111", userId: null }, routeId,
    { routeLabel: "Friendly", internalLabel: "Internal", adminNotes: "Note" });
  expect(harness.getUpdateArgs().at(-1)).toBe(false);
  expect(route.status).toBe("active");
});

test("credential deletion is blocked with sanitized referencing routes", async () => {
  const queries: string[] = [];
  const client = {
    query: vi.fn(async (sql: string) => {
      queries.push(sql);
      if (sql.includes("FROM api_credentials")) return { rows: [{
        id: "22222222-2222-2222-2222-222222222222", tenant_id: null, provider_id: "33333333-3333-3333-3333-333333333333",
        name: "Key", encrypted_secret: "cipher", nonce: "nonce", auth_tag: "tag", key_version: "v1",
        secret_fingerprint: "fingerprint", status: "active", last_used_at: null, rotated_at: null,
        created_by: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }] };
      if (sql.includes("FROM ai_routes") && sql.includes("credential_id")) return { rows: [{
        id: "44444444-4444-4444-4444-444444444444", route_key: "image.safe", route_label: "Line one",
      }] };
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  const service = new AiGatewayAdminService({ credentialVault: {}, pool: { connect: async () => client } } as never);
  const error = await service.deleteCredential({ tenantId: "11111111-1111-1111-1111-111111111111", userId: null },
    "22222222-2222-2222-2222-222222222222").catch((value) => value);
  expect(error).toMatchObject({ code: "CREDENTIAL_IN_USE", statusCode: 409,
    details: { routes: [{ id: "44444444-4444-4444-4444-444444444444", key: "image.safe", label: "Line one" }] } });
  expect(JSON.stringify(error)).not.toContain("cipher");
  expect(queries.some((sql) => sql.includes("UPDATE api_credentials"))).toBe(false);
});

describe("AiGatewayAdminService runtime route list", () => {
  test("exposes safe generation-mode capabilities from model and route config", async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("SELECT DISTINCT ON (route.route_key)")) {
          return {
            rows: [
              {
                route_key: "image.production",
                modality: "image",
                provider_key: "mock-provider",
                provider_name: "Mock Provider",
                model_key: "mock-image",
                model_display_name: "Mock Image",
                model_capabilities: {
                  supportedGenerationModes: ["standard", "panorama_360"],
                  supportedVideoWorkflows: ["video_editor_export"],
                },
          request_config: {
            capabilities: {
              supportedGenerationModes: ["standard", "wraparound_270", "raw-secret-mode"],
              supportedVideoWorkflows: ["video_editor_export", "internal-render-mode"],
            },
            unsafeInternalFlag: "server-only",
          },
                min_charge_credits: "180",
                pricing_unit: "image_generation",
              },
            ],
          };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const pool = {
      connect: vi.fn(async () => client),
    };
    const credentialVault = {};
    const service = new AiGatewayAdminService({ credentialVault, pool } as ConstructorParameters<typeof AiGatewayAdminService>[0]);

    const routes = await service.listRuntimeRoutesForUi({
      tenantId: "11111111-1111-1111-1111-111111111111",
      userId: "user-1",
    }, {
      modality: "image",
    });

    expect(routes).toEqual([
      expect.objectContaining({
        capabilities: {
          supportedGenerationModes: ["standard", "panorama_360", "wraparound_270"],
          supportedVideoWorkflows: ["video_editor_export"],
        },
        estimatedCredits: 180,
        minChargeCredits: 180,
        routeKey: "image.production",
      }),
    ]);
    expect(routes[0]).not.toHaveProperty("unsafeInternalFlag");
  });
});
