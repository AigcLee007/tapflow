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
      "openai-compatible.gpt-image-2",
      "mock.local-dev.image",
      "pixellelabs.nano-banana-2",
      "mouxihub.nano-banana-pro-t3",
      "pixellelabs.nano-banana-pro",
    ]);
    expect(BUILTIN_AI_PLUGIN_MANIFESTS).toHaveLength(5);
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
          model: "gpt-5.5",
          path: "/responses",
        }),
        routeKey: "image.gpt-image-2.line2",
        routeLabel: "线路二",
      }),
    ]);
    expect(manifest.pricing).toEqual([
      expect.objectContaining({
        minChargeCredits: 2.5,
        route: "image.gpt-image-2",
        unitCredits: 2.5,
        metadata: expect.objectContaining({
          sizeTiers: {
            "1K": 2.5,
            "2K": 3,
            "4K": 3.5,
          },
        }),
      }),
      expect.objectContaining({
        minChargeCredits: 3,
        route: "image.gpt-image-2.line2",
        unitCredits: 3,
        metadata: expect.objectContaining({
          sizeTiers: {
            "1K": 3,
            "2K": 3.5,
            "4K": 4,
          },
        }),
      }),
    ]);
  });

  test("filters by modality and provider kind", () => {
    expect(builtinAiPluginRegistry.list({ modality: "text" })).toEqual([]);
    expect(
      builtinAiPluginRegistry
        .list({ modality: "image", providerKind: "openai-compatible" })
        .map((manifest) => manifest.packageKey),
    ).toEqual(["openai-compatible.gpt-image-2", "mouxihub.nano-banana-pro-t3"]);
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
});
