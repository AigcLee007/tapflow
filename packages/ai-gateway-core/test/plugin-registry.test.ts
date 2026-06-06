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
      "visionary.nano-banana",
    ]);
    expect(BUILTIN_AI_PLUGIN_MANIFESTS).toHaveLength(3);
  });

  test("returns Nano Banana Pro and Fast models with route-bound pricing", () => {
    const manifest = builtinAiPluginRegistry.require("visionary.nano-banana");

    expect(manifest.provider.kind).toBe("visionary-nano-banana");
    expect(manifest.provider.defaultBaseUrl).toBe("https://visionary.beer");
    expect(manifest.models.map((model) => model.modelKey)).toEqual([
      "nano-banana-pro",
      "nano-banana-pro-fast",
    ]);
    expect(manifest.routes.map((route) => route.routeKey)).toEqual([
      "image.nano-banana-pro",
      "image.nano-banana-pro-fast",
    ]);
    expect(manifest.pricing).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          minChargeCredits: 24,
          model: "nano-banana-pro",
          route: "image.nano-banana-pro",
          unitCredits: 24,
        }),
        expect.objectContaining({
          minChargeCredits: 48,
          model: "nano-banana-pro-fast",
          route: "image.nano-banana-pro-fast",
          unitCredits: 48,
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
