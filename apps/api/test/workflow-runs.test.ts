import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, test } from "vitest";

import { createPgPool, withTenantTransaction } from "@aigc-flow/db";
import { QUEUE_NAMES } from "@aigc-flow/redis";

import type { ApiEnv } from "../src/config/env.js";
import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/modules/auth/password.js";
import {
  assertTextImageInputsSupportedByRuntimeGraph,
  getTextImageInputCandidates,
  WorkflowRunsService,
} from "../src/modules/workflow-runs/workflow-runs.service.js";
import { runMigrations } from "../../../packages/db/src/migrator.js";
import { hasDatabaseEnv, withDatabase } from "../../../packages/db/test/helpers.js";
import { currentLegalConsent } from "./legal-consent.fixture.js";

const originalDatabaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = hasDatabaseEnv() ? describe : describe.skip;

const testEnv: ApiEnv = {
  accessTokenTtlSeconds: 60 * 15,
  adminEmails: [],
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

function createFakeNodeExecuteQueue() {
  const jobs: Array<{ data: unknown; name: string }> = [];
  return {
    jobs,
    queue: {
      async add(name: string, data: unknown) {
        jobs.push({ data, name });
        return { id: `job-${jobs.length}` };
      },
    },
  };
}

function buildTestApp(pool: ReturnType<typeof createPgPool>) {
  const fakeQueue = createFakeNodeExecuteQueue();
  return {
    api: buildApp({
      env: testEnv,
      logger: false,
      pool,
      workflowRunsService: new WorkflowRunsService({
        nodeExecuteQueue: fakeQueue.queue,
        pool,
      }),
    }),
    fakeQueue,
  };
}

async function createDraftOnlyFlowWithSingleNode(
  api: ReturnType<typeof buildTestApp>["api"],
  accessToken: string,
  input: {
    nodeId: string;
    nodeType: "image.generate" | "video.generate";
    routeKey: string;
  },
) {
  const project = await api.inject({
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    method: "POST",
    payload: {
      name: `Workflow ${input.nodeType} Queue Project`,
    },
    url: "/api/v2/projects",
  });
  expect(project.statusCode).toBe(201);

  const flow = await api.inject({
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    method: "POST",
    payload: {
      title: `Workflow ${input.nodeType} Queue Flow`,
    },
    url: `/api/v2/projects/${project.json().id}/flows`,
  });
  expect(flow.statusCode).toBe(201);

  const saveDraft = await api.inject({
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    method: "PUT",
    payload: {
      graph: {
        edges: [],
        nodes: [
          {
            data: {
              generationPrompt: "queue routing prompt",
              routeKey: input.routeKey,
            },
            id: input.nodeId,
            type: input.nodeType,
          },
        ],
      },
    },
    url: `/api/v2/flows/${flow.json().id}/draft`,
  });
  expect(saveDraft.statusCode).toBe(200);

  return flow.json();
}

async function registerOwner(
  api: ReturnType<typeof buildTestApp>["api"],
  email: string,
  tenantName: string,
) {
  const response = await api.inject({
    method: "POST",
    payload: {
      email,
      password: "StrongPass123!",
      consent: currentLegalConsent,
      tenantName,
    },
    url: "/api/v2/auth/register",
  });

  expect(response.statusCode).toBe(201);
  return response.json();
}

async function createPublishedFlow(api: ReturnType<typeof buildTestApp>["api"], accessToken: string) {
  const project = await api.inject({
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    method: "POST",
    payload: {
      name: "Workflow Project",
    },
    url: "/api/v2/projects",
  });
  expect(project.statusCode).toBe(201);

  const flow = await api.inject({
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    method: "POST",
    payload: {
      title: "Workflow Flow",
    },
    url: `/api/v2/projects/${project.json().id}/flows`,
  });
  expect(flow.statusCode).toBe(201);

  const publish = await api.inject({
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    method: "POST",
    payload: {
      graph: {
        edges: [
          { source: "input", target: "text" },
          { source: "text", target: "output" },
        ],
        nodes: [
          {
            data: {
              inputKey: "prompt",
            },
            id: "input",
            type: "input",
          },
          {
            data: {
              routeKey: "default-text",
            },
            id: "text",
            type: "text.generate",
          },
          {
            id: "output",
            type: "output",
          },
        ],
      },
    },
    url: `/api/v2/flows/${flow.json().id}/publish`,
  });
  expect(publish.statusCode).toBe(201);

  return flow.json();
}

async function createDraftOnlyFlow(api: ReturnType<typeof buildTestApp>["api"], accessToken: string) {
  const project = await api.inject({
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    method: "POST",
    payload: {
      name: "Workflow Draft Project",
    },
    url: "/api/v2/projects",
  });
  expect(project.statusCode).toBe(201);

  const flow = await api.inject({
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    method: "POST",
    payload: {
      title: "Workflow Draft Flow",
    },
    url: `/api/v2/projects/${project.json().id}/flows`,
  });
  expect(flow.statusCode).toBe(201);

  const saveDraft = await api.inject({
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    method: "PUT",
    payload: {
      graph: {
        edges: [
          { source: "input", target: "image" },
          { source: "image", target: "output" },
        ],
        nodes: [
          {
            data: {
              inputKey: "prompt",
            },
            id: "input",
            type: "input",
          },
          {
            data: {
              routeKey: "image.default",
            },
            id: "image",
            type: "image.generate",
          },
          {
            id: "output",
            type: "output",
          },
        ],
      },
    },
    url: `/api/v2/flows/${flow.json().id}/draft`,
  });
  expect(saveDraft.statusCode).toBe(200);

  return flow.json();
}

async function createDraftOnlyFlowWithRoute(
  api: ReturnType<typeof buildTestApp>["api"],
  accessToken: string,
  routeKey: string,
) {
  const project = await api.inject({
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    method: "POST",
    payload: {
      name: `Workflow Draft Project ${routeKey}`,
    },
    url: "/api/v2/projects",
  });
  expect(project.statusCode).toBe(201);

  const flow = await api.inject({
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    method: "POST",
    payload: {
      title: `Workflow Draft Flow ${routeKey}`,
    },
    url: `/api/v2/projects/${project.json().id}/flows`,
  });
  expect(flow.statusCode).toBe(201);

  const saveDraft = await api.inject({
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    method: "PUT",
    payload: {
      graph: {
        edges: [
          { source: "input", target: "image" },
          { source: "image", target: "output" },
        ],
        nodes: [
          {
            data: {
              inputKey: "prompt",
            },
            id: "input",
            type: "input",
          },
          {
            data: {
              routeKey,
            },
            id: "image",
            type: "image.generate",
          },
          {
            id: "output",
            type: "output",
          },
        ],
      },
    },
    url: `/api/v2/flows/${flow.json().id}/draft`,
  });
  expect(saveDraft.statusCode).toBe(200);

  return flow.json();
}

async function createDraftOnlyFlowWithImageNodes(
  api: ReturnType<typeof buildTestApp>["api"],
  accessToken: string,
  nodeIds: string[],
) {
  const project = await api.inject({
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    method: "POST",
    payload: {
      name: "Workflow Concurrent Target Project",
    },
    url: "/api/v2/projects",
  });
  expect(project.statusCode).toBe(201);

  const flow = await api.inject({
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    method: "POST",
    payload: {
      title: "Workflow Concurrent Target Flow",
    },
    url: `/api/v2/projects/${project.json().id}/flows`,
  });
  expect(flow.statusCode).toBe(201);

  const saveDraft = await api.inject({
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    method: "PUT",
    payload: {
      graph: {
        edges: [],
        nodes: nodeIds.map((nodeId, index) => ({
          data: {
            generationPrompt: `prompt ${index + 1}`,
            routeKey: "image.default",
          },
          id: nodeId,
          position: {
            x: index * 320,
            y: 0,
          },
          type: "image.generate",
        })),
      },
    },
    url: `/api/v2/flows/${flow.json().id}/draft`,
  });
  expect(saveDraft.statusCode).toBe(200);

  return flow.json();
}

async function createDraftOnlyTextFlowWithImageInputs(
  api: ReturnType<typeof buildTestApp>["api"],
  accessToken: string,
  input: { imageCount: number; routeKey: string },
) {
  const project = await api.inject({
    headers: { authorization: `Bearer ${accessToken}` },
    method: "POST",
    payload: { name: "Workflow Text Image Input Project" },
    url: "/api/v2/projects",
  });
  expect(project.statusCode).toBe(201);

  const flow = await api.inject({
    headers: { authorization: `Bearer ${accessToken}` },
    method: "POST",
    payload: { title: "Workflow Text Image Input Flow" },
    url: `/api/v2/projects/${project.json().id}/flows`,
  });
  expect(flow.statusCode).toBe(201);

  const imageIds = Array.from({ length: input.imageCount }, (_, index) => `image-${index + 1}`);
  const saveDraft = await api.inject({
    headers: { authorization: `Bearer ${accessToken}` },
    method: "PUT",
    payload: {
      graph: {
        edges: imageIds.map((source) => ({ source, target: "text" })),
        nodes: [
          ...imageIds.map((id) => ({
            data: { assetId: `asset-${id}`, mimeType: "image/png" },
            id,
            type: "image",
          })),
          {
            data: {
              inputOrder: imageIds.slice().reverse().map((id) => `upstream:${id}`),
              routeKey: input.routeKey,
            },
            id: "text",
            type: "text.generate",
          },
        ],
      },
    },
    url: `/api/v2/flows/${flow.json().id}/draft`,
  });
  expect(saveDraft.statusCode).toBe(200);

  return flow.json();
}

async function createDraftOnlyFlowWithImageEditTarget(
  api: ReturnType<typeof buildTestApp>["api"],
  accessToken: string,
  routeKey: string,
  options: { omitTargetRouteKey?: boolean } = {},
) {
  const project = await api.inject({
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    method: "POST",
    payload: {
      name: "Workflow Image Edit Target Project",
    },
    url: "/api/v2/projects",
  });
  expect(project.statusCode).toBe(201);

  const flow = await api.inject({
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    method: "POST",
    payload: {
      title: "Workflow Image Edit Target Flow",
    },
    url: `/api/v2/projects/${project.json().id}/flows`,
  });
  expect(flow.statusCode).toBe(201);

  const saveDraft = await api.inject({
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    method: "PUT",
    payload: {
      graph: {
        edges: [
          {
            id: "edge-source-target",
            source: "source-image",
            target: "target-image",
          },
        ],
        nodes: [
          {
            data: {
              assetId: "asset-source",
              generationPrompt: "source",
              routeKey,
            },
            id: "source-image",
            type: "image",
          },
          {
            data: {
              generationPrompt: "show a new angle",
              imageEditRequest: {
                editType: "multiAngle",
                prompt: "show a new angle",
                routeKey,
                sourceNodeId: "source-image",
              },
              modelId: "mock-image-v1",
              ...(options.omitTargetRouteKey ? {} : { routeKey }),
              title: "多角度后的1",
            },
            id: "target-image",
            type: "image",
          },
        ],
      },
    },
    url: `/api/v2/flows/${flow.json().id}/draft`,
  });
  expect(saveDraft.statusCode).toBe(200);

  return flow.json();
}

async function seedRouteAndPricing(
  pool: ReturnType<typeof createPgPool>,
  input: {
    capabilities?: Record<string, unknown>;
    modality?: "image" | "text" | "video";
    modelKey: string;
    providerKey: string;
    routeKey: string;
    tenantId: string;
    userId: string;
    withExactPricing?: boolean;
    withProviderDefaultPricing?: boolean;
  },
) {
  await withTenantTransaction(
    { tenantId: input.tenantId, userId: input.userId },
    async (client) => {
      const provider = await client.query<{ id: string }>(
        `
          INSERT INTO ai_providers (key, name, kind, status, default_base_url, capabilities, updated_at)
          VALUES ($1, $2, 'mock', 'active', 'mock://tests', '{}'::jsonb, now())
          ON CONFLICT (key) DO UPDATE
          SET name = EXCLUDED.name, kind = EXCLUDED.kind, status = 'active', updated_at = now()
          RETURNING id::text AS id
        `,
        [input.providerKey, `${input.providerKey} provider`],
      );

      const providerId = provider.rows[0]?.id;
      if (!providerId) {
        throw new Error("Provider seed failed");
      }

      const model = await client.query<{ id: string }>(
        `
          INSERT INTO ai_models (provider_id, model_key, display_name, modality, capabilities, status, updated_at)
          VALUES ($1::uuid, $2, $3, $4, $5::jsonb, 'active', now())
          ON CONFLICT (provider_id, model_key) DO UPDATE
          SET display_name = EXCLUDED.display_name, modality = EXCLUDED.modality, capabilities = EXCLUDED.capabilities, status = 'active', updated_at = now()
          RETURNING id::text AS id
        `,
        [providerId, input.modelKey, `${input.modelKey} model`, input.modality ?? "image", JSON.stringify(input.capabilities ?? {})],
      );
      const modelId = model.rows[0]?.id;
      if (!modelId) {
        throw new Error("Model seed failed");
      }

      await client.query(
        `
          INSERT INTO ai_routes (tenant_id, provider_id, model_id, route_key, modality, status, request_config, pricing, rate_limit, updated_at)
          VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, 'active', $6::jsonb, '{}'::jsonb, '{}'::jsonb, now())
          ON CONFLICT (tenant_id, route_key)
          WHERE tenant_id IS NOT NULL
          DO UPDATE
          SET provider_id = EXCLUDED.provider_id, model_id = EXCLUDED.model_id, modality = EXCLUDED.modality, request_config = EXCLUDED.request_config, status = 'active', updated_at = now()
        `,
        [input.tenantId, providerId, modelId, input.routeKey, input.modality ?? "image", JSON.stringify(input.capabilities ? { capabilities: input.capabilities } : {})],
      );

      if (input.withExactPricing) {
        await client.query(
          `
            INSERT INTO model_pricing (provider, model, route, unit, unit_credits, min_charge_credits, metadata, active)
            VALUES ($1, $2, $3, $4, 17, 17, '{"source":"workflow-runs.test"}'::jsonb, true)
            ON CONFLICT (provider, model, route, unit) DO UPDATE
            SET min_charge_credits = EXCLUDED.min_charge_credits, unit_credits = EXCLUDED.unit_credits, active = true
          `,
          [
            input.providerKey,
            input.modelKey,
            input.routeKey,
            input.modality === "video" ? "video_generation" : "image_generation",
          ],
        );
      }

      if (input.withProviderDefaultPricing) {
        await client.query(
          `
            INSERT INTO model_pricing (provider, model, route, unit, unit_credits, min_charge_credits, metadata, active)
            VALUES ($1, 'default', 'default', 'image_generation', 13, 13, '{"source":"workflow-runs.test"}'::jsonb, true)
            ON CONFLICT (provider, model, route, unit) DO UPDATE
            SET min_charge_credits = EXCLUDED.min_charge_credits, unit_credits = EXCLUDED.unit_credits, active = true
          `,
          [input.providerKey],
        );
      }
    },
    pool,
  );
}

async function lookupUserIdByEmail(
  pool: ReturnType<typeof createPgPool>,
  email: string,
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `
      SELECT id::text AS id
      FROM users
      WHERE lower(email) = lower($1)
      LIMIT 1
    `,
    [email],
  );
  const userId = result.rows[0]?.id;
  if (!userId) {
    throw new Error(`Unable to resolve user id for ${email}`);
  }
  return userId;
}

