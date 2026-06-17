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
});
