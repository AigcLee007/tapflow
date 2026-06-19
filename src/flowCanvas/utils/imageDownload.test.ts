import { beforeEach, describe, expect, it, vi } from "vitest";

const downloadImageMock = vi.fn();

vi.mock("./imageUtils", () => ({
  downloadImage: (...args: unknown[]) => downloadImageMock(...args),
}));

describe("imageDownload", () => {
  beforeEach(() => {
    downloadImageMock.mockReset();
    vi.useRealTimers();
  });

  it("resolves asset result ids from generated result metadata", async () => {
    const {
      getAssetIdFromAssetUrl,
      getAssetIdFromResultId,
      getPreferredImageDownloadAssetId,
    } = await import("./imageDownload");

    expect(getAssetIdFromResultId("asset:asset-123")).toBe("asset-123");
    expect(getAssetIdFromResultId("runtime-asset-asset-123-0")).toBe("");
    expect(getAssetIdFromAssetUrl("https://tapflow-staging-assets.oss-ap-northeast-1.aliyuncs.com/tenants/t/assets/123e4567-e89b-12d3-a456-426614174000/original-image.png?x-oss-signature=abc")).toBe("123e4567-e89b-12d3-a456-426614174000");
    expect(getAssetIdFromAssetUrl("/api/v2/assets/asset-from-bytes/bytes?variantKey=preview")).toBe("asset-from-bytes");
    expect(getPreferredImageDownloadAssetId({
      nodeAssetId: "node-cover-asset",
      resultId: "asset:selected-result-asset",
    })).toBe("selected-result-asset");
  });

  it("downloads the original asset url instead of the preview fallback", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-19T09:08:07.000Z"));

    const { buildAittcoImageDownloadFilename, downloadOriginalImage } = await import("./imageDownload");

    expect(buildAittcoImageDownloadFilename({
      extension: "png",
      prompt: "动物运动会，3D风格，龟兔赛跑，乌龟获胜",
      sequence: 2,
    })).toBe("AIttco_20260619_动物运动会3D风格龟兔赛_02.png");

    await downloadOriginalImage({
      assetId: "asset-pig",
      fallbackUrl: "https://cdn.test/previews/pig-preview.webp",
      mimeType: "image/png",
      prompt: "动物运动会，3D风格，龟兔赛跑，乌龟获胜",
      sequence: 2,
    });

    expect(downloadImageMock).toHaveBeenCalledWith(
      "/api/v2/assets/asset-pig/bytes",
      "AIttco_20260619_动物运动会3D风格龟兔赛_02.png",
    );
  });

  it("falls back to the visible url when an original asset url is unavailable", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-19T09:08:07.000Z"));

    const { downloadOriginalImage } = await import("./imageDownload");

    await downloadOriginalImage({
      assetId: "",
      fallbackUrl: "https://cdn.test/previews/pig-preview.webp",
      mimeType: "image/png",
      prompt: "",
      sequence: 1,
    });

    expect(downloadImageMock).toHaveBeenCalledWith(
      "https://cdn.test/previews/pig-preview.webp",
      "Aittco_20260619_作品_01.webp",
    );
  });

  it("downloads old canvas signed asset urls through same-origin asset bytes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-19T09:08:07.000Z"));

    const { downloadOriginalImage } = await import("./imageDownload");

    await downloadOriginalImage({
      fallbackUrl: "https://tapflow-staging-assets.oss-ap-northeast-1.aliyuncs.com/tenants/t/assets/123e4567-e89b-12d3-a456-426614174000/original-pixellelabs-image-1.png?x-oss-signature=abc",
      mimeType: "image/png",
      prompt: "动物运动会",
      sequence: 1,
    });

    expect(downloadImageMock).toHaveBeenCalledWith(
      "/api/v2/assets/123e4567-e89b-12d3-a456-426614174000/bytes",
      "AIttco_20260619_动物运动会_01.png",
    );
  });
});