function parseSseEvents(body: string) {
  return body
    .trim()
    .split("\n\n")
    .filter((chunk) => chunk.trim() && !chunk.startsWith(":"))
    .map((chunk) => {
      const lines = chunk.split("\n");
      const event = {
        data: "",
        event: "",
        id: "",
      };

      for (const line of lines) {
        if (line.startsWith("id: ")) {
          event.id = line.slice(4);
        } else if (line.startsWith("event: ")) {
          event.event = line.slice(7);
        } else if (line.startsWith("data: ")) {
          event.data = line.slice(6);
        }
      }

      return {
        ...event,
        json: JSON.parse(event.data || "{}") as Record<string, unknown>,
      };
    });
}

describe("text image preflight candidates", () => {
  test("rejects connected video and audio inputs for text nodes", () => {
    const workflow = {
      nodes: [
        { config: {}, dependencies: [], dependents: ["text"], id: "video", type: "video.generate" },
        { config: {}, dependencies: [], dependents: ["text"], id: "audio", type: "audio.generate" },
        { config: {}, dependencies: ["video", "audio"], dependents: [], id: "text", type: "text.generate" },
      ],
    } as Parameters<typeof assertTextImageInputsSupportedByRuntimeGraph>[0]["workflow"];

    expect(() => assertTextImageInputsSupportedByRuntimeGraph({
      node: workflow.nodes[2]!,
      routeContext: {
        capabilities: { maxImages: 3, supportedImageMimeTypes: ["image/png"], supportsImageInput: true },
        modelKey: "visual-text",
        providerKey: "test",
        routeKey: "text.gpt-5-5",
      },
      workflow,
    })).toThrow("Only image inputs are supported");
  });
  test("uses inputOrder before compiled dependency order", () => {
    const workflow = {
      edges: [],
      entryNodeIds: ["first", "second"],
      nodes: [
        { config: { assetId: "asset-first" }, dependencies: [], dependents: ["text"], id: "first", type: "image.asset" },
        { config: { assetId: "asset-second" }, dependencies: [], dependents: ["text"], id: "second", type: "image.asset" },
        {
          config: { inputOrder: ["upstream:second", "upstream:first"] },
          dependencies: ["first", "second"],
          dependents: [],
          id: "text",
          type: "text.generate",
        },
      ],
      outputNodeIds: ["text"],
      schemaVersion: "v2" as const,
    };

    expect(getTextImageInputCandidates(
      workflow.nodes[2]!,
      workflow,
      { maxImages: 3, supportedImageMimeTypes: ["image/png"], supportsImageInput: true },
    ).map((asset) => asset.assetId)).toEqual(["second", "first"]);
  });
});

