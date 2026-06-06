import { describe, expect, test } from "vitest";

import { AiGateway } from "../src/ai-gateway.js";
import { MockProviderAdapter } from "../src/mock-provider-adapter.js";
import { OpenAiCompatibleTextAdapter } from "../src/openai-compatible-text-adapter.js";
import { PixelleLabsGeminiImageAdapter } from "../src/pixellelabs-gemini-image-adapter.js";
import {
  ProviderAdapterRegistry,
  createDefaultAiGateway,
  createDefaultProviderAdapterRegistry,
  normalizeProviderKind,
} from "../src/provider-adapter-registry.js";
import { VisionaryNanoBananaAdapter } from "../src/visionary-nano-banana-adapter.js";

describe("ProviderAdapterRegistry", () => {
  test("normalizes provider kinds", () => {
    expect(normalizeProviderKind(" OpenAI-Compatible ")).toBe("openai-compatible");
  });

  test("creates all default provider adapters used by manifests and runtimes", () => {
    const registry = createDefaultProviderAdapterRegistry();

    expect(registry.listKinds()).toEqual([
      "mock",
      "openai",
      "openai-compatible",
      "pixellelabs-gemini-image",
      "visionary-nano-banana",
    ]);
    expect(registry.create("mock")).toBeInstanceOf(MockProviderAdapter);
    expect(registry.create("openai")).toBeInstanceOf(OpenAiCompatibleTextAdapter);
    expect(registry.create("openai-compatible")).toBeInstanceOf(OpenAiCompatibleTextAdapter);
    expect(registry.create("pixellelabs-gemini-image")).toBeInstanceOf(PixelleLabsGeminiImageAdapter);
    expect(registry.create("visionary-nano-banana")).toBeInstanceOf(VisionaryNanoBananaAdapter);
  });

  test("supports registering custom adapter factories", () => {
    const adapter = {};
    const registry = new ProviderAdapterRegistry([
      {
        create: () => adapter,
        kind: "custom-provider",
      },
    ]);

    expect(registry.has("CUSTOM-PROVIDER")).toBe(true);
    expect(registry.create("custom-provider")).toBe(adapter);
  });

  test("creates a default gateway from the default registry", () => {
    expect(createDefaultAiGateway()).toBeInstanceOf(AiGateway);
  });
});
