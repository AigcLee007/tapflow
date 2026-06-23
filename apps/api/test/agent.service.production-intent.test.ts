import { describe, expect, it, vi } from "vitest";

import type { ApiEnv } from "../src/config/env.js";
import { AgentService } from "../src/modules/agent/agent.service.js";

const baseEnv: ApiEnv = {
  accessTokenTtlSeconds: 900,
  adminEmails: [],
  agentPlannerEnabled: false,
  agentPlannerFallbackEnabled: false,
  agentPlannerRepairAttempts: 1,
  agentPlannerTimeoutMs: 45_000,
  agentTextRouteKey: "text.default",
  apiRateLimitMax: 1000,
  apiRateLimitWindowMs: 60_000,
  authRateLimitMax: 20,
  authRateLimitWindowMs: 60_000,
  corsAllowedOrigins: ["http://localhost:5173"],
  credentialKeyVersion: "v1",
  credentialMasterKey: "test-master-key",
  jwtAccessSecret: "test-access",
  jwtRefreshSecret: "test-refresh",
  nodeEnv: "test",
  queuePrefix: "test",
  redisUrl: "redis://localhost:6379",
  refreshTokenTtlSeconds: 60 * 60 * 24 * 7,
  s3AccessKeyId: "test",
  s3Bucket: "test",
  s3Endpoint: "http://localhost:9000",
  s3ForcePathStyle: true,
  s3Region: "us-east-1",
  s3SecretAccessKey: "test",
  securityHeadersEnabled: true,
  trustProxy: false,
};

const snapshot = {
  edges: [],
  flowId: null,
  nodeOutputs: {},
  nodes: [],
  projectId: null,
  selectedNodeIds: [],
  viewport: { x: 0, y: 0, zoom: 1 },
};

describe("AgentService production intent guard", () => {
  it("does not return a deterministic node-creation plan for production image requests", async () => {
    const service = new AgentService({
      env: baseEnv,
      pool: {} as never,
      textRuntime: { generateText: vi.fn() },
    });

    await expect(
      service["planTurn"](
        { tenantId: "tenant-1", userId: "user-1" },
        "我要生成一套对比 Nano Banana Pro 和 GPT-Image-2 生图效果的套图，需要 3 张",
        snapshot,
      ),
    ).rejects.toMatchObject({
      code: "AGENT_EXECUTOR_REQUIRED",
      statusCode: 503,
    });
  });
});

