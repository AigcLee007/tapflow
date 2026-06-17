import { describe, expect, test, vi } from "vitest";

import { processWorkbenchGenerateJob } from "../src/processors/workbench-generate.processor.js";

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
