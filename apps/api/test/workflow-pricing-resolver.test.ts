import { describe, expect, it } from "vitest";
import { builtinAiPluginRegistry, type VideoGenerationCapabilities } from "@aigc-flow/ai-gateway-core";

import {
  assertNodeRouteSupportsRuntimeRequest,
  resolveConfiguredRouteKey,
  resolveNodePricing,
} from "../src/modules/workflow-runs/workflow-runs.service.js";

const pricingRows = [
  {
    min_charge_credits: "19",
    model: "model-a",
    provider: "provider-a",
    route: "image.default",
    unit: "image_generation",
    unit_credits: "19",
  },
  {
    min_charge_credits: "17",
    model: "model-a",
    provider: "provider-a",
    route: "default",
    unit: "image_generation",
    unit_credits: "17",
  },
  {
    min_charge_credits: "13",
    model: "default",
    provider: "provider-a",
    route: "default",
    unit: "image_generation",
    unit_credits: "13",
  },
  {
    min_charge_credits: "10",
    model: "default",
    provider: "default",
    route: "default",
    unit: "image_generation",
    unit_credits: "10",
  },
] as const;

function pixelHubCapabilitiesFor(modelKey: string) {
  const model = builtinAiPluginRegistry.require("pixelhub.video").models.find((entry) => entry.modelKey === modelKey);
  if (!model) throw new Error(`Missing PixelHub model ${modelKey}`);
  return {
    ...(model.capabilities as VideoGenerationCapabilities),
    supportedGenerationModes: ["standard"],
    supportedVideoWorkflows: ["video_generation"],
  };
}

function pixelHubPricingInput(input: {
  durationSeconds: number;
  minChargeCredits: number;
  model: string;
  route: string;
  unitCredits: number;
}) {
  return {
    configuredRouteKey: input.route,
    nodeConfig: {
      params: {
        videoGeneration: { durationSeconds: input.durationSeconds },
      },
    },
    nodeType: "video.generate",
    pricingRows: [{
      metadata: { billingBasis: "duration_second" },
      min_charge_credits: String(input.minChargeCredits),
      model: input.model,
      provider: "pixelhub",
      route: input.route,
      unit: "video_generation",
      unit_credits: String(input.unitCredits),
    }],
    routeContext: {
      capabilities: pixelHubCapabilitiesFor(input.model),
      modelKey: input.model,
      providerKey: "pixelhub",
      requireExactPricing: true,
      routeKey: input.route,
    },
  };
}

