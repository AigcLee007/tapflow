import { writeFile } from "node:fs/promises";

import { describe, expect, test, vi } from "vitest";

import type { StorageProvider } from "@aigc-flow/storage";
import type { Pool } from "pg";

import {
  probeReferenceVideo,
  transcodeReferenceVideo,
} from "../src/workflow-runtime/video-reference-variant.js";
import { VideoReferenceVariantProcessor } from "../src/workflow-runtime/video-reference-variant-processor.js";

vi.mock("../src/workflow-runtime/video-reference-variant.js", async () => {
  const actual = await vi.importActual<typeof import("../src/workflow-runtime/video-reference-variant.js")>("../src/workflow-runtime/video-reference-variant.js");
  return {
    ...actual,
    probeReferenceVideo: vi.fn(),
    transcodeReferenceVideo: vi.fn(),
  };
});

const tenantId = "11111111-1111-1111-1111-111111111111";
const assetId = "22222222-2222-2222-2222-222222222222";

function poolFor(asset: Record<string, unknown>) {
  return {
    query: vi.fn()
      .mockResolvedValueOnce({ rows: [asset] })
      .mockResolvedValue({ rows: [] }),
  } as unknown as Pool;
}

function storage(): StorageProvider & { getObject: NonNullable<StorageProvider["getObject"]> } {
  return {
    createPresignedGetUrl: vi.fn(),
    createPresignedPutUrl: vi.fn(),
    deleteObject: vi.fn(),
    getObject: vi.fn().mockResolvedValue({ body: Buffer.from("original"), contentLength: 8, contentType: "video/mp4", metadata: {} }),
    headObject: vi.fn(),
    putObject: vi.fn(),
  };
}

describe("VideoReferenceVariantProcessor", () => {
  test("ignores non-video assets without touching storage", async () => {
    const pool = poolFor({ bucket: "bucket", height: 100, id: assetId, kind: "image", metadata: {}, mime_type: "image/png", object_key: "original", tenant_id: tenantId, width: 100 });
    const objectStore = storage();
    const result = await new VideoReferenceVariantProcessor({ pool, storageProvider: objectStore }).process({ assetId, tenantId });
    expect(result).toMatchObject({ assetId, status: "ready", transcoded: false, variantCount: 0 });
    expect(objectStore.getObject).not.toHaveBeenCalled();
  });

  test("transcodes high-resolution videos and upserts the reference variant", async () => {
    vi.mocked(probeReferenceVideo).mockResolvedValue({ height: 1080, width: 1920 });
    vi.mocked(transcodeReferenceVideo).mockImplementation(async (_input, output) => {
      await writeFile(output, Buffer.from("compressed"));
    });
    const pool = poolFor({ bucket: "bucket", height: 1080, id: assetId, kind: "video", metadata: {}, mime_type: "video/mp4", object_key: "original", tenant_id: tenantId, width: 1920 });
    const objectStore = storage();
    const result = await new VideoReferenceVariantProcessor({ pool, storageProvider: objectStore }).process({ assetId, tenantId });
    expect(result).toMatchObject({ height: 720, status: "ready", transcoded: true, variantCount: 1, width: 1280 });
    expect(objectStore.putObject).toHaveBeenCalledWith(expect.objectContaining({ bucket: "bucket", contentType: "video/mp4", body: Buffer.from("compressed") }));
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO asset_variants"), expect.arrayContaining([tenantId, assetId, "reference-720p"]));
  });

  test("marks processing failure without modifying the original object", async () => {
    vi.mocked(probeReferenceVideo).mockRejectedValue(new Error("probe failed"));
    const pool = poolFor({ bucket: "bucket", height: 1080, id: assetId, kind: "video", metadata: {}, mime_type: "video/mp4", object_key: "original", tenant_id: tenantId, width: 1920 });
    const objectStore = storage();
    await expect(new VideoReferenceVariantProcessor({ pool, storageProvider: objectStore }).process({ assetId, tenantId })).rejects.toThrow("probe failed");
    expect(objectStore.putObject).not.toHaveBeenCalled();
    expect(pool.query).toHaveBeenLastCalledWith(expect.stringContaining("UPDATE assets"), [assetId, tenantId, expect.stringContaining("failed")]);
  });
});
