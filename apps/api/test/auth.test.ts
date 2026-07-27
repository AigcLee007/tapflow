import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, test } from "vitest";

import { createPgPool, withTenantTransaction } from "@aigc-flow/db";

import type { ApiEnv } from "../src/config/env.js";
import { requireAuth, requirePermission } from "../src/http/auth-middleware.js";
import { buildApp } from "../src/app.js";
import type {
  AuthEmailSender,
  SendVerificationCodeInput,
} from "../src/modules/auth/auth-email-sender.js";
import { hashPassword } from "../src/modules/auth/password.js";
import { resolvePermissionsForTenant } from "../src/modules/auth/permission-resolver.js";
import { hashRefreshToken } from "../src/modules/auth/token.js";
import { runMigrations } from "../../../packages/db/src/migrator.js";
import {
  hasDatabaseEnv,
  withDatabase,
} from "../../../packages/db/test/helpers.js";

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

class CapturingAuthEmailSender implements AuthEmailSender {
  readonly messages: SendVerificationCodeInput[] = [];
  failNextDelivery = false;

  async sendVerificationCode(input: SendVerificationCodeInput): Promise<void> {
    if (this.failNextDelivery) {
      this.failNextDelivery = false;
      throw new Error("test delivery failure");
    }
    this.messages.push(input);
  }

  latestCode(email: string): string | undefined {
    return [...this.messages].reverse().find((item) => item.email === email)?.code;
  }
}

function buildTestApp(pool: ReturnType<typeof createPgPool>) {
  const authEmailSender = new CapturingAuthEmailSender();
  const api = buildApp({
    authEmailSender,
    env: testEnv,
    logger: false,
    pool,
  });

  api.get(
    "/api/v2/test/flow-update",
    {
      preHandler: [requireAuth, requirePermission("flow:update")],
    },
    async () => ({ ok: true }),
  );

  return { api, authEmailSender };
}

type TestApp = ReturnType<typeof buildTestApp>;

async function registerAndVerify(
  testApp: TestApp,
  payload: {
    displayName?: string;
    email: string;
    password: string;
    tenantName: string;
  },
) {
  const registration = await testApp.api.inject({
    method: "POST",
    payload,
    url: "/api/v2/auth/register",
  });
  expect(registration.statusCode).toBe(202);
  const code = testApp.authEmailSender.latestCode(payload.email);
  expect(code).toMatch(/^\d{6}$/);
  const verified = await testApp.api.inject({
    method: "POST",
    payload: {
      challengeToken: registration.json().challengeToken,
      code,
    },
    url: "/api/v2/auth/email/verify",
  });
  expect(verified.statusCode).toBe(200);
  return verified;
}

