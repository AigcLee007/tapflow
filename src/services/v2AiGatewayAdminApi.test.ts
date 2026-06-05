import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  createAdminCredential,
  createAdminModel,
  createAdminProvider,
  createAdminRoute,
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

  test("creates provider, model, route, and credential through admin v2 paths", async () => {
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (input.endsWith("/admin/ai/providers")) {
        return new Response(JSON.stringify({ id: "provider-1", ...body }), {
          headers: { "content-type": "application/json" },
          status: 201,
        });
      }
      if (input.endsWith("/admin/ai/models")) {
        return new Response(JSON.stringify({ id: "model-1", ...body }), {
          headers: { "content-type": "application/json" },
          status: 201,
        });
      }
      if (input.endsWith("/admin/ai/routes")) {
        return new Response(JSON.stringify({ id: "route-1", ...body }), {
          headers: { "content-type": "application/json" },
          status: 201,
        });
      }
      return new Response(JSON.stringify({ id: "credential-1", ...body, maskedSecret: "sk-***" }), {
        headers: { "content-type": "application/json" },
        status: 201,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await createAdminProvider({
      defaultBaseUrl: "https://api.example.com/v1",
      key: "example",
      kind: "openai-compatible",
      name: "Example",
    });
    await createAdminModel({
      displayName: "Example Text",
      modality: "text",
      modelKey: "example-text",
      providerId: "provider-1",
    });
    await createAdminRoute({
      modality: "text",
      modelId: "model-1",
      providerId: "provider-1",
      routeKey: "text.example",
    });
    await createAdminCredential({
      name: "Example Key",
      providerId: "provider-1",
      secret: "sk-test",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/v2/admin/ai/providers",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v2/admin/ai/models",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/v2/admin/ai/routes",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/v2/admin/credentials",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
