import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { ApiEnv } from "../src/config/env.js";
import { AgentPlannerService } from "../src/modules/agent/agent-planner.service.js";

const plannerSchema = z.object({
  approvalRequired: z.boolean(),
  evidence: z.array(z.object({ summary: z.string(), type: z.string() })),
  plan: z.array(z.object({ reason: z.string(), step: z.string(), risk: z.string().optional() })),
  proposedOps: z.array(z.object({ type: z.string() })),
  reply: z.string(),
});

const baseEnv: ApiEnv = {
  accessTokenTtlSeconds: 900,
  adminEmails: [],
  agentPlannerEnabled: true,
  agentPlannerFallbackEnabled: false,
  agentPlannerRepairAttempts: 1,
  agentPlannerTimeoutMs: 45_000,
  agentTextRouteKey: "text.gpt-5-5",
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

describe("AgentPlannerService", () => {
  it("calls the text runtime when planner is enabled", async () => {
    const generateText = vi.fn().mockResolvedValue({
      outputText: JSON.stringify({
        approvalRequired: true,
        evidence: [],
        plan: [],
        proposedOps: [],
        reply: "ok",
      }),
    });

    const service = new AgentPlannerService(baseEnv, { generateText }, plannerSchema);
    const result = await service.planWithLlm({ tenantId: "tenant-1", userId: "user-1" }, "帮我建图", snapshot);

    expect(generateText).toHaveBeenCalledTimes(1);
    expect(result.reply).toBe("ok");
  });

  it("repairs markdown-wrapped JSON output", async () => {
    const generateText = vi.fn().mockResolvedValue({
      outputText: '```json\n{"approvalRequired":true,"evidence":[],"plan":[],"proposedOps":[],"reply":"ok"}\n```',
    });

    const service = new AgentPlannerService(baseEnv, { generateText }, plannerSchema);
    const result = await service.planWithLlm({ tenantId: "tenant-1", userId: "user-1" }, "帮我建图", snapshot);

    expect(result.reply).toBe("ok");
  });

  it("rejects unsafe provider internals in planner output", async () => {
    const generateText = vi.fn().mockResolvedValue({
      outputText: JSON.stringify({
        approvalRequired: true,
        evidence: [{ summary: "baseUrl should not appear", type: "run" }],
        plan: [],
        proposedOps: [],
        reply: "ok",
      }),
    });

    const service = new AgentPlannerService(baseEnv, { generateText }, plannerSchema);

    await expect(
      service.planWithLlm({ tenantId: "tenant-1", userId: "user-1" }, "帮我建图", snapshot),
    ).rejects.toMatchObject({
      code: "AGENT_PLANNER_INVALID_OUTPUT",
    });
  });

  it("fails clearly when planner is disabled", async () => {
    const generateText = vi.fn();
    const service = new AgentPlannerService(
      { ...baseEnv, agentPlannerEnabled: false },
      { generateText },
      plannerSchema,
    );

    await expect(
      service.planWithLlm({ tenantId: "tenant-1", userId: "user-1" }, "帮我建图", snapshot),
    ).rejects.toMatchObject({
      code: "AGENT_PLANNER_NOT_ENABLED",
    });
    expect(generateText).not.toHaveBeenCalled();
  });
});
