import { describe, expect, test, vi } from "vitest";

import { AiGatewayAdminService } from "../src/modules/ai-gateway/ai-gateway.service.js";

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
