import { describe, expect, test } from "vitest";

import type { AiModelCatalogItem, AiModelCatalogRoute } from "../../services/v2AiModelCatalogApi";
import { resolveDefaultVideoModel, toVideoModelOptions } from "./videoModelCatalog";
import type { VideoModelOption } from "./videoTypes";

const videoModel = (overrides: Partial<AiModelCatalogItem> = {}): AiModelCatalogItem => ({
  capabilities: {},
  defaultRouteKey: "video.internal-route",
  displayName: "Creator Video",
  id: "catalog-video-1",
  modality: "video",
  modelFamily: "private-video-family",
  modelId: "private-upstream-model",
  modelKey: "video.private-model-key",
  sortOrder: 10,
  status: "active",
  uiSchema: {},
  ...overrides,
});

const route = (overrides: Partial<AiModelCatalogRoute> = {}): AiModelCatalogRoute => {
  const { capabilities: capabilityOverrides, ...rest } = overrides;
  return {
    estimatedCredits: 15,
    minChargeCredits: 12,
    modality: "video",
    modelFamily: "private-video-family",
    modelKey: "video.private-model-key",
    pricing: { billingBasis: "duration_second", exact: true, minChargeCredits: 12, unit: "video_generation", unitCredits: 15 },
    pricingUnit: "video_generation",
    providerKey: "private-provider-key",
    providerName: "Private Provider",
    routeId: "private-route-id",
    routeKey: "video.private-route-key",
    routeLabel: "Route one",
    ...rest,
    capabilities: {
      confirmedByRoute: true,
      supportedVideoWorkflows: ["video_generation"],
      ...capabilityOverrides,
    },
  };
};

const videoOption = (modelKey: string, blocker: VideoModelOption["blocker"] = null): VideoModelOption => ({
  blocker,
  modelKey,
} as VideoModelOption);

