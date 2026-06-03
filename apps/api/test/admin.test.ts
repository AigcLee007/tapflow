import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, test } from "vitest";

import { createPgPool } from "@aigc-flow/db";

import type { ApiEnv } from "../src/config/env.js";
import { buildApp } from "../src/app.js";
import { runMigrations } from "../../../packages/db/src/migrator.js";
import { hasDatabaseEnv, withDatabase } from "../../../packages/db/test/helpers.js";

const originalDatabaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = hasDatabaseEnv() ? describe : describe.skip;

const adminEmail = "ops-admin@example.com";

const testEnv: ApiEnv = {
  accessTokenTtlSeconds: 60 * 15,
  adminEmails: [adminEmail],
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

afterAll(() => {
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
});

function createFakeWorkflowRunsService() {
  return {
    async cancelWorkflowRun() {
      throw new Error("not used");
    },
    async createWorkflowRun() {
      throw new Error("not used");
    },
    async getWorkflowRun() {
      throw new Error("not used");
    },
    async getWorkflowRunStatus() {
      throw new Error("not used");
    },
    isTerminalWorkflowRunStatus() {
      return false;
    },
    async listWorkflowRunEvents() {
      throw new Error("not used");
    },
  } as const;
}

function buildTestApp(pool: ReturnType<typeof createPgPool>) {
  return buildApp({
    env: testEnv,
    logger: false,
    pool,
    queueHealthService: {
      async close() {
        return;
      },
    } as never,
    workflowRunsService: createFakeWorkflowRunsService() as never,
  });
}

async function registerUser(
  api: ReturnType<typeof buildTestApp>,
  input: {
    displayName?: string;
    email: string;
    password?: string;
    tenantName: string;
  },
) {
  const response = await api.inject({
    method: "POST",
    payload: {
      displayName: input.displayName,
      email: input.email,
      password: input.password ?? "StrongPass123!",
      tenantName: input.tenantName,
    },
    url: "/api/v2/auth/register",
  });
  expect(response.statusCode).toBe(201);
  return response.json();
}

async function createPublishedFlow(api: ReturnType<typeof buildTestApp>, accessToken: string) {
  const project = await api.inject({
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    method: "POST",
    payload: {
      name: "Admin Workflow Project",
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
      title: "Admin Workflow Flow",
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
        edges: [{ source: "prompt", target: "image" }],
        nodes: [
          {
            data: { inputKey: "prompt" },
            id: "prompt",
            type: "input",
          },
          {
            data: { routeKey: "image.default" },
            id: "image",
            type: "image.generate",
          },
        ],
      },
    },
    url: `/api/v2/flows/${flow.json().id}/publish`,
  });
  expect(publish.statusCode).toBe(201);
  return flow.json();
}

async function addMembership(
  pool: ReturnType<typeof createPgPool>,
  input: {
    roleKey?: string;
    tenantId: string;
    userId: string;
  },
) {
  await pool.query(
    `
      INSERT INTO tenant_memberships (tenant_id, user_id, role_key, status, joined_at, updated_at)
      VALUES ($1::uuid, $2::uuid, $3, 'active', now(), now())
      ON CONFLICT (tenant_id, user_id) DO UPDATE
      SET role_key = EXCLUDED.role_key,
          status = 'active',
          updated_at = now()
    `,
    [input.tenantId, input.userId, input.roleKey ?? "tenant_admin"],
  );
}

