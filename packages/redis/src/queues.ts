import {
  Queue,
  QueueEvents,
  type DefaultJobOptions,
  type JobsOptions,
  type Processor,
  type QueueEventsOptions,
  type QueueOptions,
  type WorkerOptions,
  Worker,
} from "bullmq";
import type { Redis } from "ioredis";

import { DEFAULT_QUEUE_PREFIX, resolveQueuePrefix } from "./redis.js";

export const QUEUE_NAMES = {
  assetImageVariant: "asset.image-variant",
  assetVideoReferenceVariant: "asset.video-reference-variant",
  assetIngest: "asset.ingest",
  auditFlush: "audit.flush",
  billingSettle: "billing.settle",
  walletExpiry: "billing.wallet-expiry",
  emailSend: "email.send",
  nodeExecute: "node.execute",
  nodeExecuteDefault: "node.execute.default",
  nodeExecuteImage: "node.execute.image",
  nodeExecuteVideo: "node.execute.video",
  providerPoll: "provider.poll",
  workbenchGenerate: "workbench.generate",
  workflowStart: "workflow.start",
} as const;

export function buildAssetVideoReferenceVariantJobId(assetId: string): string {
  const normalizedAssetId = assetId.trim().replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!normalizedAssetId) throw new Error("ASSET_VIDEO_REFERENCE_VARIANT_ASSET_ID_REQUIRED");
  return `reference-720p-${normalizedAssetId}`;
}

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export type BaseJobPayload = {
  tenantId: string;
  traceId?: string;
};

export type WorkflowStartJobPayload = BaseJobPayload & {
  workflowRunId: string;
};

export type NodeExecuteJobPayload = BaseJobPayload & {
  nodeRunId: string;
  nodeType?: string;
  workflowRunId: string;
};

export type ProviderPollJobPayload = BaseJobPayload & {
  deadlineAt?: string;
  nodeRunId: string;
  pollIntervalMs?: number;
  providerTaskId: string;
  workflowRunId: string;
};

export type WorkbenchGenerateJobPayload = BaseJobPayload & {
  generationId: string;
};

export type AssetImageVariantJobPayload = BaseJobPayload & {
  assetId: string;
};

export type AssetVideoReferenceVariantJobPayload = BaseJobPayload & {
  assetId: string;
};

export type AssetIngestJobPayload = BaseJobPayload & {
  assetId: string;
};

export type BillingSettleJobPayload = BaseJobPayload & {
  usageEventId: string;
};

export type WalletExpiryJobPayload = BaseJobPayload & {
  limit?: number;
};

export type EmailSendJobPayload = BaseJobPayload & {
  emailMessageId: string;
};

export type AuditFlushJobPayload = BaseJobPayload & {
  batchId: string;
};

export type QueuePayloadMap = {
  "asset.image-variant": AssetImageVariantJobPayload;
  "asset.video-reference-variant": AssetVideoReferenceVariantJobPayload;
  "asset.ingest": AssetIngestJobPayload;
  "audit.flush": AuditFlushJobPayload;
  "billing.settle": BillingSettleJobPayload;
  "billing.wallet-expiry": WalletExpiryJobPayload;
  "email.send": EmailSendJobPayload;
  "node.execute": NodeExecuteJobPayload;
  "node.execute.default": NodeExecuteJobPayload;
  "node.execute.image": NodeExecuteJobPayload;
  "node.execute.video": NodeExecuteJobPayload;
  "provider.poll": ProviderPollJobPayload;
  "workbench.generate": WorkbenchGenerateJobPayload;
  "workflow.start": WorkflowStartJobPayload;
};

export type AnyJobPayload = QueuePayloadMap[QueueName];
export const DEFAULT_QUEUE_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 3,
  backoff: {
    delay: 1_000,
    type: "exponential",
  },
  removeOnComplete: {
    age: 60 * 60,
    count: 1_000,
  },
  removeOnFail: {
    age: 60 * 60 * 24,
    count: 5_000,
  },
};

export const DEFAULT_WORKER_CONCURRENCY = 16;

export function resolveNodeExecuteQueueName(nodeType: string | null | undefined): QueueName {
  if (nodeType === "image.generate") {
    return QUEUE_NAMES.nodeExecuteImage;
  }
  if (nodeType === "video.generate") {
    return QUEUE_NAMES.nodeExecuteVideo;
  }
  return QUEUE_NAMES.nodeExecuteDefault;
}

const DISALLOWED_PAYLOAD_KEYS = [
  "base64",
  "compiledGraph",
  "graph",
  "messages",
  "output",
  "outputs",
  "prompt",
  "rawRequest",
  "rawResponse",
  "response",
];

type QueueFactoryOptions = {
  connection: Redis;
  defaultJobOptions?: DefaultJobOptions;
  prefix?: string;
};

type CreateQueueOptions = Omit<QueueOptions, "connection" | "defaultJobOptions" | "prefix"> & {
  defaultJobOptions?: JobsOptions;
};

type CreateWorkerOptions = Omit<WorkerOptions, "connection" | "prefix">;

export function assertLightweightJobPayload(payload: unknown): void {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Queue job payload must be a plain object");
  }

  const entries = Object.entries(payload);
  if (entries.length > 8) {
    throw new Error("Queue job payload must stay lightweight");
  }

  for (const [key, value] of entries) {
    if (DISALLOWED_PAYLOAD_KEYS.includes(key)) {
      throw new Error(`Queue job payload contains disallowed key: ${key}`);
    }

    if (typeof value === "string" && value.length > 512) {
      throw new Error(`Queue job payload field '${key}' is too large for Redis job storage`);
    }

    if (value && typeof value === "object") {
      throw new Error(`Queue job payload field '${key}' must be an ID or scalar value`);
    }
  }
}

export function createQueueFactory(options: QueueFactoryOptions) {
  const prefix = resolveQueuePrefix(options.prefix ?? DEFAULT_QUEUE_PREFIX);
  const defaultJobOptions = {
    ...DEFAULT_QUEUE_JOB_OPTIONS,
    ...options.defaultJobOptions,
  };

  return {
    createQueue<Name extends QueueName>(
      name: Name,
      queueOptions?: CreateQueueOptions,
    ): Queue<QueuePayloadMap[Name], unknown, string> {
      return new Queue<QueuePayloadMap[Name], unknown, string>(name, {
        connection: options.connection,
        defaultJobOptions: {
          ...defaultJobOptions,
          ...queueOptions?.defaultJobOptions,
        },
        prefix,
        ...queueOptions,
      });
    },

    createQueueEvents<Name extends QueueName>(
      name: Name,
      queueEventsOptions?: Omit<QueueEventsOptions, "connection" | "prefix">,
    ): QueueEvents {
      return new QueueEvents(name, {
        connection: options.connection.duplicate(),
        prefix,
        ...queueEventsOptions,
      });
    },

    createWorker<Name extends QueueName>(
      name: Name,
      processor: Processor<QueuePayloadMap[Name], unknown, string>,
      workerOptions?: CreateWorkerOptions,
    ): Worker<QueuePayloadMap[Name], unknown, string> {
      return new Worker<QueuePayloadMap[Name], unknown, string>(name, processor, {
        autorun: workerOptions?.autorun ?? true,
        connection: options.connection.duplicate(),
        prefix,
        ...workerOptions,
        concurrency: workerOptions?.concurrency ?? DEFAULT_WORKER_CONCURRENCY,
      });
    },

    defaultJobOptions,
    prefix,
  };
}