describe("toVideoModelOptions", () => {
  test("uses formal PixelHub creator labels and omits route-like labels", () => {
    const options = toVideoModelOptions([
      videoModel({ displayName: "internal", uiSchema: { creatorLabel: "Gemini Omni Flash" } }),
      videoModel({ displayName: "internal", id: "sora", modelKey: "video.sora", sortOrder: 20, uiSchema: { creatorLabel: "Sora V3 Pro" } }),
      videoModel({ displayName: "internal", id: "veo", modelKey: "video.veo", sortOrder: 30, uiSchema: { creatorLabel: "Veo 3.1 Fast" } }),
      videoModel({ displayName: "video.pixelhub.internal", id: "unsafe", modelKey: "video.unsafe", sortOrder: 40, uiSchema: { creatorLabel: "video.pixelhub.private" } }),
    ], {
      "video.private-model-key": [route()],
      "video.sora": [route({ modelKey: "video.sora" })],
      "video.veo": [route({ modelKey: "video.veo" })],
      "video.unsafe": [route({ modelKey: "video.unsafe" })],
    });

    expect(options.map((option) => option.label)).toEqual(["Gemini Omni Flash", "Sora V3 Pro", "Veo 3.1 Fast"]);
    expect(JSON.stringify(options)).not.toContain("video.pixelhub.private");
  });

  test("falls back to a safe display name and accepts a safe Chinese creator label", () => {
    const options = toVideoModelOptions([
      videoModel({ displayName: "Seedance 1.0" }),
      videoModel({ id: "chinese", modelKey: "video.chinese", sortOrder: 20, displayName: "internal", uiSchema: { creatorLabel: "\u7075\u611f\u89c6\u9891" } }),
    ], {
      "video.private-model-key": [route()],
      "video.chinese": [route({ modelKey: "video.chinese" })],
    });

    expect(options.map((option) => option.label)).toEqual(["Seedance 1.0", "\u7075\u611f\u89c6\u9891"]);
  });

  test("uses only creatorLabel before falling back to displayName", () => {
    const options = toVideoModelOptions([
      videoModel({
        displayName: "Public Model",
        uiSchema: { creatorLabelZh: "\u65e7\u6807\u7b7e" },
      }),
    ], {
      "video.private-model-key": [route()],
    });

    expect(options.map((option) => option.label)).toEqual(["Public Model"]);
  });

  test("rejects unsafe Chinese creator labels before using a safe display name", () => {
    const options = toVideoModelOptions([
      videoModel({ displayName: "Fallback Video", uiSchema: { creatorLabel: "\u4e2d/\u6587" } }),
      videoModel({ id: "control", modelKey: "video.control", sortOrder: 20, displayName: "Control Fallback", uiSchema: { creatorLabel: "\u4e2d\n\u6587" } }),
    ], {
      "video.private-model-key": [route()],
      "video.control": [route({ modelKey: "video.control" })],
    });

    expect(options.map((option) => option.label)).toEqual(["Fallback Video", "Control Fallback"]);
  });

  test("omits models without a safe creator label or display name", () => {
    const options = toVideoModelOptions([
      videoModel({ displayName: "", uiSchema: {} }),
      videoModel({ id: "url", modelKey: "video.url", sortOrder: 20, displayName: "https://provider.example/model", uiSchema: {} }),
    ], {
      "video.private-model-key": [route()],
      "video.url": [route({ modelKey: "video.url" })],
    });

    expect(options).toEqual([]);
  });

  test("filters inactive or non-generation routes and keeps route-authoritative pricing", () => {
    const options = toVideoModelOptions([
      videoModel({ uiSchema: { creatorLabel: "Valid Video" } }),
      videoModel({ id: "editor", modelKey: "video.editor", sortOrder: 20, uiSchema: { creatorLabel: "Editor" } }),
      videoModel({ id: "inactive", modelKey: "video.inactive", sortOrder: 30, status: "inactive", uiSchema: { creatorLabel: "Inactive" } }),
    ], {
      "video.private-model-key": [route({ pricing: { billingBasis: "duration_second", exact: true, minChargeCredits: 4, unit: "video_generation", unitCredits: 1 } })],
      "video.editor": [route({ modelKey: "video.editor", capabilities: { supportedVideoWorkflows: ["video_editor_export"] } })],
      "video.inactive": [route({ modelKey: "video.inactive" })],
    });

    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ label: "Valid Video", pricing: { minChargeCredits: 4, unitCredits: 1 } });
  });

  test("keeps a missing-pricing video visible but blocked", () => {
    const options = toVideoModelOptions([
      videoModel({ uiSchema: { creatorLabel: "No Pricing" } }),
    ], {
      "video.private-model-key": [route({ estimatedCredits: null, minChargeCredits: null, pricing: null })],
    });

    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ blocker: "PRICING_NOT_FOUND", label: "No Pricing" });
  });

  test("sanitizes model descriptions and estimated durations at the catalog boundary", () => {
    const unsafeDescription = "Fast cinematic shots";
    const options = toVideoModelOptions([
      videoModel({ uiSchema: { creatorLabel: "Catalog Video", description: unsafeDescription } }),
      videoModel({ id: "safe", modelKey: "video.safe", sortOrder: 20, uiSchema: { creatorLabel: "Safe Video" } }),
    ], {
      "video.private-model-key": [route({ capabilities: { estimatedDurationLabel: "About 8 seconds", supportedVideoWorkflows: ["video_generation"] } })],
      "video.safe": [route({ modelKey: "video.safe", capabilities: { description: "\u9002\u5408\u8fde\u7eed\u955c\u5934\u521b\u4f5c", estimatedDurationLabel: "8 seconds / fast", supportedVideoWorkflows: ["video_generation"] } })],
    });

    expect(options[0]).toMatchObject({
      description: "\u6682\u65e0\u4e2d\u6587\u6a21\u578b\u8bf4\u660e",
      estimatedDurationLabel: "\u9884\u8ba1 8 \u79d2",
    });
    expect(options[1]).toMatchObject({ description: "\u9002\u5408\u8fde\u7eed\u955c\u5934\u521b\u4f5c" });
    expect(options[1]).not.toHaveProperty("estimatedDurationLabel");
    expect(JSON.stringify(options)).not.toContain(unsafeDescription);
  });

  test("preserves a safe Chinese estimated-duration label and rejects mixed timing labels", () => {
    const safe = toVideoModelOptions([videoModel({ uiSchema: { creatorLabel: "Timed Video" } })], {
      "video.private-model-key": [route({ capabilities: { estimatedDurationLabel: "\u9884\u8ba1 12 \u79d2", supportedVideoWorkflows: ["video_generation"] } })],
    });
    const unsafe = toVideoModelOptions([videoModel({ uiSchema: { creatorLabel: "Timed Video" } })], {
      "video.private-model-key": [route({ capabilities: { estimatedDurationLabel: "\u9884\u8ba1 12 \u79d2 fast", supportedVideoWorkflows: ["video_generation"] } })],
    });

    expect(safe[0]?.estimatedDurationLabel).toBe("\u9884\u8ba1 12 \u79d2");
    expect(unsafe[0]).not.toHaveProperty("estimatedDurationLabel");
  });

  test("rejects a non-video route that advertises video generation", () => {
    const options = toVideoModelOptions([videoModel({ uiSchema: { creatorLabel: "Wrong Route" } })], {
      "video.private-model-key": [route({ modality: "image" })],
    });

    expect(options).toEqual([]);
  });
});

describe("resolveDefaultVideoModel", () => {
  test("prefers an eligible Gemini Omni Flash option regardless of input position", () => {
    const firstEligible = videoOption("video.sora");
    const gemini = videoOption("gemini-omni-flash");

    expect(resolveDefaultVideoModel([firstEligible, gemini])).toBe(gemini);
  });

  test("falls back to the first eligible option when Gemini Omni Flash is blocked", () => {
    const firstEligible = videoOption("video.sora");
    const blockedGemini = videoOption("gemini-omni-flash", "PRICING_NOT_FOUND");
    const secondEligible = videoOption("video.veo");

    expect(resolveDefaultVideoModel([blockedGemini, firstEligible, secondEligible])).toBe(firstEligible);
  });

  test("returns null when no eligible option exists or the input is empty", () => {
    expect(resolveDefaultVideoModel([
      videoOption("gemini-omni-flash", "PRICING_NOT_FOUND"),
      videoOption("video.sora", "PRICING_NOT_FOUND"),
    ])).toBeNull();
    expect(resolveDefaultVideoModel([])).toBeNull();
  });
});
