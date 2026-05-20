import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  listAdminPricing,
  listAdminRoutes,
  rotateAdminCredential,
  upsertAdminPricing,
} from "./v2AiGatewayAdminApi";
import { clearStoredAuth, setStoredTokens } from "./v2HttpClient";

describe("v2AiGatewayAdminApi", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setStoredTokens({
      accessToken: "test-token",
      refreshToken: "refresh-token",
    });
  });

  afterEach(() => {
    clearStoredAuth();
    vi.unstubAllGlobals();
  });

  test("lists admin routes with auth header", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify([{ id: "route-1", routeKey: "image.openai" }]), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await listAdminRoutes();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v2/admin/ai/routes",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
        method: "GET",
      }),
    );
  });

  test("rotates credential without exposing secret in URL", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "credential-1", maskedSecret: "sk-***" }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await rotateAdminCredential("credential-1", "sk-test-secret");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v2/admin/credentials/credential-1/rotate",
      expect.objectContaining({
        body: JSON.stringify({ secret: "sk-test-secret" }),
        method: "POST",
      }),
    );
  });

  test("lists and upserts pricing with expected paths", async () => {
    const fetchMock = vi.fn(async (_input: string, init?: RequestInit) => {
      const method = init?.method || "GET";
      if (method === "PATCH") {
        return new Response(
          JSON.stringify({
            model: "gpt-image-2",
            provider: "openai-compatible",
            route: "image.openai",
            unit: "image_generation",
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        );
      }
      return new Response(JSON.stringify([]), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await listAdminPricing("image_generation");
    await upsertAdminPricing({
      minChargeCredits: 100,
      model: "gpt-image-2",
      provider: "openai-compatible",
      route: "image.openai",
      unit: "image_generation",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/v2/admin/ai/pricing?unit=image_generation",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v2/admin/ai/pricing",
      expect.objectContaining({
        method: "PATCH",
      }),
    );
  });
});
