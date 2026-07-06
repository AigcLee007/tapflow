import { describe, expect, it } from "vitest";

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

describe("workflow pricing resolver", () => {
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
