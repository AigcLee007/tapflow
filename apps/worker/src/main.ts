import { fileURLToPath } from "node:url";

import {
  CredentialVault,
  DatabaseMediaRuntime,
  DatabaseTextGenerationRuntime,
  createDefaultAiGateway,
} from "@aigc-flow/ai-gateway-core";
import { createPgPool } from "@aigc-flow/db";
import {
  closeRedisConnection,
  createQueueFactory,
  createRedisConnection,
  QUEUE_NAMES,
  type AnyJobPayload,
  type QueueName,
} from "@aigc-flow/redis";
import { S3StorageProvider } from "@aigc-flow/storage";
import type { Redis } from "ioredis";
import type { Pool } from "pg";

import { getWorkerEnv, type WorkerEnv } from "./config/env.js";
import { createConsoleWorkerLogger, type WorkerLogger } from "./logger.js";
import { registerWorkerQueues } from "./queues/registry.js";
import { WorkbenchGenerationService } from "./workbench/workbench-generation.service.js";
import { MediaAssetStore } from "./workflow-runtime/media-asset-store.js";
import { ImageVariantProcessor } from "./workflow-runtime/image-variant-processor.js";
import { WorkflowNodeExecutionService } from "./workflow-runtime/service.js";

type Closable = {
  close: () => Promise<unknown>;
};

type QueueFactoryLike = {
  createQueue: (
    name: QueueName,
  ) => {
    add: (name: string, data: AnyJobPayload, options?: { delay?: number }) => Promise<unknown>;
    close: () => Promise<unknown>;
  };
  createQueueEvents: (name: QueueName) => Closable;
  createWorker: (
    name: QueueName,
    processor: (job: unknown) => Promise<unknown>,
    options: { concurrency: number },
  ) => Closable;
};

export type WorkerRuntime = {
  queueNames: string[];
  shutdown: () => Promise<void>;
};

