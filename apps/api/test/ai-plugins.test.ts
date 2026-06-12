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

describeWithDatabase("ai plugin admin API", () => {
  test("installs, publishes, disables, and lists a builtin plugin without leaking secrets", async () => {
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
        const owner = await registerOwner(api, "plugin-owner@example.com", "Plugin Owner");

        const listBefore = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "GET",
          url: "/api/v2/admin/ai/plugins",
        });
        expect(listBefore.statusCode).toBe(200);
        expect(listBefore.json().map((item: { packageKey: string }) => item.packageKey)).toContain(
          "pixellelabs.nano-banana-pro",
        );

        const install = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "POST",
          payload: {
            credential: {
              name: "PixelleLabs Pro Test Key",
              secret: "pixellelabs-pro-test-secret",
            },
            publishImmediately: true,
          },
          url: "/api/v2/admin/ai/plugins/pixellelabs.nano-banana-pro/install",
        });
        expect(install.statusCode).toBe(201);
        expect(install.json()).toMatchObject({
          catalogModelKeys: ["gemini-3-pro-image-preview"],
          packageKey: "pixellelabs.nano-banana-pro",
          routeKeys: ["image.pixellelabs.nano-banana-pro"],
          status: "published",
        });
        expect(JSON.stringify(install.json())).not.toContain("pixellelabs-pro-test-secret");

        const dbState = await adminPool.query<{
          connection_adapter_kind: string | null;
          connection_count: string;
          connection_metadata_generated_by: string | null;
          connection_name: string | null;
          catalog_active_count: string;
          credential_secret_contains_raw: boolean;
          pricing_count: string;
          provider_key: string;
          route_api_mode: string | null;
          route_active_count: string;
          route_connection_matches: boolean;
          route_request_path: string | null;
          route_upstream_model: string | null;
        }>(
          `
            SELECT
              (SELECT key FROM ai_providers WHERE key = 'pixellelabs') AS provider_key,
              (
                SELECT COUNT(*)::text
                FROM ai_provider_connections
                WHERE tenant_id = $1::uuid
                  AND provider_id = (SELECT provider_id FROM tenant_ai_plugin_installs WHERE id = $2::uuid)
              ) AS connection_count,
              (
                SELECT name
                FROM ai_provider_connections
                WHERE tenant_id = $1::uuid
                  AND provider_id = (SELECT provider_id FROM tenant_ai_plugin_installs WHERE id = $2::uuid)
                ORDER BY created_at ASC
                LIMIT 1
              ) AS connection_name,
              (
                SELECT adapter_kind
                FROM ai_provider_connections
                WHERE tenant_id = $1::uuid
                  AND provider_id = (SELECT provider_id FROM tenant_ai_plugin_installs WHERE id = $2::uuid)
                ORDER BY created_at ASC
                LIMIT 1
              ) AS connection_adapter_kind,
              (
                SELECT metadata->>'generatedBy'
                FROM ai_provider_connections
                WHERE tenant_id = $1::uuid
                  AND provider_id = (SELECT provider_id FROM tenant_ai_plugin_installs WHERE id = $2::uuid)
                ORDER BY created_at ASC
                LIMIT 1
              ) AS connection_metadata_generated_by,
              (
                SELECT COUNT(*)::text
                FROM ai_routes
                WHERE tenant_id = $1::uuid
                  AND plugin_install_id = $2::uuid
                  AND status = 'active'
              ) AS route_active_count,
              (
                SELECT connection_id IS NOT NULL
                FROM ai_routes
                WHERE tenant_id = $1::uuid
                  AND plugin_install_id = $2::uuid
                LIMIT 1
              ) AS route_connection_matches,
              (
                SELECT api_mode
                FROM ai_routes
                WHERE tenant_id = $1::uuid
                  AND plugin_install_id = $2::uuid
                LIMIT 1
              ) AS route_api_mode,
              (
                SELECT upstream_model
                FROM ai_routes
                WHERE tenant_id = $1::uuid
                  AND plugin_install_id = $2::uuid
                LIMIT 1
              ) AS route_upstream_model,
              (
                SELECT request_path
                FROM ai_routes
                WHERE tenant_id = $1::uuid
                  AND plugin_install_id = $2::uuid
                LIMIT 1
              ) AS route_request_path,
              (
                SELECT COUNT(*)::text
                FROM ai_model_catalog
                WHERE tenant_id = $1::uuid
                  AND plugin_install_id = $2::uuid
                  AND status = 'active'
              ) AS catalog_active_count,
              (
                SELECT COUNT(*)::text
                FROM model_pricing
                WHERE provider = 'pixellelabs'
                  AND model = 'gemini-3-pro-image-preview'
                  AND active = true
              ) AS pricing_count,
              EXISTS (
                SELECT 1
                FROM api_credentials
                WHERE id = $3::uuid
                  AND encode(encrypted_secret, 'escape') LIKE '%pixellelabs-pro-test-secret%'
              ) AS credential_secret_contains_raw
          `,
          [owner.currentTenant.id, install.json().id, install.json().credentialId],
        );
        expect(dbState.rows[0]).toEqual({
          catalog_active_count: "1",
          connection_adapter_kind: "sync",
          connection_count: "1",
          connection_metadata_generated_by: "template-install",
          connection_name: "Nano Banana Pro Connection",
          credential_secret_contains_raw: false,
          pricing_count: "1",
          provider_key: "pixellelabs",
          route_api_mode: "sync",
          route_active_count: "1",
          route_connection_matches: true,
          route_request_path: "/v1beta/models/gemini-3-pro-image-preview:generateContent",
          route_upstream_model: "gemini-3-pro-image-preview",
        });

        const listAfterInstall = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "GET",
          url: "/api/v2/admin/ai/plugins/pixellelabs.nano-banana-pro",
        });
        expect(listAfterInstall.statusCode).toBe(200);
        expect(listAfterInstall.json().install).toMatchObject({
          id: install.json().id,
          status: "published",
        });

        const disable = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "POST",
          url: `/api/v2/admin/ai/plugins/${install.json().id}/disable`,
        });
        expect(disable.statusCode).toBe(200);
        expect(disable.json().status).toBe("disabled");

        const disabledRoutes = await adminPool.query<{ inactive_count: string }>(
          `
            SELECT COUNT(*)::text AS inactive_count
            FROM ai_routes
            WHERE tenant_id = $1::uuid
              AND plugin_install_id = $2::uuid
              AND status = 'inactive'
          `,
          [owner.currentTenant.id, install.json().id],
        );
        expect(disabledRoutes.rows[0]?.inactive_count).toBe("1");

        const publish = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "POST",
          url: `/api/v2/admin/ai/plugins/${install.json().id}/publish`,
        });
        expect(publish.statusCode).toBe(200);
        expect(publish.json().status).toBe("published");

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
              [viewerUserId, "plugin-viewer@example.com", "Plugin Viewer", viewerPasswordHash],
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
            email: "plugin-viewer@example.com",
            password: viewerPassword,
          },
          url: "/api/v2/auth/login",
        });
        expect(viewerLogin.statusCode).toBe(200);

        const forbiddenInstall = await api.inject({
          headers: {
            authorization: `Bearer ${viewerLogin.json().accessToken}`,
          },
          method: "POST",
          payload: {
            publishImmediately: true,
          },
          url: "/api/v2/admin/ai/plugins/pixellelabs.nano-banana-pro/install",
        });
        expect(forbiddenInstall.statusCode).toBe(403);

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });
});
