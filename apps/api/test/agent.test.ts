import { afterAll, describe, expect, test, vi } from "vitest";

import { createPgPool } from "@aigc-flow/db";

import type { ApiEnv } from "../src/config/env.js";
import { buildApp } from "../src/app.js";
import { runMigrations } from "../../../packages/db/src/migrator.js";
import { hasDatabaseEnv, withDatabase } from "../../../packages/db/test/helpers.js";
import { currentLegalConsent } from "./legal-consent.fixture.js";

const originalDatabaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = hasDatabaseEnv() ? describe : describe.skip;

const testEnv: ApiEnv = {
  accessTokenTtlSeconds: 60 * 15,
  adminEmails: [],
  agentDirectorEnabled: false,
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
    payload: { email, password: "StrongPass123!", consent: currentLegalConsent, tenantName },
    url: "/api/v2/auth/register",
  });
  expect(response.statusCode).toBe(201);
  return response.json();
}

async function createSession(api: ReturnType<typeof buildTestApp>, accessToken: string, title: string) {
  const response = await api.inject({
    headers: { authorization: `Bearer ${accessToken}` },
    method: "POST",
    payload: { flowId: null, projectId: null, title },
    url: "/api/v2/agent/sessions",
  });
  expect(response.statusCode).toBe(201);
  return response.json();
}

