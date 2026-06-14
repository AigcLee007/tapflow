import { resolveQueuePrefix, resolveRedisUrl } from "@aigc-flow/redis";

export type WorkerEnv = {
  credentialKeyVersion: string;
  credentialMasterKey: string;
  nodeEnv: string;
  queuePrefix: string;
  redisUrl: string;
  s3AccessKeyId: string;
  s3Bucket: string;
  s3Endpoint: string;
  s3ForcePathStyle: boolean;
  s3Region: string;
  s3SecretAccessKey: string;
  defaultNodeConcurrency: number;
  imageNodeConcurrency: number;
  imageVariantsMode: "async" | "sync";
  providerPollConcurrency: number;
  nodeExecuteConcurrency: number;
  videoNodeConcurrency: number;
  workerConcurrency: number;
  workerName: string;
};

const DEV_CREDENTIAL_KEY_VERSION = "v1";
const DEV_CREDENTIAL_MASTER_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
const DEV_S3_ACCESS_KEY_ID = "minio";
const DEV_S3_BUCKET = "aigc-flow-dev";
const DEV_S3_ENDPOINT = "http://localhost:9000";
const DEV_S3_REGION = "us-east-1";
const DEV_S3_SECRET_ACCESS_KEY = "minio123456";
const DEFAULT_NODE_EXECUTE_CONCURRENCY = 16;
const DEFAULT_PROVIDER_POLL_CONCURRENCY = 16;
const DEFAULT_WORKER_CONCURRENCY = 16;
const DEFAULT_WORKER_NAME = "aigc-flow-v2-worker";
const DEFAULT_DEFAULT_NODE_CONCURRENCY = 4;
const DEFAULT_IMAGE_NODE_CONCURRENCY = 4;
const DEFAULT_IMAGE_VARIANTS_MODE = "sync";
const DEFAULT_VIDEO_NODE_CONCURRENCY = 1;

function parsePositiveIntegerEnv(name: string, value: string | undefined, fallback: number): number {
  const raw = value?.trim() ?? "";
  const parsed = raw ? Number(raw) : fallback;
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer when provided`);
  }
  return parsed;
}

export function getWorkerEnv(): WorkerEnv {
  const nodeEnv = process.env.NODE_ENV?.trim() || "development";
  const isProduction = nodeEnv === "production";
  const credentialMasterKey =
    process.env.CREDENTIAL_MASTER_KEY?.trim() ||
    (isProduction ? "" : DEV_CREDENTIAL_MASTER_KEY);
  const credentialKeyVersion =
    process.env.CREDENTIAL_KEY_VERSION?.trim() ||
    DEV_CREDENTIAL_KEY_VERSION;
  const s3Endpoint =
    process.env.S3_ENDPOINT?.trim() ||
    (isProduction ? "" : DEV_S3_ENDPOINT);
  const s3Region =
    process.env.S3_REGION?.trim() ||
    (isProduction ? "" : DEV_S3_REGION);
  const s3Bucket =
    process.env.S3_BUCKET?.trim() ||
    (isProduction ? "" : DEV_S3_BUCKET);
  const s3AccessKeyId =
    process.env.S3_ACCESS_KEY_ID?.trim() ||
    (isProduction ? "" : DEV_S3_ACCESS_KEY_ID);
  const s3SecretAccessKey =
    process.env.S3_SECRET_ACCESS_KEY?.trim() ||
    (isProduction ? "" : DEV_S3_SECRET_ACCESS_KEY);
  const s3ForcePathStyleRaw = process.env.S3_FORCE_PATH_STYLE?.trim();
  const imageVariantsModeRaw = process.env.WORKER_IMAGE_VARIANTS_MODE?.trim().toLowerCase() || DEFAULT_IMAGE_VARIANTS_MODE;
  if (imageVariantsModeRaw !== "async" && imageVariantsModeRaw !== "sync") {
    throw new Error("WORKER_IMAGE_VARIANTS_MODE must be either 'sync' or 'async' when provided");
  }
  const workerConcurrency = parsePositiveIntegerEnv(
    "WORKER_CONCURRENCY",
    process.env.WORKER_CONCURRENCY,
    DEFAULT_WORKER_CONCURRENCY,
  );
  const nodeExecuteConcurrency = parsePositiveIntegerEnv(
    "NODE_EXECUTE_CONCURRENCY",
    process.env.NODE_EXECUTE_CONCURRENCY,
    process.env.WORKER_CONCURRENCY ? workerConcurrency : DEFAULT_NODE_EXECUTE_CONCURRENCY,
  );
  const providerPollConcurrency = parsePositiveIntegerEnv(
    "PROVIDER_POLL_CONCURRENCY",
    process.env.PROVIDER_POLL_CONCURRENCY,
    process.env.WORKER_CONCURRENCY ? workerConcurrency : DEFAULT_PROVIDER_POLL_CONCURRENCY,
  );
  const imageNodeConcurrency = parsePositiveIntegerEnv(
    "WORKER_IMAGE_CONCURRENCY",
    process.env.WORKER_IMAGE_CONCURRENCY,
    DEFAULT_IMAGE_NODE_CONCURRENCY,
  );
  const videoNodeConcurrency = parsePositiveIntegerEnv(
    "WORKER_VIDEO_CONCURRENCY",
    process.env.WORKER_VIDEO_CONCURRENCY,
    DEFAULT_VIDEO_NODE_CONCURRENCY,
  );
  const defaultNodeConcurrency = parsePositiveIntegerEnv(
    "WORKER_DEFAULT_CONCURRENCY",
    process.env.WORKER_DEFAULT_CONCURRENCY,
    DEFAULT_DEFAULT_NODE_CONCURRENCY,
  );

  if (!credentialMasterKey) {
    throw new Error("CREDENTIAL_MASTER_KEY is required to start the v2 worker");
  }
  if (!s3Endpoint) {
    throw new Error("S3_ENDPOINT is required to start the v2 worker");
  }
  if (!s3Region) {
    throw new Error("S3_REGION is required to start the v2 worker");
  }
  if (!s3Bucket) {
    throw new Error("S3_BUCKET is required to start the v2 worker");
  }
  if (!s3AccessKeyId) {
    throw new Error("S3_ACCESS_KEY_ID is required to start the v2 worker");
  }
  if (!s3SecretAccessKey) {
    throw new Error("S3_SECRET_ACCESS_KEY is required to start the v2 worker");
  }

  return {
    credentialKeyVersion,
    credentialMasterKey,
    nodeEnv,
    queuePrefix: resolveQueuePrefix(process.env.QUEUE_PREFIX),
    redisUrl: resolveRedisUrl({
      nodeEnv,
      redisUrl: process.env.REDIS_URL,
    }),
    s3AccessKeyId,
    s3Bucket,
    s3Endpoint,
    s3ForcePathStyle: s3ForcePathStyleRaw === undefined
      ? true
      : s3ForcePathStyleRaw.toLowerCase() === "true",
    s3Region,
    s3SecretAccessKey,
    defaultNodeConcurrency,
    imageNodeConcurrency,
    imageVariantsMode: imageVariantsModeRaw,
    providerPollConcurrency,
    nodeExecuteConcurrency,
    videoNodeConcurrency,
    workerConcurrency,
    workerName: process.env.WORKER_NAME?.trim() || DEFAULT_WORKER_NAME,
  };
}
