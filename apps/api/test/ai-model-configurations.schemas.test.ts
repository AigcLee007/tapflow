import { describe, expect, test } from "vitest";

import {
  publishModelConfigurationSchema,
  saveModelConfigurationDraftSchema,
} from "../src/modules/ai-model-configurations/ai-model-configurations.schemas.js";

const existingCredentialId = "11111111-1111-4111-8111-111111111111";
const existingConnectionId = "22222222-2222-4222-8222-222222222222";
const routeId = "33333333-3333-4333-8333-333333333333";

const commonDraft = {
  connection: {
    baseUrl: "https://api.example.com/v1",
    environment: "production",
    mode: "create" as const,
    name: "Primary connection",
  },
  credential: {
    mode: "existing" as const,
    credentialId: existingCredentialId,
  },
  pricing: {
    minChargeCredits: 1,
    unit: "image_generation" as const,
    unitCredits: 2.5,
  },
  route: {
    routeLabel: "Line one",
    upstreamModel: "gpt-image-1",
  },
};

const customDefinition = {
  model: {
    displayName: "Custom image model",
    modality: "image" as const,
    modelFamily: "custom-image",
    modelKey: "custom-image-v1",
  },
  provider: {
    defaultBaseUrl: "https://api.example.com/v1",
    key: "custom-openai",
    kind: "openai-compatible" as const,
    name: "Custom OpenAI",
  },
  routeDefaults: {
    apiMode: "sync",
    requestPath: "/images/generations",
    timeoutMs: 120_000,
  },
};

