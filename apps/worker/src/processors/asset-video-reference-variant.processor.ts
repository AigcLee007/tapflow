import type { Job } from "bullmq";

import type { AssetVideoReferenceVariantJobPayload } from "@aigc-flow/redis";

import type { WorkerLogger } from "../logger.js";
import type { VideoReferenceVariantProcessor } from "../workflow-runtime/video-reference-variant-processor.js";
import type { ProcessorResult } from "./shared.js";

export async function processAssetVideoReferenceVariantJob(
  job: Job<AssetVideoReferenceVariantJobPayload>,
  logger: WorkerLogger,
  options: { videoReferenceVariantProcessor: VideoReferenceVariantProcessor },
): Promise<ProcessorResult> {
  const result = await options.videoReferenceVariantProcessor.process({
    assetId: job.data.assetId,
    tenantId: job.data.tenantId,
  });
  logger.info(
    {
      assetId: job.data.assetId,
      height: result.height,
      jobId: job.id ?? null,
      queueName: job.queueName,
      tenantId: job.data.tenantId,
      traceId: job.data.traceId ?? null,
      transcoded: result.transcoded,
      variantCount: result.variantCount,
      width: result.width,
    },
    "processed asset video reference variant job",
  );
  return {
    jobId: job.id ?? null,
    queueName: job.queueName,
    status: "ok",
    tenantId: job.data.tenantId,
    traceId: job.data.traceId ?? null,
  };
}
