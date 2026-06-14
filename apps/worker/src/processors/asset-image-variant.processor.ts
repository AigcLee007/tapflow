import type { Job } from "bullmq";

import type { AssetImageVariantJobPayload } from "@aigc-flow/redis";

import type { WorkerLogger } from "../logger.js";
import type { ImageVariantProcessor } from "../workflow-runtime/image-variant-processor.js";
import type { ProcessorResult } from "./shared.js";

export async function processAssetImageVariantJob(
  job: Job<AssetImageVariantJobPayload>,
  logger: WorkerLogger,
  options: {
    imageVariantProcessor: ImageVariantProcessor;
  },
): Promise<ProcessorResult> {
  const result = await options.imageVariantProcessor.process({
    assetId: job.data.assetId,
    tenantId: job.data.tenantId,
  });

  logger.info(
    {
      assetId: job.data.assetId,
      jobId: job.id ?? null,
      queueName: job.queueName,
      tenantId: job.data.tenantId,
      traceId: job.data.traceId ?? null,
      variantCount: result.variantCount,
    },
    "processed asset image variant job",
  );

  return {
    jobId: job.id ?? null,
    queueName: job.queueName,
    status: "ok",
    tenantId: job.data.tenantId,
    traceId: job.data.traceId ?? null,
  };
}
