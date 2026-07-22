import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { deleteAdminPrompt, favoritePrompt, getPromptMediaBlob, listPrompts, recordPromptInteraction, reorderAdminPrompts, type PromptMedia } from "./v2PromptsApi";
import { clearStoredAuth, setStoredTokens } from "./v2HttpClient";

describe("v2PromptsApi", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setStoredTokens({ accessToken: "test-token", refreshToken: "refresh-token" });
  });

  afterEach(() => {
    clearStoredAuth();
    vi.unstubAllGlobals();
  });

  test("serializes prompt list filters", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await listPrompts({ category: "portrait", query: "soft light", view: "favorites" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v2/prompts?query=soft+light&category=portrait&view=favorites",
      expect.objectContaining({ method: "GET" }),
    );
  });

  test("favorites and records interaction through authenticated v2 endpoints", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await favoritePrompt("9c07e9dd-9853-4d6d-bb37-22b4b0d55884", true);
    await recordPromptInteraction("9c07e9dd-9853-4d6d-bb37-22b4b0d55884", { eventType: "reference", projectId: "f4bba6ab-89aa-4af7-a30e-bfb00afc5f6f" });

    expect(fetchMock.mock.calls[0][0]).toBe("/api/v2/prompts/9c07e9dd-9853-4d6d-bb37-22b4b0d55884/favorite");
    expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({ method: "POST" }));
    expect(fetchMock.mock.calls[1][0]).toBe("/api/v2/prompts/9c07e9dd-9853-4d6d-bb37-22b4b0d55884/interactions");
    expect(fetchMock.mock.calls[1][1]).toEqual(expect.objectContaining({
      body: JSON.stringify({ eventType: "reference", projectId: "f4bba6ab-89aa-4af7-a30e-bfb00afc5f6f" }),
      method: "POST",
    }));
  });

  test("exposes local prompt media metadata without an asset id", () => {
    const media: PromptMedia = {
      altText: "Portrait result",
      height: 1024,
      id: "c8a4f904-6e05-4f2a-9b57-9f3bbc1b8ef6",
      mimeType: "image/webp",
      originalFilename: "portrait.webp",
      sizeBytes: 1234,
      sortOrder: 0,
      width: 1024,
    };

    expect(media.id).toBeTruthy();
    expect("assetId" in media).toBe(false);
  });

  test("deletes and reorders admin prompts and requests thumbnail variants", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const promptId = "9c07e9dd-9853-4d6d-bb37-22b4b0d55884";
    const mediaId = "c8a4f904-6e05-4f2a-9b57-9f3bbc1b8ef6";

    await deleteAdminPrompt(promptId);
    await reorderAdminPrompts({ promptIds: [promptId] });
    await getPromptMediaBlob(mediaId, promptId, "thumb");

    expect(fetchMock.mock.calls[0][0]).toBe(`/api/v2/admin/prompts/${promptId}`);
    expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({ method: "DELETE" }));
    expect(fetchMock.mock.calls[1][0]).toBe("/api/v2/admin/prompts/order");
    expect(fetchMock.mock.calls[1][1]).toEqual(expect.objectContaining({ body: JSON.stringify({ promptIds: [promptId] }), method: "PATCH" }));
    expect(fetchMock.mock.calls[2][0]).toBe(`/api/v2/admin/prompts/${promptId}/media/${mediaId}/bytes?variant=thumb`);
  });
});
