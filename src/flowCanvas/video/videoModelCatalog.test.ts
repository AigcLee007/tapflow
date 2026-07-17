import { describe, expect, test } from "vitest";

import { toVideoModelOptions } from "./videoModelCatalog";
import type { AiModelCatalogItem, AiModelCatalogRoute } from "../../services/v2AiModelCatalogApi";

const videoModel = (overrides: Partial<AiModelCatalogItem> = {}): AiModelCatalogItem => ({
  capabilities: {},
  defaultRouteKey: "video.internal-route",
  displayName: "Creator Video",
  id: "catalog-video-1",
  modality: "video",
  modelFamily: "provider-private-video-family",
  modelId: "upstream-private-model",
  modelKey: "video.private-model-key",
  sortOrder: 10,
  status: "active",
  uiSchema: { description: "Creator-safe UI description" },
  ...overrides,
});

const route = (overrides: Partial<AiModelCatalogRoute> = {}): AiModelCatalogRoute => ({
  capabilities: {
    estimatedDurationLabel: "About 1 minute",
    supportedVideoWorkflows: ["video_generation"],
  },
  estimatedCredits: 15,
  minChargeCredits: 12,
  modality: "video",
  modelFamily: "provider-private-video-family",
  modelKey: "video.private-model-key",
  pricingUnit: "video_generation",
  providerKey: "private-provider-key",
  providerName: "Private Provider Name",
  routeId: "private-route-id",
  routeKey: "video.private-route-key",
  routeLabel: "Private route label",
  ...overrides,
});

describe("toVideoModelOptions", () => {
  test("includes only active models with a video generation route and exposes safe creator fields", () => {
    const models = [
      videoModel(),
      videoModel({ displayName: "Editor only", id: "catalog-editor", modelKey: "video.editor", sortOrder: 20 }),
      videoModel({ displayName: "No pricing", id: "catalog-no-price", modelKey: "video.no-price", sortOrder: 30 }),
      videoModel({ displayName: "Inactive", id: "catalog-inactive", modelKey: "video.inactive", status: "inactive", sortOrder: 40 }),
    ];
    const options = toVideoModelOptions(models, {
      "video.editor": [route({ capabilities: { supportedVideoWorkflows: ["video_editor_export"] } })],
      "video.no-price": [route({ estimatedCredits: null, minChargeCredits: null })],
      "video.private-model-key": [route()],
      "video.inactive": [route()],
    });

    expect(options.map((option) => option.label)).toEqual(["Creator Video", "No pricing"]);
    expect(options[0]).toMatchObject({
      description: "Creator-safe UI description",
      estimatedCredits: 15,
      estimatedDurationLabel: "About 1 minute",
      id: "catalog-video-1",
      minChargeCredits: 12,
    });
    expect(options[1].blocker).toBe("PRICING_NOT_FOUND");
    expect(options[0].capabilities.confirmedByRoute).toBe(true);

    const creatorRenderable = JSON.stringify(options);
    expect(creatorRenderable).not.toContain("private-provider-key");
    expect(creatorRenderable).not.toContain("Private Provider Name");
    expect(creatorRenderable).not.toContain("video.private-route-key");
    expect(creatorRenderable).not.toContain("upstream-private-model");
    expect(Object.keys(options[0])).not.toEqual(expect.arrayContaining(["providerKey", "routeKey"]));
  });

  test("uses only safe capability description when ui schema has no description", () => {
    const options = toVideoModelOptions([videoModel({ uiSchema: {} })], {
      "video.private-model-key": [route({ capabilities: { description: "Capability description", supportedVideoWorkflows: ["video_generation"] } })],
    });

    expect(options[0]?.description).toBe("Capability description");
  });

  test("uses a Chinese creator-safe fallback when the catalog omits a display name", () => {
    const options = toVideoModelOptions([videoModel({ displayName: "" })], {
      "video.private-model-key": [route()],
    });

    expect(options[0]?.label).toBe("视频模型");
    expect(options[0]?.label).not.toBe("Video model");
  });
});