describeWithDatabase("auth v2", () => {
  test("register creates a pending email challenge without a session", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();

      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });
        const { api, authEmailSender } = buildTestApp(appPool);

        const response = await api.inject({
          method: "POST",
          payload: {
            displayName: "Alice",
            email: "alice@example.com",
            password: "StrongPass123!",
            tenantName: "Alice Tenant",
          },
          url: "/api/v2/auth/register",
        });

        expect(response.statusCode).toBe(202);
        const body = response.json();
        expect(body).toMatchObject({
          status: "verification_required",
          emailMasked: "a***@example.com",
          expiresInSeconds: 600,
          resendAvailableInSeconds: 60,
          reason: "email_unverified",
        });
        expect(body.challengeToken).toEqual(expect.any(String));
        expect(body.accessToken).toBeUndefined();
        expect(body.refreshToken).toBeUndefined();
        expect(authEmailSender.latestCode("alice@example.com")).toMatch(/^\d{6}$/);

        const userRecord = await adminPool.query<{
          password_hash: string;
          user_id: string;
        }>(
          `
            SELECT id::text AS user_id, password_hash
            FROM users
            WHERE email = $1
          `,
          ["alice@example.com"],
        );
        expect(userRecord.rows[0]?.password_hash).toBeTruthy();
        expect(userRecord.rows[0]?.password_hash).not.toBe("StrongPass123!");

        const membership = await adminPool.query<{ role_key: string }>(
          `
            SELECT role_key
            FROM tenant_memberships
            WHERE user_id = $1::uuid
          `,
          [userRecord.rows[0]?.user_id],
        );
        expect(membership.rows[0]?.role_key).toBe("tenant_owner");

        const sessionCount = await adminPool.query<{ total: number }>(
          "SELECT COUNT(*)::int AS total FROM auth_sessions",
        );
        expect(sessionCount.rows[0]?.total).toBe(0);

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("email verification consumes the challenge and creates one trusted session", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();
      try {
        await runMigrations(adminPool);
        appPool = createPgPool({ connectionString: await createAppDatabaseUrl() });
        const testApp = buildTestApp(appPool);
        const registration = await testApp.api.inject({
          method: "POST",
          payload: {
            email: "verify@example.com",
            password: "StrongPass123!",
            tenantName: "Verify Tenant",
          },
          url: "/api/v2/auth/register",
        });
        const challengeToken = registration.json().challengeToken;
        const code = testApp.authEmailSender.latestCode("verify@example.com");

        const verified = await testApp.api.inject({
          method: "POST",
          payload: { challengeToken, code },
          url: "/api/v2/auth/email/verify",
        });
        expect(verified.statusCode).toBe(200);
        expect(verified.json()).toMatchObject({
          accessToken: expect.any(String),
          refreshToken: expect.any(String),
          trustedDeviceToken: expect.any(String),
        });

        const state = await adminPool.query<{
          sessions: number;
          trusted_devices: number;
          verified: boolean;
        }>(`
          SELECT
            (SELECT COUNT(*)::int FROM auth_sessions) AS sessions,
            (SELECT COUNT(*)::int FROM auth_trusted_devices) AS trusted_devices,
            (SELECT email_verified_at IS NOT NULL FROM users WHERE email = 'verify@example.com') AS verified
        `);
        expect(state.rows[0]).toMatchObject({
          sessions: 1,
          trusted_devices: 1,
          verified: true,
        });

        const replay = await testApp.api.inject({
          method: "POST",
          payload: { challengeToken, code },
          url: "/api/v2/auth/email/verify",
        });
        expect(replay.statusCode).toBe(410);
        expect(replay.json().error.code).toBe("VERIFICATION_EXPIRED");
        await testApp.api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("verification attempts decrement atomically and stop after five failures", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();
      try {
        await runMigrations(adminPool);
        appPool = createPgPool({ connectionString: await createAppDatabaseUrl() });
        const testApp = buildTestApp(appPool);
        const registration = await testApp.api.inject({
          method: "POST",
          payload: {
            email: "attempts@example.com",
            password: "StrongPass123!",
            tenantName: "Attempts Tenant",
          },
          url: "/api/v2/auth/register",
        });
        const challengeToken = registration.json().challengeToken;
        const actualCode = testApp.authEmailSender.latestCode("attempts@example.com");
        const wrongCode = actualCode === "000000" ? "999999" : "000000";

        const first = await testApp.api.inject({
          method: "POST",
          payload: { challengeToken, code: wrongCode },
          url: "/api/v2/auth/email/verify",
        });
        expect(first.statusCode).toBe(400);
        const remaining = await adminPool.query<{ attempts_remaining: number }>(
          "SELECT attempts_remaining FROM auth_email_challenges LIMIT 1",
        );
        expect(remaining.rows[0]?.attempts_remaining).toBe(4);

        let last = first;
        for (let attempt = 0; attempt < 4; attempt += 1) {
          last = await testApp.api.inject({
            method: "POST",
            payload: { challengeToken, code: wrongCode },
            url: "/api/v2/auth/email/verify",
          });
        }
        expect(last.statusCode).toBe(429);
        expect(last.json().error.code).toBe("VERIFICATION_ATTEMPTS_EXHAUSTED");
        const sessionCount = await adminPool.query<{ total: number }>(
          "SELECT COUNT(*)::int AS total FROM auth_sessions",
        );
        expect(sessionCount.rows[0]?.total).toBe(0);
        await testApp.api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("resend enforces cooldown, replaces the code, and expired challenges fail", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();
      try {
        await runMigrations(adminPool);
        appPool = createPgPool({ connectionString: await createAppDatabaseUrl() });
        const testApp = buildTestApp(appPool);
        const registration = await testApp.api.inject({
          method: "POST",
          payload: {
            email: "resend@example.com",
            password: "StrongPass123!",
            tenantName: "Resend Tenant",
          },
          url: "/api/v2/auth/register",
        });
        const challengeToken = registration.json().challengeToken;
        const oldCode = testApp.authEmailSender.latestCode("resend@example.com");

        const cooldown = await testApp.api.inject({
          method: "POST",
          payload: { challengeToken },
          url: "/api/v2/auth/email/resend",
        });
        expect(cooldown.statusCode).toBe(429);
        expect(cooldown.json().error.code).toBe("VERIFICATION_RESEND_COOLDOWN");

        await adminPool.query(
          "UPDATE auth_email_challenges SET last_sent_at = now() - interval '61 seconds'",
        );
        const resent = await testApp.api.inject({
          method: "POST",
          payload: { challengeToken },
          url: "/api/v2/auth/email/resend",
        });
        expect(resent.statusCode).toBe(200);
        const newCode = testApp.authEmailSender.latestCode("resend@example.com");
        expect(newCode).toMatch(/^\d{6}$/);
        expect(newCode).not.toBe(oldCode);

        const oldCodeResult = await testApp.api.inject({
          method: "POST",
          payload: { challengeToken, code: oldCode },
          url: "/api/v2/auth/email/verify",
        });
        expect(oldCodeResult.statusCode).toBe(400);

        await adminPool.query(
          "UPDATE auth_email_challenges SET expires_at = now() - interval '1 second'",
        );
        const expired = await testApp.api.inject({
          method: "POST",
          payload: { challengeToken, code: newCode },
          url: "/api/v2/auth/email/verify",
        });
        expect(expired.statusCode).toBe(410);
        expect(expired.json().error.code).toBe("VERIFICATION_EXPIRED");
        await testApp.api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("resend delivery failure returns 503 without creating a session", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();
      try {
        await runMigrations(adminPool);
        appPool = createPgPool({ connectionString: await createAppDatabaseUrl() });
        const testApp = buildTestApp(appPool);
        const registration = await testApp.api.inject({
          method: "POST",
          payload: {
            email: "delivery-failure@example.com",
            password: "StrongPass123!",
            tenantName: "Delivery Failure Tenant",
          },
          url: "/api/v2/auth/register",
        });
        await adminPool.query(
          "UPDATE auth_email_challenges SET last_sent_at = now() - interval '61 seconds'",
        );
        testApp.authEmailSender.failNextDelivery = true;
        const resend = await testApp.api.inject({
          method: "POST",
          payload: { challengeToken: registration.json().challengeToken },
          url: "/api/v2/auth/email/resend",
        });
        expect(resend.statusCode).toBe(503);
        expect(resend.json().error.code).toBe("EMAIL_DELIVERY_FAILED");
        const sessionCount = await adminPool.query<{ total: number }>(
          "SELECT COUNT(*)::int AS total FROM auth_sessions",
        );
        expect(sessionCount.rows[0]?.total).toBe(0);
        await testApp.api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("login succeeds with the right password and rejects the wrong password", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();
      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });
        const testApp = buildTestApp(appPool);
        const { api } = testApp;

        await registerAndVerify(testApp, {
            email: "login@example.com",
            password: "StrongPass123!",
            tenantName: "Login Tenant",
        });

        const success = await api.inject({
          method: "POST",
          payload: {
            email: "login@example.com",
            password: "StrongPass123!",
          },
          url: "/api/v2/auth/login",
        });

        expect(success.statusCode).toBe(200);
        const successBody = success.json();
        expect(successBody.currentTenant).toMatchObject({
          name: "Login Tenant",
        });
        expect(successBody.permissions).toContain("flow:update");

        const failure = await api.inject({
          method: "POST",
          payload: {
            email: "login@example.com",
            password: "wrong-password",
          },
          url: "/api/v2/auth/login",
        });

        expect(failure.statusCode).toBe(401);
        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("refresh rotates the token and logout revokes the session", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();
      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });
        const testApp = buildTestApp(appPool);
        const { api } = testApp;

        const register = await registerAndVerify(testApp, {
            email: "refresh@example.com",
            password: "StrongPass123!",
            tenantName: "Refresh Tenant",
        });
        const registerBody = register.json();

        const refreshed = await api.inject({
          method: "POST",
          payload: {
            refreshToken: registerBody.refreshToken,
          },
          url: "/api/v2/auth/refresh",
        });

        expect(refreshed.statusCode).toBe(200);
        const refreshedBody = refreshed.json();
        expect(refreshedBody.refreshToken).not.toBe(registerBody.refreshToken);

        const oldToken = await adminPool.query<{ revoked: boolean }>(
          `
            SELECT revoked_at IS NOT NULL AS revoked
            FROM refresh_tokens
            WHERE token_hash = $1
          `,
          [hashRefreshToken(registerBody.refreshToken)],
        );
        expect(oldToken.rows[0]?.revoked).toBe(true);

        const reusedOldToken = await api.inject({
          method: "POST",
          payload: {
            refreshToken: registerBody.refreshToken,
          },
          url: "/api/v2/auth/refresh",
        });
        expect(reusedOldToken.statusCode).toBe(401);

        const logout = await api.inject({
          headers: {
            authorization: `Bearer ${refreshedBody.accessToken}`,
          },
          method: "POST",
          payload: {
            refreshToken: refreshedBody.refreshToken,
          },
          url: "/api/v2/auth/logout",
        });
        expect(logout.statusCode).toBe(200);

        const afterLogout = await api.inject({
          method: "POST",
          payload: {
            refreshToken: refreshedBody.refreshToken,
          },
          url: "/api/v2/auth/refresh",
        });
        expect(afterLogout.statusCode).toBe(401);

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("concurrent refresh requests can consume the same refresh token at most once", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();
      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });
        const testApp = buildTestApp(appPool);
        const { api } = testApp;

        const register = await registerAndVerify(testApp, {
            email: "refresh-race@example.com",
            password: "StrongPass123!",
            tenantName: "Refresh Race Tenant",
        });
        expect(register.statusCode).toBe(200);
        const registerBody = register.json();
        const oldTokenHash = hashRefreshToken(registerBody.refreshToken);

        const results = await Promise.all([
          api.inject({
            method: "POST",
            payload: {
              refreshToken: registerBody.refreshToken,
            },
            url: "/api/v2/auth/refresh",
          }),
          api.inject({
            method: "POST",
            payload: {
              refreshToken: registerBody.refreshToken,
            },
            url: "/api/v2/auth/refresh",
          }),
        ]);

        const successResponses = results.filter((response) => response.statusCode === 200);
        const failedResponses = results.filter((response) => response.statusCode === 401);

        expect(successResponses).toHaveLength(1);
        expect(failedResponses).toHaveLength(1);

        const oldToken = await adminPool.query<{ id: string; revoked: boolean }>(
          `
            SELECT
              id::text AS id,
              revoked_at IS NOT NULL AS revoked
            FROM refresh_tokens
            WHERE token_hash = $1
          `,
          [oldTokenHash],
        );
        expect(oldToken.rows[0]?.revoked).toBe(true);

        const rotations = await adminPool.query<{ total: number }>(
          `
            SELECT COUNT(*)::int AS total
            FROM refresh_tokens
            WHERE rotated_from_token_id = $1::uuid
              AND revoked_at IS NULL
          `,
          [oldToken.rows[0]?.id],
        );
        expect(rotations.rows[0]?.total).toBe(1);

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("me returns the authenticated user and tenant owner can pass flow:update guard", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();
      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });
        const testApp = buildTestApp(appPool);
        const { api } = testApp;

        const anonymous = await api.inject({
          method: "GET",
          url: "/api/v2/auth/me",
        });
        expect(anonymous.statusCode).toBe(401);

        const register = await registerAndVerify(testApp, {
            displayName: "Owner User",
            email: "owner@example.com",
            password: "StrongPass123!",
            tenantName: "Owner Tenant",
        });
        const registerBody = register.json();

        const me = await api.inject({
          headers: {
            authorization: `Bearer ${registerBody.accessToken}`,
          },
          method: "GET",
          url: "/api/v2/auth/me",
        });

        expect(me.statusCode).toBe(200);
        const meBody = me.json();
        expect(meBody.user.email).toBe("owner@example.com");
        expect(meBody.currentTenant.name).toBe("Owner Tenant");
        expect(meBody.permissions).toContain("flow:update");
        expect(meBody.roles).toContain("tenant_owner");

        const protectedRoute = await api.inject({
          headers: {
            authorization: `Bearer ${registerBody.accessToken}`,
          },
          method: "GET",
          url: "/api/v2/test/flow-update",
        });
        expect(protectedRoute.statusCode).toBe(200);

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("viewer lacks flow:update and cannot resolve another tenant's permissions", async () => {
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

        const viewerUserId = randomUUID();
        const viewerTenantId = randomUUID();
        const viewerPassword = "ViewerPass123!";
        const viewerPasswordHash = await hashPassword(viewerPassword);

        await withTenantTransaction(
          { tenantId: viewerTenantId, userId: viewerUserId },
          async (client) => {
            await client.query(
              `
                INSERT INTO users (id, email, display_name, password_hash, updated_at)
                VALUES ($1::uuid, $2, $3, $4, now())
              `,
              [viewerUserId, "viewer@example.com", "Viewer User", viewerPasswordHash],
            );
            await client.query(
              "INSERT INTO tenants (id, name, slug, updated_at) VALUES ($1, $2, $3, now())",
              [viewerTenantId, "Viewer Tenant", "viewer-tenant"],
            );
            await client.query(
              `
                INSERT INTO tenant_memberships (tenant_id, user_id, role_key, status, joined_at, updated_at)
                VALUES ($1, $2, 'viewer', 'active', now(), now())
              `,
              [viewerTenantId, viewerUserId],
            );
          },
          appPool,
        );

        const otherUserEmail = "other-owner@example.com";
        await api.inject({
          method: "POST",
          payload: {
            email: otherUserEmail,
            password: "OtherPass123!",
            tenantName: "Other Tenant",
          },
          url: "/api/v2/auth/register",
        });
        const otherTenant = await adminPool.query<{ id: string }>(
          "SELECT id::text AS id FROM tenants WHERE name = $1 ORDER BY created_at DESC LIMIT 1",
          ["Other Tenant"],
        );
        const actualOtherTenantId = otherTenant.rows[0]?.id;
        expect(actualOtherTenantId).toBeTruthy();

        const login = await api.inject({
          method: "POST",
          payload: {
            email: "viewer@example.com",
            password: viewerPassword,
          },
          url: "/api/v2/auth/login",
        });
        expect(login.statusCode).toBe(200);
        const loginBody = login.json();
        expect(loginBody.permissions).not.toContain("flow:update");

        const forbiddenRoute = await api.inject({
          headers: {
            authorization: `Bearer ${loginBody.accessToken}`,
          },
          method: "GET",
          url: "/api/v2/test/flow-update",
        });
        expect(forbiddenRoute.statusCode).toBe(403);

        const crossTenantLogin = await api.inject({
          method: "POST",
          payload: {
            email: "viewer@example.com",
            password: viewerPassword,
            tenantId: actualOtherTenantId,
          },
          url: "/api/v2/auth/login",
        });
        expect(crossTenantLogin.statusCode).toBe(403);

        const ownPermissions = await resolvePermissionsForTenant(
          {
            tenantId: viewerTenantId,
            userId: viewerUserId,
          },
          appPool,
        );
        expect(ownPermissions.permissions).toContain("flow:read");
        expect(ownPermissions.permissions).not.toContain("flow:update");

        const crossTenantPermissions = await resolvePermissionsForTenant(
          {
            tenantId: actualOtherTenantId,
            userId: viewerUserId,
          },
          appPool,
        );
        expect(crossTenantPermissions).toEqual({
          permissions: [],
          roles: [],
        });

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });
});
