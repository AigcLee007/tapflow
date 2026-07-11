import { describe, expect, test, vi } from "vitest";

import { AiRouteTestService } from "../src/modules/ai-route-tests/ai-route-tests.service.js";

const context = { tenantId: "11111111-1111-1111-1111-111111111111", userId: null };
const routeId = "22222222-2222-2222-2222-222222222222";

function harness(options: { fail?: boolean; race?: boolean } = {}) {
  const state = { configurationRevision: 1, testedRevision: null as number | null, healthStatus: null as string | null };
  const sql: string[] = [];
  const client = {
    query: vi.fn(async (query: string, args?: unknown[]) => {
      sql.push(query);
      if (query.includes("FROM ai_routes route JOIN ai_providers") && query.includes("route.tenant_id IS NULL")) {
        return { rows: [{ id: routeId, route_key: "image.draft", route_label: "Draft", modality: "image",
          api_mode: "mock", upstream_model: "mock-image", configuration_revision: state.configurationRevision,
          provider_key: "mock", model_key: "mock-image", connection_name: "Mock", package_key: null }] };
      }
      if (query.includes("INSERT INTO ai_route_health_checks")) return { rows: [{ id: "33333333-3333-3333-3333-333333333333", created_at: "now" }] };
      if (query.includes("SET tested_revision=$2")) {
        if (state.configurationRevision === args?.[1]) {
          state.testedRevision = args[1] as number;
          state.healthStatus = "ok";
        }
        return { rows: [] };
      }
      if (query.includes("health_status='ok'")) state.healthStatus = "ok";
      if (query.includes("health_status='failed'")) {
        if (state.configurationRevision === args?.[1]) {
          state.healthStatus = "failed";
          state.testedRevision = null;
        }
      }
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  const runtime = { generateImage: vi.fn(async () => {
    if (options.race) state.configurationRevision += 1;
    if (options.fail) throw new Error("provider failed");
    return { modelKey: "mock-image", outputs: [{ url: "https://example.test/image.png" }], providerKey: "mock", status: "succeeded" };
  }), generateVideo: vi.fn() };
  const service = new AiRouteTestService({ credentialVault: {} as never, mediaRuntime: runtime as never,
    pool: { connect: async () => client } as never });
  return { service, sql, state };
}

describe("AiRouteTestService admin draft certification", () => {
  test("tests an exact inactive platform draft and certifies the loaded revision", async () => {
    const testHarness = harness();
    expect((await testHarness.service.testAdminDraftRoute(context, routeId, {})).status).toBe("ok");
    expect(testHarness.state).toMatchObject({ configurationRevision: 1, testedRevision: 1, healthStatus: "ok" });
    expect(testHarness.sql.some((query) => query.includes("route.tenant_id IS NULL") && query.includes("route.deleted_at IS NULL"))).toBe(true);
    expect(testHarness.sql.some((query) => query.includes("route.status='active'"))).toBe(false);
  });

  test("does not certify a newer revision changed during the provider call", async () => {
    const testHarness = harness({ race: true });
    expect((await testHarness.service.testAdminDraftRoute(context, routeId, {})).status).toBe("ok");
    expect(testHarness.state).toMatchObject({ configurationRevision: 2, testedRevision: null, healthStatus: null });
    expect(testHarness.sql.some((query) => query.includes("configuration_revision=$2"))).toBe(true);
  });

  test("failed current test clears certification for the unchanged revision", async () => {
    const testHarness = harness({ fail: true });
    testHarness.state.testedRevision = 1;
    expect((await testHarness.service.testAdminDraftRoute(context, routeId, {})).status).toBe("failed");
    expect(testHarness.state).toMatchObject({ configurationRevision: 1, testedRevision: null, healthStatus: "failed" });
  });
});
