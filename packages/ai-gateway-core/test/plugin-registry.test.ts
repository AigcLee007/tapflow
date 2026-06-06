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
      "pixellelabs.gemini-image",
    ]);
    expect(BUILTIN_AI_PLUGIN_MANIFESTS).toHaveLength(3);
  });

  test("returns PixelleLabs Nano Banana models with route-bound pricing", () => {
    const manifest = builtinAiPluginRegistry.require("pixellelabs.gemini-image");

    expect(manifest.provider.kind).toBe("pixellelabs-gemini-image");
    expect(manifest.provider.defaultBaseUrl).toBe("https://api.pixellelabs.com");
    expect(manifest.models.map((model) => model.modelKey)).toEqual([
      "gemini-3-pro-image-preview",
      "gemini-3.1-flash-image-preview",
    ]);
    expect(manifest.routes.map((route) => route.routeKey)).toEqual([
      "image.pixellelabs.nano-banana-pro",
      "image.pixellelabs.nano-banana-2",
    ]);
    expect(manifest.pricing).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          minChargeCredits: 24,
          model: "gemini-3-pro-image-preview",
          route: "image.pixellelabs.nano-banana-pro",
          unitCredits: 24,
        }),
        expect.objectContaining({
          minChargeCredits: 24,
          model: "gemini-3.1-flash-image-preview",
          route: "image.pixellelabs.nano-banana-2",
          unitCredits: 24,
        }),
      ]),
    );
  });

  test("filters by modality and provider kind", () => {
    expect(builtinAiPluginRegistry.list({ modality: "text" })).toEqual([]);
    expect(
      builtinAiPluginRegistry
        .list({ modality: "image", providerKind: "openai-compatible" })
        .map((manifest) => manifest.packageKey),
    ).toEqual(["openai-compatible.gpt-image-2"]);
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
