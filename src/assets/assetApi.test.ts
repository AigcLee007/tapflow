import { beforeEach, describe, expect, it, vi } from "vitest";

const apiPostMock = vi.fn();
const apiPatchMock = vi.fn();
const getStoredAccessTokenMock = vi.fn();

vi.mock("../services/v2HttpClient", () => ({
  apiPatch: (...args: unknown[]) => apiPatchMock(...args),
  apiPost: (...args: unknown[]) => apiPostMock(...args),
  getStoredAccessToken: (...args: unknown[]) => getStoredAccessTokenMock(...args),
}));

function stubUrlObjectApi(createObjectURL: ReturnType<typeof vi.fn>, revokeObjectURL: ReturnType<typeof vi.fn>) {
  const OriginalURL = globalThis.URL;
  class URLWithObjectApi extends OriginalURL {
    static createObjectURL = createObjectURL;
    static revokeObjectURL = revokeObjectURL;
  }
  vi.stubGlobal("URL", URLWithObjectApi as unknown as typeof URL);
}

describe("uploadAssetFile", () => {
  beforeEach(() => {
    apiPostMock.mockReset();
    apiPatchMock.mockReset();
    getStoredAccessTokenMock.mockReset();
    getStoredAccessTokenMock.mockReturnValue("test-access-token");
    vi.unstubAllGlobals();
  });

  it("falls back to the API upload proxy when direct presigned upload fetch fails", async () => {
    class FakeImage {
      naturalHeight = 1536;
      naturalWidth = 864;
      onerror: null | ((error?: unknown) => void) = null;
      onload: null | (() => void) = null;

      set src(_value: string) {
        queueMicrotask(() => {
          this.onload?.();
        });
      }
    }

    vi.stubGlobal("Image", FakeImage as unknown as typeof Image);
    const createObjectURL = vi.fn(() => "blob://cat");
    const revokeObjectURL = vi.fn();
    stubUrlObjectApi(createObjectURL, revokeObjectURL);

    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    apiPostMock
      .mockResolvedValueOnce({
        asset: {
          durationMs: null,
          height: 768,
          id: "asset-1",
          mimeType: "image/png",
          originalFilename: "cat.png",
          previewUrl: undefined,
          source: "upload",
          title: "cat",
          width: 1024,
        },
        upload: {
          expiresAt: "2026-06-11T12:00:00.000Z",
          headers: { "content-type": "image/png" },
          method: "PUT",
          url: "https://storage.test/direct-upload",
        },
      })
      .mockResolvedValueOnce({
        durationMs: null,
        height: 768,
        id: "asset-1",
        mimeType: "image/png",
        originalFilename: "cat.png",
        previewUrl: undefined,
        source: "upload",
        title: "cat",
        width: 1024,
      });
    apiPatchMock.mockResolvedValue({
      durationMs: null,
      height: 768,
      id: "asset-1",
      mimeType: "image/png",
      originalFilename: "cat.png",
      previewUrl: undefined,
      source: "upload",
      title: "cat.png",
      width: 1024,
    });

    const { uploadAssetFile } = await import("./assetApi");
    const file = new File(["cat"], "cat.png", { type: "image/png" });
    const result = await uploadAssetFile({ file, kind: "image", projectId: "project-1" });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://storage.test/direct-upload",
      expect.objectContaining({
        body: file,
        headers: { "content-type": "image/png" },
        method: "PUT",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v2/assets/asset-1/upload-bytes",
      expect.objectContaining({
        body: file,
        headers: expect.objectContaining({
          Authorization: "Bearer test-access-token",
          "Content-Type": "application/octet-stream",
          "x-asset-upload-content-type": "image/png",
        }),
        method: "POST",
      }),
    );
    expect(apiPostMock).toHaveBeenNthCalledWith(
      1,
      "/assets/presigned-upload",
      expect.objectContaining({
        height: 1536,
        width: 864,
      }),
    );
    expect(apiPostMock).toHaveBeenNthCalledWith(2, "/assets/asset-1/complete-upload", {
      height: 1536,
      sizeBytes: file.size,
      width: 864,
    });
    expect(result).toMatchObject({
      id: "asset-1",
      title: "cat.png",
    });
  });
});

describe("readImageDimensions", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads natural image dimensions before upload metadata is sent", async () => {
    class FakeImage {
      naturalHeight = 1536;
      naturalWidth = 864;
      onerror: null | (() => void) = null;
      onload: null | (() => void) = null;

      set src(_value: string) {
        queueMicrotask(() => {
          this.onload?.();
        });
      }
    }

    vi.stubGlobal("Image", FakeImage as unknown as typeof Image);
    const createObjectURL = vi.fn(() => "blob://portrait");
    const revokeObjectURL = vi.fn();
    stubUrlObjectApi(createObjectURL, revokeObjectURL);

    const { readImageDimensions } = await import("./assetApi");
    const file = new File(["portrait"], "portrait.png", { type: "image/png" });
    const result = await readImageDimensions(file);

    expect(result).toEqual({ height: 1536, width: 864 });
    expect(createObjectURL).toHaveBeenCalledWith(file);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob://portrait");
  });
});
