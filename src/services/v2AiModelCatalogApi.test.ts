import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  listAiModelCatalog,
  listAiModelRoutes,
  testAiRoute,
} from "./v2AiModelCatalogApi";
import { clearStoredAuth, setStoredTokens } from "./v2HttpClient";

describe("v2AiModelCatalogApi", () => {
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

  test("requests model catalog and model-scoped routes", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify([]), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await listAiModelCatalog("image");
    await listAiModelRoutes("nano-banana-pro");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/v2/ai/model-catalog?modality=image",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v2/ai/model-catalog/nano-banana-pro/routes",
      expect.objectContaining({ method: "GET" }),
    );
  });

  test("runs an admin route test", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ status: "ok" }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await testAiRoute("route-1", { prompt: "hello" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v2/admin/ai/routes/route-1/test",
      expect.objectContaining({
        body: JSON.stringify({ prompt: "hello" }),
        method: "POST",
      }),
    );
  });
});
