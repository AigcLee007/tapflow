import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, test, vi } from "vitest";
import sharp from "sharp";

import { BillingService, createPgPool, withTenantTransaction } from "@aigc-flow/db";
import type {
  AiGatewayMediaResult,
  ProviderTaskResult,
} from "@aigc-flow/ai-gateway-core";
import { AiGatewayError } from "@aigc-flow/ai-gateway-core";
import { QUEUE_NAMES, type NodeExecuteJobPayload, type ProviderPollJobPayload } from "@aigc-flow/redis";
import type { StorageProvider } from "@aigc-flow/storage";

import type { ApiEnv } from "../../api/src/config/env.js";
import { buildApp } from "../../api/src/app.js";
import { WorkflowRunsService } from "../../api/src/modules/workflow-runs/workflow-runs.service.js";
import { getWorkerEnv } from "../src/config/env.js";
import { createWorkerRuntime } from "../src/main.js";
import type { WorkerLogger } from "../src/logger.js";
import { processNodeExecuteJob } from "../src/processors/node-execute.processor.js";
import { processProviderPollJob } from "../src/processors/provider-poll.processor.js";
import { processWorkflowStartJob } from "../src/processors/workflow-start.processor.js";
import { WORKER_QUEUE_NAMES } from "../src/queues/registry.js";
import { WorkflowNodeExecutionService, __workerTestUtils } from "../src/workflow-runtime/service.js";
import { runMigrations } from "../../../packages/db/src/migrator.js";
import { hasDatabaseEnv, withDatabase } from "../../../packages/db/test/helpers.js";

const originalDatabaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = hasDatabaseEnv() ? describe : describe.skip;

async function createPngBuffer(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      background: { alpha: 1, b: 90, g: 80, r: 40 },
      channels: 4,
      height,
      width,
    },
  })
    .png()
    .toBuffer();
}

const testEnv: ApiEnv = {
  accessTokenTtlSeconds: 60 * 15,
  credentialKeyVersion: "v1",
  credentialMasterKey: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
  jwtAccessSecret: "test_access_secret_1234567890",
  jwtRefreshSecret: "test_refresh_secret_1234567890",
  nodeEnv: "test",
  queuePrefix: "test-prefix",
  redisUrl: "redis://localhost:6379",
  refreshTokenTtlSeconds: 60 * 60 * 24 * 7,
  s3AccessKeyId: "test-access",
  s3Bucket: "test-bucket",
  s3Endpoint: "http://localhost:9000",
  s3ForcePathStyle: true,
  s3Region: "us-east-1",
  s3SecretAccessKey: "test-secret",
};

class MemoryStorageProvider implements StorageProvider {
  readonly objects = new Map<string, {
    body: Buffer;
    contentType: string | null;
    metadata: Record<string, string>;
  }>();

  async putObject(input: {
    body: Buffer | Uint8Array | string;
    bucket: string;
    contentType?: string;
    key: string;
    metadata?: Record<string, string>;
  }): Promise<void> {
    this.objects.set(`${input.bucket}/${input.key}`, {
      body: Buffer.isBuffer(input.body) ? input.body : Buffer.from(input.body),
      contentType: input.contentType ?? null,
      metadata: input.metadata ?? {},
    });
  }

  async headObject(input: { bucket: string; key: string }) {
    const object = this.objects.get(`${input.bucket}/${input.key}`);
    if (!object) {
      throw new Error("Object not found");
    }

    return {
      contentLength: object.body.byteLength,
      contentType: object.contentType,
      eTag: "etag-test",
      lastModified: new Date().toISOString(),
      metadata: object.metadata,
    };
  }

  async deleteObject(input: { bucket: string; key: string }): Promise<void> {
    this.objects.delete(`${input.bucket}/${input.key}`);
  }

  async createPresignedPutUrl() {
    throw new Error("not used in worker tests");
  }

  async createPresignedGetUrl(input: {
    bucket: string;
    key: string;
  }) {
    return {
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
      headers: {},
      method: "GET" as const,
      url: `https://storage.test/${input.bucket}/${input.key}`,
    };
  }
}

function createFakeNodeExecuteQueue() {
  const jobs: Array<{ data: NodeExecuteJobPayload; name: string }> = [];
  return {
    jobs,
    queue: {
      async add(name: string, data: NodeExecuteJobPayload) {
        jobs.push({ data, name });
        return { id: `job-${jobs.length}` };
      },
    },
  };
}

function createFakeProviderPollQueue() {
  const jobs: Array<{ data: ProviderPollJobPayload; delay?: number; name: string }> = [];
  return {
    jobs,
    queue: {
      async add(
        name: string,
        data: ProviderPollJobPayload,
        options?: {
          delay?: number;
        },
      ) {
        jobs.push({ data, delay: options?.delay, name });
        return { id: `poll-${jobs.length}` };
      },
    },
  };
}

function createTestLogger(): WorkerLogger {
  return {
    error() {
      return;
    },
    info() {
      return;
    },
  };
}

function createSpyLogger() {
  return {
    error: vi.fn(),
    info: vi.fn(),
  } satisfies WorkerLogger;
}

async function countBillingState(
  pool: ReturnType<typeof createPgPool>,
  tenantId: string,
  userId: string,
) {
  return withTenantTransaction(
    { tenantId, userId },
    async (client) => {
      const usageEvents = await client.query<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM usage_events",
      );
      const ledgerEntries = await client.query<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM billing_ledger",
      );
      return {
        ledgerEntries: ledgerEntries.rows[0]?.count ?? 0,
        usageEvents: usageEvents.rows[0]?.count ?? 0,
      };
    },
    pool,
  );
}

async function seedWorkflowRuntime(
  pool: ReturnType<typeof createPgPool>,
  options?: {
    inputNodeStatus?: string;
    inputOutputJson?: Record<string, unknown> | null;
    middleNodeConfig?: Record<string, unknown>;
    middleNodeOutputJson?: Record<string, unknown> | null;
    middleNodeStatus?: string;
    middleNodeType?: "text.generate" | "image.generate" | "video.generate";
    outputNodeStatus?: string;
    workflowStatus?: string;
  },
) {
  const tenantId = randomUUID();
  const userId = randomUUID();
  const projectId = randomUUID();
  const flowId = randomUUID();
  const flowVersionId = randomUUID();
  const workflowRunId = randomUUID();
  const inputNodeRunId = randomUUID();
  const middleNodeRunId = randomUUID();
  const outputNodeRunId = randomUUID();
  const middleNodeType = options?.middleNodeType ?? "text.generate";
  const middleNodeId = middleNodeType.startsWith("video") ? "video" : middleNodeType.startsWith("image") ? "image" : "text";

  const compiledGraph = {
    edges: [
      { source: "input", target: middleNodeId },
      { source: middleNodeId, target: "output" },
    ],
    entryNodeIds: ["input"],
    nodes: [
      {
        config: {
          inputKey: "prompt",
        },
        dependencies: [],
        dependents: [middleNodeId],
        id: "input",
        type: "input",
      },
      {
        config: options?.middleNodeConfig ?? (
          middleNodeType === "text.generate"
            ? { routeKey: "default-text", systemPrompt: "You are helpful." }
            : { routeKey: "default-media", prompt: "render something" }
        ),
        dependencies: ["input"],
        dependents: ["output"],
        id: middleNodeId,
        type: middleNodeType,
      },
      {
        config: {},
        dependencies: [middleNodeId],
        dependents: [],
        id: "output",
        type: "output",
      },
    ],
    outputNodeIds: ["output"],
    schemaVersion: "v2" as const,
  };

  await withTenantTransaction({ tenantId, userId }, async (client) => {
    await client.query(
      `
        INSERT INTO users (id, email, display_name)
        VALUES ($1::uuid, $2, $3)
      `,
      [userId, `${tenantId}@example.com`, "Worker Owner"],
    );
    await client.query(
      `
        INSERT INTO tenants (id, name, slug, updated_at)
        VALUES ($1::uuid, 'Worker Tenant', $2, now())
      `,
      [tenantId, `worker-${tenantId.slice(0, 8)}`],
    );
    await client.query(
      `
        INSERT INTO tenant_memberships (tenant_id, user_id, role_key, status, joined_at, updated_at)
        VALUES ($1::uuid, $2::uuid, 'tenant_owner', 'active', now(), now())
      `,
      [tenantId, userId],
    );
    await client.query(
      `
        INSERT INTO projects (id, tenant_id, name, created_by, updated_at)
        VALUES ($1::uuid, $2::uuid, 'Worker Project', $3::uuid, now())
      `,
      [projectId, tenantId, userId],
    );
    await client.query(
      `
        INSERT INTO flows (id, tenant_id, project_id, title, status, current_version_id, created_by, updated_by, updated_at)
        VALUES ($1::uuid, $2::uuid, $3::uuid, 'Worker Flow', 'published', null, $4::uuid, $4::uuid, now())
      `,
      [flowId, tenantId, projectId, userId],
    );
    await client.query(
      `
        INSERT INTO flow_versions (
          id,
          tenant_id,
          flow_id,
          version,
          graph_json,
          compiled_graph_json,
          checksum,
          published_by,
          published_at
        )
        VALUES (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          1,
          $4::jsonb,
          $5::jsonb,
          'worker-checksum',
          $6::uuid,
          now()
        )
      `,
      [
        flowVersionId,
        tenantId,
        flowId,
        JSON.stringify({ edges: [], nodes: [] }),
        JSON.stringify(compiledGraph),
        userId,
      ],
    );
    await client.query(
      `
        UPDATE flows
        SET current_version_id = $2::uuid
        WHERE id = $1::uuid
      `,
      [flowId, flowVersionId],
    );
    await client.query(
      `
        INSERT INTO workflow_runs (
          id,
          tenant_id,
          flow_id,
          flow_version_id,
          status,
          input_json,
          created_by,
          updated_at
        )
        VALUES (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::uuid,
          $5,
          $6::jsonb,
          $7::uuid,
          now()
        )
      `,
      [
        workflowRunId,
        tenantId,
        flowId,
        flowVersionId,
        options?.workflowStatus ?? "pending",
        JSON.stringify({ prompt: "hello worker" }),
        userId,
      ],
    );
    await client.query(
      `
        INSERT INTO node_runs (
          id,
          tenant_id,
          workflow_run_id,
          node_id,
          node_type,
          status,
          output_json,
          provider_task_id,
          updated_at
        )
        VALUES
          ($1::uuid, $2::uuid, $3::uuid, 'input', 'input', $4, $5::jsonb, NULL, now()),
          ($6::uuid, $2::uuid, $3::uuid, $7, $8, $9, $10::jsonb, $11, now()),
          ($12::uuid, $2::uuid, $3::uuid, 'output', 'output', $13, NULL, NULL, now())
      `,
      [
        inputNodeRunId,
        tenantId,
        workflowRunId,
        options?.inputNodeStatus ?? "runnable",
        options?.inputOutputJson ? JSON.stringify(options.inputOutputJson) : null,
        middleNodeRunId,
        middleNodeId,
        middleNodeType,
        options?.middleNodeStatus ?? "pending",
        options?.middleNodeOutputJson ? JSON.stringify(options.middleNodeOutputJson) : null,
        options?.middleNodeOutputJson && isProviderTaskJson(options.middleNodeOutputJson)
          ? String(options.middleNodeOutputJson.providerTask.providerTaskId)
          : null,
        outputNodeRunId,
        options?.outputNodeStatus ?? "pending",
      ],
    );
    await client.query(
      `
        INSERT INTO workflow_run_events (tenant_id, workflow_run_id, event_type, sequence, payload)
        VALUES ($1::uuid, $2::uuid, 'workflow.run.created', 1, '{}'::jsonb)
      `,
      [tenantId, workflowRunId],
    );
  }, pool);

  return {
    flowId,
    flowVersionId,
    inputNodeRunId,
    middleNodeId,
    middleNodeRunId,
    middleNodeType,
    outputNodeRunId,
    projectId,
    tenantId,
    userId,
    workflowRunId,
  };
}

