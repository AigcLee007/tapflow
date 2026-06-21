import { describe, expect, test, vi } from "vitest";

import { processWorkbenchGenerateJob } from "../src/processors/workbench-generate.processor.js";
import { WorkbenchGenerationService } from "../src/workbench/workbench-generation.service.js";

describe("processWorkbenchGenerateJob", () => {
  test("delegates to the workbench generation service", async () => {
    const service = {
      executeGeneration: vi.fn(async () => ({
        queueName: "workbench.generate",
        status: "ok" as const,
        tenantId: "tenant-1",
        traceId: "trace-1",
      })),
    };
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
    };

    const result = await processWorkbenchGenerateJob(
      {
        data: {
          generationId: "generation-1",
          tenantId: "tenant-1",
          traceId: "trace-1",
        },
        id: "job-1",
        queueName: "workbench.generate",
        timestamp: Date.now(),
      } as never,
      logger,
      {
        generationService: service as never,
      },
    );

    expect(service.executeGeneration).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      jobId: "job-1",
      queueName: "workbench.generate",
      status: "ok",
      tenantId: "tenant-1",
      traceId: "trace-1",
    });
  });
});

describe("WorkbenchGenerationService", () => {
  test("emits structured summary logs for workbench generation execution", async () => {
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
    };
    const service = new WorkbenchGenerationService({
      assetBucket: "test-bucket",
      assetStore: {
        persistOutputs: vi.fn(async () => ({
          deferredVariantJobs: [],
          refs: [
            {
              assetId: "asset-structured-1",
              kind: "image",
              mimeType: "image/png",
              timing: {
                asset_db_insert_ms: 8,
                asset_original_upload_ms: 14,
                asset_variant_processing_ms: 22,
                provider_output_download_ms: 6,
              },
            },
          ],
        })),
      } as never,
      billingService: {
        recordUsageEventWithClient: vi.fn(async () => ({ id: "usage-structured-1" })),
        settleUsageWithClient: vi.fn(async () => ({ id: "settle-structured-1" })),
      } as never,
      mediaRuntime: {
        generateImage: vi.fn(async () => ({
          outputs: [{ base64: "data:image/png;base64,AAAA", mimeType: "image/png" }],
          status: "succeeded" as const,
        })),
        pollTask: vi.fn(),
      } as never,
      pool: {} as never,
    });

    Object.defineProperty(service, "lockGeneration", {
      value: vi.fn(async () => ({
        batch_id: null,
        batch_index: null,
        batch_role: "single",
        batch_total: null,
        charged_credits: null,
        created_by: "user-structured-1",
        display_mode: "merged",
        estimated_credits: "1",
        id: "generation-structured-1",
        model_id: "model-structured-1",
        params_json: {},
        parent_generation_id: null,
        prompt: "structured logs",
        provider_task_id: null,
        reference_asset_ids: [],
        reference_upload_ids: [],
        requested_count: 1,
        reserve_ledger_id: "reserve-structured-1",
        reserved_credits: "1",
        route_key: "image.structured-log",
        session_id: null,
        status: "queued",
        tenant_id: "tenant-structured-1",
        updated_at: new Date(Date.now() - 1_000).toISOString(),
      })),
    });
    Object.defineProperty(service, "markGenerationRunning", {
      value: vi.fn(async () => undefined),
    });
    Object.defineProperty(service, "assertGenerationStillWritable", {
      value: vi.fn(async () => true),
    });
    Object.defineProperty(service, "insertResults", {
      value: vi.fn(async () => []),
    });
    Object.defineProperty(service, "markGenerationSucceeded", {
      value: vi.fn(async () => undefined),
    });
    Object.defineProperty(service, "settleGeneration", {
      value: vi.fn(async () => undefined),
    });

    const client = {
      query: vi.fn(async () => ({ rows: [] })),
      release: vi.fn(),
    };
    const pool = {
      connect: vi.fn(async () => client),
    };
    Object.defineProperty(service, "pool", {
      value: pool,
    });

    await service.executeGeneration(
      {
        generationId: "generation-structured-1",
        tenantId: "tenant-structured-1",
        traceId: "trace-structured-1",
      },
      logger,
    );

    const infoCalls = logger.info.mock.calls;
    expect(infoCalls.map((call) => call[0]?.event)).toEqual(
      expect.arrayContaining([
        "workbench.generation.started",
        "workbench.generation.provider_completed",
        "workbench.generation.assets_persisted",
        "workbench.generation.finished",
      ]),
    );
    expect(infoCalls.find((call) => call[0]?.event === "workbench.generation.finished")?.[0]).toMatchObject({
      assetPersistTotalMs: expect.any(Number),
      generationId: "generation-structured-1",
      providerLatencyMs: expect.any(Number),
      queueWaitMs: expect.any(Number),
      resultCount: 1,
      routeKey: "image.structured-log",
      tenantId: "tenant-structured-1",
      totalDurationMs: expect.any(Number),
      traceId: "trace-structured-1",
    });
  });

  test("enqueues deferred variant jobs only after transactional work completes", async () => {
    const variantQueue = {
      add: vi.fn(async () => ({ id: "variant-job-1" })),
    };
    const service = new WorkbenchGenerationService({
      assetBucket: "test-bucket",
      assetStore: {
        persistOutputs: vi.fn(async () => ({
          deferredVariantJobs: [
            {
              assetId: "asset-deferred-1",
              tenantId: "tenant-deferred-1",
            },
          ],
          refs: [
            {
              assetId: "asset-deferred-1",
              kind: "image",
              mimeType: "image/png",
            },
          ],
        })),
      } as never,
      billingService: {
        recordUsageEventWithClient: vi.fn(async () => ({ id: "usage-deferred-1" })),
        settleUsageWithClient: vi.fn(async () => ({ id: "settle-deferred-1" })),
      } as never,
      mediaRuntime: {
        generateImage: vi.fn(async () => ({
          outputs: [{ base64: "data:image/png;base64,AAAA", mimeType: "image/png" }],
          status: "succeeded" as const,
        })),
        pollTask: vi.fn(),
      } as never,
      pool: {} as never,
      variantQueue,
    });

    Object.defineProperty(service, "lockGeneration", {
      value: vi.fn(async () => ({
        batch_id: null,
        batch_index: null,
        batch_role: "single",
        batch_total: null,
        charged_credits: null,
        created_by: "user-deferred-1",
        display_mode: "merged",
        estimated_credits: "1",
        id: "generation-deferred-1",
        model_id: "model-deferred-1",
        params_json: {},
        parent_generation_id: null,
        prompt: "deferred logs",
        provider_task_id: null,
        reference_asset_ids: [],
        reference_upload_ids: [],
        requested_count: 1,
        reserve_ledger_id: "reserve-deferred-1",
        reserved_credits: "1",
        route_key: "image.deferred-log",
        session_id: null,
        status: "queued",
        tenant_id: "tenant-deferred-1",
        updated_at: new Date(Date.now() - 1_000).toISOString(),
      })),
    });
    Object.defineProperty(service, "markGenerationRunning", {
      value: vi.fn(async () => undefined),
    });
    Object.defineProperty(service, "assertGenerationStillWritable", {
      value: vi.fn(async () => true),
    });
    Object.defineProperty(service, "insertResults", {
      value: vi.fn(async () => []),
    });
    Object.defineProperty(service, "markGenerationSucceeded", {
      value: vi.fn(async () => undefined),
    });
    Object.defineProperty(service, "settleGeneration", {
      value: vi.fn(async () => undefined),
    });

    const client = {
      query: vi.fn(async () => ({ rows: [] })),
      release: vi.fn(),
    };
    const pool = {
      connect: vi.fn(async () => client),
    };
    Object.defineProperty(service, "pool", {
      value: pool,
    });

    await service.executeGeneration(
      {
        generationId: "generation-deferred-1",
        tenantId: "tenant-deferred-1",
        traceId: "trace-deferred-1",
      },
    );

    expect(variantQueue.add).toHaveBeenCalledWith("asset.image-variants.create", {
      assetId: "asset-deferred-1",
      tenantId: "tenant-deferred-1",
    });
  });

  test("hydrates temporary workbench reference uploads as inline image inputs", async () => {
    const queries: Array<{ sql: string; values: unknown[] | undefined }> = [];
    const client = {
      query: vi.fn(async (sql: string, values?: unknown[]) => {
        queries.push({ sql, values });
        if (sql.includes("SELECT") && sql.includes("FROM workbench_reference_uploads")) {
          return {
            rows: [
              {
                bytes_base64: Buffer.from("temp-image").toString("base64"),
                height: 456,
                id: "00000000-0000-4000-8000-000000000031",
                mime_type: "image/png",
                original_filename: "ref.png",
                size_bytes: "10",
                width: 123,
              },
            ],
          };
        }
        return { rows: [] };
      }),
    };
    const mediaRuntime = {
      generateImage: vi.fn(async () => ({
        outputs: [{ base64: "data:image/png;base64,AAAA" }],
        status: "succeeded" as const,
      })),
      pollTask: vi.fn(),
    };
    const service = new WorkbenchGenerationService({
      assetBucket: "test-bucket",
      assetStore: {} as never,
      mediaRuntime,
      pool: {} as never,
    });

    const referenceAssets = await (service as unknown as {
      loadReferenceAssets(
        client: typeof client,
        tenantId: string,
        assetIds: string[],
        uploadIds: string[],
      ): Promise<Array<{ assetId: string; metadata: Record<string, unknown>; mimeType: string; width: number }>>;
    }).loadReferenceAssets(
      client,
      "00000000-0000-4000-8000-000000000001",
      [],
      ["00000000-0000-4000-8000-000000000031"],
    );

    expect(referenceAssets).toHaveLength(1);
    expect(referenceAssets[0]).toMatchObject({
      assetId: "00000000-0000-4000-8000-000000000031",
      mimeType: "image/png",
      width: 123,
    });
    expect(referenceAssets[0]?.metadata.url).toBe("data:image/png;base64,dGVtcC1pbWFnZQ==");
    expect(referenceAssets[0]?.metadata.source).toBe("workbench-temp-upload");
  });

  test("settles usage without writing product model keys into uuid model_id", async () => {
    const usageInputs: unknown[] = [];
    const billingService = {
      recordUsageEventWithClient: vi.fn(async (_client, _tenantId, input) => {
        usageInputs.push(input);
        return { id: "00000000-0000-4000-8000-000000000021" };
      }),
      settleUsageWithClient: vi.fn(async () => ({
        id: "00000000-0000-4000-8000-000000000022",
      })),
    };
    const client = {
      query: vi.fn(async () => ({ rows: [] })),
    };
    const service = new WorkbenchGenerationService({
      assetBucket: "test-bucket",
      assetStore: {} as never,
      billingService: billingService as never,
      mediaRuntime: {} as never,
      pool: {} as never,
    });

    await (service as unknown as {
      settleGeneration(
        client: typeof client,
        tenantId: string,
        generation: {
          display_mode: "merged";
          id: string;
          model_id: string;
          requested_count: number;
          reserved_credits: string;
          route_key: string;
          session_id: string | null;
        },
        units: number,
      ): Promise<void>;
    }).settleGeneration(
      client,
      "00000000-0000-4000-8000-000000000001",
      {
        display_mode: "merged",
        id: "00000000-0000-4000-8000-000000000011",
        model_id: "pixellelabs.nano-banana-pro",
        requested_count: 1,
        reserved_credits: "4",
        route_key: "image.pixellelabs.nano-banana-pro",
        session_id: null,
      },
      1,
    );

    expect(usageInputs[0]).toMatchObject({
      metadata: {
        productModelId: "pixellelabs.nano-banana-pro",
      },
      modelId: null,
    });
  });

  test("does not persist outputs when the workbench generation was deleted while provider work was running", async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("deleted_at IS NULL") && sql.includes("status <> 'canceled'")) {
          return { rows: [] };
        }
        return { rows: [] };
      }),
    };
    const service = new WorkbenchGenerationService({
      assetBucket: "test-bucket",
      assetStore: {} as never,
      mediaRuntime: {} as never,
      pool: {} as never,
    });

    const shouldContinue = await (service as unknown as {
      assertGenerationStillWritable(client: typeof client, tenantId: string, generationId: string): Promise<boolean>;
    }).assertGenerationStillWritable(
      client,
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000011",
    );

    expect(shouldContinue).toBe(false);
    expect(client.query.mock.calls[0]?.[0]).toContain("deleted_at IS NULL");
    expect(client.query.mock.calls[0]?.[0]).toContain("status <> 'canceled'");
  });

  test("child batch generations send one-image metadata to the provider", async () => {
    const client = {
      query: vi.fn(async (sql: string) => {
        if (
          sql === "BEGIN" ||
          sql === "COMMIT" ||
          sql === "ROLLBACK" ||
          sql.includes("set_config('app.tenant_id'") ||
          sql.includes("set_config('app.user_id'")
        ) {
          return { rows: [] };
        }
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    const mediaRuntime = {
      generateImage: vi.fn(async () => ({
        outputs: [{ base64: "data:image/png;base64,AAAA" }],
        status: "succeeded" as const,
      })),
      pollTask: vi.fn(),
    };
    const service = new WorkbenchGenerationService({
      assetBucket: "test-bucket",
      assetStore: {} as never,
      mediaRuntime,
      pool: {
        connect: vi.fn(async () => client),
      } as never,
    });

    await (service as unknown as {
      createProviderTask(
        tenantId: string,
        generation: {
          batch_role: "child";
          created_by: string | null;
          display_mode: "merged";
          model_id: string;
          params_json: Record<string, unknown>;
          prompt: string;
          reference_asset_ids: string[];
          reference_upload_ids: string[];
          requested_count: number;
          route_key: string;
        },
      ): Promise<unknown>;
      loadReferenceAssetsForGeneration(tenantId: string, generation: unknown): Promise<unknown[]>;
    }).createProviderTask(
      "00000000-0000-4000-8000-000000000001",
      {
        batch_role: "child",
        created_by: "00000000-0000-4000-8000-000000000009",
        display_mode: "merged",
        model_id: "pixellelabs.nano-banana-pro",
        params_json: { aspect_ratio: "1:1" },
        prompt: "batch child",
        reference_asset_ids: [],
        reference_upload_ids: [],
        requested_count: 1,
        route_key: "image.pixellelabs.nano-banana-pro",
      },
    );

    expect(mediaRuntime.generateImage).toHaveBeenCalledTimes(1);
    expect(mediaRuntime.generateImage.mock.calls[0]?.[1]).toMatchObject({
      metadata: {
        params: {
          aspect_ratio: "1:1",
          displayMode: "merged",
        },
      },
    });
    expect(mediaRuntime.generateImage.mock.calls[0]?.[1]?.metadata?.params?.n).toBeUndefined();
  });

  test("workbench provider requests mirror hydrated references into metadata.referenceImages", async () => {
    const mediaRuntime = {
      generateImage: vi.fn(async () => ({
        outputs: [{ base64: "data:image/png;base64,AAAA" }],
        status: "succeeded" as const,
      })),
      pollTask: vi.fn(),
    };
    const service = new WorkbenchGenerationService({
      assetBucket: "test-bucket",
      assetStore: {} as never,
      mediaRuntime,
      pool: {} as never,
    });

    Object.defineProperty(service, "loadReferenceAssetsForGeneration", {
      value: vi.fn(async () => ([
        {
          assetId: "asset-reference-1",
          metadata: {
            signedUrl: "https://assets.example/reference-1.png",
            url: "https://assets.example/reference-1.png",
          },
          mimeType: "image/png",
        },
        {
          assetId: "temp-upload-1",
          metadata: {
            base64: "data:image/png;base64,dGVtcC1pbWFnZQ==",
            source: "workbench-temp-upload",
            url: "data:image/png;base64,dGVtcC1pbWFnZQ==",
          },
          mimeType: "image/png",
        },
      ])),
    });

    await (service as unknown as {
      createProviderTask(
        tenantId: string,
        generation: {
          batch_role: "single";
          created_by: string | null;
          display_mode: "merged";
          id: string;
          model_id: string;
          params_json: Record<string, unknown>;
          prompt: string;
          reference_asset_ids: string[];
          reference_upload_ids: string[];
          requested_count: number;
          route_key: string;
        },
      ): Promise<unknown>;
    }).createProviderTask(
      "00000000-0000-4000-8000-000000000001",
      {
        batch_role: "single",
        created_by: "00000000-0000-4000-8000-000000000009",
        display_mode: "merged",
        id: "00000000-0000-4000-8000-000000000051",
        model_id: "pixellelabs.nano-banana-pro",
        params_json: { aspect_ratio: "1:1" },
        prompt: "edit with workbench references",
        reference_asset_ids: ["00000000-0000-4000-8000-000000000061"],
        reference_upload_ids: ["00000000-0000-4000-8000-000000000071"],
        requested_count: 1,
        route_key: "image.mouxihub.nano-banana-pro.t3",
      },
    );

    expect(mediaRuntime.generateImage).toHaveBeenCalledTimes(1);
    expect(mediaRuntime.generateImage.mock.calls[0]?.[1]).toMatchObject({
      inputAssets: [
        {
          assetId: "asset-reference-1",
        },
        {
          assetId: "temp-upload-1",
        },
      ],
      metadata: {
        referenceImages: [
          "https://assets.example/reference-1.png",
          "data:image/png;base64,dGVtcC1pbWFnZQ==",
        ],
      },
    });
  });

  test("omits quality and moderation for MouxiHub Nano Banana Pro T3 workbench requests", async () => {
    const mediaRuntime = {
      generateImage: vi.fn(async () => ({
        outputs: [{ base64: "data:image/png;base64,AAAA" }],
        status: "succeeded" as const,
      })),
      pollTask: vi.fn(),
    };
    const service = new WorkbenchGenerationService({
      assetBucket: "test-bucket",
      assetStore: {} as never,
      mediaRuntime,
      pool: {} as never,
    });

    Object.defineProperty(service, "loadReferenceAssetsForGeneration", {
      value: vi.fn(async () => ([
        {
          assetId: "asset-reference-1",
          metadata: {
            signedUrl: "https://assets.example/reference-1.png",
            url: "https://assets.example/reference-1.png",
          },
          mimeType: "image/png",
        },
        {
          assetId: "temp-upload-1",
          metadata: {
            base64: "data:image/png;base64,dGVtcC1pbWFnZQ==",
            source: "workbench-temp-upload",
            url: "data:image/png;base64,dGVtcC1pbWFnZQ==",
          },
          mimeType: "image/png",
        },
      ])),
    });

    await (service as unknown as {
      createProviderTask(
        tenantId: string,
        generation: {
          batch_role: "single";
          created_by: string | null;
          display_mode: "merged";
          id: string;
          model_id: string;
          params_json: Record<string, unknown>;
          prompt: string;
          reference_asset_ids: string[];
          reference_upload_ids: string[];
          requested_count: number;
          route_key: string;
        },
      ): Promise<unknown>;
    }).createProviderTask(
      "00000000-0000-4000-8000-000000000001",
      {
        batch_role: "single",
        created_by: "00000000-0000-4000-8000-000000000009",
        display_mode: "merged",
        id: "00000000-0000-4000-8000-000000000052",
        model_id: "pixellelabs.nano-banana-pro",
        params_json: {
          aspect_ratio: "16:9",
          moderation: "auto",
          output_format: "png",
          quality: "auto",
          size: "2k",
        },
        prompt: "edit with workbench references",
        reference_asset_ids: ["00000000-0000-4000-8000-000000000061"],
        reference_upload_ids: ["00000000-0000-4000-8000-000000000071"],
        requested_count: 1,
        route_key: "image.mouxihub.nano-banana-pro.t3",
      },
    );

    expect(mediaRuntime.generateImage).toHaveBeenCalledTimes(1);
    expect(mediaRuntime.generateImage.mock.calls[0]?.[1]).toMatchObject({
      metadata: {
        params: {
          aspect_ratio: "16:9",
          output_format: "png",
          size: "2k",
        },
        referenceImages: [
          "https://assets.example/reference-1.png",
          "data:image/png;base64,dGVtcC1pbWFnZQ==",
        ],
      },
    });
    expect(mediaRuntime.generateImage.mock.calls[0]?.[1]?.metadata?.params).not.toHaveProperty("quality");
    expect(mediaRuntime.generateImage.mock.calls[0]?.[1]?.metadata?.params).not.toHaveProperty("moderation");
  });

  test("emits T3 request debug summary for workbench reference payloads", async () => {
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
    };
    const mediaRuntime = {
      generateImage: vi.fn(async () => ({
        outputs: [{ base64: "data:image/png;base64,AAAA" }],
        status: "succeeded" as const,
      })),
      pollTask: vi.fn(),
    };
    const service = new WorkbenchGenerationService({
      assetBucket: "test-bucket",
      assetStore: {} as never,
      mediaRuntime,
      pool: {} as never,
    });

    Object.defineProperty(service, "loadReferenceAssetsForGeneration", {
      value: vi.fn(async () => ([
        {
          assetId: "asset-reference-1",
          metadata: {
            signedUrl: "https://assets.example/reference-1.png",
            url: "https://assets.example/reference-1.png",
          },
          mimeType: "image/png",
        },
        {
          assetId: "temp-upload-1",
          metadata: {
            base64: "data:image/png;base64,dGVtcC1pbWFnZQ==",
            source: "workbench-temp-upload",
            url: "data:image/png;base64,dGVtcC1pbWFnZQ==",
          },
          mimeType: "image/png",
        },
      ])),
    });

    await (service as unknown as {
      createProviderTask(
        tenantId: string,
        generation: {
          batch_role: "single";
          created_by: string | null;
          display_mode: "merged";
          id: string;
          model_id: string;
          params_json: Record<string, unknown>;
          prompt: string;
          reference_asset_ids: string[];
          reference_upload_ids: string[];
          requested_count: number;
          route_key: string;
        },
        instrumentation?: {
          logger?: typeof logger;
          traceId?: string | null;
        },
      ): Promise<unknown>;
    }).createProviderTask(
      "00000000-0000-4000-8000-000000000001",
      {
        batch_role: "single",
        created_by: "00000000-0000-4000-8000-000000000009",
        display_mode: "merged",
        id: "00000000-0000-4000-8000-000000000053",
        model_id: "pixellelabs.nano-banana-pro",
        params_json: {
          aspect_ratio: "16:9",
          moderation: "auto",
          output_format: "png",
          quality: "auto",
          size: "2k",
        },
        prompt: "图一女孩穿印有图二图案的衣服",
        reference_asset_ids: ["00000000-0000-4000-8000-000000000061"],
        reference_upload_ids: ["00000000-0000-4000-8000-000000000071"],
        requested_count: 1,
        route_key: "image.mouxihub.nano-banana-pro.t3",
      },
      {
        logger,
        traceId: "trace-workbench-t3-debug",
      },
    );

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "workbench.generation.request_debug",
        generationId: "00000000-0000-4000-8000-000000000053",
        inputAssetCount: 2,
        inputAssetKinds: ["signedUrl", "dataUrl"],
        metadataReferenceImageCount: 2,
        metadataReferenceImageKinds: ["httpsUrl", "dataUrl"],
        params: {
          aspect_ratio: "16:9",
          output_format: "png",
          size: "2k",
        },
        routeKey: "image.mouxihub.nano-banana-pro.t3",
        source: "workbench",
        tenantId: "00000000-0000-4000-8000-000000000001",
        traceId: "trace-workbench-t3-debug",
      }),
      "workbench image request debug",
    );
  });
});