export function createWorkerRuntime(options?: {
  env?: WorkerEnv;
  logger?: WorkerLogger;
  pool?: Pool;
  queueFactory?: QueueFactoryLike;
  redisConnection?: Redis;
  workflowNodeExecutionService?: WorkflowNodeExecutionService;
}) {
  const env = options?.env ?? getWorkerEnv();
  const logger = options?.logger ?? createConsoleWorkerLogger();
  const ownedPool = !options?.pool;
  const ownedRedisConnection = !options?.redisConnection;
  const pool = options?.pool ?? createPgPool();
  const redisConnection =
    options?.redisConnection ??
    createRedisConnection({
      redisUrl: env.redisUrl,
    });
  const queueFactory =
    options?.queueFactory ??
    createQueueFactory({
      connection: redisConnection,
      prefix: env.queuePrefix,
    });
  const credentialVault = new CredentialVault({
    keyVersion: env.credentialKeyVersion,
    masterKey: env.credentialMasterKey,
  });
  const aiGateway = createDefaultAiGateway();
  const nodeExecuteQueue = queueFactory.createQueue(QUEUE_NAMES.nodeExecute);
  const nodeExecuteDefaultQueue = queueFactory.createQueue(QUEUE_NAMES.nodeExecuteDefault);
  const nodeExecuteImageQueue = queueFactory.createQueue(QUEUE_NAMES.nodeExecuteImage);
  const nodeExecuteVideoQueue = queueFactory.createQueue(QUEUE_NAMES.nodeExecuteVideo);
  const providerPollQueue = queueFactory.createQueue(QUEUE_NAMES.providerPoll);
  const assetImageVariantQueue = queueFactory.createQueue(QUEUE_NAMES.assetImageVariant);
  const WORKBENCH_GENERATE_QUEUE = "workbench.generate" as const;
  const workbenchGenerateQueue = queueFactory.createQueue(WORKBENCH_GENERATE_QUEUE);
  const storageProvider = new S3StorageProvider({
    accessKeyId: env.s3AccessKeyId,
    endpoint: env.s3Endpoint,
    forcePathStyle: env.s3ForcePathStyle,
    region: env.s3Region,
    secretAccessKey: env.s3SecretAccessKey,
  });
  const mediaRuntime = new DatabaseMediaRuntime({
    aiGateway,
    credentialVault,
    pool,
  });
  const workflowNodeExecutionService =
    options?.workflowNodeExecutionService ??
    new WorkflowNodeExecutionService({
      assetBucket: env.s3Bucket,
      imageVariantQueue: assetImageVariantQueue,
      imageVariantsMode: env.imageVariantsMode,
      mediaGenerationRuntime: mediaRuntime,
      nodeExecuteQueue,
      nodeExecuteQueues: {
        default: nodeExecuteDefaultQueue,
        image: nodeExecuteImageQueue,
        legacy: nodeExecuteQueue,
        video: nodeExecuteVideoQueue,
      },
      pool,
      providerPollQueue,
      storageProvider,
      textGenerationRuntime: new DatabaseTextGenerationRuntime({
        aiGateway,
        credentialVault,
        pool,
      }),
    });
  const imageVariantProcessor = new ImageVariantProcessor({
    pool,
    storageProvider,
  });
  const workbenchGenerationService = new WorkbenchGenerationService({
    assetBucket: env.s3Bucket,
    assetStore: new MediaAssetStore({
      assetBucket: env.s3Bucket,
      storageProvider,
      variantMode: env.imageVariantsMode,
      variantQueue: assetImageVariantQueue,
    }),
    mediaRuntime,
    pool,
  });

  const registration = registerWorkerQueues({
    concurrency: {
      default: env.workerConcurrency,
      nodeExecuteDefault: env.defaultNodeConcurrency,
      nodeExecuteImage: env.imageNodeConcurrency,
      nodeExecuteVideo: env.videoNodeConcurrency,
      nodeExecute: env.nodeExecuteConcurrency,
      providerPoll: env.providerPollConcurrency,
    },
    imageVariantProcessor,
    logger,
    queueFactory,
    workbenchGenerationService,
    workflowNodeExecutionService,
  });

  let shuttingDown = false;

  async function shutdown(): Promise<void> {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.info(
      {
        queueCount: registration.queueNames.length,
        workerName: env.workerName,
      },
      "shutting down worker runtime",
    );

    await Promise.all(registration.workers.map((worker) => worker.close()));
    await Promise.all(registration.queueEvents.map((queueEvents) => queueEvents.close()));
    await Promise.all([
      assetImageVariantQueue.close(),
      nodeExecuteQueue.close(),
      nodeExecuteDefaultQueue.close(),
      nodeExecuteImageQueue.close(),
      nodeExecuteVideoQueue.close(),
      providerPollQueue.close(),
      workbenchGenerateQueue.close(),
    ]);

    if (ownedRedisConnection) {
      await closeRedisConnection(redisConnection);
    }

    if (ownedPool) {
      await pool.end();
    }
  }

  return {
    queueNames: registration.queueNames,
    shutdown,
  } satisfies WorkerRuntime;
}

async function main() {
  const env = getWorkerEnv();
  const logger = createConsoleWorkerLogger();
  const runtime = createWorkerRuntime({
    env,
    logger,
  });

  logger.info(
    {
      queueNames: runtime.queueNames,
      queuePrefix: env.queuePrefix,
      nodeExecuteConcurrency: env.nodeExecuteConcurrency,
      defaultNodeConcurrency: env.defaultNodeConcurrency,
      imageNodeConcurrency: env.imageNodeConcurrency,
      imageVariantsMode: env.imageVariantsMode,
      providerPollConcurrency: env.providerPollConcurrency,
      s3Bucket: env.s3Bucket,
      videoNodeConcurrency: env.videoNodeConcurrency,
      workerConcurrency: env.workerConcurrency,
      workerName: env.workerName,
    },
    "v2 worker runtime ready",
  );

  const shutdownAndExit = async (signal: string) => {
    logger.info(
      {
        signal,
        workerName: env.workerName,
      },
      "received worker shutdown signal",
    );

    try {
      await runtime.shutdown();
      process.exit(0);
    } catch (error) {
      logger.error(
        {
          err: error instanceof Error ? error.message : String(error),
          signal,
          workerName: env.workerName,
        },
        "worker shutdown failed",
      );
      process.exit(1);
    }
  };

  process.once("SIGINT", () => {
    void shutdownAndExit("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdownAndExit("SIGTERM");
  });

  if (process.env.WORKER_ONESHOT === "true") {
    await runtime.shutdown();
    return;
  }

  process.stdin.resume();
}

const isDirectExecution = process.argv[1]
  ? fileURLToPath(import.meta.url) === process.argv[1]
  : false;

if (isDirectExecution) {
  void main();
}