function isProviderTaskJson(value: Record<string, unknown>): value is {
  providerTask: {
    providerTaskId: string;
  };
} {
  return typeof value.providerTask === "object" &&
    value.providerTask !== null &&
    "providerTaskId" in value.providerTask;
}

function createWorkflowService(options: {
  fetchFn?: (url: string) => Promise<{
    arrayBuffer(): Promise<ArrayBuffer>;
    headers: { get(name: string): string | null };
    ok: boolean;
    status: number;
  }>;
  mediaGenerationRuntime?: {
    generateImage: (context: { tenantId: string; userId: string | null }, request: unknown, metadata?: unknown) => Promise<AiGatewayMediaResult>;
    generateVideo: (context: { tenantId: string; userId: string | null }, request: unknown, metadata?: unknown) => Promise<AiGatewayMediaResult>;
    pollTask: (context: { tenantId: string; userId: string | null }, modality: "image" | "video", request: unknown, metadata?: unknown) => Promise<ProviderTaskResult>;
  };
  nodeQueue: ReturnType<typeof createFakeNodeExecuteQueue>;
  pool: ReturnType<typeof createPgPool>;
  pollQueue: ReturnType<typeof createFakeProviderPollQueue>;
  storageProvider: StorageProvider;
  textGenerationRuntime?: {
    generateText: (context: { tenantId: string; userId: string | null }, request: unknown, metadata?: unknown) => Promise<AiGatewayTextResultLike>;
  };
}) {
  return new WorkflowNodeExecutionService({
    assetBucket: "test-bucket",
    fetchFn: options.fetchFn,
    mediaGenerationRuntime: options.mediaGenerationRuntime ?? {
      async generateImage() {
        throw new Error("generateImage not mocked");
      },
      async generateVideo() {
        throw new Error("generateVideo not mocked");
      },
      async pollTask() {
        throw new Error("pollTask not mocked");
      },
    },
    nodeExecuteQueue: options.nodeQueue.queue,
    pool: options.pool,
    providerPollQueue: options.pollQueue.queue,
    storageProvider: options.storageProvider,
    textGenerationRuntime: options.textGenerationRuntime ?? {
      async generateText() {
        return {
          modelKey: "mock-model",
          outputText: "generated text",
          providerKey: "mock-provider",
          providerRequest: {},
          providerResponse: {},
          status: "succeeded" as const,
          usage: {
            inputTokens: 2,
            outputTokens: 3,
            totalTokens: 5,
          },
        };
      },
    },
  });
}

type AiGatewayTextResultLike = {
  modelKey: string;
  outputText: string;
  providerKey: string;
  providerRequest: unknown;
  providerResponse: unknown;
  status: "succeeded";
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  };
};

afterAll(() => {
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
});

