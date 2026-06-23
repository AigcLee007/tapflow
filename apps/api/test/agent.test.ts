import { afterAll, describe, expect, test, vi } from "vitest";

import { createPgPool } from "@aigc-flow/db";

import type { ApiEnv } from "../src/config/env.js";
import { buildApp } from "../src/app.js";
import { runMigrations } from "../../../packages/db/src/migrator.js";
import { hasDatabaseEnv, withDatabase } from "../../../packages/db/test/helpers.js";

const originalDatabaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = hasDatabaseEnv() ? describe : describe.skip;

const testEnv: ApiEnv = {
  accessTokenTtlSeconds: 60 * 15,
  adminEmails: [],
  agentPlannerFallbackEnabled: false,
  agentPlannerEnabled: false,
  agentPlannerRepairAttempts: 1,
  agentPlannerTimeoutMs: 45_000,
  agentTextRouteKey: "text.default",
  apiRateLimitMax: 1000,
  apiRateLimitWindowMs: 60_000,
  authRateLimitMax: 20,
  authRateLimitWindowMs: 60_000,
  corsAllowedOrigins: ["http://localhost:5173"],
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
  securityHeadersEnabled: true,
  trustProxy: false,
};

afterAll(() => {
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
});

function buildTestApp(
  pool: ReturnType<typeof createPgPool>,
  overrides?: Partial<ApiEnv>,
  agentExecutorService?: { executeTurn: ReturnType<typeof vi.fn> },
) {
  return buildApp({
    agentExecutorService: agentExecutorService as never,
    env: { ...testEnv, ...overrides },
    logger: false,
    pool,
  });
}

async function registerOwner(api: ReturnType<typeof buildTestApp>, email: string, tenantName: string) {
  const response = await api.inject({
    method: "POST",
    payload: { email, password: "StrongPass123!", tenantName },
    url: "/api/v2/auth/register",
  });
  expect(response.statusCode).toBe(201);
  return response.json();
}

describeWithDatabase("agent routes", () => {
  test("rejects unauthenticated agent session requests", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();
      try {
        await runMigrations(adminPool);
        appPool = createPgPool({ connectionString: await createAppDatabaseUrl() });
        const app = buildTestApp(appPool);
        const response = await app.inject({
          method: "POST",
          payload: { flowId: null, projectId: null },
          url: "/api/v2/agent/sessions",
        });
        expect(response.statusCode).toBe(401);
        await app.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("creates an agent turn without returning provider internals", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();
      try {
        await runMigrations(adminPool);
        appPool = createPgPool({ connectionString: await createAppDatabaseUrl() });
        const app = buildTestApp(appPool);
        const owner = await registerOwner(app, "agent-owner@example.com", "Agent Owner");

        const session = await app.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "POST",
          payload: { flowId: null, projectId: null, title: "测试会话" },
          url: "/api/v2/agent/sessions",
        });
        expect(session.statusCode).toBe(201);
        const sessionId = session.json().id;

        const turn = await app.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "POST",
          payload: {
            prompt: "帮我做一张森林运动会图片",
            snapshot: {
              edges: [],
              flowId: null,
              nodeOutputs: {},
              nodes: [],
              projectId: null,
              selectedNodeIds: [],
              viewport: { x: 0, y: 0, zoom: 1 },
            },
          },
          url: `/api/v2/agent/sessions/${sessionId}/turns`,
        });

        expect(turn.statusCode).toBe(201);
        expect(JSON.stringify(turn.json())).not.toMatch(/baseUrl|apiKey|Authorization|provider_key|upstream_model/);

        const payload = turn.json();
        expect(payload.sessionId).toBe(sessionId);
        expect(payload.reply).toContain("Prepare");

        await app.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("streams agent planning events", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();
      try {
        await runMigrations(adminPool);
        appPool = createPgPool({ connectionString: await createAppDatabaseUrl() });
        const app = buildTestApp(appPool);
        const owner = await registerOwner(app, "agent-stream@example.com", "Agent Stream");

        const session = await app.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "POST",
          payload: { flowId: null, projectId: null, title: "Stream Session" },
          url: "/api/v2/agent/sessions",
        });
        expect(session.statusCode).toBe(201);
        const sessionId = session.json().id;

        const response = await app.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "POST",
          payload: {
            prompt: "帮我做一张图",
            snapshot: {
              edges: [],
              flowId: null,
              nodeOutputs: {},
              nodes: [],
              projectId: null,
              selectedNodeIds: [],
              viewport: { x: 0, y: 0, zoom: 1 },
            },
          },
          url: `/api/v2/agent/sessions/${sessionId}/turns/stream`,
        });

        expect(response.statusCode).toBe(200);
        expect(String(response.headers["content-type"])).toContain("text/event-stream");
        expect(response.body).toContain("event: plan");
        expect(response.body).toContain("event: done");

        await app.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("streams executor events when an executor service is configured", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();
      try {
        await runMigrations(adminPool);
        appPool = createPgPool({ connectionString: await createAppDatabaseUrl() });
        const executor = {
          executeTurn: vi.fn(async (_context, input) => {
            await input.onEvent({ content: "开始执行。", type: "message_delta" });
            await input.onEvent({ toolCallKey: "tool-1", toolName: "generate_image", type: "tool_started" });
            await input.onEvent({ result: { status: "succeeded" }, toolCallKey: "tool-1", type: "tool_result" });
            await input.onEvent({ finalText: "执行完成。", turnId: "turn-1", type: "turn_completed" });
            return {
              finalText: "执行完成。",
              sessionId: input.sessionId,
              toolResults: [],
              turnId: "turn-1",
            };
          }),
        };
        const app = buildTestApp(appPool, {}, executor);
        const owner = await registerOwner(app, "agent-execute-stream@example.com", "Agent Execute Stream");

        const session = await app.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "POST",
          payload: { flowId: null, projectId: null, title: "Execute Stream Session" },
          url: "/api/v2/agent/sessions",
        });
        expect(session.statusCode).toBe(201);
        const sessionId = session.json().id;

        const response = await app.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "POST",
          payload: {
            prompt: "生成一张图",
            snapshot: {
              edges: [],
              flowId: null,
              nodeOutputs: {},
              nodes: [],
              projectId: null,
              selectedNodeIds: [],
              viewport: { x: 0, y: 0, zoom: 1 },
            },
          },
          url: `/api/v2/agent/sessions/${sessionId}/turns/execute/stream`,
        });

        expect(response.statusCode).toBe(200);
        expect(response.body).toContain("event: message_delta");
        expect(response.body).toContain("event: tool_started");
        expect(response.body).toContain("event: tool_result");
        expect(response.body).toContain("event: turn_completed");
        expect(JSON.stringify(response.body)).not.toMatch(/baseUrl|apiKey|Authorization|provider_key|upstream_model/);

        await app.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });
});
