import { describe, expect, test } from "vitest";
import sharp from "sharp";
import { randomBytes } from "node:crypto";

import { compressTextImageForModel, MAX_TEXT_IMAGE_BYTES } from "../src/workflow-runtime/text-image-compression.js";

describe("compressTextImageForModel", () => {
  test("compresses a large image to a WebP payload at or below 5 MB", async () => {
    const pixels = randomBytes(3000 * 3000 * 3);
    const original = await sharp(pixels, { raw: { width: 3000, height: 3000, channels: 3 } }).png().toBuffer();

    const result = await compressTextImageForModel({ body: original, mimeType: "image/png" });

    expect(original.byteLength).toBeGreaterThan(MAX_TEXT_IMAGE_BYTES);
    expect(result.mimeType).toBe("image/webp");
    expect(result.body.byteLength).toBeLessThanOrEqual(MAX_TEXT_IMAGE_BYTES);
    const metadata = await sharp(result.body).metadata();
    expect(Math.max(metadata.width ?? 0, metadata.height ?? 0)).toBeLessThanOrEqual(2048);
  });

  test("leaves images already within the limit unchanged", async () => {
    const original = await sharp({
      create: { width: 64, height: 64, channels: 3, background: { r: 20, g: 40, b: 80 } },
    }).png().toBuffer();

    await expect(compressTextImageForModel({ body: original, mimeType: "image/png" }))
      .resolves.toEqual({ body: original, mimeType: "image/png" });
  });
});
