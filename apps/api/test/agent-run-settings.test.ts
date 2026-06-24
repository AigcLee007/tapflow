import { describe, expect, it, vi } from "vitest";

import { AgentCostEstimatorError } from "../src/modules/agent/agent-cost-estimator.js";
import { AgentRunSettingsService } from "../src/modules/agent/agent-run-settings.service.js";

const context = {
  tenantId: "tenant-1",
  userId: "user-1",
};

describe("AgentRunSettingsService", () => {
  it("returns only user-facing image settings with live size-tier credits", async () => {
    const service = new AgentRunSettingsService({
      catalogService: {
        listModels: vi.fn().mockResolvedValue([
          {
            capabilities: {},
            defaultRouteKey: "image.pixellelabs.nano-banana-pro",
            displayName: "Nano Banana Pro",
            id: "catalog-1",
            modality: "image",
            modelFamily: "pixellelabs.nano-banana-pro",
            modelId: "model-1",
            modelKey: "gemini-3-pro-image-preview",
            sortOrder: 10,
            status: "active",
            uiSchema: {},
          },
        ]),
        listRoutesForModel: vi.fn().mockResolvedValue([
          {
            estimatedCredits: 4,
            minChargeCredits: 4,
            modality: "image",
            modelFamily: "pixellelabs.nano-banana-pro",
            modelKey: "gemini-3-pro-image-preview",
            pricingUnit: "image_generation",
            providerKey: "pixellelabs",
            providerName: "PixelleLabs",
            routeId: "route-1",
            routeKey: "image.pixellelabs.nano-banana-pro",
            routeLabel: "线路一",
          },
          {
            estimatedCredits: 6,
            minChargeCredits: 6,
            modality: "image",
            modelFamily: "pixellelabs.nano-banana-pro",
            modelKey: "gemini-3.1-flash-image-preview-4k",
            pricingUnit: "image_generation",
            providerKey: "mouxihub-openai",
            providerName: "MouxiHub OpenAI Compatible",
            routeId: "route-2",
            routeKey: "image.mouxihub.nano-banana-pro.t3",
            routeLabel: "线路二（官方T3）",
          },
        ]),
      },
      costEstimator: {
        estimateGenerateImage: vi.fn(async (input) => {
          if (input.routeKey === "image.pixellelabs.nano-banana-pro" && input.size === "1K") {
            return {
              items: [{ credits: 4, label: "Nano Banana Pro 线路一 1K", quantity: 1 }],
              route: {
                modelKey: "gemini-3-pro-image-preview",
                providerKey: "pixellelabs",
                routeKey: "image.pixellelabs.nano-banana-pro",
              },
              totalCredits: 4,
              unit: "image_generation",
            };
          }
          if (input.routeKey === "image.pixellelabs.nano-banana-pro" && input.size === "2K") {
            return {
              items: [{ credits: 4.5, label: "Nano Banana Pro 线路一 2K", quantity: 1 }],
              route: {
                modelKey: "gemini-3-pro-image-preview",
                providerKey: "pixellelabs",
                routeKey: "image.pixellelabs.nano-banana-pro",
              },
              totalCredits: 4.5,
              unit: "image_generation",
            };
          }
          if (input.routeKey === "image.pixellelabs.nano-banana-pro" && input.size === "4K") {
            return {
              items: [{ credits: 5, label: "Nano Banana Pro 线路一 4K", quantity: 1 }],
              route: {
                modelKey: "gemini-3-pro-image-preview",
                providerKey: "pixellelabs",
                routeKey: "image.pixellelabs.nano-banana-pro",
              },
              totalCredits: 5,
              unit: "image_generation",
            };
          }
          if (input.routeKey === "image.mouxihub.nano-banana-pro.t3" && input.size === "1K") {
            return {
              items: [{ credits: 6, label: "Nano Banana Pro 线路二（官方T3） 1K", quantity: 1 }],
              route: {
                modelKey: "gemini-3.1-flash-image-preview",
                providerKey: "mouxihub-openai",
                routeKey: "image.mouxihub.nano-banana-pro.t3",
              },
              totalCredits: 6,
              unit: "image_generation",
            };
          }
          if (input.routeKey === "image.mouxihub.nano-banana-pro.t3" && input.size === "2K") {
            return {
              items: [{ credits: 8, label: "Nano Banana Pro 线路二（官方T3） 2K", quantity: 1 }],
              route: {
                modelKey: "gemini-3.1-flash-image-preview-2k",
                providerKey: "mouxihub-openai",
                routeKey: "image.mouxihub.nano-banana-pro.t3",
              },
              totalCredits: 8,
              unit: "image_generation",
            };
          }
          return {
            items: [{ credits: 12, label: "Nano Banana Pro 线路二（官方T3） 4K", quantity: 1 }],
            route: {
              modelKey: "gemini-3.1-flash-image-preview-4k",
              providerKey: "mouxihub-openai",
              routeKey: "image.mouxihub.nano-banana-pro.t3",
            },
            totalCredits: 12,
            unit: "image_generation",
          };
        }),
      },
    });

    const result = await service.listImageRunSettings(context);

    expect(result).toEqual({
      models: [
        {
          aspectRatios: ["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16"],
          defaultRouteKey: "image.pixellelabs.nano-banana-pro",
          displayName: "Nano Banana Pro",
          modelFamily: "pixellelabs.nano-banana-pro",
          modelKey: "gemini-3-pro-image-preview",
          qualityOptions: [],
          quantityOptions: [1],
          routes: [
            {
              estimatedCredits: 4,
              routeKey: "image.pixellelabs.nano-banana-pro",
              routeLabel: "线路一",
              sizes: [
                { credits: 4, size: "1K" },
                { credits: 4.5, size: "2K" },
                { credits: 5, size: "4K" },
              ],
            },
            {
              estimatedCredits: 6,
              routeKey: "image.mouxihub.nano-banana-pro.t3",
              routeLabel: "线路二（官方T3）",
              sizes: [
                { credits: 6, size: "1K" },
                { credits: 8, size: "2K" },
                { credits: 12, size: "4K" },
              ],
            },
          ],
          sizes: ["1K", "2K", "4K"],
        },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(/providerKey|providerName|baseUrl|apiKey|Authorization|upstream_model/i);
  });

  it("propagates inactive route errors when estimating by route key", async () => {
    const service = new AgentRunSettingsService({
      catalogService: {
        listModels: vi.fn(),
        listRoutesForModel: vi.fn(),
      },
      costEstimator: {
        estimateGenerateImage: vi.fn().mockRejectedValue(
          new AgentCostEstimatorError(404, "AGENT_ROUTE_NOT_ACTIVE", "The selected Agent generation route is not active."),
        ),
      },
    });

    await expect(service.estimateImageRunSettings(context, {
      routeKey: "image.pixellelabs.nano-banana-pro",
      size: "4K",
    })).rejects.toMatchObject({
      code: "AGENT_ROUTE_NOT_ACTIVE",
      statusCode: 404,
    });
  });
});
