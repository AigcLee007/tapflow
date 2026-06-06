import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  disableAiPluginInstall,
  installAiPlugin,
  listAiPlugins,
  publishAiPluginInstall,
} from "./v2AiPluginAdminApi";
import { clearStoredAuth, setStoredTokens } from "./v2HttpClient";

describe("v2AiPluginAdminApi", () => {
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

  test("calls plugin admin endpoints with auth", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify([]), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await listAiPlugins("image");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v2/admin/ai/plugins?modality=image",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
        method: "GET",
      }),
    );
  });

  test("installs and changes plugin install status", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ id: "install-1", status: "published" }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await installAiPlugin("pixellelabs.nano-banana-pro", {
      credential: {
        name: "PixelleLabs Pro",
        secret: "sk-test",
      },
      publishImmediately: true,
    });
    await publishAiPluginInstall("install-1");
    await disableAiPluginInstall("install-1");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/v2/admin/ai/plugins/pixellelabs.nano-banana-pro/install",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v2/admin/ai/plugins/install-1/publish",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/v2/admin/ai/plugins/install-1/disable",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
