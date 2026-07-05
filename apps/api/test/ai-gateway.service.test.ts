import { describe, expect, test, vi } from "vitest";

import { AiGatewayAdminService } from "../src/modules/ai-gateway/ai-gateway.service.js";

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
