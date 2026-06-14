import { describe, expect, test, vi } from "vitest";
import sharp from "sharp";

import type { StorageProvider } from "@aigc-flow/storage";

import { MediaAssetStore } from "../src/workflow-runtime/media-asset-store.js";

class MemoryStorageProvider implements StorageProvider {
  readonly objects = new Map<string, Buffer>();

  async putObject(input: {
    body: Buffer | Uint8Array | string;
    bucket: string;
    contentType?: string;
    key: string;
    metadata?: Record<string, string>;
  }): Promise<void> {
    this.objects.set(`${input.bucket}/${input.key}`, Buffer.isBuffer(input.body) ? input.body : Buffer.from(input.body));
  }

  async headObject() {
    throw new Error("not used");
  }

  async deleteObject(): Promise<void> {
    throw new Error("not used");
  }

  async createPresignedPutUrl() {
    throw new Error("not used");
  }

  async createPresignedGetUrl() {
    throw new Error("not used");
  }
}

async function createPngBuffer(): Promise<Buffer> {
  return sharp({
    create: {
      background: { alpha: 1, b: 100, g: 80, r: 60 },
      channels: 4,
      height: 32,
      width: 48,
    },
  })
    .png()
    .toBuffer();
}

describe("MediaAssetStore", () => {
  test("returns per-asset persistence timing for media outputs", async () => {
    const client = {
      query: vi.fn(async () => ({ rows: [] })),
    };
    const storageProvider = new MemoryStorageProvider();
    const store = new MediaAssetStore({
      assetBucket: "test-bucket",
      storageProvider,
    });

    const refs = await store.persistOutputs(client as never, {
      kind: "image",
      nodeRunId: "00000000-0000-4000-8000-000000000002",
      outputs: [
        {
          base64: (await createPngBuffer()).toString("base64"),
          mimeType: "image/png",
        },
      ],
      projectId: "00000000-0000-4000-8000-000000000003",
      tenantId: "00000000-0000-4000-8000-000000000004",
      workflowRunId: "00000000-0000-4000-8000-000000000005",
    });

    expect(refs).toHaveLength(1);
    expect(refs[0].timing).toEqual({
      asset_db_insert_ms: expect.any(Number),
      asset_original_upload_ms: expect.any(Number),
      asset_variant_processing_ms: expect.any(Number),
      provider_output_download_ms: expect.any(Number),
    });
    expect(refs[0].timing?.asset_db_insert_ms).toBeGreaterThanOrEqual(0);
    expect(refs[0].timing?.asset_original_upload_ms).toBeGreaterThanOrEqual(0);
    expect(refs[0].timing?.asset_variant_processing_ms).toBeGreaterThanOrEqual(0);
    expect(refs[0].timing?.provider_output_download_ms).toBeGreaterThanOrEqual(0);
  });

  test("can return image asset refs after original upload and enqueue variants asynchronously", async () => {
    const client = {
      query: vi.fn(async () => ({ rows: [] })),
    };
    const variantQueue = {
      add: vi.fn(async () => ({ id: "variant-job-1" })),
    };
    const storageProvider = new MemoryStorageProvider();
    const store = new MediaAssetStore({
      assetBucket: "test-bucket",
      storageProvider,
      variantMode: "async",
      variantQueue,
    });

    const refs = await store.persistOutputs(client as never, {
      kind: "image",
      nodeRunId: "00000000-0000-4000-8000-000000000012",
      outputs: [
        {
          base64: (await createPngBuffer()).toString("base64"),
          mimeType: "image/png",
        },
      ],
      projectId: "00000000-0000-4000-8000-000000000013",
      tenantId: "00000000-0000-4000-8000-000000000014",
      workflowRunId: "00000000-0000-4000-8000-000000000015",
    });

    expect(refs).toHaveLength(1);
    expect(storageProvider.objects.size).toBe(1);
    expect(variantQueue.add).toHaveBeenCalledWith(
      "asset.image-variants.create",
      {
        assetId: refs[0].assetId,
        tenantId: "00000000-0000-4000-8000-000000000014",
      },
    );
    expect(refs[0].timing?.asset_variant_processing_ms).toBeGreaterThanOrEqual(0);
  });
});
