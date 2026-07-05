import { describe, expect, test, vi } from "vitest";

import { AiModelCatalogService } from "../src/modules/ai-model-catalog/ai-model-catalog.service.js";

describe("AiModelCatalogService route list", () => {
  test("exposes safe generation-mode capabilities on model-scoped routes", async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("FROM ai_model_catalog AS catalog")) {
          return {
            rows: [
              {
                id: "catalog-1",
                model_key: "mock-image",
                modality: "image",
                model_family: "mock-image",
                model_id: "22222222-2222-2222-2222-222222222222",
              },
            ],
          };
        }
        if (sql.includes("SELECT DISTINCT ON (route.route_key)")) {
          return {
            rows: [
              {
                capabilities: {},
                estimated_credits: "180",
                min_charge_credits: "180",
                modality: "image",
                model_capabilities: {
                  supportedGenerationModes: ["standard", "panorama_360"],
                },
                model_family: "mock-image",
                model_key: "mock-image",
                pricing_unit: "image_generation",
                provider_key: "mock-provider",
                provider_name: "Mock Provider",
                request_config: {
                  capabilities: {
                    supportedGenerationModes: ["wraparound_270", "unsupported-provider-internal-mode"],
                  },
                },
                route_id: "route-1",
                route_key: "image.mock-production",
                route_label: "Production line",
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
    const service = new AiModelCatalogService({ pool } as ConstructorParameters<typeof AiModelCatalogService>[0]);

    const routes = await service.listRoutesForModel({
      tenantId: "11111111-1111-1111-1111-111111111111",
      userId: "user-1",
    }, "mock-image", {});

    expect(routes[0]).toMatchObject({
      capabilities: {
        supportedGenerationModes: ["standard", "panorama_360", "wraparound_270"],
      },
      estimatedCredits: 180,
      minChargeCredits: 180,
      routeKey: "image.mock-production",
    });
  });
});