async function createTurn(api: ReturnType<typeof buildTestApp>, accessToken: string, sessionId: string, prompt: string) {
  const response = await api.inject({
    headers: { authorization: `Bearer ${accessToken}` },
    method: "POST",
    payload: {
      prompt,
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

  test("persists executor task and artifact events for replay", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();
      try {
        await runMigrations(adminPool);
        appPool = createPgPool({ connectionString: await createAppDatabaseUrl() });
        const executor = {
          executeTurn: vi.fn(async (_context, input) => {
            await input.onEvent?.({ content: "Planning image task", type: "message_delta" });
            await input.onEvent?.({
              taskId: "task-db-1",
              title: "Image generation",
              toolCallKey: "tool-1",
              toolName: "generate_image",
              type: "task_created",
            });
            await input.onEvent?.({
              assetRef: {
                assetId: "asset-1",
                kind: "image",
                label: "Generated image",
                refId: "asset-ref-1",
              },
              taskId: "task-db-1",
              toolCallKey: "tool-1",
              type: "artifact_created",
            });
            await input.onEvent?.({
              result: { assetRefs: [{ assetId: "asset-1", kind: "image", label: "Generated image", refId: "asset-ref-1" }] },
              toolCallKey: "tool-1",
              type: "tool_result",
            });
            await input.onEvent?.({ finalText: "Completed", turnId: "turn-db-1", type: "turn_completed" });
            return {
              finalText: "Completed",
              sessionId: input.sessionId,
              toolResults: [],
              turnId: "turn-db-1",
            };
          }),
        };
        const app = buildTestApp(appPool, {}, executor);
        const owner = await registerOwner(app, "agent-replay@example.com", "Agent Replay");
        const session = await createSession(app, owner.accessToken, "Replay Session");

        const executeResponse = await app.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "POST",
          payload: {
            prompt: "Create a replayable image task",
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
          url: `/api/v2/agent/sessions/${session.id}/turns/execute/stream`,
        });

        expect(executeResponse.statusCode).toBe(200);
        expect(executeResponse.body).toContain("event: task_created");
        expect(executeResponse.body).toContain("event: artifact_created");

        const replayResponse = await app.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "GET",
          url: `/api/v2/agent/sessions/${session.id}/events`,
        });

        expect(replayResponse.statusCode).toBe(200);
        expect(replayResponse.json()).toEqual({
          events: expect.arrayContaining([
            expect.objectContaining({
              eventJson: expect.objectContaining({
                taskId: "task-db-1",
                title: "Image generation",
                toolCallKey: "tool-1",
                toolName: "generate_image",
              }),
              eventType: "task_created",
              taskId: "task-db-1",
            }),
            expect.objectContaining({
              eventJson: expect.objectContaining({
                assetRef: expect.objectContaining({
                  assetId: "asset-1",
                  label: "Generated image",
                }),
                taskId: "task-db-1",
                toolCallKey: "tool-1",
              }),
              eventType: "artifact_created",
              taskId: "task-db-1",
            }),
          ]),
        });

        await app.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("lists only the current tenant sessions", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();
      try {
        await runMigrations(adminPool);
        appPool = createPgPool({ connectionString: await createAppDatabaseUrl() });
        const app = buildTestApp(appPool);
        const ownerA = await registerOwner(app, "agent-list-a@example.com", "Agent List A");
        const ownerB = await registerOwner(app, "agent-list-b@example.com", "Agent List B");

        await createSession(app, ownerA.accessToken, "A Session 1");
        await createSession(app, ownerA.accessToken, "A Session 2");
        await createSession(app, ownerB.accessToken, "B Session 1");

        const response = await app.inject({
          headers: { authorization: `Bearer ${ownerA.accessToken}` },
          method: "GET",
          url: "/api/v2/agent/sessions",
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual([
          expect.objectContaining({ title: "A Session 2" }),
          expect.objectContaining({ title: "A Session 1" }),
        ]);
        expect(JSON.stringify(response.json())).not.toContain("B Session 1");

        await app.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("returns durable conversation history for a session", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();
      try {
        await runMigrations(adminPool);
        appPool = createPgPool({ connectionString: await createAppDatabaseUrl() });
        const app = buildTestApp(appPool);
        const owner = await registerOwner(app, "agent-history@example.com", "Agent History");

        const session = await createSession(app, owner.accessToken, "History Session");
        const turn = await createTurn(app, owner.accessToken, session.id, "Help me generate a poster");

        const response = await app.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "GET",
          url: `/api/v2/agent/sessions/${session.id}/history`,
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
          messages: [
            expect.objectContaining({ content: "Help me generate a poster", role: "user" }),
            expect.objectContaining({ role: "assistant" }),
          ],
          session: expect.objectContaining({ id: session.id, title: "History Session" }),
          turns: [
            expect.objectContaining({
              id: turn.turnId,
              sessionId: session.id,
              status: "planned",
            }),
          ],
        });

        await app.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("returns ordered session events for replay", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();
      try {
        await runMigrations(adminPool);
        appPool = createPgPool({ connectionString: await createAppDatabaseUrl() });
        const app = buildTestApp(appPool);
        const owner = await registerOwner(app, "agent-events@example.com", "Agent Events");
        const session = await createSession(app, owner.accessToken, "Events Session");
        const turn = await createTurn(app, owner.accessToken, session.id, "Generate one image");

        await adminPool.query(
          `
            INSERT INTO agent_tasks (
              tenant_id,
              session_id,
              turn_id,
              task_key,
              task_type,
              title,
              status,
              input_json,
              output_json
            )
            VALUES ($1::uuid, $2::uuid, $3::uuid, 'task-1', 'generate_image', 'Generate image', 'running', '{}'::jsonb, '{}'::jsonb)
          `,
          [owner.currentTenant.id, session.id, turn.turnId],
        );

        await adminPool.query(
          `
            INSERT INTO agent_task_events (
              tenant_id,
              session_id,
              turn_id,
              event_type,
              event_json
            )
            VALUES
              ($1::uuid, $2::uuid, $3::uuid, 'turn_started', '{"turnId":"${turn.turnId}"}'::jsonb),
              ($1::uuid, $2::uuid, $3::uuid, 'thinking_status', '{"label":"planning"}'::jsonb),
              ($1::uuid, $2::uuid, $3::uuid, 'turn_completed', '{"turnId":"${turn.turnId}","finalText":"Done"}'::jsonb)
          `,
          [owner.currentTenant.id, session.id, turn.turnId],
        );

        const response = await app.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "GET",
          url: `/api/v2/agent/sessions/${session.id}/events`,
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
          events: [
            expect.objectContaining({ eventType: "turn_started", seq: 1 }),
            expect.objectContaining({ eventType: "thinking_status", seq: 2 }),
            expect.objectContaining({ eventType: "turn_completed", seq: 3 }),
          ],
        });

        await app.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("returns user-facing image run settings without provider internals", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();
      try {
        await runMigrations(adminPool);
        appPool = createPgPool({ connectionString: await createAppDatabaseUrl() });
        const app = buildTestApp(appPool);
        const owner = await registerOwner(app, "agent-settings@example.com", "Agent Settings");

        const installPro = await app.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "POST",
          payload: {
            credential: {
              name: "PixelleLabs Pro Agent Key",
              secret: "pixellelabs-pro-agent-secret",
            },
            publishImmediately: true,
          },
          url: "/api/v2/admin/ai/plugins/pixellelabs.nano-banana-pro/install",
        });
        expect(installPro.statusCode).toBe(201);

        const installT3 = await app.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "POST",
          payload: {
            connection: {
              apiKey: "mouxi-agent-secret",
              baseUrl: "https://api.mouxihub.com",
              name: "Nano Banana Pro T3 Connection",
            },
            publishImmediately: true,
          },
          url: "/api/v2/admin/ai/plugins/mouxihub.nano-banana-pro-t3/install",
        });
        expect(installT3.statusCode).toBe(201);

        const response = await app.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "GET",
          url: "/api/v2/agent/run-settings/image",
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
          models: expect.arrayContaining([
            expect.objectContaining({
              defaultRouteKey: expect.any(String),
              displayName: "Nano Banana Pro",
              routes: expect.arrayContaining([
                expect.objectContaining({
                  estimatedCredits: 4,
                  routeKey: "image.pixellelabs.nano-banana-pro",
                  routeLabel: "线路一",
                  sizes: expect.arrayContaining([
                    expect.objectContaining({ credits: 4, size: "1K" }),
                    expect.objectContaining({ credits: 4.5, size: "2K" }),
                    expect.objectContaining({ credits: 5, size: "4K" }),
                  ]),
                }),
                expect.objectContaining({
                  estimatedCredits: 6,
                  routeKey: "image.mouxihub.nano-banana-pro.t3",
                  routeLabel: "线路二（官方T3）",
                  sizes: expect.arrayContaining([
                    expect.objectContaining({ credits: 6, size: "1K" }),
                    expect.objectContaining({ credits: 8, size: "2K" }),
                    expect.objectContaining({ credits: 12, size: "4K" }),
                  ]),
                }),
              ]),
            }),
          ]),
        });
        expect(JSON.stringify(response.json())).not.toMatch(/baseUrl|apiKey|Authorization|providerKey|providerName|upstream_model/i);

        await app.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("rejects inactive image routes from agent run settings and route estimates", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();
      try {
        await runMigrations(adminPool);
        appPool = createPgPool({ connectionString: await createAppDatabaseUrl() });
        const app = buildTestApp(appPool);
        const owner = await registerOwner(app, "agent-settings-inactive@example.com", "Agent Settings Inactive");

        const installPro = await app.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "POST",
          payload: {
            credential: {
              name: "PixelleLabs Pro Agent Key 2",
              secret: "pixellelabs-pro-agent-secret-2",
            },
            publishImmediately: true,
          },
          url: "/api/v2/admin/ai/plugins/pixellelabs.nano-banana-pro/install",
        });
        expect(installPro.statusCode).toBe(201);

        await adminPool.query(
          `
            UPDATE ai_routes
            SET status = 'inactive', updated_at = now()
            WHERE tenant_id = $1::uuid
              AND route_key = 'image.pixellelabs.nano-banana-pro'
          `,
          [owner.currentTenant.id],
        );

        const settingsResponse = await app.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "GET",
          url: "/api/v2/agent/run-settings/image",
        });

        expect(settingsResponse.statusCode).toBe(200);
        expect(JSON.stringify(settingsResponse.json())).not.toContain("image.pixellelabs.nano-banana-pro");

        const estimateResponse = await app.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "GET",
          url: "/api/v2/agent/run-settings/image/estimate?routeKey=image.pixellelabs.nano-banana-pro&size=4K",
        });

        expect(estimateResponse.statusCode).toBe(404);
        expect(estimateResponse.json()).toMatchObject({
          error: {
            code: "AGENT_ROUTE_NOT_ACTIVE",
          },
        });

        await app.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });
});
