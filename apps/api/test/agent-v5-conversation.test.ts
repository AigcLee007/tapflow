import { afterAll, describe, expect, test } from "vitest";

import { createPgPool } from "@aigc-flow/db";

import type { ApiEnv } from "../src/config/env.js";
import { buildApp } from "../src/app.js";
import {
  createAgentV5DecisionSchema,
  createAgentV5TurnSchema,
} from "../src/modules/agent/agent.schemas.js";
import { runMigrations } from "../../../packages/db/src/migrator.js";
import { hasDatabaseEnv, withDatabase } from "../../../packages/db/test/helpers.js";
import { currentLegalConsent } from "./legal-consent.fixture.js";

const originalDatabaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = hasDatabaseEnv() ? describe : describe.skip;

const snapshot = {
  edges: [],
  flowId: null,
  nodeOutputs: {},
  nodes: [],
  projectId: null,
  selectedNodeIds: [],
  viewport: { x: 0, y: 0, zoom: 1 },
};

const contextSnapshot = {
  appRefs: [],
  assetRefs: [],
  flowId: null,
  graphRevision: 0,
  modelKey: null,
  projectId: null,
  selectedNodeIds: [],
  skillRefs: [],
  uploadedAssetIds: [],
};

test("V5 turn schema requires a durable, product-safe request envelope", () => {
  expect(() => createAgentV5TurnSchema.parse({
    contextSnapshot,
    mode: "manual_confirmation",
    modelKey: null,
    prompt: "基于参考图设计儿童陪伴玩具",
    referenceContext: { items: [] },
    snapshot,
  })).toThrow();

  expect(createAgentV5TurnSchema.parse({
    contextSnapshot,
    idempotencyKey: "v5-turn-1",
    mode: "manual_confirmation",
    modelKey: null,
    prompt: "基于参考图设计儿童陪伴玩具",
    referenceContext: { items: [] },
    snapshot,
  })).toMatchObject({
    idempotencyKey: "v5-turn-1",
    mode: "manual_confirmation",
  });
});

test("V5 decisions only accept the public interaction protocol", () => {
  expect(createAgentV5DecisionSchema.parse({
    blockId: "direction",
    optionId: "comfort",
    type: "select_choice",
  })).toEqual({
    blockId: "direction",
    optionId: "comfort",
    type: "select_choice",
  });
  expect(() => createAgentV5DecisionSchema.parse({
    providerKey: "should-not-cross-the-boundary",
    type: "confirm",
  })).toThrow();
});

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
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
});

function buildTestApp(pool: ReturnType<typeof createPgPool>) {
  return buildApp({ env: testEnv, logger: false, pool });
}

async function registerOwner(api: ReturnType<typeof buildTestApp>) {
  const response = await api.inject({
    method: "POST",
    payload: {
      consent: currentLegalConsent,
      email: "agent-v5-owner@example.com",
      password: "StrongPass123!",
      tenantName: "Agent V5 Owner",
    },
    url: "/api/v2/auth/register",
  });
  expect(response.statusCode).toBe(201);
  return response.json();
}

async function createSession(api: ReturnType<typeof buildTestApp>, accessToken: string) {
  const response = await api.inject({
    headers: { authorization: `Bearer ${accessToken}` },
    method: "POST",
    payload: { flowId: null, projectId: null, title: "儿童陪伴玩具" },
    url: "/api/v2/agent/sessions",
  });
  expect(response.statusCode).toBe(201);
  return response.json();
}

async function createV5Turn(
  api: ReturnType<typeof buildTestApp>,
  accessToken: string,
  sessionId: string,
  idempotencyKey = "v5-turn-1",
) {
  return api.inject({
    headers: { authorization: `Bearer ${accessToken}` },
    method: "POST",
    payload: {
      contextSnapshot,
      idempotencyKey,
      mode: "manual_confirmation",
      modelKey: null,
      prompt: "基于参考图设计儿童陪伴玩具",
      referenceContext: { items: [] },
      snapshot,
    },
    url: `/api/v2/agent/sessions/${sessionId}/v5-turns`,
  });
}

