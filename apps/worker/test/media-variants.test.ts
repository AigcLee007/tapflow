import { describe, expect, test } from "vitest";
import sharp from "sharp";

import { createImageVariants } from "../src/workflow-runtime/media-variants.js";

describe("createImageVariants", () => {
  test("creates webp thumb and preview variants for large images", async () => {
    const original = await sharp({
      create: {
        background: { r: 20, g: 80, b: 160, alpha: 1 },
        channels: 4,
        height: 1400,
        width: 2200,
      },
    })
      .png()
      .toBuffer();

    const variants = await createImageVariants({
      body: original,
      mimeType: "image/png",
    });

    expect(variants.map((item) => item.variantKey)).toEqual(["thumb", "preview"]);
    expect(variants[0]?.mimeType).toBe("image/webp");
    expect(variants[0]?.width).toBe(640);
    expect(variants[0]?.height).toBe(407);
    expect(variants[1]?.width).toBeLessThanOrEqual(1024);
    expect(variants[1]?.height).toBeLessThanOrEqual(1024);
    expect(variants[0]?.body.byteLength).toBeLessThan(original.byteLength);
  });

  test("skips variants for unsupported media", async () => {
    const variants = await createImageVariants({
      body: Buffer.from("not an image"),
      mimeType: "video/mp4",
    });

    expect(variants).toEqual([]);
  });
});
