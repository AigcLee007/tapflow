import sharp from "sharp";
import { describe, expect, test } from "vitest";

import { generatePromptMediaVariants, parsePromptMediaVariantArgs } from "./migrate-prompt-media-variants";

describe("prompt media variant migration", () => {
  test("parses dry-run and bounded concurrency", () => {
    expect(parsePromptMediaVariantArgs(["node", "script", "--dry-run", "--concurrency", "3"])).toEqual({ concurrency: 3, dryRun: true });
    expect(() => parsePromptMediaVariantArgs(["node", "script", "--concurrency=0"])).toThrow();
  });

  test("creates 640px thumbnail and 1600px preview without enlargement", async () => {
    const source = await sharp({ create: { background: "#ff0000", channels: 3, height: 2000, width: 2400 } }).png().toBuffer();
    const result = await generatePromptMediaVariants(source);
    expect((await sharp(result.thumb).metadata()).width).toBe(640);
    expect((await sharp(result.preview).metadata()).width).toBe(1600);
  });
});