describe("workflow pricing resolver", () => {
  it.each([
    ["gemini-omni-flash", "video.pixelhub.gemini-omni-flash", 1, 4, 4, 4],
    ["gemini-omni-flash", "video.pixelhub.gemini-omni-flash", 1, 4, 10, 10],
    ["sora-v3-pro", "video.pixelhub.sora-v3-pro", 10, 40, 4, 40],
    ["sora-v3-pro", "video.pixelhub.sora-v3-pro", 10, 40, 15, 150],
    ["veo31-fast", "video.pixelhub.veo31-fast", 0.5, 2, 4, 2],
    ["veo31-fast", "video.pixelhub.veo31-fast", 0.5, 2, 6, 3],
    ["veo31-fast", "video.pixelhub.veo31-fast", 0.5, 2, 8, 4],
  ])("charges %s for %s seconds", (model, route, unitCredits, minChargeCredits, durationSeconds, expected) => {
    const resolved = resolveNodePricing(pixelHubPricingInput({
      durationSeconds,
      minChargeCredits,
      model,
      route,
      unitCredits,
    }));
    expect(resolved.amountCents).toBe(expected);
    expect(resolved.quantity).toBe(durationSeconds);
    expect(resolved.fallbackLevel).toBe(1);
  });

  it("rejects generic pricing for an exact-priced PixelHub route", () => {
    const input = pixelHubPricingInput({
      durationSeconds: 4,
      minChargeCredits: 4,
      model: "gemini-omni-flash",
      route: "video.pixelhub.gemini-omni-flash",
      unitCredits: 1,
    });
    input.pricingRows[0]!.route = "default";
    const resolved = resolveNodePricing(input);
    expect(resolved.pricingMatch).toBeNull();
    expect(resolved.amountCents).toBe(0);
  });

  it("does not apply video duration to a non-duration editor price", () => {
    const resolved = resolveNodePricing({
      configuredRouteKey: "video.editor",
      nodeConfig: {
        params: { videoGeneration: { durationSeconds: 10 } },
      },
      nodeType: "video.generate",
      pricingRows: [{
        min_charge_credits: "3",
        model: "editor",
        provider: "internal",
        route: "video.editor",
        unit: "video_generation",
        unit_credits: "3",
      }],
      routeContext: {
        capabilities: {
          supportedGenerationModes: ["standard"],
          supportedVideoWorkflows: ["video_editor_export"],
        },
        modelKey: "editor",
        providerKey: "internal",
        routeKey: "video.editor",
      },
    });
    expect(resolved.quantity).toBe(1);
    expect(resolved.amountCents).toBe(3);
  });

  it("rejects an invalid structured video request before reserve", () => {
    expect(() => assertNodeRouteSupportsRuntimeRequest({
      node: {
        config: {
          generationPrompt: "animate the subject",
          params: {
            videoGeneration: {
              schemaVersion: 2,
              mode: "text_to_video",
              aspectRatio: "16:9",
              resolution: "720P",
              durationSeconds: 5,
              generateAudio: true,
              count: 1,
              referenceInputs: [],
            },
          },
          routeKey: "video.pixelhub.gemini-omni-flash",
        },
        id: "invalid-video",
        type: "video.generate",
      },
      routeContext: {
        capabilities: pixelHubCapabilitiesFor("gemini-omni-flash"),
        modelKey: "gemini-omni-flash",
        providerKey: "pixelhub",
        requireExactPricing: true,
        routeKey: "video.pixelhub.gemini-omni-flash",
      },
    })).toThrow(/UNSUPPORTED_DURATION|This duration is not supported/);
  });

  it("resolves nested image edit route keys when the top-level routeKey is missing", () => {
    expect(resolveConfiguredRouteKey({
      config: {
        imageEditRequest: {
          routeKey: " image.pixellelabs.nano-banana-pro ",
        },
      },
      type: "image.generate",
    })).toBe("image.pixellelabs.nano-banana-pro");

    expect(resolveConfiguredRouteKey({
      config: {
        params: {
          imageEditMapping: {
            routeKey: "image.pixellelabs.nano-banana-2",
          },
        },
      },
      type: "image.generate",
    })).toBe("image.pixellelabs.nano-banana-2");

    expect(resolveConfiguredRouteKey({
      config: {
        imageEditRequest: {
          routeKey: "image.pixellelabs.nano-banana-pro",
        },
        routeKey: "image.default",
      },
      type: "image.generate",
    })).toBe("image.default");
  });

  it("matches exact provider/model/route/unit first", () => {
    const resolved = resolveNodePricing({
      configuredRouteKey: "image.default",
      nodeType: "image.generate",
      pricingRows: [...pricingRows],
      routeContext: {
        modelKey: "model-a",
        providerKey: "provider-a",
        routeKey: "image.default",
      },
    });

    expect(resolved.amountCents).toBe(19);
    expect(resolved.fallbackLevel).toBe(1);
    expect(resolved.pricingMatch).toMatchObject({
      model: "model-a",
      provider: "provider-a",
      route: "image.default",
      unit: "image_generation",
    });
  });

  it("falls back in the expected order", () => {
    const level2 = resolveNodePricing({
      configuredRouteKey: "image.other",
      nodeType: "image.generate",
      pricingRows: [...pricingRows],
      routeContext: {
        modelKey: "model-a",
        providerKey: "provider-a",
        routeKey: "image.other",
      },
    });
    expect(level2.amountCents).toBe(17);
    expect(level2.fallbackLevel).toBe(2);

    const level3 = resolveNodePricing({
      configuredRouteKey: "image.other",
      nodeType: "image.generate",
      pricingRows: pricingRows.filter((row) => !(row.provider === "provider-a" && row.model === "model-a")),
      routeContext: {
        modelKey: "model-a",
        providerKey: "provider-a",
        routeKey: "image.other",
      },
    });
    expect(level3.amountCents).toBe(13);
    expect(level3.fallbackLevel).toBe(3);

    const level4 = resolveNodePricing({
      configuredRouteKey: "image.other",
      nodeType: "image.generate",
      pricingRows: pricingRows.filter((row) => !(row.provider === "provider-a")),
      routeContext: {
        modelKey: "model-a",
        providerKey: "provider-a",
        routeKey: "image.other",
      },
    });
    expect(level4.amountCents).toBe(10);
    expect(level4.fallbackLevel).toBe(4);
  });

  it("returns not found semantics when no pricing row exists", () => {
    const resolved = resolveNodePricing({
      configuredRouteKey: "image.default",
      nodeType: "image.generate",
      pricingRows: [],
      routeContext: {
        modelKey: "model-a",
        providerKey: "provider-a",
        routeKey: "image.default",
      },
    });

    expect(resolved.amountCents).toBe(0);
    expect(resolved.fallbackLevel).toBeNull();
    expect(resolved.pricingMatch).toBeNull();
    expect(resolved.unit).toBe("image_generation");
  });

  it("maps default/default/default hit to fallback level 4 when route context is unresolved", () => {
    const resolved = resolveNodePricing({
      configuredRouteKey: null,
      nodeType: "image.generate",
      pricingRows: [
        {
          min_charge_credits: "10",
          model: "default",
          provider: "default",
          route: "default",
          unit: "image_generation",
          unit_credits: "10",
        },
      ],
      routeContext: null,
    });

    expect(resolved.amountCents).toBe(10);
    expect(resolved.fallbackLevel).toBe(4);
    expect(resolved.pricingMatch).toMatchObject({
      model: "default",
      provider: "default",
      route: "default",
      unit: "image_generation",
    });
  });

  it("multiplies image pricing by requested output count", () => {
    const resolved = resolveNodePricing({
      configuredRouteKey: "image.default",
      nodeType: "image.generate",
      pricingRows: [
        {
          min_charge_credits: "24",
          model: "model-a",
          provider: "provider-a",
          route: "image.default",
          unit: "image_generation",
          unit_credits: "24",
        },
      ],
      quantity: 2,
      routeContext: {
        modelKey: "model-a",
        providerKey: "provider-a",
        routeKey: "image.default",
      },
    });

    expect(resolved.amountCents).toBe(48);
  });

  it("uses pricing metadata size tiers for Nano Banana Pro official T3 route", () => {
    const resolved = resolveNodePricing({
      configuredRouteKey: "image.mouxihub.nano-banana-pro.t3",
      nodeConfig: {
        params: {
          size: "4k",
        },
      },
      nodeType: "image.generate",
      pricingRows: [
        {
          metadata: {
            sizeTiers: {
              "1K": 6,
              "2K": 8,
              "4K": 12,
            },
          },
          min_charge_credits: "6",
          model: "gemini-3-pro-image-preview",
          provider: "mouxihub-openai",
          route: "image.mouxihub.nano-banana-pro.t3",
          unit: "image_generation",
          unit_credits: "6",
        },
      ],
      routeContext: {
        modelKey: "gemini-3-pro-image-preview",
        providerKey: "mouxihub-openai",
        routeKey: "image.mouxihub.nano-banana-pro.t3",
      },
    });

    expect(resolved.amountCents).toBe(12);
    expect(resolved.pricingMatch).toMatchObject({
      model: "gemini-3-pro-image-preview",
      provider: "mouxihub-openai",
      route: "image.mouxihub.nano-banana-pro.t3",
      unit: "image_generation",
    });
  });

  it("preserves decimal image pricing tiers", () => {
    const resolved = resolveNodePricing({
      configuredRouteKey: "image.pixellelabs.nano-banana-pro",
      nodeConfig: {
        params: {
          imageSize: "2K",
        },
      },
      nodeType: "image.generate",
      pricingRows: [
        {
          metadata: {
            sizeTiers: {
              "1K": 4,
              "2K": 4.5,
              "4K": 5,
            },
          },
          min_charge_credits: "4",
          model: "gemini-3-pro-image-preview",
          provider: "pixellelabs",
          route: "image.pixellelabs.nano-banana-pro",
          unit: "image_generation",
          unit_credits: "4",
        },
      ],
      routeContext: {
        modelKey: "gemini-3-pro-image-preview",
        providerKey: "pixellelabs",
        routeKey: "image.pixellelabs.nano-banana-pro",
      },
    });

    expect(resolved.amountCents).toBe(4.5);
  });

  it("blocks video editor export nodes when the route does not support editor exports", () => {
    expect(() => assertNodeRouteSupportsRuntimeRequest({
      node: {
        config: {
          params: {
            videoEditor: {
              aspect: "16:9",
              resolution: "1920x1080",
              sourceVideoEditorNodeId: "editor-1",
              timeline: {
                audio: [],
                clips: [],
                durationMs: 3000,
                subtitles: [],
              },
            },
          },
        },
        id: "video-export",
        type: "video.generate",
      },
      routeContext: {
        capabilities: {
          supportedGenerationModes: ["standard"],
          supportedVideoWorkflows: [],
        },
        modelKey: "mock-video",
        providerKey: "mock-provider",
        routeKey: "video.default",
      },
    })).toThrow("UNSUPPORTED_VIDEO_EDITOR_EXPORT");
  });

  it("blocks production image modes when the route does not support them", () => {
    expect(() => assertNodeRouteSupportsRuntimeRequest({
      node: {
        config: {
          params: {
            generationMode: "panorama_360",
            panorama: {
              continuity: "seamless",
              projectionHint: "equirectangular",
              subjectType: "scene",
            },
          },
        },
        id: "panorama-image",
        type: "image.generate",
      },
      routeContext: {
        capabilities: {
          supportedGenerationModes: ["standard"],
          supportedVideoWorkflows: [],
        },
        modelKey: "mock-image",
        providerKey: "mock-provider",
        routeKey: "image.default",
      },
    })).toThrow("UNSUPPORTED_GENERATION_MODE");
  });

  it("allows production image modes when the route declares support", () => {
    expect(() => assertNodeRouteSupportsRuntimeRequest({
      node: {
        config: {
          generationMode: "subject_orbit_270",
          params: {
            wraparound: {
              coverageDegrees: 270,
              layout: "three_panel_sheet",
              panels: 3,
              subjectType: "subject",
            },
          },
        },
        id: "subject-orbit-image",
        type: "image.generate",
      },
      routeContext: {
        capabilities: {
          supportedGenerationModes: ["standard", "subject_orbit_270"],
          supportedVideoWorkflows: [],
        },
        modelKey: "mock-image",
        providerKey: "mock-provider",
        routeKey: "image.gpt-image-2",
      },
    })).not.toThrow();
  });

  it("allows video editor export nodes when the route supports editor exports", () => {
    expect(() => assertNodeRouteSupportsRuntimeRequest({
      node: {
        config: {
          params: {
            videoEditor: {
              sourceVideoEditorNodeId: "editor-1",
              timeline: {
                audio: [],
                clips: [],
                durationMs: 3000,
                subtitles: [],
              },
            },
          },
        },
        id: "video-export",
        type: "video.generate",
      },
      routeContext: {
        capabilities: {
          supportedGenerationModes: ["standard"],
          supportedVideoWorkflows: ["video_editor_export"],
        },
        modelKey: "mock-video",
        providerKey: "mock-provider",
        routeKey: "video.default",
      },
    })).not.toThrow();
  });

  it("allows ordinary video nodes without video editor export metadata", () => {
    expect(() => assertNodeRouteSupportsRuntimeRequest({
      node: {
        config: {
          generationPrompt: "generate a short video",
        },
        id: "plain-video",
        type: "video.generate",
      },
      routeContext: {
        capabilities: {
          supportedGenerationModes: ["standard"],
          supportedVideoWorkflows: [],
        },
        modelKey: "mock-video",
        providerKey: "mock-provider",
        routeKey: "video.default",
      },
    })).not.toThrow();
  });
});
