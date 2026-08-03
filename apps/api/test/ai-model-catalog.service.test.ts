import { describe, expect, test, vi } from "vitest";

import { AiModelCatalogService } from "../src/modules/ai-model-catalog/ai-model-catalog.service.js";

describe("AiModelCatalogService route list", () => {
  test("preserves established safe image catalog capabilities while excluding unknown values", async () => {
    const client = {
      query: vi.fn(async () => ({
        rows: [{
          capabilities: {
            maxInputImages: 8,
            maxPromptLength: 4096,
            supportedAspectRatios: ["1:1", "2:1"],
            supportedGenerationModes: ["standard"],
            supportedSizes: ["1024x1024", "4K"],
            supportsImageEdit: true,
            supportsReferenceImages: true,
            supportsStreaming: false,
            upstreamApiKey: "image-catalog-secret-must-not-leak",
            providerConfig: { authorization: "Bearer image-catalog-secret-must-not-leak" },
          },
          default_route_key: "image.safe-route",
          display_name: "Safe image model",
          id: "catalog-image-1",
          modality: "image",
          model_family: "safe-image",
          model_id: "22222222-2222-2222-2222-222222222222",
          model_key: "safe-image",
          sort_order: 10,
          status: "active",
          ui_schema: {},
        }],
      })),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn(async () => client) };
    const service = new AiModelCatalogService({ pool } as ConstructorParameters<typeof AiModelCatalogService>[0]);

    const models = await service.listModels({
      tenantId: "11111111-1111-1111-1111-111111111111",
      userId: "user-1",
    }, { modality: "image" });

    expect(models[0]?.capabilities).toEqual({
      maxInputImages: 8,
      maxPromptLength: 4096,
      supportedAspectRatios: ["1:1", "2:1"],
      supportedGenerationModes: ["standard"],
      supportedSizes: ["1024x1024", "4K"],
      supportsImageEdit: true,
      supportsReferenceImages: true,
      supportsStreaming: false,
    });
    expect(JSON.stringify(models[0]?.capabilities)).not.toContain("image-catalog-secret-must-not-leak");
    expect(JSON.stringify(models[0]?.capabilities)).not.toContain("providerConfig");
  });

  test("projects only safe video-generation capabilities for creator catalog models", async () => {
    const client = {
      query: vi.fn(async () => ({
        rows: [{
          capabilities: {
            supportedVideoWorkflows: ["video_generation"],
            supportedModes: ["text_to_video"],
            resolutions: ["4K"],
            upstreamApiKey: "catalog-secret-must-not-leak",
            nestedProviderConfig: { authorization: "Bearer catalog-secret-must-not-leak" },
          },
          default_route_key: "video.safe-route",
          display_name: "Safe video model",
          id: "catalog-video-1",
          modality: "video",
          model_family: "safe-video",
          model_id: "22222222-2222-2222-2222-222222222222",
          model_key: "safe-video",
          sort_order: 10,
          status: "active",
          ui_schema: {},
        }],
      })),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn(async () => client) };
    const service = new AiModelCatalogService({ pool } as ConstructorParameters<typeof AiModelCatalogService>[0]);

    const models = await service.listModels({
      tenantId: "11111111-1111-1111-1111-111111111111",
      userId: "user-1",
    }, { modality: "video" });

    expect(models[0]?.capabilities).toEqual({
      supportedVideoWorkflows: ["video_generation"],
      supportedModes: ["text_to_video"],
      resolutions: ["4K"],
    });
    expect(JSON.stringify(models[0]?.capabilities)).not.toContain("catalog-secret-must-not-leak");
    expect(JSON.stringify(models[0]?.capabilities)).not.toContain("nestedProviderConfig");
  });

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
                  supportedVideoWorkflows: ["video_editor_export"],
                },
                model_family: "mock-image",
                model_key: "mock-image",
                pricing_unit: "image_generation",
                provider_key: "mock-provider",
                provider_name: "Mock Provider",
                request_config: {
                  capabilities: {
                    supportedGenerationModes: ["wraparound_270", "unsupported-provider-internal-mode"],
                    supportedVideoWorkflows: ["video_editor_export", "internal-render-mode"],
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
        supportedVideoWorkflows: ["video_editor_export"],
      },
      estimatedCredits: 180,
      minChargeCredits: 180,
      routeKey: "image.mock-production",
    });
  });

  test("preserves safe video-generation capabilities while excluding route configuration secrets", async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("FROM ai_model_catalog AS catalog")) {
          return {
            rows: [{
              id: "catalog-video-1",
              model_key: "video-model",
              modality: "video",
              model_family: "video-model",
              model_id: "22222222-2222-2222-2222-222222222222",
            }],
          };
        }
        if (sql.includes("SELECT DISTINCT ON (route.route_key)")) {
          return {
            rows: [{
              estimated_credits: "180",
              min_charge_credits: "180",
              modality: "video",
              model_capabilities: {
                supportedVideoWorkflows: ["video_generation"],
                supportedModes: ["text_to_video", "image_to_video"],
                aspectRatios: ["16:9", "9:16"],
                resolutions: ["720P", "4K"],
                minDurationSeconds: 3,
                maxDurationSeconds: 12,
                durationStepSeconds: 3,
                maxCount: 4,
                supportsAudio: false,
                supportsHumanReview: true,
                description: "A safe model description",
                upstreamApiKey: "must-not-leak",
              },
              model_family: "video-model",
              model_key: "video-model",
              pricing_unit: "video_generation",
              pricing_metadata: { billingBasis: "duration_second", internalMargin: "must-not-leak" },
              pricing_fallback_level: 1,
              provider_key: "private-provider",
              provider_name: "Private Provider",
              request_config: {
                capabilities: {
                  supportedVideoWorkflows: ["video_editor_export", "video_generation"],
                  supportedModes: ["first_last_frame", "private-mode"],
                  aspectRatios: ["1:1", "private-ratio"],
                  resolutions: ["1080P", "private-resolution"],
                  maxDurationSeconds: 16,
                  supportedDurations: [4, 6, 8, "private-duration"],
                  estimatedDurationLabel: "about 16 seconds",
                  authorization: "Bearer must-not-leak",
                  baseUrl: "https://provider.example/internal",
                  defaults: {
                    aspectRatio: "16:9",
                    count: 1,
                    durationSeconds: 8,
                    generateAudio: true,
                    mode: "text_to_video",
                    resolution: "1080P",
                    signedUrl: "https://provider.example/signed",
                  },
                  modeConstraints: {
                    text_to_video: { maxTotal: 0, authorization: "Bearer must-not-leak" },
                    private_mode: { maxTotal: 99 },
                  },
                },
              },
              route_id: "route-video-1",
              route_key: "video.private-production",
              route_label: "Production line",
            }],
          };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn(async () => client) };
    const service = new AiModelCatalogService({ pool } as ConstructorParameters<typeof AiModelCatalogService>[0]);

    const routes = await service.listRoutesForModel({
      tenantId: "11111111-1111-1111-1111-111111111111",
      userId: "user-1",
    }, "video-model", {});

    expect(routes[0]?.capabilities).toEqual({
      supportedGenerationModes: ["standard"],
      supportedVideoWorkflows: ["video_generation", "video_editor_export"],
      supportedModes: ["text_to_video", "image_to_video", "first_last_frame"],
      aspectRatios: ["16:9", "9:16", "1:1"],
      resolutions: ["720P", "4K", "1080P"],
      minDurationSeconds: 3,
      maxDurationSeconds: 16,
      supportedDurations: [4, 6, 8],
      durationStepSeconds: 3,
      maxCount: 4,
      supportsAudio: false,
      supportsHumanReview: true,
      description: "A safe model description",
      estimatedDurationLabel: "about 16 seconds",
      defaults: {
        aspectRatio: "16:9",
        count: 1,
        durationSeconds: 8,
        generateAudio: true,
        mode: "text_to_video",
        resolution: "1080P",
      },
      modeConstraints: { text_to_video: { maxTotal: 0 } },
    });
    expect(routes[0]?.pricing).toEqual({
      billingBasis: "duration_second",
      exact: true,
      minChargeCredits: 180,
      unit: "video_generation",
      unitCredits: 180,
    });
    expect(JSON.stringify(routes)).not.toMatch(/authorization|signedUrl|internalMargin|baseUrl|request_path|must-not-leak/);
  });
});