describe("worker skeleton", () => {
  test("video.generate request uses exported video editor prompt and timeline asset ids", () => {
    const request = (__workerTestUtils as {
      buildVideoRequest: (
        upstreamOutputs: Array<Record<string, unknown> | null>,
        config: Record<string, unknown>,
      ) => {
        inputAssets?: Array<Record<string, unknown>> | null;
        metadata?: Record<string, unknown> | null;
        prompt: string;
        routeKey?: string | null;
      };
    }).buildVideoRequest([], {
      generationPrompt: "根据剪辑工程时间线生成视频",
      params: {
        videoEditor: {
          sourceVideoEditorNodeId: "video-editor-1",
          aspect: "16:9",
          resolution: "1920x1080",
          timeline: {
            audio: [
              { id: "audio-1", assetId: "asset-audio-1", track: 2, startMs: 0, inMs: 0, outMs: 3000, volume: 0.8 },
            ],
            clips: [
              { id: "clip-1", assetId: "asset-image-1", kind: "image", track: 1, startMs: 0, inMs: 0, outMs: 3000, speed: 1 },
              { id: "clip-2", assetId: "asset-video-2", kind: "video", track: 1, startMs: 3000, inMs: 200, outMs: 4200, speed: 1 },
            ],
            durationMs: 7000,
            subtitles: [{ id: "sub-1", text: "开场", startMs: 0, endMs: 1200 }],
          },
        },
      },
      routeKey: "video.default",
    });

    expect(request.prompt).toBe("根据剪辑工程时间线生成视频");
    expect(request.routeKey).toBe("video.default");
    expect(request.inputAssets).toEqual([
      expect.objectContaining({ assetId: "asset-image-1", kind: "image" }),
      expect.objectContaining({ assetId: "asset-video-2", kind: "video" }),
      expect.objectContaining({ assetId: "asset-audio-1", kind: "audio" }),
    ]);
    expect(request.metadata).toEqual(expect.objectContaining({
      videoEditor: expect.objectContaining({
        aspect: "16:9",
        resolution: "1920x1080",
        timeline: expect.objectContaining({
          durationMs: 7000,
        }),
      }),
      videoEditorExport: expect.objectContaining({
        billingUnit: "video_generation",
        durationMs: 7000,
        renderPlan: expect.objectContaining({
          assetIds: ["asset-image-1", "asset-video-2", "asset-audio-1"],
          output: expect.objectContaining({
            durationMs: 7000,
            height: 1080,
            mimeType: "video/mp4",
            width: 1920,
          }),
          renderer: "ffmpeg",
        }),
        source: "video_editor_export",
        sourceVideoEditorNodeId: "video-editor-1",
        timelineAssetCounts: {
          audio: 1,
          clips: 2,
        },
      }),
    }));
    expect(JSON.stringify(request)).not.toMatch(/blob:|data:/);
  });

  test("video editor export usage metadata identifies billing context", () => {
    const metadata = (__workerTestUtils as {
      buildMediaUsageMetadata: (
        kind: "image" | "video",
        node: { config: Record<string, unknown>; type: string },
      ) => Record<string, unknown>;
    }).buildMediaUsageMetadata("video", {
      config: {
        params: {
          videoEditor: {
            sourceVideoEditorNodeId: "video-editor-1",
            aspect: "16:9",
            resolution: "1920x1080",
            timeline: {
              audio: [
                { id: "audio-1", assetId: "asset-audio-1", track: 2, startMs: 0, inMs: 0, outMs: 3000, volume: 0.8 },
              ],
              clips: [
                { id: "clip-1", assetId: "asset-image-1", kind: "image", track: 1, startMs: 0, inMs: 0, outMs: 3000, speed: 1 },
                { id: "clip-2", assetId: "asset-video-2", kind: "video", track: 1, startMs: 3000, inMs: 200, outMs: 4200, speed: 1 },
              ],
              durationMs: 7000,
              subtitles: [],
            },
          },
        },
      },
      type: "video.generate",
    });

    expect(metadata).toMatchObject({
      sourceNodeType: "video.generate",
      videoEditorExport: expect.objectContaining({
        billingUnit: "video_generation",
        durationMs: 7000,
        source: "video_editor_export",
        sourceVideoEditorNodeId: "video-editor-1",
        timelineAssetCounts: {
          audio: 1,
          clips: 2,
        },
      }),
    });
    expect((metadata.videoEditorExport as Record<string, unknown>).renderPlan).toBeUndefined();
    expect(JSON.stringify(metadata)).not.toMatch(/blob:|data:/);
  });

  test("registers the expected queue names", () => {
    const workerClose = vi.fn(async () => {});
    const eventsClose = vi.fn(async () => {});
    const queueClose = vi.fn(async () => {});
    const createdQueues: string[] = [];

    const runtime = createWorkerRuntime({
      env: {
        credentialKeyVersion: "v1",
        credentialMasterKey: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
        nodeEnv: "test",
        queuePrefix: "test-prefix",
        redisUrl: "redis://localhost:6379",
        s3AccessKeyId: "test-access",
        s3Bucket: "test-bucket",
        s3Endpoint: "http://localhost:9000",
        s3ForcePathStyle: true,
        s3Region: "us-east-1",
        s3SecretAccessKey: "test-secret",
        defaultNodeConcurrency: 4,
        imageNodeConcurrency: 2,
        imageVariantsMode: "sync",
        nodeExecuteConcurrency: 16,
        providerPollConcurrency: 16,
        videoNodeConcurrency: 1,
        workerConcurrency: 2,
        workerName: "test-worker",
      },
      logger: createTestLogger(),
      pool: {} as never,
      queueFactory: {
        createQueue(name: string) {
          createdQueues.push(`queue:${name}`);
          return { close: queueClose };
        },
        createQueueEvents(name: string) {
          createdQueues.push(`events:${name}`);
          return { close: eventsClose };
        },
        createWorker(name: string) {
          createdQueues.push(`worker:${name}`);
          return { close: workerClose };
        },
      } as never,
      workflowNodeExecutionService: {} as never,
    });

    expect(runtime.queueNames).toEqual([...WORKER_QUEUE_NAMES]);
    expect(createdQueues).toContain(`worker:${QUEUE_NAMES.nodeExecute}`);
    expect(createdQueues).toContain(`worker:${QUEUE_NAMES.nodeExecuteDefault}`);
    expect(createdQueues).toContain(`worker:${QUEUE_NAMES.nodeExecuteImage}`);
    expect(createdQueues).toContain(`worker:${QUEUE_NAMES.nodeExecuteVideo}`);
    expect(createdQueues).toContain(`worker:${QUEUE_NAMES.providerPoll}`);
    expect(createdQueues).toContain(`worker:${QUEUE_NAMES.assetImageVariant}`);
  });

  test("registers node execution modality queues with independent concurrency", () => {
    const workerClose = vi.fn(async () => {});
    const eventsClose = vi.fn(async () => {});
    const queueClose = vi.fn(async () => {});
    const workerOptions = new Map<string, { concurrency: number }>();

    createWorkerRuntime({
      env: {
        credentialKeyVersion: "v1",
        credentialMasterKey: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
        nodeEnv: "test",
        queuePrefix: "test-prefix",
        redisUrl: "redis://localhost:6379",
        s3AccessKeyId: "test-access",
        s3Bucket: "test-bucket",
        s3Endpoint: "http://localhost:9000",
        s3ForcePathStyle: true,
        s3Region: "us-east-1",
        s3SecretAccessKey: "test-secret",
        defaultNodeConcurrency: 5,
        imageNodeConcurrency: 3,
        imageVariantsMode: "sync",
        nodeExecuteConcurrency: 32,
        providerPollConcurrency: 24,
        videoNodeConcurrency: 1,
        workerConcurrency: 8,
        workerName: "test-worker",
      },
      logger: createTestLogger(),
      pool: {} as never,
      queueFactory: {
        createQueue() {
          return { close: queueClose };
        },
        createQueueEvents() {
          return { close: eventsClose };
        },
        createWorker(name: string, _processor: unknown, options: { concurrency: number }) {
          workerOptions.set(name, options);
          return { close: workerClose };
        },
      } as never,
      workflowNodeExecutionService: {} as never,
    });

    expect(workerOptions.get(QUEUE_NAMES.nodeExecute)?.concurrency).toBe(32);
    expect(workerOptions.get(QUEUE_NAMES.nodeExecuteDefault)?.concurrency).toBe(5);
    expect(workerOptions.get(QUEUE_NAMES.nodeExecuteImage)?.concurrency).toBe(3);
    expect(workerOptions.get(QUEUE_NAMES.nodeExecuteVideo)?.concurrency).toBe(1);
    expect(workerOptions.get(QUEUE_NAMES.providerPoll)?.concurrency).toBe(24);
    expect(workerOptions.get(QUEUE_NAMES.workflowStart)?.concurrency).toBe(8);
    expect(workerOptions.get(QUEUE_NAMES.assetImageVariant)?.concurrency).toBe(8);
    expect(workerOptions.get(QUEUE_NAMES.assetIngest)?.concurrency).toBe(8);
    expect(workerOptions.get(QUEUE_NAMES.billingSettle)?.concurrency).toBe(8);
  });

  test("worker env defaults node.execute concurrency above single-flight and supports override", () => {
    const previous = {
      credential: process.env.CREDENTIAL_MASTER_KEY,
      defaultConcurrency: process.env.WORKER_DEFAULT_CONCURRENCY,
      imageConcurrency: process.env.WORKER_IMAGE_CONCURRENCY,
      imageVariantsMode: process.env.WORKER_IMAGE_VARIANTS_MODE,
      nodeExecuteConcurrency: process.env.NODE_EXECUTE_CONCURRENCY,
      nodeEnv: process.env.NODE_ENV,
      providerPollConcurrency: process.env.PROVIDER_POLL_CONCURRENCY,
      s3AccessKeyId: process.env.S3_ACCESS_KEY_ID,
      s3Bucket: process.env.S3_BUCKET,
      s3Endpoint: process.env.S3_ENDPOINT,
      s3ForcePathStyle: process.env.S3_FORCE_PATH_STYLE,
      s3Region: process.env.S3_REGION,
      s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      videoConcurrency: process.env.WORKER_VIDEO_CONCURRENCY,
      workerConcurrency: process.env.WORKER_CONCURRENCY,
    };

    try {
      process.env.NODE_ENV = "test";
      delete process.env.WORKER_CONCURRENCY;
      delete process.env.WORKER_DEFAULT_CONCURRENCY;
      delete process.env.WORKER_IMAGE_CONCURRENCY;
      delete process.env.WORKER_IMAGE_VARIANTS_MODE;
      delete process.env.WORKER_VIDEO_CONCURRENCY;
      delete process.env.NODE_EXECUTE_CONCURRENCY;
      delete process.env.PROVIDER_POLL_CONCURRENCY;
      const defaultEnv = getWorkerEnv();
      expect(defaultEnv.nodeExecuteConcurrency).toBeGreaterThan(1);
      expect(defaultEnv.providerPollConcurrency).toBeGreaterThan(1);
      expect(defaultEnv.imageNodeConcurrency).toBe(4);
      expect(defaultEnv.videoNodeConcurrency).toBe(1);
      expect(defaultEnv.defaultNodeConcurrency).toBe(4);
      expect(defaultEnv.imageVariantsMode).toBe("sync");

      process.env.NODE_EXECUTE_CONCURRENCY = "37";
      process.env.PROVIDER_POLL_CONCURRENCY = "19";
      process.env.WORKER_IMAGE_CONCURRENCY = "6";
      process.env.WORKER_VIDEO_CONCURRENCY = "2";
      process.env.WORKER_DEFAULT_CONCURRENCY = "7";
      process.env.WORKER_IMAGE_VARIANTS_MODE = "async";
      const overriddenEnv = getWorkerEnv();
      expect(overriddenEnv.nodeExecuteConcurrency).toBe(37);
      expect(overriddenEnv.providerPollConcurrency).toBe(19);
      expect(overriddenEnv.imageNodeConcurrency).toBe(6);
      expect(overriddenEnv.videoNodeConcurrency).toBe(2);
      expect(overriddenEnv.defaultNodeConcurrency).toBe(7);
      expect(overriddenEnv.imageVariantsMode).toBe("async");
    } finally {
      if (previous.credential === undefined) delete process.env.CREDENTIAL_MASTER_KEY;
      else process.env.CREDENTIAL_MASTER_KEY = previous.credential;
      if (previous.defaultConcurrency === undefined) delete process.env.WORKER_DEFAULT_CONCURRENCY;
      else process.env.WORKER_DEFAULT_CONCURRENCY = previous.defaultConcurrency;
      if (previous.imageConcurrency === undefined) delete process.env.WORKER_IMAGE_CONCURRENCY;
      else process.env.WORKER_IMAGE_CONCURRENCY = previous.imageConcurrency;
      if (previous.imageVariantsMode === undefined) delete process.env.WORKER_IMAGE_VARIANTS_MODE;
      else process.env.WORKER_IMAGE_VARIANTS_MODE = previous.imageVariantsMode;
      if (previous.nodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous.nodeEnv;
      if (previous.videoConcurrency === undefined) delete process.env.WORKER_VIDEO_CONCURRENCY;
      else process.env.WORKER_VIDEO_CONCURRENCY = previous.videoConcurrency;
      if (previous.workerConcurrency === undefined) delete process.env.WORKER_CONCURRENCY;
      else process.env.WORKER_CONCURRENCY = previous.workerConcurrency;
      if (previous.nodeExecuteConcurrency === undefined) delete process.env.NODE_EXECUTE_CONCURRENCY;
      else process.env.NODE_EXECUTE_CONCURRENCY = previous.nodeExecuteConcurrency;
      if (previous.providerPollConcurrency === undefined) delete process.env.PROVIDER_POLL_CONCURRENCY;
      else process.env.PROVIDER_POLL_CONCURRENCY = previous.providerPollConcurrency;
      if (previous.s3Endpoint === undefined) delete process.env.S3_ENDPOINT;
      else process.env.S3_ENDPOINT = previous.s3Endpoint;
      if (previous.s3Region === undefined) delete process.env.S3_REGION;
      else process.env.S3_REGION = previous.s3Region;
      if (previous.s3Bucket === undefined) delete process.env.S3_BUCKET;
      else process.env.S3_BUCKET = previous.s3Bucket;
      if (previous.s3AccessKeyId === undefined) delete process.env.S3_ACCESS_KEY_ID;
      else process.env.S3_ACCESS_KEY_ID = previous.s3AccessKeyId;
      if (previous.s3SecretAccessKey === undefined) delete process.env.S3_SECRET_ACCESS_KEY;
      else process.env.S3_SECRET_ACCESS_KEY = previous.s3SecretAccessKey;
      if (previous.s3ForcePathStyle === undefined) delete process.env.S3_FORCE_PATH_STYLE;
      else process.env.S3_FORCE_PATH_STYLE = previous.s3ForcePathStyle;
    }
  });

  test("processor skeleton returns a no-op result with tenantId and traceId", async () => {
    const result = await processWorkflowStartJob(
      {
        data: {
          tenantId: "tenant-1",
          traceId: "trace-1",
          workflowRunId: "run-1",
        },
        id: "job-1",
        queueName: QUEUE_NAMES.workflowStart,
      } as never,
      createTestLogger(),
    );

    expect(result).toEqual({
      jobId: "job-1",
      queueName: QUEUE_NAMES.workflowStart,
      status: "no-op",
      tenantId: "tenant-1",
      traceId: "trace-1",
    });
  });

  test("worker processor logs include traceId, tenantId, queueName, and jobId", async () => {
    const logger = createSpyLogger();

    await processNodeExecuteJob(
      {
        data: {
          nodeRunId: "node-1",
          tenantId: "tenant-1",
          traceId: "trace-1",
          workflowRunId: "run-1",
        },
        id: "job-1",
        queueName: QUEUE_NAMES.nodeExecute,
      } as never,
      logger,
      {
        executionService: {
          async executeNode() {
            return {
              jobId: null,
              queueName: QUEUE_NAMES.nodeExecute,
              status: "ok" as const,
              tenantId: "tenant-1",
              traceId: "trace-1",
            };
          },
        } as never,
      },
    );

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-1",
        nodeRunId: "node-1",
        queueName: QUEUE_NAMES.nodeExecute,
        tenantId: "tenant-1",
        traceId: "trace-1",
        workflowRunId: "run-1",
      }),
      "processing node.execute job",
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-1",
        nodeRunId: "node-1",
        queueName: QUEUE_NAMES.nodeExecute,
        status: "ok",
        tenantId: "tenant-1",
        traceId: "trace-1",
        workflowRunId: "run-1",
      }),
      "completed node.execute job",
    );
  });

  test("graceful shutdown closes worker resources", async () => {
    const workerClose = vi.fn(async () => {});
    const eventsClose = vi.fn(async () => {});
    const queueClose = vi.fn(async () => {});

    const runtime = createWorkerRuntime({
      env: {
        credentialKeyVersion: "v1",
        credentialMasterKey: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
        nodeEnv: "test",
        queuePrefix: "test-prefix",
        redisUrl: "redis://localhost:6379",
        s3AccessKeyId: "test-access",
        s3Bucket: "test-bucket",
        s3Endpoint: "http://localhost:9000",
        s3ForcePathStyle: true,
        s3Region: "us-east-1",
        s3SecretAccessKey: "test-secret",
        defaultNodeConcurrency: 4,
        imageNodeConcurrency: 2,
        imageVariantsMode: "sync",
        nodeExecuteConcurrency: 16,
        providerPollConcurrency: 16,
        videoNodeConcurrency: 1,
        workerConcurrency: 2,
        workerName: "test-worker",
      },
      logger: createTestLogger(),
      pool: { end: vi.fn(async () => {}) } as never,
      queueFactory: {
        createQueue() {
          return { close: queueClose };
        },
        createQueueEvents() {
          return { close: eventsClose };
        },
        createWorker() {
          return { close: workerClose };
        },
      } as never,
      workflowNodeExecutionService: {} as never,
    });

    await runtime.shutdown();

    expect(workerClose).toHaveBeenCalledTimes(WORKER_QUEUE_NAMES.length);
    expect(eventsClose).toHaveBeenCalledTimes(WORKER_QUEUE_NAMES.length);
    expect(queueClose).toHaveBeenCalledTimes(7);
  });
});

