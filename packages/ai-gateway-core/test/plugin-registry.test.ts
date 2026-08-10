import { describe, expect, test } from "vitest";

import {
  AiPluginRegistry,
  AiPluginRegistryError,
  BUILTIN_AI_PLUGIN_MANIFESTS,
  builtinAiPluginRegistry,
  validateAiPluginManifest,
  type AiPluginManifest,
} from "../src/index.js";

describe("AI plugin registry", () => {
  test("lists built-in plugin manifests", () => {
    const manifests = builtinAiPluginRegistry.list();
    expect(manifests.map((manifest) => manifest.packageKey)).toEqual([
      "aittco.text-relay",
      "siphonlab.gpt-5-5-text",
      "openai-compatible.gpt-image-2",
      "mouxihub.gpt-image-2-line3",
      "mouxihub.gpt-image-2-line4",
      "mock.local-dev.image",
      "pixellelabs.nano-banana-2",
      "mouxihub.nano-banana-pro-t3",
      "pixellelabs.nano-banana-pro",
      "pixelhub.video",
      "tapflow.video-editor-ffmpeg",
    ]);
    expect(BUILTIN_AI_PLUGIN_MANIFESTS).toHaveLength(11);
  });

  test("returns the PixelHub video package with three independent product routes", () => {
    const manifest = builtinAiPluginRegistry.require("pixelhub.video");
    expect(manifest.provider).toMatchObject({ key: "pixelhub", kind: "pixelhub-video", defaultBaseUrl: "" });
    expect(manifest.models.map((model) => [model.modelKey, model.modelFamily, model.defaultRouteKey])).toEqual([
      ["gemini-omni-flash", "pixelhub-gemini-omni-flash", "video.pixelhub.gemini-omni-flash"],
      ["sora-v3-pro", "pixelhub-sora-v3-pro", "video.pixelhub.sora-v3-pro"],
      ["veo31-fast", "pixelhub-veo31-fast", "video.pixelhub.veo31-fast"],
    ]);
    expect(manifest.pricing.map((price) => [price.model, price.unitCredits, price.minChargeCredits, price.metadata?.billingBasis])).toEqual([
      ["gemini-omni-flash", 1, 4, "duration_second"],
      ["sora-v3-pro", 10, 40, "duration_second"],
      ["veo31-fast", 0.5, 2, "duration_second"],
    ]);

    expect(manifest.models.map((model) => [model.modelKey, model.uiSchema.creatorLabel])).toEqual([
      ["gemini-omni-flash", "Gemini Omni Flash"],
      ["sora-v3-pro", "Sora V3 Pro"],
      ["veo31-fast", "Veo 3.1 Fast"],
    ]);
    const capabilitiesByRoute = Object.fromEntries(manifest.routes.map((route) => [
      route.routeKey,
      route.requestConfig.capabilities,
    ]));

    expect(capabilitiesByRoute).toMatchObject({
      "video.pixelhub.gemini-omni-flash": {
        aspectRatios: ["16:9", "9:16"],
        audioControlMode: "always_on_implicit",
        confirmedByRoute: true,
        modeConstraints: {
          all_reference: { maxAudios: 0, maxImages: 5, maxTotal: 6, maxVideos: 1, minVideos: 1 },
          image_reference: { maxAudios: 0, maxImages: 5, maxTotal: 5, maxVideos: 0, minImages: 2 },
          image_to_video: { maxAudios: 0, maxImages: 1, maxTotal: 1, maxVideos: 0, minImages: 1 },
          text_to_video: { maxAudios: 0, maxImages: 0, maxTotal: 0, maxVideos: 0 },
        },
        resolutions: ["720P", "1080P"],
        supportedDurations: [4, 6, 8, 10],
        supportedModes: ["text_to_video", "image_to_video", "image_reference", "all_reference"],
      },
      "video.pixelhub.sora-v3-pro": {
        aspectRatios: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
        audioControlMode: "toggle",
        confirmedByRoute: true,
        modeConstraints: {
          all_reference: { maxAudios: 3, maxImages: 9, maxTotal: 12, maxVideos: 3, requiresVideoOrAudio: true, requiresVisualWithAudio: true },
          image_reference: { maxAudios: 0, maxImages: 9, maxTotal: 9, maxVideos: 0, minImages: 2 },
          image_to_video: { maxAudios: 0, maxImages: 1, maxTotal: 1, maxVideos: 0, minImages: 1 },
          text_to_video: { maxAudios: 0, maxImages: 0, maxTotal: 0, maxVideos: 0 },
        },
        resolutions: ["720P"],
        supportedDurations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        supportedModes: ["text_to_video", "image_to_video", "image_reference", "all_reference"],
      },
      "video.pixelhub.veo31-fast": {
        aspectRatios: ["16:9", "9:16"],
        audioControlMode: "always_on_implicit",
        confirmedByRoute: true,
        modeConstraints: {
          first_last_frame: { maxAudios: 0, maxImages: 2, maxTotal: 2, maxVideos: 0, minImages: 1 },
          image_to_video: { maxAudios: 0, maxImages: 1, maxTotal: 1, maxVideos: 0, minImages: 1 },
          text_to_video: { maxAudios: 0, maxImages: 0, maxTotal: 0, maxVideos: 0 },
        },
        resolutions: ["720P", "1080P"],
        supportedDurations: [4, 6, 8],
        supportedModes: ["text_to_video", "image_to_video", "first_last_frame"],
      },
    });
  });

  test("returns TapFlow video editor FFmpeg export manifest", () => {
    const manifest = builtinAiPluginRegistry.require("tapflow.video-editor-ffmpeg");

    expect(manifest.displayName).toBe("Video Editor FFmpeg Export");
    expect(manifest.modality).toBe("video");
    expect(manifest.provider).toMatchObject({
      defaultBaseUrl: "internal://tapflow-video-renderer",
      key: "tapflow-local-render",
      kind: "mock",
    });
    expect(manifest.credentials.fields).toEqual([]);
    expect(manifest.models).toEqual([
      expect.objectContaining({
        defaultRouteKey: "video.editor.ffmpeg",
        displayName: "Video Editor FFmpeg",
        modality: "video",
        modelFamily: "tapflow.video-editor",
        modelKey: "video-editor-ffmpeg",
      }),
    ]);
    expect(manifest.routes).toEqual([
      expect.objectContaining({
        mode: "sync",
        modelFamily: "tapflow.video-editor",
        modelKey: "video-editor-ffmpeg",
        path: "/internal/video-editor/render",
        requestConfig: expect.objectContaining({
          apiMode: "internal-render",
          capabilities: {
            supportedVideoWorkflows: ["video_editor_export"],
            videoEditorRenderEngine: "ffmpeg",
          },
          path: "/internal/video-editor/render",
        }),
        routeKey: "video.editor.ffmpeg",
        routeLabel: "FFmpeg Export",
      }),
    ]);
    expect(manifest.pricing).toEqual([
      expect.objectContaining({
        minChargeCredits: 50,
        model: "video-editor-ffmpeg",
        provider: "tapflow-local-render",
        route: "video.editor.ffmpeg",
        unit: "video_generation",
        unitCredits: 50,
      }),
    ]);
  });

  test("returns MouxiHub Nano Banana Pro official T3 async route manifest", () => {
    const manifest = builtinAiPluginRegistry.require("mouxihub.nano-banana-pro-t3");

    expect(manifest.displayName).toBe("Nano Banana Pro");
    expect(manifest.provider).toMatchObject({
      defaultBaseUrl: "https://api.mouxihub.com",
      key: "mouxihub-openai",
      kind: "openai-compatible",
    });
    expect(manifest.models).toEqual([
      expect.objectContaining({
        defaultRouteKey: "image.mouxihub.nano-banana-pro.t3",
        displayName: "Nano Banana Pro",
        modality: "image",
        modelFamily: "pixellelabs.nano-banana-pro",
        modelKey: "gemini-3-pro-image-preview",
      }),
    ]);
    expect(manifest.routes).toEqual([
      expect.objectContaining({
        mode: "async",
        modelFamily: "pixellelabs.nano-banana-pro",
        modelKey: "gemini-3-pro-image-preview",
        path: "/v1/images/generations",
        requestConfig: expect.objectContaining({
          async: true,
          editPath: "/v1/images/edits",
          modelBySize: {
            "1K": "gemini-3.1-flash-image-preview",
            "2K": "gemini-3.1-flash-image-preview-2k",
            "4K": "gemini-3.1-flash-image-preview-4k",
          },
          path: "/v1/images/generations",
          pollPath: "/v1/images/tasks/{task_id}",
        }),
        routeKey: "image.mouxihub.nano-banana-pro.t3",
        routeLabel: "线路二（官方T3）",
      }),
    ]);
    expect(manifest.pricing).toEqual([
      expect.objectContaining({
        minChargeCredits: 6,
        model: "gemini-3-pro-image-preview",
        provider: "mouxihub-openai",
        route: "image.mouxihub.nano-banana-pro.t3",
        unitCredits: 6,
        metadata: expect.objectContaining({
          sizeTiers: {
            "1K": 6,
            "2K": 8,
            "4K": 12,
          },
        }),
      }),
    ]);
  });

  test("returns split PixelleLabs Nano Banana plugins with independent routes", () => {
    const proManifest = builtinAiPluginRegistry.require("pixellelabs.nano-banana-pro");
    const flashManifest = builtinAiPluginRegistry.require("pixellelabs.nano-banana-2");

    expect(proManifest.provider.kind).toBe("pixellelabs-gemini-image");
    expect(proManifest.provider.defaultBaseUrl).toBe("https://api.pixellelabs.com");
    expect(proManifest.models.map((model) => model.modelKey)).toEqual(["gemini-3-pro-image-preview"]);
    expect(proManifest.routes.map((route) => route.routeKey)).toEqual(["image.pixellelabs.nano-banana-pro"]);
    expect(proManifest.credentials.envKeys).toEqual(["PIXELLELABS_NANO_BANANA_PRO_API_KEY"]);
    expect(proManifest.pricing).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          minChargeCredits: 4,
          model: "gemini-3-pro-image-preview",
          route: "image.pixellelabs.nano-banana-pro",
          unitCredits: 4,
          metadata: expect.objectContaining({
            sizeTiers: {
              "1K": 4,
              "2K": 4.5,
              "4K": 5,
            },
          }),
        }),
      ]),
    );

    expect(flashManifest.models.map((model) => model.modelKey)).toEqual(["gemini-3.1-flash-image-preview"]);
    expect(flashManifest.routes.map((route) => route.routeKey)).toEqual(["image.pixellelabs.nano-banana-2"]);
    expect(flashManifest.credentials.envKeys).toEqual(["PIXELLELABS_NANO_BANANA_2_API_KEY"]);
    expect(flashManifest.pricing).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          minChargeCredits: 2.5,
          model: "gemini-3.1-flash-image-preview",
          route: "image.pixellelabs.nano-banana-2",
          unitCredits: 2.5,
          metadata: expect.objectContaining({
            sizeTiers: {
              "1K": 2.5,
              "2K": 3,
              "4K": 3.5,
            },
          }),
        }),
      ]),
    );
  });

  test("publishes 2:1 aspect ratio support for panorama-capable Nano Banana routes", () => {
    const manifests = [
      builtinAiPluginRegistry.require("pixellelabs.nano-banana-pro"),
      builtinAiPluginRegistry.require("pixellelabs.nano-banana-2"),
      builtinAiPluginRegistry.require("mouxihub.nano-banana-pro-t3"),
    ];

    manifests.forEach((manifest) => {
      expect(manifest.models[0]?.capabilities?.supportedAspectRatios).toContain("2:1");
      const aspectField = manifest.models[0]?.uiSchema?.fields?.find?.((field: { key?: string }) => field.key === "aspectRatio");
      expect(aspectField?.options?.map?.((option: { value?: string }) => option.value)).toContain("2:1");
    });
  });

  test("returns GPT-Image-2 plugin manifest for SiphonLab line one", () => {
    const manifest = builtinAiPluginRegistry.require("openai-compatible.gpt-image-2");

    expect(manifest.displayName).toBe("GPT-Image-2");
    expect(manifest.provider).toMatchObject({
      defaultBaseUrl: "https://sub.siphonlab.cn/v1",
      key: "openai-compatible",
      kind: "openai-compatible",
    });
    expect(manifest.models).toEqual([
      expect.objectContaining({
        defaultRouteKey: "image.gpt-image-2",
        displayName: "GPT-Image-2",
        modality: "image",
        modelFamily: "gpt-image-2",
        modelKey: "gpt-image-2",
      }),
    ]);
    expect(manifest.routes).toEqual([
      expect.objectContaining({
        modelFamily: "gpt-image-2",
        modelKey: "gpt-image-2",
        path: "/images/generations",
        requestConfig: expect.objectContaining({
          capabilities: {
            supportedGenerationModes: [
              "standard",
              "panorama_360",
              "wraparound_270",
              "subject_orbit_270",
            ],
          },
          editPath: "/images/edits",
          path: "/images/generations",
        }),
        routeKey: "image.gpt-image-2",
        routeLabel: "线路一",
      }),
      expect.objectContaining({
        modelFamily: "gpt-image-2",
        modelKey: "gpt-image-2",
        path: "/responses",
        requestConfig: expect.objectContaining({
          apiMode: "responses",
          capabilities: {
            supportedGenerationModes: [
              "standard",
              "panorama_360",
              "wraparound_270",
              "subject_orbit_270",
            ],
          },
          model: "gpt-5.5",
          path: "/responses",
        }),
        routeKey: "image.gpt-image-2.line2",
        routeLabel: "线路二",
      }),
    ]);
  });

  test("returns GPT-5.5 text plugin manifest for SiphonLab", () => {
    const manifest = builtinAiPluginRegistry.require("siphonlab.gpt-5-5-text");

    expect(manifest.displayName).toBe("GPT-5.5");
    expect(manifest.modality).toBe("text");
    expect(manifest.provider).toMatchObject({
      defaultBaseUrl: "https://sub.siphonlab.cn",
      key: "siphonlab-openai-text",
      kind: "openai-compatible",
    });
    expect(manifest.credentials.envKeys).toEqual(["SIPHONLAB_GPT_5_5_API_KEY"]);
    expect(manifest.models).toEqual([
      expect.objectContaining({
        defaultRouteKey: "text.gpt-5-5",
        displayName: "GPT-5.5",
        modality: "text",
        modelFamily: "gpt-5.5",
        modelKey: "gpt-5.5",
      }),
    ]);
    expect(manifest.routes).toEqual([
      expect.objectContaining({
        mode: "sync",
        modelFamily: "gpt-5.5",
        modelKey: "gpt-5.5",
        path: "/v1/chat/completions",
        requestConfig: expect.objectContaining({
          chatPath: "/v1/chat/completions",
          responsesPath: "/v1/responses",
        }),
        routeKey: "text.gpt-5-5",
        routeLabel: "默认线路",
      }),
    ]);
    expect(manifest.pricing).toEqual([
      expect.objectContaining({
        minChargeCredits: 2,
        model: "gpt-5.5",
        provider: "siphonlab-openai-text",
        route: "text.gpt-5-5",
        unit: "text_generation",
        unitCredits: 2,
      }),
    ]);
  });

  test("returns all Aittco relay text models with their upstream protocols and prices", () => {
    const manifest = builtinAiPluginRegistry.require("aittco.text-relay");
    const expected = [
      ["gemini-3.1-pro", "Gemini-3.1-pro", "gemini-3.1-pro-preview", "gemini", "/v1beta/models/{model}:generateContent", 1],
      ["gemini-3.5-flash", "Gemini-3.5-flash", "gemini-3.5-flash-preview", "gemini", "/v1beta/models/{model}:generateContent", 0.5],
      ["gpt-5.6-sol", "GPT-5.6-sol", "gpt-5.6-sol", "chat-completions", "/v1/chat/completions", 2],
      ["gpt-5.6-terra", "GPT-5.6-terra", "gpt-5.6-terra", "chat-completions", "/v1/chat/completions", 1],
      ["gpt-5.5", "GPT-5.5", "gpt-5.5", "chat-completions", "/v1/chat/completions", 2],
      ["claude-opus-5", "Claude-Opus-5", "claude-opus-5", "claude", "/v1/messages", 2.5],
      ["claude-sonnet-5", "Claude-Sonnet-5", "claude-sonnet-5", "claude", "/v1/messages", 1.5],
      ["claude-opus-4-8", "Claude-Opus-4-8", "claude-opus-4-8", "claude", "/v1/messages", 2],
    ] as const;

    expect(manifest.provider).toMatchObject({
      defaultBaseUrl: "https://api.aittco.com",
      key: "aittco-text-relay",
      kind: "aittco-text-relay",
    });
    expect(manifest.provider.capabilities).toEqual({
      protocols: ["gemini", "chat-completions", "claude"],
      timeoutMs: 60_000,
    });
    expect(manifest.models).toHaveLength(expected.length);
    expect(manifest.routes).toHaveLength(expected.length);
    expect(manifest.pricing).toHaveLength(expected.length);

    expected.forEach(([modelKey, displayName, upstreamModel, protocol, path, credits]) => {
      expect(manifest.models).toContainEqual(expect.objectContaining({
        defaultRouteKey: `text.${modelKey.replace(/\./g, "-")}`,
        displayName,
        modelFamily: modelKey,
        modelKey,
      }));
      expect(manifest.routes).toContainEqual(expect.objectContaining({
        modelKey,
        path,
        requestConfig: expect.objectContaining({
          apiMode: protocol,
          model: upstreamModel,
          path,
          protocol,
        }),
      }));
      expect(manifest.pricing).toContainEqual(expect.objectContaining({
        minChargeCredits: credits,
        model: modelKey,
        provider: "aittco-text-relay",
        unit: "text_generation",
        unitCredits: credits,
      }));
    });
  });

  test("accepts fractional pricing credits and rejects zero credits", () => {
    const manifest = builtinAiPluginRegistry.require("siphonlab.gpt-5-5-text");
    const fractionalPricingManifest: AiPluginManifest = {
      ...manifest,
      pricing: manifest.pricing.map((pricing) => ({
        ...pricing,
        minChargeCredits: 0.5,
        unitCredits: 0.5,
      })),
    };
    const zeroUnitCreditsManifest: AiPluginManifest = {
      ...fractionalPricingManifest,
      pricing: fractionalPricingManifest.pricing.map((pricing) => ({
        ...pricing,
        unitCredits: 0,
      })),
    };

    expect(validateAiPluginManifest(fractionalPricingManifest)).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "PRICING_CREDITS_INVALID" }),
      ]),
    );
    expect(validateAiPluginManifest(zeroUnitCreditsManifest)).toEqual(
      expect.arrayContaining([
        {
          code: "PRICING_CREDITS_INVALID",
          message: "Pricing for text.gpt-5-5 must use positive credits",
        },
      ]),
    );
  });

  test("returns GPT-Image-2 MouxiHub line three plugin manifest", () => {
    const manifest = builtinAiPluginRegistry.require("mouxihub.gpt-image-2-line3");

    expect(manifest.displayName).toBe("GPT-Image-2 线路三");
    expect(manifest.provider).toMatchObject({
      defaultBaseUrl: "https://api.mouxihub.com",
      key: "mouxihub-openai",
      kind: "openai-compatible",
    });
    expect(manifest.models).toEqual([
      expect.objectContaining({
        defaultRouteKey: "image.gpt-image-2.line3",
        displayName: "GPT-Image-2",
        modality: "image",
        modelFamily: "gpt-image-2",
        modelKey: "gpt-image-2",
        publishToCatalog: false,
      }),
    ]);
    expect(manifest.routes).toEqual([
      expect.objectContaining({
        mode: "async",
        modelFamily: "gpt-image-2",
        modelKey: "gpt-image-2",
        path: "/v1/images/generations",
        requestConfig: expect.objectContaining({
          async: true,
          capabilities: {
            supportedGenerationModes: [
              "standard",
              "panorama_360",
              "wraparound_270",
              "subject_orbit_270",
            ],
          },
          editPath: "/v1/images/edits",
          modelBySize: {
            "1K": "gpt-image-2",
            "2K": "gpt-image-2-2k",
            "4K": "gpt-image-2-4k",
          },
          path: "/v1/images/generations",
          pollPath: "/v1/images/tasks/{task_id}",
          providerBaseModel: "gpt-image-2",
        }),
        routeKey: "image.gpt-image-2.line3",
        routeLabel: "线路三",
      }),
    ]);
    expect(manifest.pricing).toEqual([
      expect.objectContaining({
        minChargeCredits: 1,
        route: "image.gpt-image-2.line3",
        unitCredits: 1,
        metadata: expect.objectContaining({
          sizeTiers: {
            "1K": 1,
            "2K": 2,
            "4K": 3,
          },
        }),
      }),
    ]);
  });

  test("returns GPT-Image-2 MouxiHub line four plugin manifest", () => {
    const manifest = builtinAiPluginRegistry.require("mouxihub.gpt-image-2-line4");

    expect(manifest.displayName).toBe("GPT-Image-2 线路四");
    expect(manifest.provider).toMatchObject({
      defaultBaseUrl: "https://api.mouxihub.com",
      key: "mouxihub-openai",
      kind: "openai-compatible",
    });
    expect(manifest.models).toEqual([
      expect.objectContaining({
        defaultRouteKey: "image.gpt-image-2.line4",
        displayName: "GPT-Image-2",
        modality: "image",
        modelFamily: "gpt-image-2",
        modelKey: "gpt-image-2",
        publishToCatalog: false,
      }),
    ]);
    expect(manifest.routes).toEqual([
      expect.objectContaining({
        mode: "async",
        modelFamily: "gpt-image-2",
        modelKey: "gpt-image-2",
        path: "/v1/images/generations",
        requestConfig: expect.objectContaining({
          async: true,
          capabilities: {
            supportedGenerationModes: [
              "standard",
              "panorama_360",
              "wraparound_270",
              "subject_orbit_270",
            ],
          },
          editPath: "/v1/images/edits",
          modelBySize: {
            "1K": "gpt-image-2-vip",
            "2K": "gpt-image-2-vip-2k",
            "4K": "gpt-image-2-vip-4k",
          },
          path: "/v1/images/generations",
          pollPath: "/v1/images/tasks/{task_id}",
          providerBaseModel: "gpt-image-2-vip",
        }),
        routeKey: "image.gpt-image-2.line4",
        routeLabel: "线路四",
      }),
    ]);
    expect(manifest.pricing).toEqual([
      expect.objectContaining({
        minChargeCredits: 3,
        route: "image.gpt-image-2.line4",
        unitCredits: 3,
        metadata: expect.objectContaining({
          sizeTiers: {
            "1K": 3,
            "2K": 4,
            "4K": 5,
          },
        }),
      }),
    ]);
  });

  test("filters by modality and provider kind", () => {
    expect(builtinAiPluginRegistry.list({ modality: "text" }).map((manifest) => manifest.packageKey)).toEqual([
      "aittco.text-relay",
      "siphonlab.gpt-5-5-text",
    ]);
    expect(
      builtinAiPluginRegistry
        .list({ modality: "image", providerKind: "openai-compatible" })
        .map((manifest) => manifest.packageKey),
    ).toEqual([
      "openai-compatible.gpt-image-2",
      "mouxihub.gpt-image-2-line3",
      "mouxihub.gpt-image-2-line4",
      "mouxihub.nano-banana-pro-t3",
    ]);
  });

  test("throws for missing packages", () => {
    expect(() => builtinAiPluginRegistry.require("missing.package")).toThrow(
      AiPluginRegistryError,
    );
  });

  test("validates route and pricing references", () => {
    const manifest: AiPluginManifest = {
      ...builtinAiPluginRegistry.require("openai-compatible.gpt-image-2"),
      packageKey: "broken.gpt-image-2",
      pricing: [
        {
          minChargeCredits: 1,
          model: "missing-model",
          provider: "openai-compatible",
          route: "missing-route",
          unit: "image_generation",
          unitCredits: 1,
        },
      ],
      routes: [
        {
          ...builtinAiPluginRegistry.require("openai-compatible.gpt-image-2").routes[0],
          modelKey: "missing-model",
        },
      ],
    };

    expect(validateAiPluginManifest(manifest).map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "ROUTE_MODEL_NOT_FOUND",
        "PRICING_MODEL_NOT_FOUND",
        "PRICING_ROUTE_NOT_FOUND",
      ]),
    );
    expect(() => new AiPluginRegistry([manifest])).toThrow(AiPluginRegistryError);
  });

  test("requires route-scoped credential bindings to cover each route exactly once", () => {
    const source = builtinAiPluginRegistry.require("pixelhub.video");
    const malformed: AiPluginManifest = {
      ...source,
      credentialBindings: [
        { ...source.credentialBindings![0], label: "" },
        { ...source.credentialBindings![0], bindingKey: "duplicate-route", label: "" },
      ],
    };

    expect(validateAiPluginManifest(malformed).map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "CREDENTIAL_BINDING_LABEL_REQUIRED",
      "DUPLICATE_CREDENTIAL_BINDING_LABEL",
      "DUPLICATE_CREDENTIAL_BINDING_ROUTE",
      "CREDENTIAL_BINDING_ROUTE_COVERAGE_INCOMPLETE",
    ]));
  });
});
