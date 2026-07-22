import sharp from "sharp";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import { generatePromptMediaVariants, migratePromptMediaRows, parsePromptMediaVariantArgs } from "./migrate-prompt-media-variants";

describe("prompt media variant migration", () => {
  const directories: string[] = [];
  afterEach(async () => Promise.all(directories.splice(0).map((path) => rm(path, { force: true, recursive: true }))));

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

  test("does not overwrite existing variants and records their keys", async () => {
    const mediaDir = await mkdtemp(join(tmpdir(), "prompt-variant-migration-"));
    directories.push(mediaDir);
    const source = await sharp({ create: { background: "#00ff00", channels: 3, height: 900, width: 1200 } }).png().toBuffer();
    await writeFile(join(mediaDir, "original.png"), source);
    await writeFile(join(mediaDir, "original.thumb.webp"), Buffer.from("existing-thumb"));
    const updateRow = vi.fn(async () => undefined);

    const counts = await migratePromptMediaRows([
      { id: "media-1", preview_storage_key: null, storage_key: "original.png", thumbnail_storage_key: null },
    ], { concurrency: 1, dryRun: false, mediaDir, updateRow });

    expect((await readFile(join(mediaDir, "original.thumb.webp"))).toString()).toBe("existing-thumb");
    expect(await readFile(join(mediaDir, "original.preview.webp"))).not.toHaveLength(0);
    expect(updateRow).toHaveBeenCalledWith("media-1", "original.thumb.webp", "original.preview.webp");
    expect(counts).toEqual({ failed: 0, generated: 1, processed: 1, skipped: 0 });
  });

  test("skips rows whose original file is missing", async () => {
    const mediaDir = await mkdtemp(join(tmpdir(), "prompt-variant-migration-"));
    directories.push(mediaDir);
    const updateRow = vi.fn(async () => undefined);

    const counts = await migratePromptMediaRows([
      { id: "media-missing", preview_storage_key: null, storage_key: "missing.png", thumbnail_storage_key: null },
    ], { concurrency: 2, dryRun: false, mediaDir, updateRow });

    expect(counts).toEqual({ failed: 0, generated: 0, processed: 1, skipped: 1 });
    expect(updateRow).not.toHaveBeenCalled();
  });
});
