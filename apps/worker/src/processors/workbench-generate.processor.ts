import type { Job } from "bullmq";

import type { WorkerLogger } from "../logger.js";
import type { ProcessorResult } from "./shared.js";
import type { WorkbenchGenerationService } from "../workbench/workbench-generation.service.js";

type WorkbenchGenerateJobPayload = {
  generationId: string;
  tenantId: string;
  traceId?: string;
};

export async function processWorkbenchGenerateJob(
  job: Job<WorkbenchGenerateJobPayload>,
  logger: WorkerLogger,
  options: {
    generationService: Pick<WorkbenchGenerationService, "executeGeneration">;
  },
): Promise<ProcessorResult> {
  const dequeuedAt = Date.now();
  const submittedAt = typeof job.timestamp === "number" ? job.timestamp : dequeuedAt;

  logger.info(
    {
      dequeued_at: new Date(dequeuedAt).toISOString(),
      generationId: job.data.generationId,
      jobId: job.id ?? null,
      queueName: job.queueName,
      queue_wait_ms: Math.max(0, dequeuedAt - submittedAt),
      submitted_at: new Date(submittedAt).toISOString(),
      tenantId: job.data.tenantId,
      traceId: job.data.traceId ?? null,
    },
    "processing workbench.generate job",
  );

  const result = await options.generationService.executeGeneration(job.data, logger);

  logger.info(
    {
      end_to_end_ms: Math.max(0, Date.now() - submittedAt),
      generationId: job.data.generationId,
      jobId: job.id ?? null,
      queueName: job.queueName,
      status: result.status,
      tenantId: job.data.tenantId,
      traceId: job.data.traceId ?? null,
    },
    "completed workbench.generate job",
  );

  return {
    ...result,
    jobId: job.id ?? null,
  };
}
