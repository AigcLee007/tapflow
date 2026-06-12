import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, test } from "vitest";

import { createPgPool, withTenantTransaction } from "@aigc-flow/db";
import type { StorageProvider } from "@aigc-flow/storage";

import { buildApp } from "../src/app.js";
import type { ApiEnv } from "../src/config/env.js";
import { hashPassword } from "../src/modules/auth/password.js";
import { runMigrations } from "../../../packages/db/src/migrator.js";
import { hasDatabaseEnv, withDatabase } from "../../../packages/db/test/helpers.js";

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

class MemoryStorageProvider implements StorageProvider {
  async putObject(): Promise<void> {}
  async headObject() {
    return {
      contentLength: null,
      contentType: null,
      eTag: null,
      lastModified: null,
      metadata: {},
    };
  }
  async deleteObject(): Promise<void> {}
  async createPresignedPutUrl() {
    return {
      expiresAt: new Date(Date.now() + 900000).toISOString(),
      headers: {},
      method: "PUT" as const,
      url: "memory://put",
    };
  }
  async createPresignedGetUrl() {
    return {
      expiresAt: new Date(Date.now() + 900000).toISOString(),
      headers: {},
      method: "GET" as const,
      url: "memory://get",
    };
  }
}

afterAll(() => {
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
});

function buildTestApp(pool: ReturnType<typeof createPgPool>) {
  return buildApp({
    env: testEnv,
    logger: false,
    pool,
    storageProvider: new MemoryStorageProvider(),
  });
}

async function registerOwner(
  api: ReturnType<typeof buildTestApp>,
  email: string,
  tenantName: string,
) {
  const response = await api.inject({
    method: "POST",
    payload: {
      email,
      password: "StrongPass123!",
      tenantName,
    },
    url: "/api/v2/auth/register",
  });

  expect(response.statusCode).toBe(201);
  return response.json();
}

describeWithDatabase("ai route test API", () => {
  test("runs route health checks, stores summaries, and honors permissions", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();

      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });
        const api = buildTestApp(appPool);
        const owner = await registerOwner(api, "route-test-owner@example.com", "Route Test Owner");

        const install = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "POST",
          payload: {
            credential: {
              name: "Mock Route Test Key",
              secret: "mock-route-test-secret",
            },
            publishImmediately: true,
          },
          url: "/api/v2/admin/ai/plugins/mock.local-dev.image/install",
        });
        expect(install.statusCode).toBe(201);

        const routes = await adminPool.query<{ id: string; route_key: string }>(
          `
            SELECT id::text AS id, route_key
            FROM ai_routes
            WHERE tenant_id = $1::uuid
              AND route_key IN ('image.default', 'image.fail')
            ORDER BY route_key ASC
          `,
          [owner.currentTenant.id],
        );
        const successRoute = routes.rows.find((route) => route.route_key === "image.default");
        const failRoute = routes.rows.find((route) => route.route_key === "image.fail");
        expect(successRoute?.id).toBeTruthy();
        expect(failRoute?.id).toBeTruthy();

        const successTest = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "POST",
          payload: {
            prompt: "mock route health check",
          },
          url: `/api/v2/admin/ai/routes/${successRoute?.id}/test`,
        });
        expect(successTest.statusCode).toBe(200);
        expect(successTest.json()).toMatchObject({
          routeId: successRoute?.id,
          routeKey: "image.default",
          status: "ok",
        });
        expect(successTest.json().responseSummary).toMatchObject({
          apiMode: "mock",
          connectionName: null,
          outputCount: 1,
          providerKey: "mock-local-dev",
          status: "succeeded",
          upstreamModel: "mock-image",
        });
        expect(successTest.json().requestSummary).toMatchObject({
          apiMode: "mock",
          providerKey: "mock-local-dev",
          routeKey: "image.default",
          upstreamModel: "mock-image",
        });
        expect(JSON.stringify(successTest.json())).not.toContain("mock-route-test-secret");
        expect(JSON.stringify(successTest.json())).not.toContain("iVBORw0KGgo");

        const failedTest = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "POST",
          url: `/api/v2/admin/ai/routes/${failRoute?.id}/test`,
        });
        expect(failedTest.statusCode).toBe(200);
        expect(failedTest.json()).toMatchObject({
          routeId: failRoute?.id,
          routeKey: "image.fail",
          status: "failed",
        });
        expect(failedTest.json().error).toMatchObject({
          code: "PROVIDER_BAD_REQUEST",
        });

        const healthRows = await adminPool.query<{
          error: Record<string, unknown> | null;
          response_summary: Record<string, unknown>;
          status: string;
        }>(
          `
            SELECT status, response_summary, error
            FROM ai_route_health_checks
            WHERE tenant_id = $1::uuid
            ORDER BY created_at ASC
          `,
          [owner.currentTenant.id],
        );
        expect(healthRows.rows.map((row) => row.status)).toEqual(["ok", "failed"]);
        expect(JSON.stringify(healthRows.rows)).not.toContain("mock-route-test-secret");
        expect(JSON.stringify(healthRows.rows)).not.toContain("iVBORw0KGgo");

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
              [viewerUserId, "route-test-viewer@example.com", "Route Test Viewer", viewerPasswordHash],
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
            email: "route-test-viewer@example.com",
            password: viewerPassword,
          },
          url: "/api/v2/auth/login",
        });
        expect(viewerLogin.statusCode).toBe(200);

        const forbiddenTest = await api.inject({
          headers: {
            authorization: `Bearer ${viewerLogin.json().accessToken}`,
          },
          method: "POST",
          url: `/api/v2/admin/ai/routes/${successRoute?.id}/test`,
        });
        expect(forbiddenTest.statusCode).toBe(403);

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });
});
