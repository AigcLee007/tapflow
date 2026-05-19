import { describe, expect, test } from "vitest";

import { AiGatewayError } from "../src/errors.js";
import { MockProviderAdapter } from "../src/mock-provider-adapter.js";

const context = {
  apiKey: "mock-key",
  baseUrl: "mock://local",
  modelKey: "mock-image-v1",
  providerKey: "mock-local-dev",
  requestConfig: {},
  routeId: "route-1",
  routeKey: "image.default",
  timeoutMs: 5000,
};

describe("MockProviderAdapter", () => {
  test("returns inline base64 png on success", async () => {
    const adapter = new MockProviderAdapter();
    const result = await adapter.generateImage(context, {
      prompt: "make image",
      routeKey: "image.default",
    });

    expect(result.status).toBe("succeeded");
    expect(result.outputs?.[0]?.mimeType).toBe("image/png");
    expect(result.outputs?.[0]?.base64?.startsWith("data:image/png;base64,")).toBe(true);
  });

  test("throws failure when route key indicates fail", async () => {
    const adapter = new MockProviderAdapter();

    await expect(
      adapter.generateImage(
        {
          ...context,
          routeKey: "image.fail",
        },
        {
          prompt: "fail this",
          routeKey: "image.fail",
        },
      ),
    ).rejects.toBeInstanceOf(AiGatewayError);
  });
});