async function countBillingAndWorkflowState(
  pool: ReturnType<typeof createPgPool>,
  tenantId: string,
  userId: string,
) {
  return withTenantTransaction({ tenantId, userId }, async (client) => {
    const [ledger, usageEvents, workflowRuns] = await Promise.all([
      client.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM billing_wallet_ledger WHERE tenant_id = $1::uuid", [tenantId]),
      client.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM usage_events WHERE tenant_id = $1::uuid", [tenantId]),
      client.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM workflow_runs WHERE tenant_id = $1::uuid", [tenantId]),
    ]);
    return {
      ledgerEntries: Number(ledger.rows[0]?.count ?? "0"),
      usageEvents: Number(usageEvents.rows[0]?.count ?? "0"),
      workflowRuns: Number(workflowRuns.rows[0]?.count ?? "0"),
    };
  }, pool);
}

describeWithDatabase("workflow runs api", () => {
  test("group runs derive direct children from the server draft and only enqueue ready roots", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();
      try {
        await runMigrations(adminPool);
        appPool = createPgPool({ connectionString: await createAppDatabaseUrl() });
        const { api, fakeQueue } = buildTestApp(appPool);
        const ownerEmail = "workflow-group-scope@example.com";
        const owner = await registerOwner(api, ownerEmail, "Workflow Group Scope");
        const ownerUserId = await lookupUserIdByEmail(appPool, ownerEmail);
        await seedRouteAndPricing(appPool, {
          modelKey: "mock-image-v1",
          providerKey: "mock-local-dev",
          routeKey: "image.default",
          tenantId: owner.currentTenant.id,
          userId: ownerUserId,
          withExactPricing: true,
        });
        const flow = await createDraftOnlyFlowWithImageNodes(api, owner.accessToken, ["inside", "outside"]);
        await withTenantTransaction({ tenantId: owner.currentTenant.id, userId: ownerUserId }, async (client) => {
          const draft = await client.query<{ graph_json: Record<string, unknown> }>(
            "SELECT graph_json FROM flow_drafts WHERE flow_id = $1::uuid",
            [flow.id],
          );
          const graph = draft.rows[0]!.graph_json;
          graph.nodes = [
            { id: "group", type: "group", data: {} },
            ...(graph.nodes as Array<Record<string, unknown>>).map((node) =>
              node.id === "inside" ? { ...node, parentId: "group" } : node,
            ),
          ];
          await client.query(
            "UPDATE flow_drafts SET graph_json = $2::jsonb WHERE flow_id = $1::uuid",
            [flow.id, JSON.stringify(graph)],
          );
        }, appPool);

        const response = await api.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "POST",
          payload: { input: { runMode: "group", groupId: "group", planHash: "client-controlled" } },
          url: `/api/v2/flows/${flow.id}/runs`,
        });

        expect(response.statusCode).toBe(201);
        const details = await api.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "GET",
          url: `/api/v2/workflow-runs/${response.json().runId}`,
        });
        expect(details.json().workflowRun.inputJson).toMatchObject({
          groupId: "group",
          runMode: "group",
          scopeNodeIds: ["inside"],
        });
        expect(details.json().workflowRun.inputJson.planHash).not.toBe("client-controlled");
        expect(details.json().nodeRuns).toHaveLength(1);
        expect(details.json().nodeRuns[0]).toMatchObject({ nodeId: "inside", status: "runnable" });
        expect(fakeQueue.jobs).toHaveLength(1);
        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("group runs reject missing external dependency outputs", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();
      try {
        await runMigrations(adminPool);
        appPool = createPgPool({ connectionString: await createAppDatabaseUrl() });
        const { api, fakeQueue } = buildTestApp(appPool);
        const ownerEmail = "workflow-group-external@example.com";
        const owner = await registerOwner(api, ownerEmail, "Workflow Group External");
        const ownerUserId = await lookupUserIdByEmail(appPool, ownerEmail);
        await seedRouteAndPricing(appPool, {
          modelKey: "mock-image-v1", providerKey: "mock-local-dev", routeKey: "image.default",
          tenantId: owner.currentTenant.id, userId: ownerUserId, withExactPricing: true,
        });
        const flow = await createDraftOnlyFlowWithImageNodes(api, owner.accessToken, ["inside", "outside"]);
        await withTenantTransaction({ tenantId: owner.currentTenant.id, userId: ownerUserId }, async (client) => {
          const result = await client.query<{ graph_json: Record<string, unknown> }>("SELECT graph_json FROM flow_drafts WHERE flow_id = $1::uuid", [flow.id]);
          const graph = result.rows[0]!.graph_json;
          graph.nodes = [
            { id: "group", type: "group", data: {} },
            ...(graph.nodes as Array<Record<string, unknown>>).map((node) => node.id === "inside" ? { ...node, parentId: "group" } : node),
          ];
          graph.edges = [{ source: "outside", target: "inside" }];
          await client.query("UPDATE flow_drafts SET graph_json = $2::jsonb WHERE flow_id = $1::uuid", [flow.id, JSON.stringify(graph)]);
        }, appPool);

        const response = await api.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` }, method: "POST",
          payload: { input: { runMode: "group", groupId: "group" } }, url: `/api/v2/flows/${flow.id}/runs`,
        });
        expect(response.statusCode).toBe(422);
        expect(response.json()).toMatchObject({ error: { code: "GROUP_EXTERNAL_DEPENDENCY_INVALID" } });
        expect(fakeQueue.jobs).toHaveLength(0);
        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("group runs snapshot a verified external output without scheduling its source", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();
      try {
        await runMigrations(adminPool);
        appPool = createPgPool({ connectionString: await createAppDatabaseUrl() });
        const { api, fakeQueue } = buildTestApp(appPool);
        const ownerEmail = "workflow-group-external-success@example.com";
        const owner = await registerOwner(api, ownerEmail, "Workflow Group External Success");
        const ownerUserId = await lookupUserIdByEmail(appPool, ownerEmail);
        await seedRouteAndPricing(appPool, {
          modelKey: "mock-image-v1", providerKey: "mock-local-dev", routeKey: "image.default",
          tenantId: owner.currentTenant.id, userId: ownerUserId, withExactPricing: true,
        });
        const flow = await createDraftOnlyFlowWithImageNodes(api, owner.accessToken, ["inside", "outside"]);
        await withTenantTransaction({ tenantId: owner.currentTenant.id, userId: ownerUserId }, async (client) => {
          const result = await client.query<{ graph_json: Record<string, unknown> }>("SELECT graph_json FROM flow_drafts WHERE flow_id = $1::uuid", [flow.id]);
          const graph = result.rows[0]!.graph_json;
          graph.nodes = [
            { id: "group", type: "group", data: {} },
            ...(graph.nodes as Array<Record<string, unknown>>).map((node) => node.id === "inside" ? { ...node, parentId: "group" } : node),
          ];
          graph.edges = [{ source: "outside", target: "inside" }];
          await client.query("UPDATE flow_drafts SET graph_json = $2::jsonb WHERE flow_id = $1::uuid", [flow.id, JSON.stringify(graph)]);
        }, appPool);
        const historicalRun = await api.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` }, method: "POST",
          payload: { input: { runMode: "target_node", targetNodeId: "outside" } }, url: `/api/v2/flows/${flow.id}/runs`,
        });
        expect(historicalRun.statusCode).toBe(201);
        await withTenantTransaction({ tenantId: owner.currentTenant.id, userId: ownerUserId }, async (client) => {
          await client.query("UPDATE workflow_runs SET status = 'succeeded', finished_at = now() WHERE id = $1::uuid", [historicalRun.json().runId]);
          await client.query(
            "UPDATE node_runs SET status = 'succeeded', output_json = $2::jsonb, finished_at = now() WHERE workflow_run_id = $1::uuid AND node_id = 'outside'",
            [historicalRun.json().runId, JSON.stringify({ assets: [{ assetId: "asset-history", kind: "image", mimeType: "image/png" }] })],
          );
        }, appPool);
        fakeQueue.jobs.length = 0;

        const response = await api.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` }, method: "POST",
          payload: { input: { runMode: "group", groupId: "group" } }, url: `/api/v2/flows/${flow.id}/runs`,
        });
        expect(response.statusCode).toBe(201);
        const details = await api.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` }, method: "GET", url: `/api/v2/workflow-runs/${response.json().runId}`,
        });
        expect(details.json().workflowRun.inputJson.verifiedExternalDependencies).toEqual([
          expect.objectContaining({ nodeId: "outside", sourceWorkflowRunId: historicalRun.json().runId }),
        ]);
        expect(details.json().nodeRuns).toEqual([expect.objectContaining({ nodeId: "inside" })]);
        expect(fakeQueue.jobs).toHaveLength(1);
        expect((fakeQueue.jobs[0]!.data as { nodeRunId: string }).nodeRunId).toBe(details.json().nodeRuns[0].id);
        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("rejects four upstream images for a text target before billing or queueing", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();
      try {
        await runMigrations(adminPool);
        appPool = createPgPool({ connectionString: await createAppDatabaseUrl() });
        const { api, fakeQueue } = buildTestApp(appPool);
        const owner = await registerOwner(api, "workflow-text-images-limit@example.com", "Workflow Text Images Limit");
        const ownerUserId = await lookupUserIdByEmail(appPool, "workflow-text-images-limit@example.com");
        await seedRouteAndPricing(appPool, {
          capabilities: { maxImages: 3, supportedImageMimeTypes: ["image/png"], supportsImageInput: true },
          modality: "text",
          modelKey: "mock-text-visual-limit",
          providerKey: "mock-text-visual-limit",
          routeKey: "text.visual.limit",
          tenantId: owner.currentTenant.id,
          userId: ownerUserId,
        });
        const flow = await createDraftOnlyTextFlowWithImageInputs(api, owner.accessToken, {
          imageCount: 4,
          routeKey: "text.visual.limit",
        });

        const response = await api.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "POST",
          payload: { input: { runMode: "target_node", targetNodeId: "text" } },
          url: `/api/v2/flows/${flow.id}/runs`,
        });

        expect(response.statusCode).toBe(422);
        expect(response.json()).toMatchObject({ error: { code: "TEXT_IMAGE_INPUT_LIMIT_EXCEEDED" } });
        expect(await countBillingAndWorkflowState(appPool, owner.currentTenant.id, ownerUserId)).toEqual({
          ledgerEntries: 0,
          usageEvents: 0,
          workflowRuns: 0,
        });
        expect(fakeQueue.jobs).toHaveLength(0);
        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("rejects image input on a nonvisual text route before billing or queueing", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();
      try {
        await runMigrations(adminPool);
        appPool = createPgPool({ connectionString: await createAppDatabaseUrl() });
        const { api, fakeQueue } = buildTestApp(appPool);
        const owner = await registerOwner(api, "workflow-text-images-unsupported@example.com", "Workflow Text Images Unsupported");
        const ownerUserId = await lookupUserIdByEmail(appPool, "workflow-text-images-unsupported@example.com");
        await seedRouteAndPricing(appPool, {
          modality: "text",
          modelKey: "mock-text-nonvisual",
          providerKey: "mock-text-nonvisual",
          routeKey: "text.nonvisual",
          tenantId: owner.currentTenant.id,
          userId: ownerUserId,
        });
        const flow = await createDraftOnlyTextFlowWithImageInputs(api, owner.accessToken, {
          imageCount: 1,
          routeKey: "text.nonvisual",
        });

        const response = await api.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "POST",
          payload: { input: { runMode: "target_node", targetNodeId: "text" } },
          url: `/api/v2/flows/${flow.id}/runs`,
        });

        expect(response.statusCode).toBe(422);
        expect(response.json()).toMatchObject({ error: { code: "TEXT_MODEL_IMAGE_INPUT_UNSUPPORTED" } });
        expect(await countBillingAndWorkflowState(appPool, owner.currentTenant.id, ownerUserId)).toEqual({
          ledgerEntries: 0,
          usageEvents: 0,
          workflowRuns: 0,
        });
        expect(fakeQueue.jobs).toHaveLength(0);
        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });
  test("reserve prefers exact provider/model/route pricing and stores fallback metadata", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();

      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });

        const { api, fakeQueue } = buildTestApp(appPool);
        const ownerEmail = "workflow-pricing-exact@example.com";
        const owner = await registerOwner(api, ownerEmail, "Workflow Pricing Exact");
        const ownerUserId = await lookupUserIdByEmail(appPool, ownerEmail);

        await seedRouteAndPricing(appPool, {
          modelKey: "mock-image-v1",
          providerKey: "mock-local-dev",
          routeKey: "image.default",
          tenantId: owner.currentTenant.id,
          userId: ownerUserId,
          withExactPricing: true,
        });

        const flow = await createDraftOnlyFlowWithRoute(api, owner.accessToken, "image.default");
        const createRun = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "POST",
          payload: {
            input: {
              prompt: "exact pricing",
            },
          },
          url: `/api/v2/flows/${flow.id}/runs`,
        });
        expect(createRun.statusCode).toBe(201);

        const runDetails = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "GET",
          url: `/api/v2/workflow-runs/${createRun.json().runId}`,
        });
        expect(runDetails.statusCode).toBe(200);
        const imageNode = runDetails.json().nodeRuns.find((row: { nodeType: string }) => row.nodeType === "image.generate");
        expect(imageNode.costJson.estimatedCents).toBe(17);
        expect(imageNode.costJson.pricingFallbackLevel).toBe(1);
        expect(imageNode.costJson.pricingMatch).toMatchObject({
          model: "mock-image-v1",
          provider: "mock-local-dev",
          route: "image.default",
          unit: "image_generation",
        });

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("reserve falls back to provider default pricing when route-specific pricing is missing", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();

      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });

        const { api } = buildTestApp(appPool);
        const ownerEmail = "workflow-pricing-fallback@example.com";
        const owner = await registerOwner(api, ownerEmail, "Workflow Pricing Fallback");
        const ownerUserId = await lookupUserIdByEmail(appPool, ownerEmail);

        await seedRouteAndPricing(appPool, {
          modelKey: "mock-image-v2",
          providerKey: "mock-local-dev-fallback",
          routeKey: "image.tenant.fallback",
          tenantId: owner.currentTenant.id,
          userId: ownerUserId,
          withProviderDefaultPricing: true,
        });

        const flow = await createDraftOnlyFlowWithRoute(api, owner.accessToken, "image.tenant.fallback");
        const createRun = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "POST",
          payload: {
            input: {
              prompt: "fallback pricing",
            },
          },
          url: `/api/v2/flows/${flow.id}/runs`,
        });
        expect(createRun.statusCode).toBe(201);

        const runDetails = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "GET",
          url: `/api/v2/workflow-runs/${createRun.json().runId}`,
        });
        expect(runDetails.statusCode).toBe(200);
        const imageNode = runDetails.json().nodeRuns.find((row: { nodeType: string }) => row.nodeType === "image.generate");
        expect(imageNode.costJson.estimatedCents).toBe(13);
        expect(imageNode.costJson.pricingFallbackLevel).toBe(3);
        expect(imageNode.costJson.pricingMatch).toMatchObject({
          model: "default",
          provider: "mock-local-dev-fallback",
          route: "default",
          unit: "image_generation",
        });

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("returns PRICING_NOT_FOUND when no pricing row matches node unit", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();

      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });

        const { api } = buildTestApp(appPool);
        const ownerEmail = "workflow-pricing-missing@example.com";
        const owner = await registerOwner(api, ownerEmail, "Workflow Pricing Missing");
        const ownerUserId = await lookupUserIdByEmail(appPool, ownerEmail);

        await withTenantTransaction(
          { tenantId: owner.currentTenant.id, userId: ownerUserId },
          async (client) => {
            await client.query("DELETE FROM model_pricing WHERE unit = 'image_generation'");
          },
          appPool,
        );

        const flow = await createDraftOnlyFlowWithRoute(api, owner.accessToken, "image.default");
        const createRun = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "POST",
          payload: {
            input: {
              prompt: "missing pricing",
            },
          },
          url: `/api/v2/flows/${flow.id}/runs`,
        });
        expect(createRun.statusCode).toBe(422);
        expect(createRun.json()).toMatchObject({
          error: {
            code: "PRICING_NOT_FOUND",
          },
        });
        expect(fakeQueue.jobs).toHaveLength(0);

        const runCount = await withTenantTransaction(
          { tenantId: owner.currentTenant.id, userId: ownerUserId },
          async (client) => {
            const result = await client.query<{ count: string }>(
              `
                SELECT COUNT(*)::text AS count
                FROM workflow_runs
                WHERE tenant_id = $1::uuid
              `,
              [owner.currentTenant.id],
            );
            return Number(result.rows[0]?.count ?? "0");
          },
          appPool,
        );
        expect(runCount).toBe(0);

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("auto-creates runnable snapshot from server-side draft when no published version exists", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();

      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });

        const { api, fakeQueue } = buildTestApp(appPool);
        const owner = await registerOwner(api, "workflow-draft-run@example.com", "Workflow Draft Run");
        const flow = await createDraftOnlyFlow(api, owner.accessToken);

        const createRun = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "POST",
          payload: {
            input: {
              prompt: "run from draft",
            },
          },
          url: `/api/v2/flows/${flow.id}/runs`,
        });

        expect(createRun.statusCode).toBe(201);
        expect(createRun.json().status).toBe("pending");
        expect(fakeQueue.jobs).toHaveLength(1);

        const runDetails = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "GET",
          url: `/api/v2/workflow-runs/${createRun.json().runId}`,
        });
        expect(runDetails.statusCode).toBe(200);
        expect(runDetails.json().workflowRun.flowVersionId).toBeTruthy();
        expect(runDetails.json().nodeRuns).toHaveLength(3);

        const versions = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "GET",
          url: `/api/v2/flows/${flow.id}/versions`,
        });
        expect(versions.statusCode).toBe(200);
        expect(versions.json().length).toBeGreaterThanOrEqual(1);
        expect(versions.json()[0].changelog).toBe("auto_run_snapshot");

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("concurrent target_node runs for the same flow bypass flow current-version updates and all enqueue", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();

      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });

        const { api, fakeQueue } = buildTestApp(appPool);
        const ownerEmail = "workflow-target-node-concurrent@example.com";
        const owner = await registerOwner(api, ownerEmail, "Workflow Target Concurrent");
        const ownerUserId = await lookupUserIdByEmail(appPool, ownerEmail);
        await seedRouteAndPricing(appPool, {
          modelKey: "mock-image-concurrent",
          providerKey: "mock-local-concurrent",
          routeKey: "image.default",
          tenantId: owner.currentTenant.id,
          userId: ownerUserId,
          withExactPricing: true,
        });

        const targetNodeIds = ["image-a", "image-b", "image-c"];
        const flow = await createDraftOnlyFlowWithImageNodes(api, owner.accessToken, targetNodeIds);

        const beforeCurrentVersion = await withTenantTransaction(
          { tenantId: owner.currentTenant.id, userId: ownerUserId },
          async (client) => {
            const result = await client.query<{ current_version_id: string | null }>(
              "SELECT current_version_id::text AS current_version_id FROM flows WHERE id = $1::uuid",
              [flow.id],
            );
            return result.rows[0]?.current_version_id ?? null;
          },
          appPool,
        );
        expect(beforeCurrentVersion).toBeNull();

        const responses = await Promise.all(targetNodeIds.map((targetNodeId) =>
          api.inject({
            headers: {
              authorization: `Bearer ${owner.accessToken}`,
            },
            method: "POST",
            payload: {
              input: {
                prompt: `run ${targetNodeId}`,
                runMode: "target_node",
                targetNodeId,
              },
            },
            url: `/api/v2/flows/${flow.id}/runs`,
          }),
        ));

        expect(responses.map((response) => response.statusCode)).toEqual([201, 201, 201]);
        expect(fakeQueue.jobs).toHaveLength(3);
        expect(fakeQueue.jobs.map((job) => job.name)).toEqual([
          QUEUE_NAMES.nodeExecuteImage,
          QUEUE_NAMES.nodeExecuteImage,
          QUEUE_NAMES.nodeExecuteImage,
        ]);

        const runIds = responses.map((response) => response.json().runId);
        expect(new Set(runIds).size).toBe(3);

        const runRows = await withTenantTransaction(
          { tenantId: owner.currentTenant.id, userId: ownerUserId },
          async (client) => {
            const runs = await client.query<{ count: number; version_count: number }>(
              `
                SELECT
                  COUNT(*)::int AS count,
                  COUNT(DISTINCT flow_version_id)::int AS version_count
                FROM workflow_runs
                WHERE flow_id = $1::uuid
              `,
              [flow.id],
            );
            const nodeRuns = await client.query<{ count: number; nodes: string[] }>(
              `
                SELECT COUNT(*)::int AS count, array_agg(node_id ORDER BY node_id) AS nodes
                FROM node_runs
                WHERE workflow_run_id = ANY($1::uuid[])
              `,
              [runIds],
            );
            const flowRow = await client.query<{ current_version_id: string | null }>(
              "SELECT current_version_id::text AS current_version_id FROM flows WHERE id = $1::uuid",
              [flow.id],
            );
            const versions = await client.query<{ count: number }>(
              `
                SELECT COUNT(*)::int AS count
                FROM flow_versions
                WHERE flow_id = $1::uuid
              `,
              [flow.id],
            );
            return {
              currentVersionId: flowRow.rows[0]?.current_version_id ?? null,
              flowVersionCount: versions.rows[0]?.count ?? 0,
              nodeRunCount: nodeRuns.rows[0]?.count ?? 0,
              nodeRunNodes: nodeRuns.rows[0]?.nodes ?? [],
              runCount: runs.rows[0]?.count ?? 0,
              workflowRunVersionCount: runs.rows[0]?.version_count ?? 0,
            };
          },
          appPool,
        );

        expect(runRows.runCount).toBe(3);
        expect(runRows.nodeRunCount).toBe(3);
        expect(runRows.nodeRunNodes).toEqual(targetNodeIds);
        expect(runRows.currentVersionId).toBeNull();
        expect(runRows.flowVersionCount).toBe(1);
        expect(runRows.workflowRunVersionCount).toBe(1);

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("target_node image and video runs enqueue modality-specific execution queues", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();

      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });

        const { api, fakeQueue } = buildTestApp(appPool);
        const ownerEmail = "workflow-modality-queue@example.com";
        const owner = await registerOwner(api, ownerEmail, "Workflow Modality Queue");
        const ownerUserId = await lookupUserIdByEmail(appPool, ownerEmail);
        await seedRouteAndPricing(appPool, {
          modality: "image",
          modelKey: "mock-image-queue",
          providerKey: "mock-local-image-queue",
          routeKey: "image.default",
          tenantId: owner.currentTenant.id,
          userId: ownerUserId,
          withExactPricing: true,
        });
        await seedRouteAndPricing(appPool, {
          modality: "video",
          modelKey: "mock-video-queue",
          providerKey: "mock-local-video-queue",
          routeKey: "video.default",
          tenantId: owner.currentTenant.id,
          userId: ownerUserId,
          withExactPricing: true,
        });

        const imageFlow = await createDraftOnlyFlowWithSingleNode(api, owner.accessToken, {
          nodeId: "image-target",
          nodeType: "image.generate",
          routeKey: "image.default",
        });
        const videoFlow = await createDraftOnlyFlowWithSingleNode(api, owner.accessToken, {
          nodeId: "video-target",
          nodeType: "video.generate",
          routeKey: "video.default",
        });

        const imageRun = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "POST",
          payload: {
            input: {
              runMode: "target_node",
              targetNodeId: "image-target",
            },
          },
          url: `/api/v2/flows/${imageFlow.id}/runs`,
        });
        const videoRun = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "POST",
          payload: {
            input: {
              runMode: "target_node",
              targetNodeId: "video-target",
            },
          },
          url: `/api/v2/flows/${videoFlow.id}/runs`,
        });

        expect(imageRun.statusCode).toBe(201);
        expect(videoRun.statusCode).toBe(201);
        expect(fakeQueue.jobs.map((job) => job.name)).toEqual([
          QUEUE_NAMES.nodeExecuteImage,
          QUEUE_NAMES.nodeExecuteVideo,
        ]);
        expect(fakeQueue.jobs.map((job) => job.data)).toEqual([
          expect.objectContaining({ nodeType: "image.generate" }),
          expect.objectContaining({ nodeType: "video.generate" }),
        ]);

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("target_node run for an image edit child node creates and enqueues the edit target", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();

      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });

        const { api, fakeQueue } = buildTestApp(appPool);
        const ownerEmail = "workflow-image-edit-target@example.com";
        const owner = await registerOwner(api, ownerEmail, "Workflow Image Edit Target");
        const ownerUserId = await lookupUserIdByEmail(appPool, ownerEmail);
        await seedRouteAndPricing(appPool, {
          modelKey: "mock-image-v1",
          providerKey: "mock-local-dev",
          routeKey: "image.default",
          tenantId: owner.currentTenant.id,
          userId: ownerUserId,
          withExactPricing: true,
        });

        const flow = await createDraftOnlyFlowWithImageEditTarget(api, owner.accessToken, "image.default");
        const createRun = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "POST",
          payload: {
            input: {
              runMode: "target_node",
              targetNodeId: "target-image",
            },
          },
          url: `/api/v2/flows/${flow.id}/runs`,
        });

        expect(createRun.statusCode).toBe(201);
        expect(fakeQueue.jobs).toHaveLength(1);

        const runDetails = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "GET",
          url: `/api/v2/workflow-runs/${createRun.json().runId}`,
        });
        expect(runDetails.statusCode).toBe(200);
        expect(runDetails.json().nodeRuns).toHaveLength(1);
        expect(runDetails.json().nodeRuns[0]).toMatchObject({
          nodeId: "target-image",
          nodeType: "image.generate",
          status: "runnable",
        });
        expect(runDetails.json().nodeRuns[0].inputJson).toMatchObject({
          imageEditRequest: {
            editType: "multiAngle",
            sourceNodeId: "source-image",
          },
          routeKey: "image.default",
        });

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("target_node image edit uses nested imageEditRequest routeKey for pricing when top-level routeKey is missing", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();

      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });

        const { api, fakeQueue } = buildTestApp(appPool);
        const ownerEmail = "workflow-image-edit-nested-route@example.com";
        const owner = await registerOwner(api, ownerEmail, "Workflow Image Edit Nested Route");
        const ownerUserId = await lookupUserIdByEmail(appPool, ownerEmail);
        await seedRouteAndPricing(appPool, {
          modelKey: "mock-image-v1",
          providerKey: "mock-local-dev-nested",
          routeKey: "image.pixellelabs.nano-banana-pro",
          tenantId: owner.currentTenant.id,
          userId: ownerUserId,
          withExactPricing: true,
        });

        const flow = await createDraftOnlyFlowWithImageEditTarget(
          api,
          owner.accessToken,
          "image.pixellelabs.nano-banana-pro",
          { omitTargetRouteKey: true },
        );
        const createRun = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "POST",
          payload: {
            input: {
              runMode: "target_node",
              targetNodeId: "target-image",
            },
          },
          url: `/api/v2/flows/${flow.id}/runs`,
        });

        expect(createRun.statusCode).toBe(201);
        expect(fakeQueue.jobs).toHaveLength(1);

        const runDetails = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "GET",
          url: `/api/v2/workflow-runs/${createRun.json().runId}`,
        });
        expect(runDetails.statusCode).toBe(200);
        expect(runDetails.json().nodeRuns[0].costJson).toMatchObject({
          estimatedCents: 17,
          pricingFallbackLevel: 1,
          pricingMatch: {
            model: "mock-image-v1",
            provider: "mock-local-dev-nested",
            route: "image.pixellelabs.nano-banana-pro",
            unit: "image_generation",
          },
        });

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("tenant_owner can create a run and viewer cannot", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();

      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });

        const { api, fakeQueue } = buildTestApp(appPool);
        const owner = await registerOwner(api, "workflow-owner@example.com", "Workflow Tenant");
        const flow = await createPublishedFlow(api, owner.accessToken);

        const createRun = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "POST",
          payload: {
            input: {
              prompt: "hello world",
            },
          },
          url: `/api/v2/flows/${flow.id}/runs`,
        });

        expect(createRun.statusCode).toBe(201);
        expect(createRun.json().status).toBe("pending");
        expect(fakeQueue.jobs).toHaveLength(1);

        const runDetails = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "GET",
          url: `/api/v2/workflow-runs/${createRun.json().runId}`,
        });

        expect(runDetails.statusCode).toBe(200);
        expect(runDetails.json().nodeRuns).toHaveLength(3);
        expect(runDetails.json().nodeRuns.filter((row: { status: string }) => row.status === "runnable")).toHaveLength(1);

        const viewerUserId = randomUUID();
        const viewerPassword = "ViewerPass123!";
        const viewerPasswordHash = await hashPassword(viewerPassword);

        await withTenantTransaction(
          { tenantId: owner.currentTenant.id, userId: viewerUserId },
          async (client) => {
            await client.query(
              `
                INSERT INTO users (id, email, display_name, password_hash, updated_at)
                VALUES ($1::uuid, $2, $3, $4, now())
              `,
              [viewerUserId, "workflow-viewer@example.com", "Workflow Viewer", viewerPasswordHash],
            );
            await client.query(
              `
                INSERT INTO tenant_memberships (tenant_id, user_id, role_key, status, joined_at, updated_at)
                VALUES ($1::uuid, $2::uuid, 'viewer', 'active', now(), now())
              `,
              [owner.currentTenant.id, viewerUserId],
            );
          },
          appPool,
        );

        const viewerLogin = await api.inject({
          method: "POST",
          payload: {
            email: "workflow-viewer@example.com",
            password: viewerPassword,
            consent: currentLegalConsent,
          },
          url: "/api/v2/auth/login",
        });
        expect(viewerLogin.statusCode).toBe(200);

        const forbiddenRun = await api.inject({
          headers: {
            authorization: `Bearer ${viewerLogin.json().accessToken}`,
          },
          method: "POST",
          payload: {
            input: {
              prompt: "forbidden",
            },
          },
          url: `/api/v2/flows/${flow.id}/runs`,
        });
        expect(forbiddenRun.statusCode).toBe(403);

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("events support afterSequence and cancel writes a cancellation event", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();

      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });

        const { api } = buildTestApp(appPool);
        const owner = await registerOwner(api, "workflow-events@example.com", "Workflow Events");
        const flow = await createPublishedFlow(api, owner.accessToken);

        const createRun = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "POST",
          payload: {
            input: {
              prompt: "cancel me",
            },
          },
          url: `/api/v2/flows/${flow.id}/runs`,
        });
        expect(createRun.statusCode).toBe(201);

        const allEvents = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "GET",
          url: `/api/v2/workflow-runs/${createRun.json().runId}/events`,
        });
        expect(allEvents.statusCode).toBe(200);
        expect(allEvents.json().length).toBeGreaterThanOrEqual(2);

        const afterFirst = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "GET",
          url: `/api/v2/workflow-runs/${createRun.json().runId}/events?afterSequence=1`,
        });
        expect(afterFirst.statusCode).toBe(200);
        expect(afterFirst.json().every((row: { sequence: number }) => row.sequence > 1)).toBe(true);

        const cancelRun = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "POST",
          url: `/api/v2/workflow-runs/${createRun.json().runId}/cancel`,
        });
        expect(cancelRun.statusCode).toBe(200);
        expect(cancelRun.json().status).toBe("canceled");

        const canceledEvents = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "GET",
          url: `/api/v2/workflow-runs/${createRun.json().runId}/events`,
        });
        expect(canceledEvents.json().some((row: { eventType: string }) => row.eventType === "workflow.run.canceled")).toBe(true);

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("tenant A cannot read tenant B run", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();

      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });

        const { api } = buildTestApp(appPool);
        const tenantA = await registerOwner(api, "tenant-a-runs@example.com", "Tenant A Runs");
        const tenantB = await registerOwner(api, "tenant-b-runs@example.com", "Tenant B Runs");
        const flowB = await createPublishedFlow(api, tenantB.accessToken);

        const createRunB = await api.inject({
          headers: {
            authorization: `Bearer ${tenantB.accessToken}`,
          },
          method: "POST",
          payload: {
            input: {
              prompt: "tenant b",
            },
          },
          url: `/api/v2/flows/${flowB.id}/runs`,
        });
        expect(createRunB.statusCode).toBe(201);

        const tenantARead = await api.inject({
          headers: {
            authorization: `Bearer ${tenantA.accessToken}`,
          },
          method: "GET",
          url: `/api/v2/workflow-runs/${createRunB.json().runId}`,
        });
        expect(tenantARead.statusCode).toBe(404);

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("stream requires auth and viewer lacks run:read", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();

      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });

        const { api } = buildTestApp(appPool);
        const owner = await registerOwner(api, "workflow-stream-auth@example.com", "Workflow Stream Auth");
        const flow = await createPublishedFlow(api, owner.accessToken);

        const createRun = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "POST",
          payload: {
            input: {
              prompt: "stream auth",
            },
          },
          url: `/api/v2/flows/${flow.id}/runs`,
        });
        expect(createRun.statusCode).toBe(201);

        const cancelRun = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "POST",
          url: `/api/v2/workflow-runs/${createRun.json().runId}/cancel`,
        });
        expect(cancelRun.statusCode).toBe(200);

        const noToken = await api.inject({
          method: "GET",
          url: `/api/v2/workflow-runs/${createRun.json().runId}/stream`,
        });
        expect(noToken.statusCode).toBe(401);

        const viewerUserId = randomUUID();
        const viewerPassword = "ViewerPass123!";
        const viewerPasswordHash = await hashPassword(viewerPassword);

        await withTenantTransaction(
          { tenantId: owner.currentTenant.id, userId: viewerUserId },
          async (client) => {
            await client.query(
              `
                INSERT INTO roles (id, tenant_id, key, name)
                VALUES ($1::uuid, $2::uuid, 'no_run_read', 'No Run Read')
              `,
              [randomUUID(), owner.currentTenant.id],
            );
            await client.query(
              `
                INSERT INTO users (id, email, display_name, password_hash, updated_at)
                VALUES ($1::uuid, $2, $3, $4, now())
              `,
              [viewerUserId, "workflow-stream-viewer@example.com", "Workflow Stream Viewer", viewerPasswordHash],
            );
            await client.query(
              `
                INSERT INTO tenant_memberships (tenant_id, user_id, role_key, status, joined_at, updated_at)
                VALUES ($1::uuid, $2::uuid, 'no_run_read', 'active', now(), now())
              `,
              [owner.currentTenant.id, viewerUserId],
            );
          },
          appPool,
        );

        const viewerLogin = await api.inject({
          method: "POST",
          payload: {
            email: "workflow-stream-viewer@example.com",
            password: viewerPassword,
            consent: currentLegalConsent,
          },
          url: "/api/v2/auth/login",
        });
        expect(viewerLogin.statusCode).toBe(200);

        const forbidden = await api.inject({
          headers: {
            authorization: `Bearer ${viewerLogin.json().accessToken}`,
          },
          method: "GET",
          url: `/api/v2/workflow-runs/${createRun.json().runId}/stream`,
        });
        expect(forbidden.statusCode).toBe(403);

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  }, 15_000);

  test("stream returns SSE events, honors afterSequence and Last-Event-ID, and isolates tenants", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();

      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });

        const { api } = buildTestApp(appPool);
        const tenantA = await registerOwner(api, "workflow-stream-a@example.com", "Workflow Stream A");
        const tenantB = await registerOwner(api, "workflow-stream-b@example.com", "Workflow Stream B");

        const flowA = await createPublishedFlow(api, tenantA.accessToken);
        const flowB = await createPublishedFlow(api, tenantB.accessToken);

        const createRunA = await api.inject({
          headers: {
            authorization: `Bearer ${tenantA.accessToken}`,
          },
          method: "POST",
          payload: {
            input: {
              prompt: "tenant a stream",
            },
          },
          url: `/api/v2/flows/${flowA.id}/runs`,
        });
        expect(createRunA.statusCode).toBe(201);

        const cancelRunA = await api.inject({
          headers: {
            authorization: `Bearer ${tenantA.accessToken}`,
          },
          method: "POST",
          url: `/api/v2/workflow-runs/${createRunA.json().runId}/cancel`,
        });
        expect(cancelRunA.statusCode).toBe(200);

        const createRunB = await api.inject({
          headers: {
            authorization: `Bearer ${tenantB.accessToken}`,
          },
          method: "POST",
          payload: {
            input: {
              prompt: "tenant b stream",
            },
          },
          url: `/api/v2/flows/${flowB.id}/runs`,
        });
        expect(createRunB.statusCode).toBe(201);

        const tenantAStream = await api.inject({
          headers: {
            accept: "text/event-stream",
            authorization: `Bearer ${tenantA.accessToken}`,
          },
          method: "GET",
          url: `/api/v2/workflow-runs/${createRunA.json().runId}/stream`,
        });
        expect(tenantAStream.statusCode).toBe(200);
        expect(tenantAStream.headers["content-type"]).toContain("text/event-stream");

        const initialEvents = parseSseEvents(tenantAStream.body);
        expect(initialEvents.length).toBeGreaterThanOrEqual(3);
        expect(initialEvents[0]).toMatchObject({
          event: "workflow.run.created",
          id: "1",
        });
        expect(initialEvents[0]?.json).toMatchObject({
          eventType: "workflow.run.created",
          sequence: 1,
          workflowRunId: createRunA.json().runId,
        });
        expect(initialEvents[0]?.json.payload).toMatchObject({
          status: "pending",
        });
        expect(initialEvents.some((event) => event.event === "workflow.run.canceled")).toBe(true);
        expect(initialEvents.every((event) => !String(event.data).includes("tenant b stream"))).toBe(true);

        const afterSequence = await api.inject({
          headers: {
            accept: "text/event-stream",
            authorization: `Bearer ${tenantA.accessToken}`,
          },
          method: "GET",
          url: `/api/v2/workflow-runs/${createRunA.json().runId}/stream?afterSequence=1`,
        });
        const afterSequenceEvents = parseSseEvents(afterSequence.body);
        expect(afterSequenceEvents.every((event) => Number(event.id) > 1)).toBe(true);
        expect(afterSequence.headers["x-workflow-stream-cursor-source"]).toBe("afterSequence");

        const lastEventId = await api.inject({
          headers: {
            accept: "text/event-stream",
            authorization: `Bearer ${tenantA.accessToken}`,
            "last-event-id": "1",
          },
          method: "GET",
          url: `/api/v2/workflow-runs/${createRunA.json().runId}/stream`,
        });
        const lastEventIdEvents = parseSseEvents(lastEventId.body);
        expect(lastEventIdEvents.every((event) => Number(event.id) > 1)).toBe(true);
        expect(lastEventId.headers["x-workflow-stream-cursor-source"]).toBe("last-event-id");

        const queryWins = await api.inject({
          headers: {
            accept: "text/event-stream",
            authorization: `Bearer ${tenantA.accessToken}`,
            "last-event-id": "2",
          },
          method: "GET",
          url: `/api/v2/workflow-runs/${createRunA.json().runId}/stream?afterSequence=1`,
        });
        const queryWinsEvents = parseSseEvents(queryWins.body);
        expect(queryWinsEvents.some((event) => event.id === "2")).toBe(true);
        expect(queryWins.headers["x-workflow-stream-cursor-source"]).toBe("afterSequence");

        const tenantBCrossRead = await api.inject({
          headers: {
            accept: "text/event-stream",
            authorization: `Bearer ${tenantB.accessToken}`,
          },
          method: "GET",
          url: `/api/v2/workflow-runs/${createRunA.json().runId}/stream`,
        });
        expect(tenantBCrossRead.statusCode).toBe(404);

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });
});
