import { describe, expect, test, vi } from "vitest";
import sharp from "sharp";

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { StorageProvider } from "@aigc-flow/storage";
import type { WorkerLogger } from "../src/logger.js";

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
  test("persists local rendered video files without base64 conversion", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "tapflow-render-output-"));
    try {
      const outputPath = join(tempDir, "rendered-output.mp4");
      await writeFile(outputPath, Buffer.from("fake mp4 bytes"));

      const client = {
        query: vi.fn(async () => ({ rows: [] })),
      };
      const storageProvider = new MemoryStorageProvider();
      const store = new MediaAssetStore({
        assetBucket: "test-bucket",
        storageProvider,
      });

      const result = await store.persistOutputs(client as never, {
        kind: "video",
        nodeRunId: "00000000-0000-4000-8000-000000000032",
        outputs: [
          {
            durationMs: 4200,
            localFilePath: outputPath,
            mimeType: "video/mp4",
          },
        ],
        projectId: "00000000-0000-4000-8000-000000000033",
        tenantId: "00000000-0000-4000-8000-000000000034",
        workflowRunId: "00000000-0000-4000-8000-000000000035",
      });

      expect(result.refs).toEqual([
        expect.objectContaining({
          durationMs: 4200,
          kind: "video",
          mimeType: "video/mp4",
        }),
      ]);
      expect(storageProvider.objects.size).toBe(1);
      expect([...storageProvider.objects.values()][0]?.toString()).toBe("fake mp4 bytes");
      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO assets"),
        expect.arrayContaining([
          "video/mp4",
          expect.stringContaining("rendered-output.mp4"),
          "rendered-output.mp4",
          14,
          null,
          null,
          4200,
        ]),
      );
    } finally {
      await rm(tempDir, { force: true, recursive: true });
    }
  });

  test("emits structured stage logs for persisted image outputs", async () => {
    const client = {
      query: vi.fn(async () => ({ rows: [] })),
    };
    const storageProvider = new MemoryStorageProvider();
    const logger: WorkerLogger = {
      error: vi.fn(),
      info: vi.fn(),
    };
    const store = new MediaAssetStore({
      assetBucket: "test-bucket",
      storageProvider,
    });

    const result = await store.persistOutputs(
      client as never,
      {
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
      },
      {
        generationId: "generation-1",
        logger,
        routeKey: "image.default",
        traceId: "trace-1",
      },
    );

    const refs = result.refs;
    expect(refs).toHaveLength(1);
    const infoCalls = (logger.info as ReturnType<typeof vi.fn>).mock.calls;
    expect(infoCalls.map((call) => call[0]?.event)).toEqual(
      expect.arrayContaining([
        "asset.persist.started",
        "asset.persist.output_download.finished",
        "asset.persist.original_upload.finished",
        "asset.persist.db_insert.finished",
        "asset.variant.generate.finished",
        "asset.variant.upload.finished",
        "asset.variant.db_insert.finished",
        "asset.persist.completed",
      ]),
    );
    expect(infoCalls.find((call) => call[0]?.event === "asset.persist.completed")?.[0]).toMatchObject({
      assetId: refs[0].assetId,
      durationMs: expect.any(Number),
      generationId: "generation-1",
      routeKey: "image.default",
      tenantId: "00000000-0000-4000-8000-000000000004",
      traceId: "trace-1",
    });
  });

  test("returns per-asset persistence timing for media outputs", async () => {
    const client = {
      query: vi.fn(async () => ({ rows: [] })),
    };
    const storageProvider = new MemoryStorageProvider();
    const store = new MediaAssetStore({
      assetBucket: "test-bucket",
      storageProvider,
    });

    const result = await store.persistOutputs(client as never, {
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

    const refs = result.refs;
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

    const result = await store.persistOutputs(client as never, {
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

    const refs = result.refs;
    expect(refs).toHaveLength(1);
    expect(storageProvider.objects.size).toBe(1);
    expect(variantQueue.add).not.toHaveBeenCalled();
    expect(result.deferredVariantJobs).toEqual([
      {
        assetId: refs[0].assetId,
        tenantId: "00000000-0000-4000-8000-000000000014",
      },
    ]);
    expect(refs[0].timing?.asset_variant_processing_ms).toBeGreaterThanOrEqual(0);
  });

  test("returns deferred variant jobs instead of enqueueing them inside async asset persistence", async () => {
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

    const result = await store.persistOutputs(client as never, {
      kind: "image",
      nodeRunId: "00000000-0000-4000-8000-000000000022",
      outputs: [
        {
          base64: (await createPngBuffer()).toString("base64"),
          mimeType: "image/png",
        },
      ],
      projectId: "00000000-0000-4000-8000-000000000023",
      tenantId: "00000000-0000-4000-8000-000000000024",
      workflowRunId: "00000000-0000-4000-8000-000000000025",
    });

    expect(variantQueue.add).not.toHaveBeenCalled();
    expect(result.refs).toHaveLength(1);
    expect(result.deferredVariantJobs).toEqual([
      {
        assetId: result.refs[0]?.assetId,
        tenantId: "00000000-0000-4000-8000-000000000024",
      },
    ]);
  });
});
