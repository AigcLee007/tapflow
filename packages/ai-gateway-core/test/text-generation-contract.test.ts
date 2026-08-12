import { describe, expect, test } from "vitest";

import {
  resolveTextGenerationCapabilities,
  validateTextImageInput,
} from "../src/text-generation-contract.js";

describe("text image input contract", () => {
  test("fails closed when image capability is absent", () => {
    expect(resolveTextGenerationCapabilities({}, {})).toEqual({
      maxImages: 0,
      supportedImageMimeTypes: [],
      supportsImageInput: false,
    });
  });

  test("uses the lower route/model maximum and normalized MIME intersection", () => {
    expect(resolveTextGenerationCapabilities(
      { maxImages: 3, supportedImageMimeTypes: ["image/png", "image/webp"], supportsImageInput: true },
      { maxImages: 2, supportedImageMimeTypes: ["image/webp", "image/jpeg"], supportsImageInput: true },
    )).toEqual({
      maxImages: 2,
      supportedImageMimeTypes: ["image/webp"],
      supportsImageInput: true,
    });
  });

  test("fails closed for explicitly empty or invalid MIME declarations", () => {
    expect(resolveTextGenerationCapabilities(
      { maxImages: 3, supportedImageMimeTypes: [], supportsImageInput: true },
      { maxImages: 3, supportedImageMimeTypes: ["image/png"], supportsImageInput: true },
    ).supportsImageInput).toBe(false);
    expect(resolveTextGenerationCapabilities(
      { maxImages: 3, supportedImageMimeTypes: ["not-a-mime"], supportsImageInput: true },
      { maxImages: 3, supportedImageMimeTypes: ["image/png"], supportsImageInput: true },
    ).supportsImageInput).toBe(false);
  });

  test("returns null when no images are supplied", () => {
    expect(validateTextImageInput({
      capabilities: { maxImages: 3, supportedImageMimeTypes: ["image/png"], supportsImageInput: true },
      inputAssets: null,
    })).toBeNull();
  });

  test("rejects image input when effective support is absent", () => {
    expect(validateTextImageInput({
      capabilities: { maxImages: 0, supportedImageMimeTypes: [], supportsImageInput: false },
      inputAssets: [{ assetId: "image-1", kind: "image", mimeType: "image/png" }],
    })).toMatchObject({ code: "TEXT_MODEL_IMAGE_INPUT_UNSUPPORTED" });
  });

  test("rejects a fourth valid image instead of truncating it", () => {
    const issue = validateTextImageInput({
      capabilities: { maxImages: 3, supportedImageMimeTypes: ["image/png"], supportsImageInput: true },
      inputAssets: ["a", "b", "c", "d"].map((assetId) => ({ assetId, kind: "image", mimeType: "image/png" })),
    });
    expect(issue).toMatchObject({ code: "TEXT_IMAGE_INPUT_LIMIT_EXCEEDED" });
  });

  test.each([
    [{ assetId: "image-1", kind: "video", mimeType: "image/png" }, "TEXT_IMAGE_TYPE_UNSUPPORTED"],
    [{ assetId: "  ", kind: "image", mimeType: "image/png" }, "TEXT_IMAGE_ASSET_NOT_FOUND"],
    [{ assetId: "image-1", kind: "image", mimeType: "image/jpeg" }, "TEXT_IMAGE_TYPE_UNSUPPORTED"],
  ] as const)("validates image kind, asset ID, and MIME type", (asset, code) => {
    expect(validateTextImageInput({
      capabilities: { maxImages: 3, supportedImageMimeTypes: ["image/png"], supportsImageInput: true },
      inputAssets: [asset],
    })).toMatchObject({ code });
  });
});
