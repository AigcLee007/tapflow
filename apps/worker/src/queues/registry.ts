import type { QueueEvents, Worker } from "bullmq";

import { QUEUE_NAMES, type QueueName } from "@aigc-flow/redis";

import { getWorkerErrorFields, type WorkerLogger } from "../logger.js";
import { processAssetImageVariantJob } from "../processors/asset-image-variant.processor.js";
import { processAssetIngestJob } from "../processors/asset-ingest.processor.js";
import { processBillingSettleJob } from "../processors/billing-settle.processor.js";
import { processWalletExpiryJob } from "../processors/wallet-expiry.processor.js";
import { processNodeExecuteJob } from "../processors/node-execute.processor.js";
import { processProviderPollJob } from "../processors/provider-poll.processor.js";
import { processWorkbenchGenerateJob } from "../processors/workbench-generate.processor.js";
import { processWorkflowStartJob } from "../processors/workflow-start.processor.js";
import type { WorkbenchGenerationService } from "../workbench/workbench-generation.service.js";
import type { ImageVariantProcessor } from "../workflow-runtime/image-variant-processor.js";
import type { WorkflowNodeExecutionService } from "../workflow-runtime/service.js";

type Closable = {
  close: () => Promise<unknown>;
};

type QueueFactoryLike = {
  createQueueEvents: (name: QueueName) => QueueEvents | Closable;
  createWorker: (
    name: QueueName,
    processor: (job: unknown) => Promise<unknown>,
    options: { concurrency: number },
  ) => Worker | Closable;
};

export const WORKER_QUEUE_NAMES = [
  QUEUE_NAMES.workflowStart,
  QUEUE_NAMES.nodeExecute,
  QUEUE_NAMES.nodeExecuteDefault,
  QUEUE_NAMES.nodeExecuteImage,
  QUEUE_NAMES.nodeExecuteVideo,
  QUEUE_NAMES.providerPoll,
  QUEUE_NAMES.assetImageVariant,
  QUEUE_NAMES.assetIngest,
  QUEUE_NAMES.billingSettle,
  QUEUE_NAMES.walletExpiry,
  "workbench.generate" as QueueName,
] as const;

export type WorkerQueueConcurrency = {
  assetImageVariant: number;
  default: number;
  nodeExecuteDefault: number;
  nodeExecuteImage: number;
  nodeExecuteVideo: number;
  nodeExecute: number;
  providerPoll: number;
};

function resolveQueueConcurrency(queueName: QueueName, concurrency: WorkerQueueConcurrency): number {
  if (queueName === QUEUE_NAMES.nodeExecute) {
    return concurrency.nodeExecute;
  }
  if (queueName === QUEUE_NAMES.nodeExecuteDefault) {
    return concurrency.nodeExecuteDefault;
  }
  if (queueName === QUEUE_NAMES.nodeExecuteImage) {
    return concurrency.nodeExecuteImage;
  }
  if (queueName === QUEUE_NAMES.nodeExecuteVideo) {
    return concurrency.nodeExecuteVideo;
  }
  if (queueName === QUEUE_NAMES.providerPoll) {
    return concurrency.providerPoll;
  }
  if (queueName === QUEUE_NAMES.assetImageVariant) {
    return concurrency.assetImageVariant;
  }
  return concurrency.default;
}

function withWorkerErrorLogging(
  queueName: QueueName,
  logger: WorkerLogger,
  processor: (job: unknown) => Promise<unknown>,
) {
  return async (job: unknown) => {
    try {
      return await processor(job);
    } catch (error) {
      const typedJob = job as {
        data?: {
          tenantId?: string;
          traceId?: string;
        };
        id?: string | null;
      };
      logger.error(
        {
          ...getWorkerErrorFields(error),
          jobId: typedJob.id ?? null,
          queueName,
          tenantId: typedJob.data?.tenantId ?? null,
          traceId: typedJob.data?.traceId ?? null,
        },
        "worker skeleton job failed",
      );
      throw error;
    }
  };
}

export function registerWorkerQueues(options: {
  concurrency: WorkerQueueConcurrency;
  imageVariantProcessor?: ImageVariantProcessor;
  logger: WorkerLogger;
  queueFactory: QueueFactoryLike;
  workbenchGenerationService?: WorkbenchGenerationService;
  workflowNodeExecutionService?: WorkflowNodeExecutionService;
}) {
  const workers: Closable[] = [];
  const queueEvents: Closable[] = [];

  for (const queueName of WORKER_QUEUE_NAMES) {
    const queueEventsInstance = options.queueFactory.createQueueEvents(queueName);
    queueEvents.push(queueEventsInstance);

    const processor =
      queueName === QUEUE_NAMES.workflowStart
        ? (job: unknown) => processWorkflowStartJob(job as never, options.logger)
        : queueName === QUEUE_NAMES.nodeExecute
          || queueName === QUEUE_NAMES.nodeExecuteDefault
          || queueName === QUEUE_NAMES.nodeExecuteImage
          || queueName === QUEUE_NAMES.nodeExecuteVideo
          ? (job: unknown) =>
              processNodeExecuteJob(job as never, options.logger, {
                executionService: options.workflowNodeExecutionService,
              })
        : queueName === QUEUE_NAMES.providerPoll
          ? (job: unknown) =>
              processProviderPollJob(job as never, options.logger, {
                executionService: options.workflowNodeExecutionService,
              })
        : queueName === QUEUE_NAMES.assetImageVariant
          ? (job: unknown) => {
              if (!options.imageVariantProcessor) {
                throw new Error("imageVariantProcessor is required for asset image variant jobs");
              }
              return processAssetImageVariantJob(job as never, options.logger, {
                imageVariantProcessor: options.imageVariantProcessor,
              });
            }
        : queueName === QUEUE_NAMES.assetIngest
          ? (job: unknown) => processAssetIngestJob(job as never, options.logger)
          : queueName === ("workbench.generate" as QueueName)
            ? (job: unknown) => {
                if (!options.workbenchGenerationService) {
                  throw new Error("workbenchGenerationService is required for workbench generation jobs");
                }
              return processWorkbenchGenerateJob(job as never, options.logger, {
                generationService: options.workbenchGenerationService,
              });
            }
          : queueName === QUEUE_NAMES.walletExpiry
            ? (job: unknown) => processWalletExpiryJob(job as never, options.logger)
          : (job: unknown) => processBillingSettleJob(job as never, options.logger);

    const worker = options.queueFactory.createWorker(
      queueName,
      withWorkerErrorLogging(queueName, options.logger, processor),
      {
        concurrency: resolveQueueConcurrency(queueName, options.concurrency),
      },
    );

    workers.push(worker);
  }

  return {
    queueEvents,
    queueNames: [...WORKER_QUEUE_NAMES],
    workers,
  };
}