describe("AI model configuration schemas", () => {
  test("accepts a built-in template draft using packageKey", () => {
    const parsed = saveModelConfigurationDraftSchema.parse({
      ...commonDraft,
      packageKey: "openai-compatible.gpt-image-2",
    });

    expect(parsed.packageKey).toBe("openai-compatible.gpt-image-2");
    expect(parsed.connection).toEqual(commonDraft.connection);
  });

  test("accepts a custom OpenAI-compatible draft", () => {
    const parsed = saveModelConfigurationDraftSchema.parse({
      ...commonDraft,
      custom: customDefinition,
      route: {
        ...commonDraft.route,
        fallbackGroup: "image-primary",
        priority: 10,
        requestConfig: { responseFormat: "b64_json" },
        routeKey: "image.custom-openai.line-1",
        weight: 100,
      },
    });

    expect(parsed.custom.provider.kind).toBe("openai-compatible");
    expect(parsed.route.routeKey).toBe("image.custom-openai.line-1");
  });

  test("accepts a credential create choice and trims its values", () => {
    const parsed = saveModelConfigurationDraftSchema.parse({
      ...commonDraft,
      credential: { mode: "create", name: "  New key  ", secret: "  sk-synthetic  " },
      packageKey: "openai-compatible.gpt-image-2",
    });

    expect(parsed.credential).toEqual({
      mode: "create",
      name: "New key",
      secret: "sk-synthetic",
    });
  });

  test("accepts a credential existing choice", () => {
    const parsed = saveModelConfigurationDraftSchema.parse({
      ...commonDraft,
      packageKey: "openai-compatible.gpt-image-2",
    });

    expect(parsed.credential).toEqual(commonDraft.credential);
  });

  test("rejects ambiguous credential input containing secret and credentialId", () => {
    expect(() =>
      saveModelConfigurationDraftSchema.parse({
        ...commonDraft,
        credential: {
          credentialId: existingCredentialId,
          mode: "create",
          name: "New key",
          secret: "sk-synthetic",
        },
        packageKey: "openai-compatible.gpt-image-2",
      }),
    ).toThrow();
  });

  test("requires exactly one template source", () => {
    expect(() =>
      saveModelConfigurationDraftSchema.parse({
        ...commonDraft,
        custom: customDefinition,
        packageKey: "openai-compatible.gpt-image-2",
      }),
    ).toThrow();

    expect(() => saveModelConfigurationDraftSchema.parse(commonDraft)).toThrow();
  });

  test("requires positive, modality-compatible pricing", () => {
    for (const pricing of [
      { ...commonDraft.pricing, unitCredits: 0 },
      { ...commonDraft.pricing, minChargeCredits: -1 },
      { ...commonDraft.pricing, unit: "video_generation" },
    ]) {
      expect(() =>
        saveModelConfigurationDraftSchema.parse({
          ...commonDraft,
          custom: customDefinition,
          pricing,
        }),
      ).toThrow();
    }
  });

  test("keeps pricing credits within the persistence contract range", () => {
    for (const pricing of [
      { ...commonDraft.pricing, unitCredits: 0.00001 },
      { ...commonDraft.pricing, unitCredits: 1_000_000_001 },
      { ...commonDraft.pricing, minChargeCredits: 0.00001 },
      { ...commonDraft.pricing, minChargeCredits: 1_000_000_001 },
    ]) {
      expect(() =>
        saveModelConfigurationDraftSchema.parse({
          ...commonDraft,
          packageKey: "openai-compatible.gpt-image-2",
          pricing,
        }),
      ).toThrow();
    }
  });

  test("requires routeId and expectedRevision together for draft updates", () => {
    expect(() =>
      saveModelConfigurationDraftSchema.parse({
        ...commonDraft,
        expectedRevision: 1,
        packageKey: "openai-compatible.gpt-image-2",
      }),
    ).toThrow();

    expect(() =>
      saveModelConfigurationDraftSchema.parse({
        ...commonDraft,
        packageKey: "openai-compatible.gpt-image-2",
        routeId,
      }),
    ).toThrow();

    expect(
      saveModelConfigurationDraftSchema.parse({
        ...commonDraft,
        expectedRevision: 2,
        packageKey: "openai-compatible.gpt-image-2",
        routeId,
      }).expectedRevision,
    ).toBe(2);
  });

  test("publish input requires a UUID routeId and positive integer expectedRevision", () => {
    expect(publishModelConfigurationSchema.parse({ routeId, expectedRevision: 3 })).toEqual({
      routeId,
      expectedRevision: 3,
    });
    expect(() =>
      publishModelConfigurationSchema.parse({ routeId: "not-a-uuid", expectedRevision: 3 }),
    ).toThrow();
    expect(() =>
      publishModelConfigurationSchema.parse({ routeId, expectedRevision: 0 }),
    ).toThrow();
    expect(() =>
      publishModelConfigurationSchema.parse({ routeId, expectedRevision: 1.5 }),
    ).toThrow();
  });

  test("validates an advanced routeKey with the gateway route-key pattern", () => {
    expect(() =>
      saveModelConfigurationDraftSchema.parse({
        ...commonDraft,
        packageKey: "openai-compatible.gpt-image-2",
        route: { ...commonDraft.route, routeKey: "image route" },
      }),
    ).toThrow();
  });

  test("normalizes created connection URLs and defaults the environment", () => {
    const parsed = saveModelConfigurationDraftSchema.parse({
      ...commonDraft,
      connection: {
        baseUrl: " https://api.example.com/v1 ",
        mode: "create",
        name: " New connection ",
      },
      packageKey: "openai-compatible.gpt-image-2",
    });

    expect(parsed.connection).toEqual({
      baseUrl: "https://api.example.com/v1",
      environment: "production",
      mode: "create",
      name: "New connection",
    });
  });

  test("rejects unsafe base URL components", () => {
    const unsafeBaseUrls = [
      "ftp://api.example.com/v1",
      "https://user@api.example.com/v1",
      "https://user:password@api.example.com/v1",
      "https://api.example.com/v1?apiKey=synthetic",
      "https://api.example.com/v1#credentials",
    ];

    for (const baseUrl of unsafeBaseUrls) {
      expect(() =>
        saveModelConfigurationDraftSchema.parse({
          ...commonDraft,
          connection: {
            baseUrl,
            mode: "create",
            name: "New connection",
          },
          packageKey: "openai-compatible.gpt-image-2",
        }),
      ).toThrow();
    }
  });

  test("canonicalizes an origin-only base URL with a trailing slash", () => {
    const parsed = saveModelConfigurationDraftSchema.parse({
      ...commonDraft,
      connection: {
        baseUrl: "https://api.example.com",
        mode: "create",
        name: "New connection",
      },
      packageKey: "openai-compatible.gpt-image-2",
    });

    expect(parsed.connection).toMatchObject({ baseUrl: "https://api.example.com/" });
  });

  test("accepts an existing connection choice", () => {
    const parsed = saveModelConfigurationDraftSchema.parse({
      ...commonDraft,
      connection: { connectionId: existingConnectionId, mode: "existing" },
      packageKey: "openai-compatible.gpt-image-2",
    });

    expect(parsed.connection).toEqual({ connectionId: existingConnectionId, mode: "existing" });
  });
});
