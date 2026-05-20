import { describe, expect, test } from "vitest";

import {
  createModelSchema,
  createRouteSchema,
  createCredentialSchema,
  listRuntimeRoutesQuerySchema,
  listPricingQuerySchema,
  upsertPricingSchema,
} from "../src/modules/ai-gateway/ai-gateway.schemas.js";

describe("ai-gateway schemas", () => {
  test("accepts existing routeKey examples", () => {
    const routeKeys = [
      "image.default",
      "image.fail",
      "image.openai",
      "video.default",
      "text.default",
    ];

    for (const routeKey of routeKeys) {
      const parsed = createRouteSchema.parse({
        modality: "image",
        providerId: "00000000-0000-0000-0000-000000000000",
        routeKey,
      });
      expect(parsed.routeKey).toBe(routeKey);
    }
  });

  test("rejects invalid modality values", () => {
    expect(() =>
      createModelSchema.parse({
        displayName: "x",
        modality: "audio",
        modelKey: "mock-image-v1",
        providerId: "00000000-0000-0000-0000-000000000000",
      }),
    ).toThrow();

    expect(() => listRuntimeRoutesQuerySchema.parse({ modality: "audio" })).toThrow();
  });

  test("rejects invalid status values", () => {
    expect(() =>
      createCredentialSchema.parse({
        name: "cred",
        providerId: "00000000-0000-0000-0000-000000000000",
        secret: "sk-test-secret",
        status: "enabled",
      }),
    ).toThrow();
  });

  test("rejects invalid pricing unit values", () => {
    expect(() => listPricingQuerySchema.parse({ unit: "image" })).toThrow();

    expect(() =>
      upsertPricingSchema.parse({
        minChargeCredits: 100,
        model: "gpt-image-2",
        provider: "openai-compatible",
        route: "image.openai",
        unit: "image",
      }),
    ).toThrow();
  });

  test("rejects malformed routeKey", () => {
    expect(() =>
      createRouteSchema.parse({
        modality: "image",
        providerId: "11111111-1111-1111-1111-111111111111",
        routeKey: "image default",
      }),
    ).toThrow();
  });
});
