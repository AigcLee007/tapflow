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

async function createTestAiRoute(
  pool: ReturnType<typeof createPgPool>,
  input: {
    routeLabel?: string;
    routeKey?: string;
    tenantId: string;
  },
) {
  const provider = await pool.query<{ id: string }>(
    `
      INSERT INTO ai_providers (key, name, kind, status, default_base_url, capabilities, updated_at)
      VALUES ($1, 'PixelleLabs', 'openai-compatible', 'active', 'https://example.invalid', '{}'::jsonb, now())
      ON CONFLICT (key) DO UPDATE
      SET updated_at = now()
      RETURNING id::text AS id
    `,
    [`provider-${randomUUID()}`],
  );
  const model = await pool.query<{ id: string }>(
    `
      INSERT INTO ai_models (provider_id, model_key, display_name, modality, capabilities, status, updated_at)
      VALUES ($1::uuid, $2, 'Nano Banana Pro', 'image', '{}'::jsonb, 'active', now())
      RETURNING id::text AS id
    `,
    [provider.rows[0]?.id, `nano-banana-pro-${randomUUID()}`],
  );
  const route = await pool.query<{ id: string }>(
    `
      INSERT INTO ai_routes (
        tenant_id,
        provider_id,
        model_id,
        route_key,
        route_label,
        modality,
        status,
        request_config,
        pricing,
        rate_limit,
        updated_at
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        $3::uuid,
        $4,
        $5,
        'image',
        'active',
        '{}'::jsonb,
        '{}'::jsonb,
        '{}'::jsonb,
        now()
      )
      RETURNING id::text AS id
    `,
    [
      input.tenantId,
      provider.rows[0]?.id,
      model.rows[0]?.id,
      input.routeKey ?? `image.test.${randomUUID()}`,
      input.routeLabel ?? "线路一",
    ],
  );

  return {
    modelId: model.rows[0]?.id,
    providerId: provider.rows[0]?.id,
    routeId: route.rows[0]?.id,
  };
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

        const searchAfterGrant = await api.inject({
          headers: {
            authorization: `Bearer ${adminLogin.json().accessToken}`,
          },
          method: "GET",
          url: "/api/v2/admin/users?query=Searchable",
        });
        expect(searchAfterGrant.statusCode).toBe(200);
        expect(searchAfterGrant.json().items[0].wallet.creditLedger[0]).toMatchObject({
          amountCredits: 250,
          direction: "credit",
          entryType: "admin_credit",
        });

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

  test("system admin can search users outside current tenant and manage membership billing", async () => {
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
          displayName: "Global Search User",
          email: "global-search-user@example.com",
          tenantName: "Creator Tenant",
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

        const search = await api.inject({
          headers: {
            authorization: `Bearer ${adminLogin.json().accessToken}`,
          },
          method: "GET",
          url: "/api/v2/admin/users?query=global-search-user",
        });
        expect(search.statusCode).toBe(200);
        expect(search.json().items[0]).toMatchObject({
          email: "global-search-user@example.com",
        });
        expect(search.json().items[0].memberships[0]).toMatchObject({
          tenantId: targetUser.currentTenant.id,
        });

        const tier = await api.inject({
          headers: {
            authorization: `Bearer ${adminLogin.json().accessToken}`,
          },
          method: "PATCH",
          payload: {
            tenantId: targetUser.currentTenant.id,
            tier: "gold",
          },
          url: `/api/v2/admin/users/${targetUser.user.id}/membership-tier`,
        });
        expect(tier.statusCode).toBe(200);
        expect(tier.json()).toMatchObject({
          membershipTier: "gold",
          tenantId: targetUser.currentTenant.id,
        });

        const grant = await api.inject({
          headers: {
            authorization: `Bearer ${adminLogin.json().accessToken}`,
          },
          method: "POST",
          payload: {
            credits: 100,
            reason: "three month package",
            tenantId: targetUser.currentTenant.id,
            validityMode: "months",
            validityMonths: 3,
          },
          url: `/api/v2/admin/users/${targetUser.user.id}/grant-credits`,
        });
        expect(grant.statusCode).toBe(200);

        const account = await adminPool.query<{ membership_tier: string }>(
          `
            SELECT membership_tier
            FROM billing_accounts
            WHERE tenant_id = $1::uuid
          `,
          [targetUser.currentTenant.id],
        );
        expect(account.rows[0]?.membership_tier).toBe("gold");

        const grants = await adminPool.query<{ expires_at: string | null }>(
          `
            SELECT expires_at::text AS expires_at
            FROM billing_credit_grants
            WHERE tenant_id = $1::uuid
              AND source_type = 'admin_grant'
            ORDER BY created_at DESC
            LIMIT 1
          `,
          [targetUser.currentTenant.id],
        );
        expect(grants.rows[0]?.expires_at).toBeTruthy();

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("includes one personal wallet with expiry and absolute debit ledger entries", async () => {
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
          displayName: "Audited Creator",
          email: "audited-creator@example.com",
          tenantName: "Audited Tenant",
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

        const targetLogin = await api.inject({
          method: "POST",
          payload: {
            email: "audited-creator@example.com",
            password: "StrongPass123!",
            tenantId: targetUser.currentTenant.id,
          },
          url: "/api/v2/auth/login",
        });
        expect(targetLogin.statusCode).toBe(200);

        const grant = await api.inject({
          headers: {
            authorization: `Bearer ${adminLogin.json().accessToken}`,
          },
          method: "POST",
          payload: {
            credits: 300,
            reason: "three month package",
            tenantId: targetUser.currentTenant.id,
            validityMode: "months",
            validityMonths: 3,
          },
          url: `/api/v2/admin/users/${targetUser.user.id}/grant-credits`,
        });
        expect(grant.statusCode).toBe(200);

        await adminPool.query(
          `
            INSERT INTO tenant_memberships (tenant_id, user_id, role_key, status, joined_at, updated_at)
            VALUES ($1::uuid, $2::uuid, 'flow_developer', 'active', now(), now())
          `,
          [adminUser.currentTenant.id, targetUser.user.id],
        );

        const debit = await api.inject({
          headers: {
            authorization: `Bearer ${adminLogin.json().accessToken}`,
          },
          method: "POST",
          payload: {
            credits: 120,
            direction: "subtract",
            reason: "test wallet debit",
            tenantId: targetUser.currentTenant.id,
          },
          url: `/api/v2/admin/users/${targetUser.user.id}/adjust-credits`,
        });
        expect(debit.statusCode).toBe(200);

        const search = await api.inject({
          headers: {
            authorization: `Bearer ${adminLogin.json().accessToken}`,
          },
          method: "GET",
          url: "/api/v2/admin/users?query=audited-creator",
        });
        expect(search.statusCode).toBe(200);
        const user = search.json().items[0];
        expect(user.lastLoginAt).toBeTruthy();
        expect(user.memberships).toHaveLength(2);
        expect(user.wallet).toMatchObject({
          balanceCredits: 180,
          availableCredits: 180,
          creditGrantCount: 1,
        });
        expect(user.wallet.nearestExpiryAt).toBeTruthy();
        expect(user.wallet.creditLedger[0]).toMatchObject({
          amountCredits: 120,
          direction: "debit",
          entryType: "admin_debit",
        });

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("system admin can promote and demote admin accounts", async () => {
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
          email: "future-admin@example.com",
          tenantName: "Creator Tenant",
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

        const promote = await api.inject({
          headers: {
            authorization: `Bearer ${adminLogin.json().accessToken}`,
          },
          method: "PATCH",
          payload: {
            roleKey: "tenant_admin",
            tenantId: targetUser.currentTenant.id,
          },
          url: `/api/v2/admin/users/${targetUser.user.id}/role`,
        });
        expect(promote.statusCode).toBe(200);
        expect(promote.json()).toMatchObject({
          roleKey: "tenant_admin",
          targetUserId: targetUser.user.id,
          tenantId: targetUser.currentTenant.id,
        });

        const row = await adminPool.query<{ role_key: string }>(
          `
            SELECT role_key
            FROM tenant_memberships
            WHERE tenant_id = $1::uuid
              AND user_id = $2::uuid
          `,
          [targetUser.currentTenant.id, targetUser.user.id],
        );
        expect(row.rows[0]?.role_key).toBe("tenant_admin");

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("lists redeem codes and redemption users", async () => {
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
          displayName: "Redeem User",
          email: "redeem-user@example.com",
          tenantName: "Redeem Tenant",
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

        const createRedeemCode = await api.inject({
          headers: {
            authorization: `Bearer ${adminLogin.json().accessToken}`,
          },
          method: "POST",
          payload: {
            credits: 150,
            maxRedemptions: 1,
            reason: "ops code",
            tenantId: targetUser.currentTenant.id,
          },
          url: "/api/v2/admin/redeem-codes",
        });
        expect(createRedeemCode.statusCode).toBe(201);

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

        const list = await api.inject({
          headers: {
            authorization: `Bearer ${adminLogin.json().accessToken}`,
          },
          method: "GET",
          url: "/api/v2/admin/redeem-codes",
        });
        expect(list.statusCode).toBe(200);
        expect(list.json().items[0]).toMatchObject({
          code: createRedeemCode.json().code,
          createdByEmail: adminEmail,
          credits: 150,
          maxRedemptions: 1,
          redeemedCount: 1,
          status: "redeemed",
        });

        const redemptions = await api.inject({
          headers: {
            authorization: `Bearer ${adminLogin.json().accessToken}`,
          },
          method: "GET",
          url: `/api/v2/admin/redeem-codes/${createRedeemCode.json().id}/redemptions`,
        });
        expect(redemptions.statusCode).toBe(200);
        expect(redemptions.json().items[0]).toMatchObject({
          billingLedgerId: redeem.json().ledgerEntry.id,
          userDisplayName: "Redeem User",
          userEmail: "redeem-user@example.com",
        });

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("admin can delete only unredeemed redeem codes", async () => {
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
          email: "delete-redeem-user@example.com",
          tenantName: "Redeem Delete Tenant",
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

        const unused = await api.inject({
          headers: { authorization: `Bearer ${adminLogin.json().accessToken}` },
          method: "POST",
          payload: {
            credits: 10,
            maxRedemptions: 1,
            tenantId: targetUser.currentTenant.id,
          },
          url: "/api/v2/admin/redeem-codes",
        });
        expect(unused.statusCode).toBe(201);
        const deleteUnused = await api.inject({
          headers: { authorization: `Bearer ${adminLogin.json().accessToken}` },
          method: "DELETE",
          url: `/api/v2/admin/redeem-codes/${unused.json().id}`,
        });
        expect(deleteUnused.statusCode).toBe(204);

        const used = await api.inject({
          headers: { authorization: `Bearer ${adminLogin.json().accessToken}` },
          method: "POST",
          payload: {
            credits: 10,
            maxRedemptions: 1,
            tenantId: targetUser.currentTenant.id,
          },
          url: "/api/v2/admin/redeem-codes",
        });
        expect(used.statusCode).toBe(201);
        const redeem = await api.inject({
          headers: { authorization: `Bearer ${targetUser.accessToken}` },
          method: "POST",
          payload: { code: used.json().code },
          url: "/api/v2/billing/redeem",
        });
        expect(redeem.statusCode).toBe(201);
        const deleteUsed = await api.inject({
          headers: { authorization: `Bearer ${adminLogin.json().accessToken}` },
          method: "DELETE",
          url: `/api/v2/admin/redeem-codes/${used.json().id}`,
        });
        expect(deleteUsed.statusCode).toBe(409);

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("manages announcements", async () => {
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

        const create = await api.inject({
          headers: {
            authorization: `Bearer ${adminLogin.json().accessToken}`,
          },
          method: "POST",
          payload: {
            audience: "all",
            body: "New image model line is available.",
            imageUrl: "https://example.com/notice.png",
            linkUrl: "https://example.com/changelog",
            pinned: true,
            status: "published",
            title: "Model update",
          },
          url: "/api/v2/admin/announcements",
        });
        expect(create.statusCode).toBe(201);
        expect(create.json()).toMatchObject({
          audience: "all",
          body: "New image model line is available.",
          imageUrl: "https://example.com/notice.png",
          linkUrl: "https://example.com/changelog",
          pinned: true,
          status: "published",
          title: "Model update",
        });

        const feed = await api.inject({
          headers: {
            authorization: `Bearer ${adminLogin.json().accessToken}`,
          },
          method: "GET",
          url: "/api/v2/announcements",
        });
        expect(feed.statusCode).toBe(200);
        expect(feed.json().items[0]).toMatchObject({
          isRead: false,
          pinned: true,
          status: "published",
          title: "Model update",
        });

        const markRead = await api.inject({
          headers: {
            authorization: `Bearer ${adminLogin.json().accessToken}`,
          },
          method: "POST",
          url: `/api/v2/announcements/${create.json().id}/read`,
        });
        expect(markRead.statusCode).toBe(200);

        const readFeed = await api.inject({
          headers: {
            authorization: `Bearer ${adminLogin.json().accessToken}`,
          },
          method: "GET",
          url: "/api/v2/announcements",
        });
        expect(readFeed.statusCode).toBe(200);
        expect(readFeed.json().items[0]).toMatchObject({
          isRead: true,
          title: "Model update",
        });

        const patch = await api.inject({
          headers: {
            authorization: `Bearer ${adminLogin.json().accessToken}`,
          },
          method: "PATCH",
          payload: {
            pinned: false,
            status: "archived",
            title: "Archived model update",
          },
          url: `/api/v2/admin/announcements/${create.json().id}`,
        });
        expect(patch.statusCode).toBe(200);
        expect(patch.json()).toMatchObject({
          pinned: false,
          status: "archived",
          title: "Archived model update",
        });

        const list = await api.inject({
          headers: {
            authorization: `Bearer ${adminLogin.json().accessToken}`,
          },
          method: "GET",
          url: "/api/v2/admin/announcements",
        });
        expect(list.statusCode).toBe(200);
        expect(list.json().items[0]).toMatchObject({
          createdByEmail: adminEmail,
          pinned: false,
          status: "archived",
          title: "Archived model update",
        });

        const remove = await api.inject({
          headers: {
            authorization: `Bearer ${adminLogin.json().accessToken}`,
          },
          method: "DELETE",
          url: `/api/v2/admin/announcements/${create.json().id}`,
        });
        expect(remove.statusCode).toBe(204);

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("returns ai route reliability stats", async () => {
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
        const route = await createTestAiRoute(adminPool, {
          routeLabel: "线路一",
          tenantId: adminUser.currentTenant.id,
        });
        await adminPool.query(
          `
            INSERT INTO ai_call_logs (
              tenant_id,
              provider_id,
              model_id,
              route_id,
              status,
              latency_ms,
              error,
              created_at
            )
            VALUES
              ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'succeeded', 1000, NULL, now()),
              ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'failed', 2000, '{"message":"timeout"}'::jsonb, now())
          `,
          [adminUser.currentTenant.id, route.providerId, route.modelId, route.routeId],
        );
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

        const stats = await api.inject({
          headers: {
            authorization: `Bearer ${adminLogin.json().accessToken}`,
          },
          method: "GET",
          url: "/api/v2/admin/ai/route-stats?windowMinutes=30",
        });
        expect(stats.statusCode).toBe(200);
        expect(stats.json().summary).toMatchObject({
          averageLatencyMs: 1500,
          successRate: 50,
          totalCalls: 2,
        });
        expect(stats.json().routes[0]).toMatchObject({
          averageLatencyMs: 1500,
          routeLabel: "线路一",
          successfulCalls: 1,
          totalCalls: 2,
        });

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

  test("system admin can disable users and manually add or subtract credits", async () => {
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
          email: "disabled-user@example.com",
          tenantName: "Disable Tenant",
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

        const addCredits = await api.inject({
          headers: { authorization: `Bearer ${adminLogin.json().accessToken}` },
          method: "POST",
          payload: {
            credits: 300,
            direction: "add",
            reason: "manual add",
            tenantId: targetUser.currentTenant.id,
          },
          url: `/api/v2/admin/users/${targetUser.user.id}/adjust-credits`,
        });
        expect(addCredits.statusCode).toBe(200);
        expect(addCredits.json().account.balanceCredits).toBe(300);

        const subtractCredits = await api.inject({
          headers: { authorization: `Bearer ${adminLogin.json().accessToken}` },
          method: "POST",
          payload: {
            credits: 120,
            direction: "subtract",
            reason: "manual subtract",
            tenantId: targetUser.currentTenant.id,
          },
          url: `/api/v2/admin/users/${targetUser.user.id}/adjust-credits`,
        });
        expect(subtractCredits.statusCode).toBe(200);
        expect(subtractCredits.json().account.balanceCredits).toBe(180);

        const disable = await api.inject({
          headers: { authorization: `Bearer ${adminLogin.json().accessToken}` },
          method: "PATCH",
          payload: { status: "disabled" },
          url: `/api/v2/admin/users/${targetUser.user.id}/status`,
        });
        expect(disable.statusCode).toBe(200);
        expect(disable.json().status).toBe("disabled");

        const disabledLogin = await api.inject({
          method: "POST",
          payload: {
            email: "disabled-user@example.com",
            password: "StrongPass123!",
            tenantId: targetUser.currentTenant.id,
          },
          url: "/api/v2/auth/login",
        });
        expect(disabledLogin.statusCode).toBe(401);

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