describeWithDatabase("admin api", () => {
  test("admin endpoints require auth and admin permission", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();
      try {
        await runMigrations(adminPool);
        appPool = createPgPool({ connectionString: await createAppDatabaseUrl() });
        const api = buildTestApp(appPool);

        const anonymous = await api.inject({
          method: "GET",
          url: "/api/v2/admin/users",
        });
        expect(anonymous.statusCode).toBe(401);

        const normalUser = await registerUser(api, {
          email: "member-admin-test@example.com",
          tenantName: "Member Tenant",
        });

        const forbidden = await api.inject({
          headers: {
            authorization: `Bearer ${normalUser.accessToken}`,
          },
          method: "GET",
          url: "/api/v2/admin/users",
        });
        expect(forbidden.statusCode).toBe(403);

        const adminUser = await registerUser(api, {
          displayName: "Ops Admin",
          email: adminEmail,
          tenantName: "Ops Tenant",
        });
        const adminLogin = await api.inject({
          method: "POST",
          payload: {
            email: adminEmail,
            password: "StrongPass123!",
            tenantId: adminUser.currentTenant.id,
          },
          url: "/api/v2/auth/login",
        });
        expect(adminLogin.statusCode).toBe(200);

        const allowed = await api.inject({
          headers: {
            authorization: `Bearer ${adminLogin.json().accessToken}`,
          },
          method: "GET",
          url: "/api/v2/admin/users?query=Ops",
        });
        expect(allowed.statusCode).toBe(200);
        expect(allowed.json().items[0].email).toBe(adminEmail);

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("admin can search users, grant credits idempotently, and create redeem codes", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();
      try {
        await runMigrations(adminPool);
        appPool = createPgPool({ connectionString: await createAppDatabaseUrl() });
        const api = buildTestApp(appPool);

        const adminUser = await registerUser(api, {
          displayName: "Ops Admin",
          email: adminEmail,
          tenantName: "Ops Tenant",
        });
        const targetUser = await registerUser(api, {
          displayName: "Searchable User",
          email: "searchable-user@example.com",
          tenantName: "Credits Tenant",
        });
        await addMembership(adminPool, {
          tenantId: targetUser.currentTenant.id,
          userId: adminUser.user.id,
        });
        const adminLogin = await api.inject({
          method: "POST",
          payload: {
            email: adminEmail,
            password: "StrongPass123!",
            tenantId: targetUser.currentTenant.id,
          },
          url: "/api/v2/auth/login",
        });
        expect(adminLogin.statusCode).toBe(200);

        const search = await api.inject({
          headers: {
            authorization: `Bearer ${adminLogin.json().accessToken}`,
          },
          method: "GET",
          url: "/api/v2/admin/users?query=Searchable",
        });
        expect(search.statusCode).toBe(200);
        expect(search.json().items[0]).toMatchObject({
          displayName: "Searchable User",
          email: "searchable-user@example.com",
        });

        const idempotencyKey = `grant:${randomUUID()}`;
        const grantOne = await api.inject({
          headers: {
            authorization: `Bearer ${adminLogin.json().accessToken}`,
          },
          method: "POST",
          payload: {
            credits: 250,
            idempotencyKey,
            reason: "ops seed credits",
            tenantId: targetUser.currentTenant.id,
          },
          url: `/api/v2/admin/users/${targetUser.user.id}/grant-credits`,
        });
        expect(grantOne.statusCode).toBe(200);

        const grantTwo = await api.inject({
          headers: {
            authorization: `Bearer ${adminLogin.json().accessToken}`,
          },
          method: "POST",
          payload: {
            credits: 250,
            idempotencyKey,
            reason: "ops seed credits",
            tenantId: targetUser.currentTenant.id,
          },
          url: `/api/v2/admin/users/${targetUser.user.id}/grant-credits`,
        });
        expect(grantTwo.statusCode).toBe(200);
        expect(grantTwo.json().ledgerEntry.id).toBe(grantOne.json().ledgerEntry.id);

        const summary = await api.inject({
          headers: {
            authorization: `Bearer ${targetUser.accessToken}`,
          },
          method: "GET",
          url: "/api/v2/billing/summary",
        });
        expect(summary.statusCode).toBe(200);
        expect(summary.json().balanceCredits).toBe(250);
        expect(summary.json().availableCredits).toBe(250);

        const createRedeemCode = await api.inject({
          headers: {
            authorization: `Bearer ${adminLogin.json().accessToken}`,
          },
          method: "POST",
          payload: {
            credits: 150,
            maxRedemptions: 1,
            reason: "staging redeem test",
            tenantId: targetUser.currentTenant.id,
          },
          url: "/api/v2/admin/redeem-codes",
        });
        expect(createRedeemCode.statusCode).toBe(201);
        expect(createRedeemCode.json().code).toMatch(/^TF-/);

        const redeem = await api.inject({
          headers: {
            authorization: `Bearer ${targetUser.accessToken}`,
          },
          method: "POST",
          payload: {
            code: createRedeemCode.json().code,
          },
          url: "/api/v2/billing/redeem",
        });
        expect(redeem.statusCode).toBe(201);
        expect(redeem.json().credits).toBe(150);

        const afterRedeem = await api.inject({
          headers: {
            authorization: `Bearer ${targetUser.accessToken}`,
          },
          method: "GET",
          url: "/api/v2/billing/summary",
        });
        expect(afterRedeem.statusCode).toBe(200);
        expect(afterRedeem.json().balanceCredits).toBe(400);

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("admin password reset allows the user to log in with the returned temporary password", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();
      try {
        await runMigrations(adminPool);
        appPool = createPgPool({ connectionString: await createAppDatabaseUrl() });
        const api = buildTestApp(appPool);

        const adminUser = await registerUser(api, {
          email: adminEmail,
          tenantName: "Ops Tenant",
        });
        const targetUser = await registerUser(api, {
          email: "resettable-user@example.com",
          tenantName: "Reset Tenant",
        });
        await addMembership(adminPool, {
          tenantId: targetUser.currentTenant.id,
          userId: adminUser.user.id,
        });
        const adminLogin = await api.inject({
          method: "POST",
          payload: {
            email: adminEmail,
            password: "StrongPass123!",
            tenantId: targetUser.currentTenant.id,
          },
          url: "/api/v2/auth/login",
        });
        expect(adminLogin.statusCode).toBe(200);

        const reset = await api.inject({
          headers: {
            authorization: `Bearer ${adminLogin.json().accessToken}`,
          },
          method: "POST",
          url: `/api/v2/admin/users/${targetUser.user.id}/reset-password`,
        });
        expect(reset.statusCode).toBe(200);
        expect(reset.json().passwordShownOnce).toBeTruthy();

        const relogin = await api.inject({
          method: "POST",
          payload: {
            email: "resettable-user@example.com",
            password: reset.json().passwordShownOnce,
            tenantId: targetUser.currentTenant.id,
          },
          url: "/api/v2/auth/login",
        });
        expect(relogin.statusCode).toBe(200);

        const userRow = await adminPool.query<{
          email_verified_at: string | null;
          password_hash: string;
          status: string;
        }>(
          `
            SELECT password_hash, status, email_verified_at::text AS email_verified_at
            FROM users
            WHERE id = $1::uuid
          `,
          [targetUser.user.id],
        );
        expect(userRow.rows[0]?.status).toBe("active");
        expect(userRow.rows[0]?.email_verified_at).toBeTruthy();
        expect(userRow.rows[0]?.password_hash).not.toBe(reset.json().passwordShownOnce);

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("admin can inspect failed workflow runs and node error_json details", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();
      try {
        await runMigrations(adminPool);
        appPool = createPgPool({ connectionString: await createAppDatabaseUrl() });
        const api = buildTestApp(appPool);

        const adminUser = await registerUser(api, {
          email: adminEmail,
          tenantName: "Ops Tenant",
        });
        const flowOwner = await registerUser(api, {
          email: "workflow-owner@example.com",
          tenantName: "Workflow Tenant",
        });
        await addMembership(adminPool, {
          tenantId: flowOwner.currentTenant.id,
          userId: adminUser.user.id,
        });
        const adminLogin = await api.inject({
          method: "POST",
          payload: {
            email: adminEmail,
            password: "StrongPass123!",
            tenantId: flowOwner.currentTenant.id,
          },
          url: "/api/v2/auth/login",
        });
        expect(adminLogin.statusCode).toBe(200);

        const flow = await createPublishedFlow(api, flowOwner.accessToken);
        const runId = randomUUID();
        const nodeRunId = randomUUID();
        const flowVersionResult = await adminPool.query<{ id: string }>(
          `
            SELECT id::text AS id
            FROM flow_versions
            WHERE flow_id = $1::uuid
            ORDER BY created_at DESC
            LIMIT 1
          `,
          [flow.id],
        );

        await adminPool.query(
          `
            INSERT INTO workflow_runs (
              id,
              tenant_id,
              flow_id,
              flow_version_id,
              status,
              input_json,
              error_json,
              created_by,
              started_at,
              finished_at,
              updated_at
            )
            VALUES (
              $1::uuid,
              $2::uuid,
              $3::uuid,
              $4::uuid,
              'failed',
              $5::jsonb,
              $6::jsonb,
              $7::uuid,
              now(),
              now(),
              now()
            )
          `,
          [
            runId,
            flowOwner.currentTenant.id,
            flow.id,
            flowVersionResult.rows[0]?.id,
            JSON.stringify({
              runMode: "target_node",
              targetNodeId: "image",
            }),
            JSON.stringify({
              code: "PROVIDER_INTERNAL_ERROR",
              message: "Provider timed out while generating image",
            }),
            flowOwner.user.id,
          ],
        );

        await adminPool.query(
          `
            INSERT INTO node_runs (
              id,
              tenant_id,
              workflow_run_id,
              node_id,
              node_type,
              status,
              error_json,
              output_json,
              started_at,
              finished_at,
              updated_at
            )
            VALUES (
              $1::uuid,
              $2::uuid,
              $3::uuid,
              'image',
              'image.generate',
              'failed',
              $4::jsonb,
              $5::jsonb,
              now(),
              now(),
              now()
            )
          `,
          [
            nodeRunId,
            flowOwner.currentTenant.id,
            runId,
            JSON.stringify({
              code: "PROVIDER_TIMEOUT_UNKNOWN",
              details: {
                timeoutMs: 300000,
              },
              message: "Checking upstream result timed out",
            }),
            JSON.stringify({
              targetNodeId: "image",
            }),
          ],
        );

        const list = await api.inject({
          headers: {
            authorization: `Bearer ${adminLogin.json().accessToken}`,
          },
          method: "GET",
          url: "/api/v2/admin/workflow-runs?status=failed",
        });
        expect(list.statusCode).toBe(200);
        expect(list.json().items.some((item: { id: string }) => item.id === runId)).toBe(true);

        const detail = await api.inject({
          headers: {
            authorization: `Bearer ${adminLogin.json().accessToken}`,
          },
          method: "GET",
          url: `/api/v2/admin/workflow-runs/${runId}`,
        });
        expect(detail.statusCode).toBe(200);
        expect(detail.json().workflowRun.targetNodeId).toBe("image");
        expect(detail.json().workflowRun.errorJson.code).toBe("PROVIDER_INTERNAL_ERROR");
        expect(detail.json().nodeRuns[0].errorJson.code).toBe("PROVIDER_TIMEOUT_UNKNOWN");

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });
});