describeWithDatabase("workflow node execution", () => {
  test("text node execution records billing audit logs without prompt leakage", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();

      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });

        const seeded = await seedWorkflowRuntime(appPool, {
          inputNodeOutputJson: {
            prompt: "sensitive prompt text",
          },
          inputNodeStatus: "succeeded",
          middleNodeStatus: "runnable",
        });
        const nodeQueue = createFakeNodeExecuteQueue();
        const pollQueue = createFakeProviderPollQueue();
        const service = createWorkflowService({
          nodeQueue,
          pollQueue,
          pool: appPool,
          storageProvider: new MemoryStorageProvider(),
          textGenerationRuntime: {
            async generateText() {
              return {
                modelKey: "mock-model",
                outputText: "generated text",
                providerKey: "mock-provider",
                providerRequest: {
                  prompt: "sensitive prompt text",
                },
                providerResponse: {
                  base64: "should-not-appear",
                },
                status: "succeeded" as const,
                usage: {
                  inputTokens: 2,
                  outputTokens: 3,
                  totalTokens: 5,
                },
              };
            },
          },
        });

        await processNodeExecuteJob(
          {
            data: {
              nodeRunId: seeded.middleNodeRunId,
              tenantId: seeded.tenantId,
              traceId: "trace-audit",
              workflowRunId: seeded.workflowRunId,
            },
            id: "job-audit",
            queueName: QUEUE_NAMES.nodeExecute,
          } as never,
          createTestLogger(),
          { executionService: service },
        );

        const auditRows = await withTenantTransaction(
          { tenantId: seeded.tenantId, userId: seeded.userId },
          async (client) => {
            const result = await client.query<{
              action: string;
              metadata: Record<string, unknown>;
            }>(
              `
                SELECT action, metadata
                FROM audit_logs
                ORDER BY created_at ASC, id ASC
              `,
            );
            return result.rows;
          },
          appPool,
        );

        expect(auditRows.map((row) => row.action)).toEqual([
          "billing.usage.record",
          "billing.ledger.settle",
        ]);
        const serialized = JSON.stringify(auditRows);
        expect(serialized).not.toContain("sensitive prompt text");
        expect(serialized).not.toContain("should-not-appear");
        expect(serialized).not.toContain("base64");
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("input node succeeds and downstream node is enqueued with ID-only payload", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();

      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });

        const seeded = await seedWorkflowRuntime(appPool);
        const nodeQueue = createFakeNodeExecuteQueue();
        const pollQueue = createFakeProviderPollQueue();
        const service = createWorkflowService({
          nodeQueue,
          pollQueue,
          pool: appPool,
          storageProvider: new MemoryStorageProvider(),
        });

        await processNodeExecuteJob(
          {
            data: {
              nodeRunId: seeded.inputNodeRunId,
              tenantId: seeded.tenantId,
              traceId: "trace-input",
              workflowRunId: seeded.workflowRunId,
            },
            id: "job-input",
            queueName: QUEUE_NAMES.nodeExecute,
          } as never,
          createTestLogger(),
          { executionService: service },
        );

        const result = await withTenantTransaction(
          { tenantId: seeded.tenantId, userId: seeded.userId },
          async (client) => {
            const inputNode = await client.query<{ status: string; output_json: Record<string, unknown> }>(
              "SELECT status, output_json FROM node_runs WHERE id = $1::uuid",
              [seeded.inputNodeRunId],
            );
            const nextNode = await client.query<{ id: string; status: string }>(
              "SELECT id::text AS id, status FROM node_runs WHERE id = $1::uuid",
              [seeded.middleNodeRunId],
            );
            return {
              inputNode: inputNode.rows[0],
              nextNode: nextNode.rows[0],
            };
          },
          appPool,
        );

        expect(result.inputNode.status).toBe("succeeded");
        expect(result.inputNode.output_json).toEqual({ prompt: "hello worker" });
        expect(result.nextNode.status).toBe("runnable");
        expect(nodeQueue.jobs).toHaveLength(1);
        expect(Object.keys(nodeQueue.jobs[0].data).sort()).toEqual([
          "nodeRunId",
          "tenantId",
          "traceId",
          "workflowRunId",
        ]);
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("text.generate node calls mocked AI Gateway runtime and succeeds", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();

      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });

        const generatedImage = await createPngBuffer(640, 360);
        const seeded = await seedWorkflowRuntime(appPool, {
          inputNodeStatus: "succeeded",
          inputOutputJson: { prompt: "hello from upstream" },
          middleNodeStatus: "runnable",
        });
        const generateText = vi.fn(async () => ({
          modelKey: "mock-model",
          outputText: "generated text",
          providerKey: "mock-provider",
          providerRequest: {},
          providerResponse: {},
          status: "succeeded" as const,
          usage: {
            inputTokens: 2,
            outputTokens: 3,
            totalTokens: 5,
          },
        }));

        const service = createWorkflowService({
          nodeQueue: createFakeNodeExecuteQueue(),
          pollQueue: createFakeProviderPollQueue(),
          pool: appPool,
          storageProvider: new MemoryStorageProvider(),
          textGenerationRuntime: {
            generateText,
          },
        });

        await processNodeExecuteJob(
          {
            data: {
              nodeRunId: seeded.middleNodeRunId,
              tenantId: seeded.tenantId,
              traceId: "trace-text",
              workflowRunId: seeded.workflowRunId,
            },
            id: "job-text",
            queueName: QUEUE_NAMES.nodeExecute,
          } as never,
          createTestLogger(),
          { executionService: service },
        );

        await processNodeExecuteJob(
          {
            data: {
              nodeRunId: seeded.middleNodeRunId,
              tenantId: seeded.tenantId,
              traceId: "trace-text-retry",
              workflowRunId: seeded.workflowRunId,
            },
            id: "job-text-retry",
            queueName: QUEUE_NAMES.nodeExecute,
          } as never,
          createTestLogger(),
          { executionService: service },
        );

        expect(generateText).toHaveBeenCalledTimes(1);
        const nodeRun = await withTenantTransaction(
          { tenantId: seeded.tenantId, userId: seeded.userId },
          async (client) => {
            const result = await client.query<{ status: string; output_json: Record<string, unknown> }>(
              "SELECT status, output_json FROM node_runs WHERE id = $1::uuid",
              [seeded.middleNodeRunId],
            );
            return result.rows[0];
          },
          appPool,
        );
        const billing = await countBillingState(appPool, seeded.tenantId, seeded.userId);
        const billingService = new BillingService({ pool: appPool });

        const usageEventId = await withTenantTransaction(
          { tenantId: seeded.tenantId, userId: seeded.userId },
          async (client) => {
            const result = await client.query<{ id: string }>(
              "SELECT id::text AS id FROM usage_events LIMIT 1",
            );
            return result.rows[0]?.id ?? "";
          },
          appPool,
        );
        await billingService.settleUsage(
          { tenantId: seeded.tenantId, userId: seeded.userId },
          {
            amountCents: 0,
            idempotencyKey: `settle:${usageEventId}`,
            usageEventId,
          },
        );
        const billingAfterDuplicateSettle = await countBillingState(appPool, seeded.tenantId, seeded.userId);

        expect(nodeRun.status).toBe("succeeded");
        expect(nodeRun.output_json.text).toBe("generated text");
        expect(billing).toEqual({
          ledgerEntries: 1,
          usageEvents: 1,
        });
        expect(billingAfterDuplicateSettle).toEqual({
          ledgerEntries: 1,
          usageEvents: 1,
        });
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("text.generate uses generationPrompt when there is no upstream text output", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();

      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });

        const seeded = await seedWorkflowRuntime(appPool, {
          inputNodeOutputJson: {},
          inputNodeStatus: "succeeded",
          middleNodeConfig: {
            generationPrompt: "帮我写一段搞笑的短视频脚本",
            routeKey: "default-text",
            systemPrompt: "You are helpful.",
          },
          middleNodeStatus: "runnable",
        });
        const generateText = vi.fn(async () => ({
          modelKey: "mock-model",
          outputText: "这是一个搞笑短视频脚本。",
          providerKey: "mock-provider",
          providerRequest: {},
          providerResponse: {},
          status: "succeeded" as const,
          usage: {
            inputTokens: 2,
            outputTokens: 3,
            totalTokens: 5,
          },
        }));

        const service = createWorkflowService({
          nodeQueue: createFakeNodeExecuteQueue(),
          pollQueue: createFakeProviderPollQueue(),
          pool: appPool,
          storageProvider: new MemoryStorageProvider(),
          textGenerationRuntime: {
            generateText,
          },
        });

        await processNodeExecuteJob(
          {
            data: {
              nodeRunId: seeded.middleNodeRunId,
              tenantId: seeded.tenantId,
              traceId: "trace-text-generation-prompt",
              workflowRunId: seeded.workflowRunId,
            },
            id: "job-text-generation-prompt",
            queueName: QUEUE_NAMES.nodeExecute,
          } as never,
          createTestLogger(),
          { executionService: service },
        );

        expect(generateText).toHaveBeenCalledTimes(1);
        expect(generateText).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            messages: expect.arrayContaining([
              expect.objectContaining({
                content: "帮我写一段搞笑的短视频脚本",
                role: "user",
              }),
            ]),
          }),
          expect.anything(),
        );
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("image.generate sync result creates asset rows and stores AssetRef only", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();

      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });

        const seeded = await seedWorkflowRuntime(appPool, {
          inputNodeStatus: "succeeded",
          inputOutputJson: { prompt: "draw a sunrise" },
          middleNodeConfig: {
            prompt: "fallback prompt",
            routeKey: "default-image",
          },
          middleNodeStatus: "runnable",
          middleNodeType: "image.generate",
        });
        const nodeQueue = createFakeNodeExecuteQueue();
        const pollQueue = createFakeProviderPollQueue();
        const storageProvider = new MemoryStorageProvider();
        const service = createWorkflowService({
          mediaGenerationRuntime: {
            async generateImage() {
              return {
                modelKey: "image-model",
                outputs: [
                  {
                    base64: generatedImage.toString("base64"),
                    mimeType: "image/png",
                    height: 1,
                    width: 1,
                  },
                ],
                providerKey: "mock-provider",
                providerRequest: { prompt: "draw a sunrise" },
                providerResponse: { accepted: true },
                status: "succeeded",
                usage: {
                  inputTokens: 5,
                  outputTokens: 1,
                  totalTokens: 6,
                },
              };
            },
            async generateVideo() {
              throw new Error("not used");
            },
            async pollTask() {
              throw new Error("not used");
            },
          },
          nodeQueue,
          pollQueue,
          pool: appPool,
          storageProvider,
        });

        await processNodeExecuteJob(
          {
            data: {
              nodeRunId: seeded.middleNodeRunId,
              tenantId: seeded.tenantId,
              traceId: "trace-image",
              workflowRunId: seeded.workflowRunId,
            },
            id: "job-image",
            queueName: QUEUE_NAMES.nodeExecute,
          } as never,
          createTestLogger(),
          { executionService: service },
        );

        const state = await withTenantTransaction(
          { tenantId: seeded.tenantId, userId: seeded.userId },
          async (client) => {
            const nodeRun = await client.query<{ status: string; output_json: Record<string, unknown> }>(
              "SELECT status, output_json FROM node_runs WHERE id = $1::uuid",
              [seeded.middleNodeRunId],
            );
            const asset = await client.query<{ height: number; id: string; kind: string; status: string; workflow_run_id: string; node_run_id: string; width: number }>(
              "SELECT height, id::text AS id, kind, status, workflow_run_id::text AS workflow_run_id, node_run_id::text AS node_run_id, width FROM assets WHERE workflow_run_id = $1::uuid",
              [seeded.workflowRunId],
            );
            const variants = await client.query<{ height: number; object_key: string; size_bytes: string; variant_key: string; width: number }>(
              "SELECT height, object_key, size_bytes::text AS size_bytes, variant_key, width FROM asset_variants WHERE asset_id = $1::uuid ORDER BY variant_key ASC",
              [asset.rows[0]?.id],
            );
            const outputNode = await client.query<{ status: string }>(
              "SELECT status FROM node_runs WHERE id = $1::uuid",
              [seeded.outputNodeRunId],
            );
            return {
              asset: asset.rows[0],
              nodeRun: nodeRun.rows[0],
              outputNode: outputNode.rows[0],
              variants: variants.rows,
            };
          },
          appPool,
        );
        const billing = await countBillingState(appPool, seeded.tenantId, seeded.userId);

        expect(state.nodeRun.status).toBe("succeeded");
        expect(state.nodeRun.output_json).toEqual({
          aiRuntime: {
            modelId: null,
            modelKey: "image-model",
            providerId: null,
            providerKey: "mock-provider",
            routeId: null,
            routeKey: "default-image",
          },
          assets: [
            expect.objectContaining({
              assetId: expect.any(String),
              kind: "image",
              mimeType: "image/png",
              height: 360,
              width: 640,
            }),
          ],
        });
        expect(JSON.stringify(state.nodeRun.output_json)).not.toContain("base64");
        expect(JSON.stringify(state.nodeRun.output_json)).not.toContain("assetTimings");
        expect(JSON.stringify(state.nodeRun.output_json)).not.toContain("timing");
        expect(state.asset).toMatchObject({
          kind: "image",
          height: 360,
          node_run_id: seeded.middleNodeRunId,
          status: "available",
          width: 640,
          workflow_run_id: seeded.workflowRunId,
        });
        expect(state.variants.map((variant) => variant.variant_key)).toEqual(["preview", "thumb"]);
        for (const variant of state.variants) {
          expect(Number(variant.size_bytes)).toBeGreaterThan(0);
          expect(storageProvider.objects.get(`test-bucket/${variant.object_key}`)?.body.byteLength).toBeGreaterThan(0);
        }
        expect(storageProvider.objects.size).toBe(3);
        expect(state.outputNode.status).toBe("runnable");
        expect(pollQueue.jobs).toHaveLength(0);
        expect(billing).toEqual({
          ledgerEntries: 1,
          usageEvents: 1,
        });
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("image.generate emits T3 request debug summary for workflow runs", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();

      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });

        const referenceAssetId = "00000000-0000-4000-8000-000000000201";
        const seeded = await seedWorkflowRuntime(appPool, {
          inputNodeStatus: "succeeded",
          middleNodeConfig: {
            generationPrompt: "图一女孩穿印有图二图案的衣服",
            params: {
              aspect_ratio: "16:9",
              quality: "auto",
              size: "2k",
            },
            referenceImages: ["https://assets.example/reference-1.png"],
            routeKey: "image.mouxihub.nano-banana-pro.t3",
          },
          middleNodeStatus: "runnable",
          middleNodeType: "image.generate",
        });

        await withTenantTransaction(
          { tenantId: seeded.tenantId, userId: seeded.userId },
          async (client) => {
            await client.query(
              `
                INSERT INTO assets (
                  id,
                  tenant_id,
                  project_id,
                  owner_user_id,
                  kind,
                  mime_type,
                  bucket,
                  object_key,
                  original_filename,
                  status,
                  source
                )
                VALUES (
                  $1::uuid,
                  $2::uuid,
                  $3::uuid,
                  $4::uuid,
                  'image',
                  'image/png',
                  'test-bucket',
                  'tenants/reference/debug.png',
                  'debug.png',
                  'available',
                  'upload'
                )
              `,
              [referenceAssetId, seeded.tenantId, seeded.projectId, seeded.userId],
            );
            await client.query(
              `
                UPDATE flow_versions
                SET compiled_graph_json = $2::jsonb
                WHERE id = $1::uuid
              `,
              [
                seeded.flowVersionId,
                JSON.stringify({
                  edges: [
                    { source: "reference", target: "image" },
                  ],
                  entryNodeIds: ["reference"],
                  nodes: [
                    {
                      config: {
                        assetId: referenceAssetId,
                        mimeType: "image/png",
                      },
                      dependencies: [],
                      dependents: ["image"],
                      id: "reference",
                      type: "image.asset",
                    },
                    {
                      config: {
                        generationPrompt: "图一女孩穿印有图二图案的衣服",
                        params: {
                          aspect_ratio: "16:9",
                          quality: "auto",
                          size: "2k",
                        },
                        referenceImages: ["https://assets.example/reference-1.png"],
                        routeKey: "image.mouxihub.nano-banana-pro.t3",
                      },
                      dependencies: ["reference"],
                      dependents: [],
                      id: "image",
                      type: "image.generate",
                    },
                  ],
                  outputNodeIds: ["image"],
                  schemaVersion: "v2",
                }),
              ],
            );
          },
          appPool,
        );

        const service = createWorkflowService({
          mediaGenerationRuntime: {
            async generateImage() {
              return {
                modelKey: "image-model",
                outputs: [
                  {
                    base64: Buffer.from("fake image bytes").toString("base64"),
                    mimeType: "image/png",
                    width: 512,
                  },
                ],
                providerKey: "mock-provider",
                providerRequest: {},
                providerResponse: { accepted: true },
                status: "succeeded" as const,
                usage: {
                  inputTokens: 5,
                  outputTokens: 1,
                  totalTokens: 6,
                },
              };
            },
            async generateVideo() {
              throw new Error("not used");
            },
            async pollTask() {
              throw new Error("not used");
            },
          },
          nodeQueue: createFakeNodeExecuteQueue(),
          pollQueue: createFakeProviderPollQueue(),
          pool: appPool,
          storageProvider: new MemoryStorageProvider(),
        });

        const logger = createTestLogger();
        await processNodeExecuteJob(
          {
            data: {
              nodeRunId: seeded.middleNodeRunId,
              tenantId: seeded.tenantId,
              traceId: "trace-workflow-debug",
              workflowRunId: seeded.workflowRunId,
            },
            id: "job-image-debug",
            queueName: QUEUE_NAMES.nodeExecute,
          } as never,
          logger,
          { executionService: service },
        );

        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            event: "workflow.image.request_debug",
            inputAssetCount: 1,
            inputAssetKinds: ["signedUrl"],
            metadataReferenceImageCount: 1,
            metadataReferenceImageKinds: ["httpsUrl"],
            params: {
              aspect_ratio: "16:9",
              quality: "auto",
              size: "2k",
            },
            routeKey: "image.mouxihub.nano-banana-pro.t3",
            traceId: "trace-workflow-debug",
            workflowRunId: seeded.workflowRunId,
          }),
          "workflow image request debug",
        );
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("target image node receives static text prompt, image asset reference, and batch count", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();

      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });

        const referenceAssetId = "00000000-0000-4000-8000-000000000001";
        const seeded = await seedWorkflowRuntime(appPool, {
          inputNodeStatus: "succeeded",
          middleNodeConfig: {
            batchCount: 2,
            routeKey: "default-image",
          },
          middleNodeStatus: "runnable",
          middleNodeType: "image.generate",
        });

        await withTenantTransaction(
          { tenantId: seeded.tenantId, userId: seeded.userId },
          async (client) => {
            await client.query(
              `
                INSERT INTO assets (
                  id,
                  tenant_id,
                  project_id,
                  owner_user_id,
                  kind,
                  mime_type,
                  bucket,
                  object_key,
                  original_filename,
                  status,
                  source
                )
                VALUES (
                  $1::uuid,
                  $2::uuid,
                  $3::uuid,
                  $4::uuid,
                  'image',
                  'image/png',
                  'test-bucket',
                  'tenants/reference/cat.png',
                  'cat.png',
                  'available',
                  'upload'
                )
              `,
              [referenceAssetId, seeded.tenantId, seeded.projectId, seeded.userId],
            );
            await client.query(
              `
                UPDATE flow_versions
                SET compiled_graph_json = $2::jsonb
                WHERE id = $1::uuid
              `,
              [
                seeded.flowVersionId,
                JSON.stringify({
                  edges: [
                    { source: "prompt", target: "image" },
                    { source: "reference", target: "image" },
                  ],
                  entryNodeIds: ["prompt", "reference"],
                  nodes: [
                    {
                      config: { text: "一只黑色小猫" },
                      dependencies: [],
                      dependents: ["image"],
                      id: "prompt",
                      type: "text.static",
                    },
                    {
                      config: {
                        assetId: referenceAssetId,
                        mimeType: "image/png",
                      },
                      dependencies: [],
                      dependents: ["image"],
                      id: "reference",
                      type: "image.asset",
                    },
                    {
                      config: {
                        batchCount: 2,
                        routeKey: "default-image",
                      },
                      dependencies: ["prompt", "reference"],
                      dependents: [],
                      id: "image",
                      type: "image.generate",
                    },
                  ],
                  outputNodeIds: ["image"],
                  schemaVersion: "v2",
                }),
              ],
            );
          },
          appPool,
        );

        const generateImage = vi.fn(async () => ({
          modelKey: "image-model",
          outputs: [
            {
              base64: Buffer.from("fake image bytes").toString("base64"),
              mimeType: "image/png",
              width: 512,
            },
          ],
          providerKey: "mock-provider",
          providerRequest: {},
          providerResponse: { accepted: true },
          status: "succeeded" as const,
          usage: {
            inputTokens: 5,
            outputTokens: 1,
            totalTokens: 6,
          },
        }));
        const service = createWorkflowService({
          mediaGenerationRuntime: {
            generateImage,
            async generateVideo() {
              throw new Error("not used");
            },
            async pollTask() {
              throw new Error("not used");
            },
          },
          nodeQueue: createFakeNodeExecuteQueue(),
          pollQueue: createFakeProviderPollQueue(),
          pool: appPool,
          storageProvider: new MemoryStorageProvider(),
        });

        await processNodeExecuteJob(
          {
            data: {
              nodeRunId: seeded.middleNodeRunId,
              tenantId: seeded.tenantId,
              traceId: "trace-target-inputs",
              workflowRunId: seeded.workflowRunId,
            },
            id: "job-target-inputs",
            queueName: QUEUE_NAMES.nodeExecute,
          } as never,
          createTestLogger(),
          { executionService: service },
        );

        expect(generateImage).toHaveBeenCalledTimes(1);
        expect(generateImage.mock.calls[0]?.[1]).toMatchObject({
          inputAssets: [
            {
              assetId: referenceAssetId,
              metadata: {
                signedUrl: "https://storage.test/test-bucket/tenants/reference/cat.png",
              },
            },
          ],
          metadata: {
            n: 2,
            params: expect.objectContaining({
              n: 2,
            }),
          },
          prompt: "一只黑色小猫",
        });
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("image.generate provider timeout keeps node recoverable instead of failing immediately", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();

      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });
        const seeded = await seedWorkflowRuntime(appPool, {
          inputNodeStatus: "succeeded",
          inputOutputJson: { prompt: "draw a slow sheep" },
          middleNodeConfig: {
            prompt: "draw a slow sheep",
            routeKey: "default-image",
          },
          middleNodeStatus: "runnable",
          middleNodeType: "image.generate",
        });
        const pollQueue = createFakeProviderPollQueue();
        const service = createWorkflowService({
          mediaGenerationRuntime: {
            async generateImage() {
              throw new AiGatewayError({
                code: "PROVIDER_TIMEOUT",
                message: "The provider request timed out",
                providerRequest: { prompt: "draw a slow sheep" },
                statusCode: 504,
              });
            },
            async generateVideo() {
              throw new Error("not used");
            },
            async pollTask() {
              throw new Error("not used");
            },
          },
          nodeQueue: createFakeNodeExecuteQueue(),
          pollQueue,
          pool: appPool,
          storageProvider: new MemoryStorageProvider(),
        });

        await processNodeExecuteJob(
          {
            data: {
              nodeRunId: seeded.middleNodeRunId,
              tenantId: seeded.tenantId,
              traceId: "trace-timeout",
              workflowRunId: seeded.workflowRunId,
            },
            id: "job-timeout",
            queueName: QUEUE_NAMES.nodeExecute,
          } as never,
          createTestLogger(),
          { executionService: service },
        );

        const state = await withTenantTransaction(
          { tenantId: seeded.tenantId, userId: seeded.userId },
          async (client) => {
            const nodeRun = await client.query<{
              error_json: Record<string, unknown> | null;
              output_json: Record<string, unknown>;
              provider_task_id: string;
              status: string;
            }>(
              "SELECT status, output_json, provider_task_id, error_json FROM node_runs WHERE id = $1::uuid",
              [seeded.middleNodeRunId],
            );
            const workflowRun = await client.query<{ status: string }>(
              "SELECT status FROM workflow_runs WHERE id = $1::uuid",
              [seeded.workflowRunId],
            );
            return {
              nodeRun: nodeRun.rows[0],
              workflowRun: workflowRun.rows[0],
            };
          },
          appPool,
        );

        expect(state.nodeRun.status).toBe("waiting_provider");
        expect(state.workflowRun.status).toBe("running");
        expect(state.nodeRun.provider_task_id).toMatch(/^timeout-unknown:/);
        expect(state.nodeRun.error_json?.code).toBe("PROVIDER_RESULT_UNKNOWN");
        expect(state.nodeRun.output_json.providerTask).toMatchObject({
          reconcileReason: "provider_result_unknown",
          status: "provider_result_unknown",
        });
        expect(pollQueue.jobs).toHaveLength(1);
        expect(pollQueue.jobs[0].data.providerTaskId).toMatch(/^timeout-unknown:/);
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("video.generate async result marks node waiting_provider and enqueues provider.poll with ID-only payload", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();

      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });

        const seeded = await seedWorkflowRuntime(appPool, {
          inputNodeStatus: "succeeded",
          inputOutputJson: { prompt: "animate a river" },
          middleNodeStatus: "runnable",
          middleNodeType: "video.generate",
        });
        const nodeQueue = createFakeNodeExecuteQueue();
        const pollQueue = createFakeProviderPollQueue();
        const service = createWorkflowService({
          mediaGenerationRuntime: {
            async generateImage() {
              throw new Error("not used");
            },
            async generateVideo() {
              return {
                modelKey: "video-model",
                outputs: [],
                providerKey: "mock-provider",
                providerRequest: { prompt: "animate a river" },
                providerResponse: { accepted: true },
                providerTaskId: "task-video-1",
                status: "waiting_provider",
                usage: {
                  inputTokens: 6,
                  outputTokens: null,
                  totalTokens: 6,
                },
              };
            },
            async pollTask() {
              throw new Error("not used");
            },
          },
          nodeQueue,
          pollQueue,
          pool: appPool,
          storageProvider: new MemoryStorageProvider(),
        });

        await processNodeExecuteJob(
          {
            data: {
              nodeRunId: seeded.middleNodeRunId,
              tenantId: seeded.tenantId,
              traceId: "trace-video",
              workflowRunId: seeded.workflowRunId,
            },
            id: "job-video",
            queueName: QUEUE_NAMES.nodeExecute,
          } as never,
          createTestLogger(),
          { executionService: service },
        );

        const nodeRun = await withTenantTransaction(
          { tenantId: seeded.tenantId, userId: seeded.userId },
          async (client) => {
            const result = await client.query<{ provider_task_id: string; status: string; output_json: Record<string, unknown> }>(
              "SELECT status, provider_task_id, output_json FROM node_runs WHERE id = $1::uuid",
              [seeded.middleNodeRunId],
            );
            return result.rows[0];
          },
          appPool,
        );

        expect(nodeRun.status).toBe("waiting_provider");
        expect(nodeRun.provider_task_id).toBe("task-video-1");
        expect(nodeRun.output_json).toEqual({
          providerTask: {
            modelId: null,
            modelKey: "video-model",
            providerId: null,
            providerKey: "mock-provider",
            providerTaskId: "task-video-1",
            routeId: null,
            routeKey: "default-media",
            status: "waiting_provider",
          },
        });
        expect(pollQueue.jobs).toHaveLength(1);
        expect(pollQueue.jobs[0]).toMatchObject({
          data: {
            nodeRunId: seeded.middleNodeRunId,
            providerTaskId: "task-video-1",
            tenantId: seeded.tenantId,
            traceId: "trace-video",
            workflowRunId: seeded.workflowRunId,
          },
        });
        expect(Object.keys(pollQueue.jobs[0].data).sort()).toEqual([
          "nodeRunId",
          "providerTaskId",
          "tenantId",
          "traceId",
          "workflowRunId",
        ]);
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("provider.poll pending re-enqueues without storing payload blobs", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();

      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });

        const seeded = await seedWorkflowRuntime(appPool, {
          inputNodeStatus: "succeeded",
          middleNodeOutputJson: {
            providerTask: {
              modelKey: "video-model",
              providerKey: "mock-provider",
              providerTaskId: "task-pending",
              routeId: "route-1",
              routeKey: "default-media",
              status: "waiting_provider",
            },
          },
          middleNodeStatus: "waiting_provider",
          middleNodeType: "video.generate",
        });
        const pollQueue = createFakeProviderPollQueue();
        const service = createWorkflowService({
          mediaGenerationRuntime: {
            async generateImage() {
              throw new Error("not used");
            },
            async generateVideo() {
              throw new Error("not used");
            },
            async pollTask() {
              return {
                providerTaskId: "task-pending",
                providerRequest: {},
                providerResponse: {},
                status: "pending",
                usage: null,
              };
            },
          },
          nodeQueue: createFakeNodeExecuteQueue(),
          pollQueue,
          pool: appPool,
          storageProvider: new MemoryStorageProvider(),
        });

        await processProviderPollJob(
          {
            data: {
              nodeRunId: seeded.middleNodeRunId,
              providerTaskId: "task-pending",
              tenantId: seeded.tenantId,
              traceId: "trace-pending",
              workflowRunId: seeded.workflowRunId,
            },
            id: "job-pending",
            queueName: QUEUE_NAMES.providerPoll,
          } as never,
          createTestLogger(),
          { executionService: service },
        );

        const nodeRun = await withTenantTransaction(
          { tenantId: seeded.tenantId, userId: seeded.userId },
          async (client) => {
            const result = await client.query<{ status: string; output_json: Record<string, unknown> }>(
              "SELECT status, output_json FROM node_runs WHERE id = $1::uuid",
              [seeded.middleNodeRunId],
            );
            return result.rows[0];
          },
          appPool,
        );
        const billing = await countBillingState(appPool, seeded.tenantId, seeded.userId);

        expect(nodeRun.status).toBe("waiting_provider");
        expect(nodeRun.output_json.providerTask).toMatchObject({
          providerTaskId: "task-pending",
          status: "pending",
        });
        expect(JSON.stringify(nodeRun.output_json)).not.toContain("base64");
        expect(pollQueue.jobs).toHaveLength(1);
        expect(pollQueue.jobs[0].delay).toBeGreaterThan(0);
        expect(billing).toEqual({
          ledgerEntries: 0,
          usageEvents: 0,
        });
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("provider.poll succeeded creates asset, marks node succeeded, and unlocks downstream", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();

      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });

        const seeded = await seedWorkflowRuntime(appPool, {
          inputNodeStatus: "succeeded",
          middleNodeOutputJson: {
            providerTask: {
              modelKey: "video-model",
              providerKey: "mock-provider",
              providerTaskId: "task-success",
              routeId: "route-1",
              routeKey: "default-media",
              status: "waiting_provider",
            },
          },
          middleNodeStatus: "waiting_provider",
          middleNodeType: "video.generate",
        });
        const nodeQueue = createFakeNodeExecuteQueue();
        const service = createWorkflowService({
          mediaGenerationRuntime: {
            async generateImage() {
              throw new Error("not used");
            },
            async generateVideo() {
              throw new Error("not used");
            },
            async pollTask() {
              return {
                mimeType: "video/mp4",
                outputBase64: [Buffer.from("fake video bytes").toString("base64")],
                providerRequest: {},
                providerResponse: {},
                providerTaskId: "task-success",
                status: "succeeded",
                usage: null,
              };
            },
          },
          nodeQueue,
          pollQueue: createFakeProviderPollQueue(),
          pool: appPool,
          storageProvider: new MemoryStorageProvider(),
        });

        await processProviderPollJob(
          {
            data: {
              nodeRunId: seeded.middleNodeRunId,
              providerTaskId: "task-success",
              tenantId: seeded.tenantId,
              traceId: "trace-success",
              workflowRunId: seeded.workflowRunId,
            },
            id: "job-success",
            queueName: QUEUE_NAMES.providerPoll,
          } as never,
          createTestLogger(),
          { executionService: service },
        );

        await processProviderPollJob(
          {
            data: {
              nodeRunId: seeded.middleNodeRunId,
              providerTaskId: "task-success",
              tenantId: seeded.tenantId,
              traceId: "trace-success-retry",
              workflowRunId: seeded.workflowRunId,
            },
            id: "job-success-retry",
            queueName: QUEUE_NAMES.providerPoll,
          } as never,
          createTestLogger(),
          { executionService: service },
        );

        const state = await withTenantTransaction(
          { tenantId: seeded.tenantId, userId: seeded.userId },
          async (client) => {
            const nodeRun = await client.query<{ status: string; output_json: Record<string, unknown> }>(
              "SELECT status, output_json FROM node_runs WHERE id = $1::uuid",
              [seeded.middleNodeRunId],
            );
            const outputNode = await client.query<{ status: string }>(
              "SELECT status FROM node_runs WHERE id = $1::uuid",
              [seeded.outputNodeRunId],
            );
            const assets = await client.query<{ count: number }>(
              "SELECT COUNT(*)::int AS count FROM assets WHERE workflow_run_id = $1::uuid",
              [seeded.workflowRunId],
            );
            return {
              assets: assets.rows[0]?.count ?? 0,
              nodeRun: nodeRun.rows[0],
              outputNode: outputNode.rows[0],
            };
          },
          appPool,
        );
        const billing = await countBillingState(appPool, seeded.tenantId, seeded.userId);

        expect(state.nodeRun.status).toBe("succeeded");
        expect(state.nodeRun.output_json.assets).toHaveLength(1);
        expect(JSON.stringify(state.nodeRun.output_json)).not.toContain("base64");
        expect(state.outputNode.status).toBe("runnable");
        expect(state.assets).toBe(1);
        expect(nodeQueue.jobs).toHaveLength(1);
        expect(billing).toEqual({
          ledgerEntries: 1,
          usageEvents: 1,
        });
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("image.generate async multi-task waits for all provider tasks before settling", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();

      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });

        const seeded = await seedWorkflowRuntime(appPool, {
          inputNodeStatus: "succeeded",
          inputOutputJson: { prompt: "make two images" },
          middleNodeStatus: "runnable",
          middleNodeType: "image.generate",
        });
        const nodeQueue = createFakeNodeExecuteQueue();
        const pollQueue = createFakeProviderPollQueue();
        const imageOne = await createPngBuffer(32, 32);
        const imageTwo = await createPngBuffer(48, 48);
        const service = createWorkflowService({
          mediaGenerationRuntime: {
            async generateImage() {
              return {
                modelKey: "nano-banana-pro",
                outputs: [],
                providerKey: "mock-provider",
                providerRequest: [{ call: 1 }, { call: 2 }],
                providerResponse: [{ accepted: true }, { accepted: true }],
                providerTaskId: "task-image-1",
                providerTaskIds: ["task-image-1", "task-image-2"],
                status: "waiting_provider",
                usage: {
                  inputTokens: 10,
                  outputTokens: null,
                  totalTokens: 10,
                },
              };
            },
            async generateVideo() {
              throw new Error("not used");
            },
            async pollTask(_context, _modality, request) {
              if ((request as { providerTaskId: string }).providerTaskId === "task-image-1") {
                return {
                  mimeType: "image/png",
                  outputBase64: [imageOne.toString("base64")],
                  providerRequest: {},
                  providerResponse: {},
                  providerTaskId: "task-image-1",
                  status: "succeeded",
                  usage: null,
                };
              }
              return {
                mimeType: "image/png",
                outputBase64: [imageTwo.toString("base64")],
                providerRequest: {},
                providerResponse: {},
                providerTaskId: "task-image-2",
                status: "succeeded",
                usage: null,
              };
            },
          },
          nodeQueue,
          pollQueue,
          pool: appPool,
          storageProvider: new MemoryStorageProvider(),
        });

        await processNodeExecuteJob(
          {
            data: {
              nodeRunId: seeded.middleNodeRunId,
              tenantId: seeded.tenantId,
              traceId: "trace-image-multi",
              workflowRunId: seeded.workflowRunId,
            },
            id: "job-image-multi",
            queueName: QUEUE_NAMES.nodeExecute,
          } as never,
          createTestLogger(),
          { executionService: service },
        );

        expect(pollQueue.jobs).toHaveLength(2);

        await processProviderPollJob(
          {
            data: pollQueue.jobs[0]!.data,
            id: "job-image-poll-1",
            queueName: QUEUE_NAMES.providerPoll,
          } as never,
          createTestLogger(),
          { executionService: service },
        );

        const afterFirstPoll = await withTenantTransaction(
          { tenantId: seeded.tenantId, userId: seeded.userId },
          async (client) => {
            const nodeRun = await client.query<{ status: string; output_json: Record<string, unknown> }>(
              "SELECT status, output_json FROM node_runs WHERE id = $1::uuid",
              [seeded.middleNodeRunId],
            );
            return nodeRun.rows[0];
          },
          appPool,
        );
        const billingAfterFirstPoll = await countBillingState(appPool, seeded.tenantId, seeded.userId);

        expect(afterFirstPoll.status).toBe("waiting_provider");
        expect(Array.isArray(afterFirstPoll.output_json.providerTasks)).toBe(true);
        expect((afterFirstPoll.output_json.providerTasks as Array<Record<string, unknown>>).map((task) => task.status)).toEqual([
          "succeeded",
          "waiting_provider",
        ]);
        expect(billingAfterFirstPoll).toEqual({
          ledgerEntries: 0,
          usageEvents: 0,
        });

        await processProviderPollJob(
          {
            data: pollQueue.jobs[1]!.data,
            id: "job-image-poll-2",
            queueName: QUEUE_NAMES.providerPoll,
          } as never,
          createTestLogger(),
          { executionService: service },
        );

        const finalState = await withTenantTransaction(
          { tenantId: seeded.tenantId, userId: seeded.userId },
          async (client) => {
            const nodeRun = await client.query<{ status: string; output_json: Record<string, unknown> }>(
              "SELECT status, output_json FROM node_runs WHERE id = $1::uuid",
              [seeded.middleNodeRunId],
            );
            const outputNode = await client.query<{ status: string }>(
              "SELECT status FROM node_runs WHERE id = $1::uuid",
              [seeded.outputNodeRunId],
            );
            const assets = await client.query<{ count: number }>(
              "SELECT COUNT(*)::int AS count FROM assets WHERE workflow_run_id = $1::uuid",
              [seeded.workflowRunId],
            );
            return {
              assets: assets.rows[0]?.count ?? 0,
              nodeRun: nodeRun.rows[0],
              outputNode: outputNode.rows[0],
            };
          },
          appPool,
        );
        const finalBilling = await countBillingState(appPool, seeded.tenantId, seeded.userId);

        expect(finalState.nodeRun.status).toBe("succeeded");
        expect(finalState.nodeRun.output_json.assets).toHaveLength(2);
        expect(finalState.assets).toBe(2);
        expect(finalState.outputNode.status).toBe("runnable");
        expect(nodeQueue.jobs).toHaveLength(1);
        expect(finalBilling).toEqual({
          ledgerEntries: 1,
          usageEvents: 1,
        });
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("provider.poll failed marks node and workflow failed", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();

      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });

        const seeded = await seedWorkflowRuntime(appPool, {
          inputNodeStatus: "succeeded",
          middleNodeOutputJson: {
            providerTask: {
              modelKey: "video-model",
              providerKey: "mock-provider",
              providerTaskId: "task-failed",
              routeId: "route-1",
              routeKey: "default-media",
              status: "waiting_provider",
            },
          },
          middleNodeStatus: "waiting_provider",
          middleNodeType: "video.generate",
        });
        const service = createWorkflowService({
          mediaGenerationRuntime: {
            async generateImage() {
              throw new Error("not used");
            },
            async generateVideo() {
              throw new Error("not used");
            },
            async pollTask() {
              return {
                error: {
                  code: "PROVIDER_FAILED",
                  message: "provider failed",
                },
                providerRequest: {},
                providerResponse: {},
                providerTaskId: "task-failed",
                status: "failed",
                usage: null,
              };
            },
          },
          nodeQueue: createFakeNodeExecuteQueue(),
          pollQueue: createFakeProviderPollQueue(),
          pool: appPool,
          storageProvider: new MemoryStorageProvider(),
        });

        await expect(
          processProviderPollJob(
            {
              data: {
                nodeRunId: seeded.middleNodeRunId,
                providerTaskId: "task-failed",
                tenantId: seeded.tenantId,
                traceId: "trace-failed",
                workflowRunId: seeded.workflowRunId,
              },
              id: "job-failed",
              queueName: QUEUE_NAMES.providerPoll,
            } as never,
            createTestLogger(),
            { executionService: service },
          ),
        ).rejects.toThrow("provider failed");

        const state = await withTenantTransaction(
          { tenantId: seeded.tenantId, userId: seeded.userId },
          async (client) => {
            const nodeRun = await client.query<{ status: string; error_json: Record<string, unknown> }>(
              "SELECT status, error_json FROM node_runs WHERE id = $1::uuid",
              [seeded.middleNodeRunId],
            );
            const workflowRun = await client.query<{ status: string; error_json: Record<string, unknown> }>(
              "SELECT status, error_json FROM workflow_runs WHERE id = $1::uuid",
              [seeded.workflowRunId],
            );
            return {
              nodeRun: nodeRun.rows[0],
              workflowRun: workflowRun.rows[0],
            };
          },
          appPool,
        );

        expect(state.nodeRun.status).toBe("failed");
        expect(state.workflowRun.status).toBe("failed");
        expect(state.nodeRun.error_json.message).toBe("provider failed");
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("integration harness executes input -> image.generate -> output to success", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();

      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });

        const fakeQueue = createFakeNodeExecuteQueue();
        const api = buildApp({
          env: testEnv,
          logger: false,
          pool: appPool,
          queueHealthService: {
            async close() {
              return;
            },
          } as never,
          workflowRunsService: new WorkflowRunsService({
            nodeExecuteQueue: fakeQueue.queue,
            pool: appPool,
          }),
        });

        const register = await api.inject({
          method: "POST",
          payload: {
            email: "integration-worker@example.com",
            password: "StrongPass123!",
            tenantName: "Integration Worker",
          },
          url: "/api/v2/auth/register",
        });
        expect(register.statusCode).toBe(201);
        const owner = register.json();

        const project = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "POST",
          payload: {
            name: "Integration Project",
          },
          url: "/api/v2/projects",
        });
        const flow = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "POST",
          payload: {
            title: "Integration Flow",
          },
          url: `/api/v2/projects/${project.json().id}/flows`,
        });
        const publish = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "POST",
          payload: {
            graph: {
              edges: [
                { source: "input", target: "image" },
                { source: "image", target: "output" },
              ],
              nodes: [
                { id: "input", type: "input", data: { inputKey: "prompt" } },
                { id: "image", type: "image.generate", data: { routeKey: "default-media" } },
                { id: "output", type: "output" },
              ],
            },
          },
          url: `/api/v2/flows/${flow.json().id}/publish`,
        });
        expect(publish.statusCode).toBe(201);

        const createRun = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "POST",
          payload: {
            input: {
              prompt: "integration image",
            },
          },
          url: `/api/v2/flows/${flow.json().id}/runs`,
        });
        expect(createRun.statusCode).toBe(201);

        const workerService = createWorkflowService({
          mediaGenerationRuntime: {
            async generateImage() {
              return {
                modelKey: "image-model",
                outputs: [
                  {
                    base64: Buffer.from("integration image bytes").toString("base64"),
                    mimeType: "image/png",
                    width: 256,
                  },
                ],
                providerKey: "mock-provider",
                providerRequest: {},
                providerResponse: {},
                status: "succeeded",
                usage: {
                  inputTokens: 2,
                  outputTokens: 1,
                  totalTokens: 3,
                },
              };
            },
            async generateVideo() {
              throw new Error("not used");
            },
            async pollTask() {
              throw new Error("not used");
            },
          },
          nodeQueue: fakeQueue,
          pollQueue: createFakeProviderPollQueue(),
          pool: appPool,
          storageProvider: new MemoryStorageProvider(),
        });

        for (let index = 0; index < 10 && fakeQueue.jobs.length > 0; index += 1) {
          const nextJob = fakeQueue.jobs.shift();
          if (!nextJob) {
            break;
          }
          await processNodeExecuteJob(
            {
              data: nextJob.data,
              id: `job-${index + 1}`,
              queueName: QUEUE_NAMES.nodeExecute,
            } as never,
            createTestLogger(),
            { executionService: workerService },
          );
        }

        const runState = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "GET",
          url: `/api/v2/workflow-runs/${createRun.json().runId}`,
        });
        expect(runState.statusCode).toBe(200);
        expect(runState.json().workflowRun.status).toBe("succeeded");
        expect(runState.json().workflowRun.outputJson.assets).toHaveLength(1);
        expect(runState.json().workflowRun.outputJson.assets[0]).toMatchObject({
          kind: "image",
          mimeType: "image/png",
          width: 256,
        });

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });
});
