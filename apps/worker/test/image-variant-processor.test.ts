import { describe, expect, test, vi } from "vitest";
import sharp from "sharp";

import type { StorageProvider } from "@aigc-flow/storage";

import { ImageVariantProcessor } from "../src/workflow-runtime/image-variant-processor.js";

class ReadWriteMemoryStorageProvider implements StorageProvider {
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

  async getObject(input: { bucket: string; key: string }): Promise<{ body: Buffer }> {
    const body = this.objects.get(`${input.bucket}/${input.key}`);
    if (!body) {
      throw new Error("object not found");
    }
    return { body };
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
      background: { alpha: 1, b: 90, g: 40, r: 20 },
      channels: 4,
      height: 64,
      width: 96,
    },
  })
    .png()
    .toBuffer();
}

function createPool(assetRow: Record<string, unknown>) {
  const variantInserts: unknown[][] = [];
  const client = {
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes("FROM assets")) {
        return { rows: [assetRow] };
      }
      if (sql.includes("INSERT INTO asset_variants")) {
        variantInserts.push(values ?? []);
      }
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  return {
    client,
    pool: {
      connect: vi.fn(async () => client),
    },
    variantInserts,
  };
}

describe("ImageVariantProcessor", () => {
  test("creates image variants from persisted original asset", async () => {
    const storageProvider = new ReadWriteMemoryStorageProvider();
    await storageProvider.putObject({
      body: await createPngBuffer(),
      bucket: "asset-bucket",
      key: "original.png",
    });
    const { pool, variantInserts } = createPool({
      bucket: "asset-bucket",
      id: "asset-1",
      mime_type: "image/png",
      node_run_id: "node-run-1",
      object_key: "original.png",
      tenant_id: "tenant-1",
      workflow_run_id: "workflow-run-1",
    });

    const processor = new ImageVariantProcessor({
      pool: pool as never,
      storageProvider,
    });

    const result = await processor.process({
      assetId: "asset-1",
      tenantId: "tenant-1",
    });

    expect(result).toEqual({
      assetId: "asset-1",
      variantCount: expect.any(Number),
    });
    expect(result.variantCount).toBeGreaterThan(0);
    expect(variantInserts).toHaveLength(result.variantCount);
    expect(storageProvider.objects.size).toBeGreaterThan(1);
  });

  test("skips non-image assets without reading original object", async () => {
    const storageProvider = new ReadWriteMemoryStorageProvider();
    const getObjectSpy = vi.spyOn(storageProvider, "getObject");
    const { pool, variantInserts } = createPool({
      bucket: "asset-bucket",
      id: "asset-video",
      mime_type: "video/mp4",
      node_run_id: "node-run-1",
      object_key: "original.mp4",
      tenant_id: "tenant-1",
      workflow_run_id: "workflow-run-1",
    });

    const processor = new ImageVariantProcessor({
      pool: pool as never,
      storageProvider,
    });

    const result = await processor.process({
      assetId: "asset-video",
      tenantId: "tenant-1",
    });

    expect(result).toEqual({
      assetId: "asset-video",
      variantCount: 0,
    });
    expect(getObjectSpy).not.toHaveBeenCalled();
    expect(variantInserts).toHaveLength(0);
  });
});
