import { describe, expect, it, vi } from "vitest";
import {
  builtinAiPluginRegistry,
  validateVideoGenerationRequest,
  type VideoGenerationCapabilities,
} from "@aigc-flow/ai-gateway-core";

import {
  assertNodeRouteSupportsRuntimeRequest,
  resolveConfiguredRouteKey,
  resolveNodePricing,
  WorkflowRunsService,
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

function withFirstLastFrameMinImages(capabilities: VideoGenerationCapabilities, minImages: number): VideoGenerationCapabilities {
  return {
    ...capabilities,
    modeConstraints: {
      ...capabilities.modeConstraints,
      first_last_frame: {
        ...capabilities.modeConstraints.first_last_frame!,
        minImages,
      },
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

  it.each([
    ["text_to_video rejects image references", "gemini-omni-flash", "text_to_video", ["reference_image", "reference_image"]],
    ["image_to_video rejects two images", "gemini-omni-flash", "image_to_video", ["main_image", "main_image"]],
    ["first_last_frame rejects three images", "veo31-fast", "first_last_frame", ["first_frame", "last_frame", "last_frame"]],
  ])("%s before reserve/enqueue", (_label, model, mode, roles) => {
    const referenceInputs = roles.map((role, index) => ({
      referenceKey: `ref-${index}`,
      source: { kind: "asset", id: `asset-${index}` },
      mediaKind: "image",
      role,
      order: index,
    }));

    expect(() => assertNodeRouteSupportsRuntimeRequest({
      node: {
        config: {
          generationPrompt: "animate the subject",
          params: {
            videoGeneration: {
              schemaVersion: 2,
              mode,
              aspectRatio: "16:9",
              resolution: model === "veo31-fast" ? "1080P" : "720P",
              durationSeconds: 4,
              generateAudio: true,
              count: 1,
              referenceInputs,
            },
          },
          routeKey: `video.pixelhub.${model}`,
        },
        id: `invalid-${mode}`,
        type: "video.generate",
      },
      routeContext: {
        capabilities: pixelHubCapabilitiesFor(model),
        modelKey: model,
        providerKey: "pixelhub",
        requireExactPricing: true,
        routeKey: `video.pixelhub.${model}`,
      },
    })).toThrowError(expect.objectContaining({ statusCode: 422 }));
  });

  it.each([
    ["text_to_video with a non-array reference input", "gemini-omni-flash", "text_to_video", {}],
    ["text_to_video with a malformed image reference", "gemini-omni-flash", "text_to_video", [{
      referenceKey: "malformed-image",
      source: { kind: "asset" },
      mediaKind: "image",
      role: "reference_image",
      order: 0,
    }]],
    ["image_to_video with two images", "gemini-omni-flash", "image_to_video", [
      { referenceKey: "main-0", source: { kind: "asset", id: "asset-0" }, mediaKind: "image", role: "main_image", order: 0 },
      { referenceKey: "main-1", source: { kind: "asset", id: "asset-1" }, mediaKind: "image", role: "main_image", order: 1 },
    ]],
    ["first_last_frame with three images", "veo31-fast", "first_last_frame", [
      { referenceKey: "first", source: { kind: "asset", id: "asset-first" }, mediaKind: "image", role: "first_frame", order: 0 },
      { referenceKey: "last", source: { kind: "asset", id: "asset-last" }, mediaKind: "image", role: "last_frame", order: 1 },
      { referenceKey: "extra", source: { kind: "asset", id: "asset-extra" }, mediaKind: "image", role: "last_frame", order: 2 },
    ]],
  ])("returns 422 before reserve or enqueue for %s", async (_label, model, mode, referenceInputs) => {
    const reserveUsageWithClient = vi.fn();
    const queueAdd = vi.fn();
    const client = {
      query: vi.fn(async (query: string) => {
        if (query === "BEGIN" || query === "COMMIT" || query === "ROLLBACK" || query.startsWith("SELECT set_config")) {
          return { rows: [] };
        }
        throw new Error("structured video validation must run before database writes");
      }),
      release: vi.fn(),
    };
    const service = new WorkflowRunsService({
      nodeExecuteQueue: { add: queueAdd },
      personalWalletService: { reserveUsageWithClient } as never,
      pool: { connect: vi.fn(async () => client) } as never,
    });
    const node = {
      config: {
        generationPrompt: "animate the subject",
        params: {
          videoGeneration: {
            schemaVersion: 2,
            mode,
            aspectRatio: "16:9",
            resolution: model === "veo31-fast" ? "1080P" : "720P",
            durationSeconds: 4,
            generateAudio: true,
            count: 1,
            referenceInputs,
          },
        },
        routeKey: `video.pixelhub.${model}`,
      },
      id: "invalid-video",
      type: "video.generate",
    };
    const internals = service as unknown as {
      getCurrentFlowRuntimeOrCreateSnapshot: () => Promise<unknown>;
      loadActivePricing: () => Promise<unknown[]>;
      loadRouteRuntimeContexts: () => Promise<Map<string, unknown>>;
    };
    internals.getCurrentFlowRuntimeOrCreateSnapshot = async () => ({
      compiled_graph_json: { entryNodeIds: [node.id], nodes: [node] },
      current_version_id: "version-1",
      flow_id: "flow-1",
    });
    internals.loadActivePricing = async () => [];
    internals.loadRouteRuntimeContexts = async () => new Map([[
      `video.pixelhub.${model}`,
      {
        capabilities: pixelHubCapabilitiesFor(model),
        modelKey: model,
        providerKey: "pixelhub",
        routeKey: `video.pixelhub.${model}`,
      },
    ]]);

    await expect(service.createWorkflowRun(
      { tenantId: "tenant-1", userId: "user-1" },
      "flow-1",
      {},
    )).rejects.toMatchObject({ statusCode: 422 });
    expect(reserveUsageWithClient).not.toHaveBeenCalled();
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it("preserves video_generation when loading a structured video route context", async () => {
    const service = new WorkflowRunsService({
      nodeExecuteQueue: {
        async add() {
          return { id: "job-1" };
        },
      },
      pool: {} as never,
    });
    const loadRouteRuntimeContexts = (
      service as unknown as {
        loadRouteRuntimeContexts: (
          client: { query: () => Promise<{ rows: Array<Record<string, unknown>> }> },
          tenantId: string,
          nodes: Array<{ config: Record<string, unknown>; type: string }>,
        ) => Promise<Map<string, { capabilities: { supportedVideoWorkflows: string[] } }>>;
      }
    ).loadRouteRuntimeContexts.bind(service);
    const routeKey = "video.pixelhub.gemini-omni-flash";

    const contexts = await loadRouteRuntimeContexts({
      async query() {
        return {
          rows: [{
            model_capabilities: {},
            model_key: "gemini-omni-flash",
            provider_key: "pixelhub",
            request_config: {
              capabilities: pixelHubCapabilitiesFor("gemini-omni-flash"),
              supportedVideoWorkflows: ["video_generation"],
            },
            route_key: routeKey,
            tenant_id: null,
          }],
        };
      },
    }, "tenant-1", [{ config: { routeKey }, type: "video.generate" }]);

    expect(contexts.get(routeKey)?.capabilities.supportedVideoWorkflows).toEqual(["video_generation"]);
  });

  it("uses each route's video capabilities ahead of shared model defaults", async () => {
    const sharedModelCapabilities = withFirstLastFrameMinImages(pixelHubCapabilitiesFor("veo31-fast"), 2);
    const service = new WorkflowRunsService({
      nodeExecuteQueue: { async add() { return { id: "job-1" }; } },
      pool: {} as never,
    });
    const loadRouteRuntimeContexts = (
      service as unknown as {
        loadRouteRuntimeContexts: (
          client: { query: () => Promise<{ rows: Array<Record<string, unknown>> }> },
          tenantId: string,
          nodes: Array<{ config: Record<string, unknown>; type: string }>,
        ) => Promise<Map<string, { capabilities: VideoGenerationCapabilities }>>;
      }
    ).loadRouteRuntimeContexts.bind(service);
    const loadCapabilities = async (routeCapabilities: VideoGenerationCapabilities, routeTenantId: string | null) => {
      const contexts = await loadRouteRuntimeContexts({
        async query() {
          return {
            rows: [{
              model_capabilities: sharedModelCapabilities,
              model_id: "shared-veo-model",
              model_key: "veo31-fast",
              provider_key: "pixelhub",
              request_config: { capabilities: routeCapabilities },
              route_key: "video.pixelhub.veo31-fast",
              tenant_id: routeTenantId,
            }],
          };
        },
      }, "tenant-1", [{ config: { routeKey: "video.pixelhub.veo31-fast" }, type: "video.generate" }]);
      return contexts.get("video.pixelhub.veo31-fast")!.capabilities;
    };
    const platformCapabilities = await loadCapabilities(withFirstLastFrameMinImages(pixelHubCapabilitiesFor("veo31-fast"), 1), null);
    const tenantCapabilities = await loadCapabilities(withFirstLastFrameMinImages(pixelHubCapabilitiesFor("veo31-fast"), 2), "tenant-1");
    const firstFrameRequest = {
      inputAssets: [{
        assetId: "first-frame",
        kind: "image",
        metadata: {
          videoReference: {
            mediaKind: "image",
            order: 0,
            referenceKey: "first-frame",
            role: "first_frame",
            sourceKind: "asset",
            sourceNodeId: null,
          },
        },
      }],
      params: {
        aspectRatio: "16:9",
        count: 1,
        durationSeconds: 4,
        generateAudio: true,
        mode: "first_last_frame",
        resolution: "1080P",
      },
      prompt: "Animate the scene",
    };

    expect(validateVideoGenerationRequest(firstFrameRequest, platformCapabilities)).toEqual([]);
    expect(validateVideoGenerationRequest(firstFrameRequest, tenantCapabilities).map((issue) => issue.code)).toContain("VIDEO_MODE_INPUT_REQUIRED");
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

  it("allows an empty video editor prompt when a connected static text node supplies it", () => {
    const videoNode = {
      config: {
        generationPrompt: "",
        params: {
          videoGeneration: {
            aspectRatio: "16:9",
            count: 1,
            durationSeconds: 4,
            generateAudio: true,
            mode: "image_to_video",
            referenceInputs: [{
              mediaKind: "image",
              order: 0,
              referenceKey: "upstream:image",
              role: "main_image",
              source: { id: "image", kind: "upstream" },
            }],
            resolution: "720P",
            schemaVersion: 2,
          },
        },
        routeKey: "video.pixelhub.gemini-omni-flash",
      },
      dependencies: ["copy", "image"],
      dependents: [],
      id: "video",
      type: "video.generate",
    };

    expect(() => assertNodeRouteSupportsRuntimeRequest({
      compiledGraph: {
        edges: [],
        entryNodeIds: ["copy", "image"],
        nodes: [
          {
            config: { text: "A quiet room in morning light, with gentle curtain movement." },
            dependencies: [],
            dependents: ["video"],
            id: "copy",
            type: "text.generate",
          },
          {
            config: { assetId: "asset-image" },
            dependencies: [],
            dependents: ["video"],
            id: "image",
            type: "image.asset",
          },
          videoNode,
        ],
        outputNodeIds: ["video"],
        schemaVersion: "v2",
      },
      node: videoNode,
      routeContext: {
        capabilities: pixelHubCapabilitiesFor("gemini-omni-flash"),
        modelKey: "gemini-omni-flash",
        providerKey: "pixelhub",
        routeKey: "video.pixelhub.gemini-omni-flash",
      },
    })).not.toThrow();
  });
});