describeWithDatabase("Agent V5 conversation API", () => {
  test("asks for a direction before planning, generating, or writing to the canvas", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();
      try {
        await runMigrations(adminPool);
        appPool = createPgPool({ connectionString: await createAppDatabaseUrl() });
        const app = buildTestApp(appPool);
        const owner = await registerOwner(app);
        const session = await createSession(app, owner.accessToken);

        const response = await createV5Turn(app, owner.accessToken, session.id);
        expect(response.statusCode).toBe(201);
        expect(response.json()).toMatchObject({
          executionState: "idle",
          phase: "waiting_for_choice",
          sessionId: session.id,
        });
        expect(response.json().blocks).toEqual(expect.arrayContaining([
          expect.objectContaining({ type: "paragraph" }),
          expect.objectContaining({ id: "direction", type: "choice_grid" }),
        ]));
        expect(JSON.stringify(response.json())).not.toMatch(/proposedOps|routeKey|provider|canvas\.apply|Authorization|apiKey/i);

        await app.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("persists a direction, age, brief and guarded queue transition", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();
      try {
        await runMigrations(adminPool);
        appPool = createPgPool({ connectionString: await createAppDatabaseUrl() });
        const app = buildTestApp(appPool);
        const owner = await registerOwner(app);
        const session = await createSession(app, owner.accessToken);
        const initial = await createV5Turn(app, owner.accessToken, session.id);
        const turnId = initial.json().turnId;

        const direction = await app.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "POST",
          payload: { decision: { blockId: "direction", optionId: "comfort", type: "select_choice" } },
          url: `/api/v2/agent/sessions/${session.id}/v5-turns/${turnId}/decisions`,
        });
        expect(direction.statusCode).toBe(200);
        expect(direction.json()).toMatchObject({ phase: "waiting_for_choice" });
        expect(direction.json().blocks).toEqual(expect.arrayContaining([
          expect.objectContaining({ id: "age", type: "choice_grid" }),
        ]));

        const age = await app.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "POST",
          payload: { decision: { blockId: "age", optionId: "3-6", type: "select_choice" } },
          url: `/api/v2/agent/sessions/${session.id}/v5-turns/${turnId}/decisions`,
        });
        expect(age.statusCode).toBe(200);
        expect(age.json()).toMatchObject({ phase: "waiting_for_confirmation" });
        expect(age.json().blocks).toEqual(expect.arrayContaining([
          expect.objectContaining({ type: "brief_card" }),
          expect.objectContaining({ type: "confirmation_card" }),
        ]));

        const confirmed = await app.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "POST",
          payload: { decision: { type: "confirm" } },
          url: `/api/v2/agent/sessions/${session.id}/v5-turns/${turnId}/decisions`,
        });
        expect(confirmed.statusCode).toBe(200);
        expect(confirmed.json()).toMatchObject({ executionState: "queued", phase: "executing" });
        expect(JSON.stringify(confirmed.json())).toMatch(/尚未启动生成任务/);

        const history = await app.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "GET",
          url: `/api/v2/agent/sessions/${session.id}/history`,
        });
        expect(history.statusCode).toBe(200);
        expect(history.json().session).toMatchObject({
          conversationPhase: "executing",
          executionMode: "manual_confirmation",
        });
        expect(history.json().turns).toEqual(expect.arrayContaining([
          expect.objectContaining({
            blocksJson: expect.arrayContaining([expect.objectContaining({ type: "confirmation_card" })]),
            conversationPhase: "executing",
            executionState: "queued",
          }),
        ]));

        await app.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("rejects a stale or invalid V5 decision without changing the turn", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();
      try {
        await runMigrations(adminPool);
        appPool = createPgPool({ connectionString: await createAppDatabaseUrl() });
        const app = buildTestApp(appPool);
        const owner = await registerOwner(app);
        const session = await createSession(app, owner.accessToken);
        const initial = await createV5Turn(app, owner.accessToken, session.id);
        const turnId = initial.json().turnId;

        const invalid = await app.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "POST",
          payload: { decision: { blockId: "direction", optionId: "not-a-real-choice", type: "select_choice" } },
          url: `/api/v2/agent/sessions/${session.id}/v5-turns/${turnId}/decisions`,
        });
        expect(invalid.statusCode).toBe(409);
        expect(invalid.json()).toMatchObject({ error: { code: "AGENT_DECISION_STALE" } });

        const confirm = await app.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "POST",
          payload: { decision: { type: "confirm" } },
          url: `/api/v2/agent/sessions/${session.id}/v5-turns/${turnId}/decisions`,
        });
        expect(confirm.statusCode).toBe(409);
        expect(confirm.json()).toMatchObject({ error: { code: "AGENT_DECISION_STALE" } });

        await app.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });
});
