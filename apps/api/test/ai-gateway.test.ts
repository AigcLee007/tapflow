import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { afterAll, describe, expect, test } from "vitest";

import { createPgPool, withTenantTransaction } from "@aigc-flow/db";
import type { StorageProvider } from "@aigc-flow/storage";

import type { ApiEnv } from "../src/config/env.js";
import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/modules/auth/password.js";
import { runMigrations } from "../../../packages/db/src/migrator.js";
import { hasDatabaseEnv, withDatabase } from "../../../packages/db/test/helpers.js";
import { currentLegalConsent } from "./legal-consent.fixture.js";

const originalDatabaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = hasDatabaseEnv() ? describe : describe.skip;
const openServers = new Set<ReturnType<typeof createServer>>();

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

async function withMockProvider(
  handler: Parameters<typeof createServer>[0],
): Promise<{ close: () => Promise<void>; url: string }> {
  const server = createServer(handler);
  openServers.add(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected a TCP server address");
  }

  return {
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      openServers.delete(server);
    },
    url: `http://127.0.0.1:${address.port}`,
  };
}

afterAll(() => {
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
});

afterAll(async () => {
  for (const server of openServers) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    openServers.delete(server);
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
      consent: currentLegalConsent,
      tenantName,
    },
    url: "/api/v2/auth/register",
  });

  expect(response.statusCode).toBe(201);
  return response.json();
}

async function createTextRuntimeFixture(options: {
  accessToken: string;
  api: ReturnType<typeof buildTestApp>;
  baseUrl: string;
  modelKey?: string;
  routeKey: string;
}) {
  const provider = await options.api.inject({
    headers: {
      authorization: `Bearer ${options.accessToken}`,
    },
    method: "POST",
    payload: {
      defaultBaseUrl: options.baseUrl,
      key: `${options.routeKey}-provider`,
      kind: "openai-compatible",
      name: `${options.routeKey} Provider`,
    },
    url: "/api/v2/admin/ai/providers",
  });
  expect(provider.statusCode).toBe(201);

  const providerBody = provider.json();
  const model = await options.api.inject({
    headers: {
      authorization: `Bearer ${options.accessToken}`,
    },
    method: "POST",
    payload: {
      displayName: `${options.routeKey} Model`,
      modality: "text",
      modelKey: options.modelKey ?? `${options.routeKey}-model`,
      providerId: providerBody.id,
    },
    url: "/api/v2/admin/ai/models",
  });
  expect(model.statusCode).toBe(201);

  const modelBody = model.json();
  const credential = await options.api.inject({
    headers: {
      authorization: `Bearer ${options.accessToken}`,
    },
    method: "POST",
    payload: {
      name: `${options.routeKey} Credential`,
      providerId: providerBody.id,
      secret: `sk-${options.routeKey}-secret`,
    },
    url: "/api/v2/admin/credentials",
  });
  expect(credential.statusCode).toBe(201);

  const credentialBody = credential.json();
  const route = await options.api.inject({
    headers: {
      authorization: `Bearer ${options.accessToken}`,
    },
    method: "POST",
    payload: {
      credentialId: credentialBody.id,
      modality: "text",
      modelId: modelBody.id,
      providerId: providerBody.id,
      routeKey: options.routeKey,
    },
    url: "/api/v2/admin/ai/routes",
  });
  expect(route.statusCode).toBe(201);

  return {
    credential: credentialBody,
    model: modelBody,
    provider: providerBody,
    route: route.json(),
  };
}

describeWithDatabase("ai gateway admin API", () => {
  test("credential create stores only encrypted data and GET returns maskedSecret", async () => {
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
        const owner = await registerOwner(api, "gateway-owner@example.com", "Gateway Owner");

        const provider = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "POST",
          payload: {
            key: "openai-compatible",
            kind: "openai-compatible",
            name: "OpenAI Compatible",
          },
          url: "/api/v2/admin/ai/providers",
        });
        expect(provider.statusCode).toBe(201);
        const providerBody = provider.json();

        const createdCredential = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "POST",
          payload: {
            name: "Primary Key",
            providerId: providerBody.id,
            secret: "sk-primary-secret-abcd",
          },
          url: "/api/v2/admin/credentials",
        });
        expect(createdCredential.statusCode).toBe(201);
        expect(createdCredential.json()).toMatchObject({
          name: "Primary Key",
          providerId: providerBody.id,
          status: "active",
        });
        expect(createdCredential.json().maskedSecret).toMatch(/^.{1,3}\*{4}.+$/);
        expect(createdCredential.json()).not.toHaveProperty("secret");
        expect(createdCredential.json()).not.toHaveProperty("encrypted_secret");
        expect(createdCredential.json()).not.toHaveProperty("nonce");
        expect(createdCredential.json()).not.toHaveProperty("auth_tag");

        const dbCredential = await adminPool.query<{
          auth_tag_hex: string;
          encrypted_secret_b64: string;
          nonce_hex: string;
          rotated_at: string | null;
        }>(
          `
            SELECT
              encode(encrypted_secret, 'base64') AS encrypted_secret_b64,
              encode(nonce, 'hex') AS nonce_hex,
              encode(auth_tag, 'hex') AS auth_tag_hex,
              rotated_at::text AS rotated_at
            FROM api_credentials
            WHERE id = $1::uuid
          `,
          [createdCredential.json().id],
        );
        expect(dbCredential.rows[0]?.encrypted_secret_b64).toBeTruthy();
        expect(dbCredential.rows[0]?.encrypted_secret_b64).not.toContain("sk-primary-secret-abcd");
        expect(dbCredential.rows[0]?.nonce_hex).toBeTruthy();
        expect(dbCredential.rows[0]?.auth_tag_hex).toBeTruthy();
        expect(dbCredential.rows[0]?.rotated_at).toBeNull();

        const listedCredentials = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "GET",
          url: "/api/v2/admin/credentials",
        });
        expect(listedCredentials.statusCode).toBe(200);
        expect(listedCredentials.json()).toMatchObject([
          {
            id: createdCredential.json().id,
            maskedSecret: expect.any(String),
            name: "Primary Key",
          },
        ]);
        expect(listedCredentials.json()[0]).not.toHaveProperty("encrypted_secret");
        expect(listedCredentials.json()[0]).not.toHaveProperty("nonce");
        expect(listedCredentials.json()[0]).not.toHaveProperty("auth_tag");

        const guardedRoute = await adminPool.query<{ id: string }>(
          `INSERT INTO ai_routes (provider_id,credential_id,route_key,modality,status,route_label)
           VALUES ($1,$2,'image.credential-guard','image','inactive','Safe line') RETURNING id::text`,
          [providerBody.id, createdCredential.json().id],
        );
        const guardedDelete = await api.inject({ headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "DELETE", url: `/api/v2/admin/credentials/${createdCredential.json().id}` });
        expect(guardedDelete.statusCode).toBe(409);
        expect(guardedDelete.json().error).toMatchObject({ code: "CREDENTIAL_IN_USE", details: { routes: [{
          id: guardedRoute.rows[0].id, key: "image.credential-guard", label: "Safe line",
        }] } });
        expect(JSON.stringify(guardedDelete.json())).not.toContain("encrypted_secret");

        const beforeRotate = await adminPool.query<{
          encrypted_secret_b64: string;
        }>(
          `
            SELECT encode(encrypted_secret, 'base64') AS encrypted_secret_b64
            FROM api_credentials
            WHERE id = $1::uuid
          `,
          [createdCredential.json().id],
        );

        const rotatedCredential = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "POST",
          payload: {
            secret: "sk-rotated-secret-wxyz",
          },
          url: `/api/v2/admin/credentials/${createdCredential.json().id}/rotate`,
        });
        expect(rotatedCredential.statusCode).toBe(200);
        expect(rotatedCredential.json().maskedSecret).not.toBe(createdCredential.json().maskedSecret);

        const afterRotate = await adminPool.query<{
          encrypted_secret_b64: string;
          rotated_at: string | null;
        }>(
          `
            SELECT
              encode(encrypted_secret, 'base64') AS encrypted_secret_b64,
              rotated_at::text AS rotated_at
            FROM api_credentials
            WHERE id = $1::uuid
          `,
          [createdCredential.json().id],
        );
        expect(afterRotate.rows[0]?.encrypted_secret_b64).not.toBe(
          beforeRotate.rows[0]?.encrypted_secret_b64,
        );
        expect(afterRotate.rows[0]?.rotated_at).toBeTruthy();

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("provider/model/route management honors permissions and tenant isolation", async () => {
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
        const tenantAOwner = await registerOwner(api, "tenant-a-gateway@example.com", "Tenant A Gateway");
        const tenantBOwner = await registerOwner(api, "tenant-b-gateway@example.com", "Tenant B Gateway");

        const provider = await api.inject({
          headers: {
            authorization: `Bearer ${tenantAOwner.accessToken}`,
          },
          method: "POST",
          payload: {
            key: "provider-a",
            kind: "openai-compatible",
            name: "Provider A",
          },
          url: "/api/v2/admin/ai/providers",
        });
        expect(provider.statusCode).toBe(201);
        const providerBody = provider.json();

        const model = await api.inject({
          headers: {
            authorization: `Bearer ${tenantAOwner.accessToken}`,
          },
          method: "POST",
          payload: {
            displayName: "Model A",
            modality: "text",
            modelKey: "model-a",
            providerId: providerBody.id,
          },
          url: "/api/v2/admin/ai/models",
        });
        expect(model.statusCode).toBe(201);
        const modelBody = model.json();

        const credentialA = await api.inject({
          headers: {
            authorization: `Bearer ${tenantAOwner.accessToken}`,
          },
          method: "POST",
          payload: {
            name: "Tenant A Credential",
            providerId: providerBody.id,
            secret: "sk-tenant-a-credential",
          },
          url: "/api/v2/admin/credentials",
        });
        expect(credentialA.statusCode).toBe(201);
        const credentialABody = credentialA.json();

        const systemRoute = await adminPool.query<{ id: string }>(
          `
            INSERT INTO ai_routes (
              tenant_id,
              provider_id,
              model_id,
              route_key,
              modality
            )
            VALUES (
              NULL,
              $1::uuid,
              $2::uuid,
              'system-default',
              'text'
            )
            RETURNING id::text AS id
          `,
          [providerBody.id, modelBody.id],
        );
        expect(systemRoute.rows[0]?.id).toBeTruthy();

        const routeA = await api.inject({
          headers: {
            authorization: `Bearer ${tenantAOwner.accessToken}`,
          },
          method: "POST",
          payload: {
            credentialId: credentialABody.id,
            modality: "text",
            modelId: modelBody.id,
            providerId: providerBody.id,
            routeKey: "tenant-a-route",
          },
          url: "/api/v2/admin/ai/routes",
        });
        expect(routeA.statusCode).toBe(201);
        const routeABody = routeA.json();

        const credentialB = await api.inject({
          headers: {
            authorization: `Bearer ${tenantBOwner.accessToken}`,
          },
          method: "POST",
          payload: {
            name: "Tenant B Credential",
            providerId: providerBody.id,
            secret: "sk-tenant-b-credential",
          },
          url: "/api/v2/admin/credentials",
        });
        expect(credentialB.statusCode).toBe(201);
        const credentialBBody = credentialB.json();

        const routeB = await api.inject({
          headers: {
            authorization: `Bearer ${tenantBOwner.accessToken}`,
          },
          method: "POST",
          payload: {
            credentialId: credentialBBody.id,
            modality: "text",
            modelId: modelBody.id,
            providerId: providerBody.id,
            routeKey: "tenant-b-route",
          },
          url: "/api/v2/admin/ai/routes",
        });
        expect(routeB.statusCode).toBe(201);

        const listCredentialsA = await api.inject({
          headers: {
            authorization: `Bearer ${tenantAOwner.accessToken}`,
          },
          method: "GET",
          url: "/api/v2/admin/credentials",
        });
        expect(listCredentialsA.statusCode).toBe(200);
        expect(listCredentialsA.json().map((item: { name: string }) => item.name)).toEqual([
          "Tenant A Credential",
        ]);

        const connectionA = await api.inject({
          headers: {
            authorization: `Bearer ${tenantAOwner.accessToken}`,
          },
          method: "POST",
          payload: {
            adapterKind: "openai-compatible",
            baseUrl: "https://tenant-a.example.com/v1",
            credentialId: credentialABody.id,
            name: "Tenant A Connection",
            providerId: providerBody.id,
          },
          url: "/api/v2/admin/ai/connections",
        });
        expect(connectionA.statusCode).toBe(201);
        const connectionABody = connectionA.json();

        const connectionB = await api.inject({
          headers: {
            authorization: `Bearer ${tenantBOwner.accessToken}`,
          },
          method: "POST",
          payload: {
            adapterKind: "openai-compatible",
            baseUrl: "https://tenant-b.example.com/v1",
            credentialId: credentialBBody.id,
            name: "Tenant B Connection",
            providerId: providerBody.id,
          },
          url: "/api/v2/admin/ai/connections",
        });
        expect(connectionB.statusCode).toBe(201);
        const connectionBBody = connectionB.json();

        const listConnectionsA = await api.inject({
          headers: {
            authorization: `Bearer ${tenantAOwner.accessToken}`,
          },
          method: "GET",
          url: "/api/v2/admin/ai/connections",
        });
        expect(listConnectionsA.statusCode).toBe(200);
        expect(listConnectionsA.json().map((item: { name: string }) => item.name)).toEqual([
          "Tenant A Connection",
        ]);

        const imageModel = await api.inject({
          headers: {
            authorization: `Bearer ${tenantAOwner.accessToken}`,
          },
          method: "POST",
          payload: {
            displayName: "Image Model A",
            modality: "image",
            modelKey: "image-model-a",
            providerId: providerBody.id,
          },
          url: "/api/v2/admin/ai/models",
        });
        expect(imageModel.statusCode).toBe(201);
        const imageModelBody = imageModel.json();

        const imageRoute = await api.inject({
          headers: {
            authorization: `Bearer ${tenantAOwner.accessToken}`,
          },
          method: "POST",
          payload: {
            apiMode: "responses",
            connectionId: connectionABody.id,
            credentialId: credentialABody.id,
            internalLabel: "SiphonLab Backup",
            modality: "image",
            modelId: imageModelBody.id,
            providerId: providerBody.id,
            requestPath: "/responses",
            routeKey: "image.model-a.line2",
            routeLabel: "线路二",
            upstreamModel: "gpt-5.5",
          },
          url: "/api/v2/admin/ai/routes",
        });
        expect(imageRoute.statusCode).toBe(201);
        expect(imageRoute.json()).toMatchObject({
          apiMode: "responses",
          connectionId: connectionABody.id,
          internalLabel: "SiphonLab Backup",
          requestPath: "/responses",
          routeLabel: "线路二",
          upstreamModel: "gpt-5.5",
        });

        const updatedImageRoute = await api.inject({
          headers: {
            authorization: `Bearer ${tenantAOwner.accessToken}`,
          },
          method: "PATCH",
          payload: {
            apiMode: "images",
            internalLabel: "SiphonLab Main",
            requestPath: "/images/generations",
            routeLabel: "线路一",
            upstreamModel: "gpt-image-2",
          },
          url: `/api/v2/admin/ai/routes/${imageRoute.json().id}`,
        });
        expect(updatedImageRoute.statusCode).toBe(200);
        expect(updatedImageRoute.json()).toMatchObject({
          apiMode: "images",
          connectionId: connectionABody.id,
          internalLabel: "SiphonLab Main",
          requestPath: "/images/generations",
          routeLabel: "线路一",
          upstreamModel: "gpt-image-2",
        });

        const listRoutesA = await api.inject({
          headers: {
            authorization: `Bearer ${tenantAOwner.accessToken}`,
          },
          method: "GET",
          url: "/api/v2/admin/ai/routes",
        });
        expect(listRoutesA.statusCode).toBe(200);
        expect(listRoutesA.json().map((item: { routeKey: string }) => item.routeKey)).toEqual([
          "system-default",
          "tenant-a-route",
        ]);

        const crossTenantCredentialUpdate = await api.inject({
          headers: {
            authorization: `Bearer ${tenantAOwner.accessToken}`,
          },
          method: "PATCH",
          payload: {
            name: "No Access",
          },
          url: `/api/v2/admin/credentials/${credentialBBody.id}`,
        });
        expect(crossTenantCredentialUpdate.statusCode).toBe(404);

        const crossTenantConnectionUpdate = await api.inject({
          headers: {
            authorization: `Bearer ${tenantAOwner.accessToken}`,
          },
          method: "PATCH",
          payload: {
            name: "No Access",
          },
          url: `/api/v2/admin/ai/connections/${connectionBBody.id}`,
        });
        expect(crossTenantConnectionUpdate.statusCode).toBe(404);

        const crossTenantRouteUpdate = await api.inject({
          headers: {
            authorization: `Bearer ${tenantAOwner.accessToken}`,
          },
          method: "PATCH",
          payload: {
            priority: 50,
          },
          url: `/api/v2/admin/ai/routes/${routeB.json().id}`,
        });
        expect(crossTenantRouteUpdate.statusCode).toBe(404);

        const updateConnectionA = await api.inject({
          headers: {
            authorization: `Bearer ${tenantAOwner.accessToken}`,
          },
          method: "PATCH",
          payload: {
            name: "Tenant A Connection Updated",
            status: "inactive",
          },
          url: `/api/v2/admin/ai/connections/${connectionABody.id}`,
        });
        expect(updateConnectionA.statusCode).toBe(200);
        expect(updateConnectionA.json()).toMatchObject({
          name: "Tenant A Connection Updated",
          status: "inactive",
        });

        const systemRouteUpdate = await api.inject({
          headers: {
            authorization: `Bearer ${tenantAOwner.accessToken}`,
          },
          method: "PATCH",
          payload: {
            priority: 50,
          },
          url: `/api/v2/admin/ai/routes/${systemRoute.rows[0]?.id}`,
        });
        expect(systemRouteUpdate.statusCode).toBe(404);

        const viewerUserId = randomUUID();
        const viewerPassword = "ViewerPass123!";
        const viewerPasswordHash = await hashPassword(viewerPassword);

        await withTenantTransaction(
          { tenantId: tenantAOwner.currentTenant.id, userId: viewerUserId },
          async (client) => {
            await client.query(
              `
                INSERT INTO users (id, email, display_name, password_hash, updated_at)
                VALUES ($1::uuid, $2, $3, $4, now())
              `,
              [viewerUserId, "viewer-ai@example.com", "Viewer AI", viewerPasswordHash],
            );
            await client.query(
              `
                INSERT INTO tenant_memberships (tenant_id, user_id, role_key, status, joined_at, updated_at)
                VALUES ($1::uuid, $2::uuid, 'viewer', 'active', now(), now())
              `,
              [tenantAOwner.currentTenant.id, viewerUserId],
            );
          },
          appPool,
        );

        const viewerLogin = await api.inject({
          method: "POST",
          payload: {
            email: "viewer-ai@example.com",
            password: viewerPassword,
            consent: currentLegalConsent,
          },
          url: "/api/v2/auth/login",
        });
        expect(viewerLogin.statusCode).toBe(200);

        const forbiddenCredentialManage = await api.inject({
          headers: {
            authorization: `Bearer ${viewerLogin.json().accessToken}`,
          },
          method: "POST",
          payload: {
            name: "Forbidden Credential",
            providerId: providerBody.id,
            secret: "sk-forbidden",
          },
          url: "/api/v2/admin/credentials",
        });
        expect(forbiddenCredentialManage.statusCode).toBe(403);

        const forbiddenProviderRead = await api.inject({
          headers: {
            authorization: `Bearer ${viewerLogin.json().accessToken}`,
          },
          method: "GET",
          url: "/api/v2/admin/ai/routes",
        });
        expect(forbiddenProviderRead.statusCode).toBe(403);

        const invalidTimeoutUpdate = await api.inject({
          headers: {
            authorization: `Bearer ${tenantAOwner.accessToken}`,
          },
          method: "PATCH",
          payload: {
            requestConfig: {
              timeoutMs: 999999,
            },
          },
          url: `/api/v2/admin/ai/routes/${routeABody.id}`,
        });
        expect(invalidTimeoutUpdate.statusCode).toBe(400);

        const invalidBaseUrlUpdate = await api.inject({
          headers: {
            authorization: `Bearer ${tenantAOwner.accessToken}`,
          },
          method: "PATCH",
          payload: {
            baseUrlOverride: "file:///tmp/unsafe",
          },
          url: `/api/v2/admin/ai/routes/${routeABody.id}`,
        });
        expect(invalidBaseUrlUpdate.statusCode).toBe(400);

        const invalidPricingUpdate = await api.inject({
          headers: {
            authorization: `Bearer ${tenantAOwner.accessToken}`,
          },
          method: "PATCH",
          payload: {
            minChargeCredits: 0,
            model: "model-a",
            provider: "provider-a",
            route: "tenant-a-route",
            unit: "image_generation",
          },
          url: "/api/v2/admin/ai/pricing",
        });
        expect(invalidPricingUpdate.statusCode).toBe(400);

        const crossTenantPricingUpdate = await api.inject({
          headers: {
            authorization: `Bearer ${tenantAOwner.accessToken}`,
          },
          method: "PATCH",
          payload: {
            minChargeCredits: 10,
            model: "model-a",
            provider: "provider-a",
            route: "tenant-b-route",
            unit: "image_generation",
          },
          url: "/api/v2/admin/ai/pricing",
        });
        expect(crossTenantPricingUpdate.statusCode).toBe(403);

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("route duplicate, default assignment, and delete rules stay consistent with model catalog", async () => {
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
        const owner = await registerOwner(api, "route-admin@example.com", "Route Admin");

        const provider = await api.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "POST",
          payload: {
            key: "route-admin-provider",
            kind: "openai-compatible",
            name: "Route Admin Provider",
          },
          url: "/api/v2/admin/ai/providers",
        });
        expect(provider.statusCode).toBe(201);
        const providerBody = provider.json();

        const model = await api.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "POST",
          payload: {
            displayName: "GPT-Image-2",
            modality: "image",
            modelKey: "gpt-image-2",
            providerId: providerBody.id,
          },
          url: "/api/v2/admin/ai/models",
        });
        expect(model.statusCode).toBe(201);
        const modelBody = model.json();

        const credential = await api.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "POST",
          payload: {
            name: "Image Credential",
            providerId: providerBody.id,
            secret: "sk-image-test-secret",
          },
          url: "/api/v2/admin/credentials",
        });
        expect(credential.statusCode).toBe(201);
        const credentialBody = credential.json();

        const connection = await api.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "POST",
          payload: {
            adapterKind: "openai-compatible",
            baseUrl: "https://example.com/v1",
            credentialId: credentialBody.id,
            name: "Primary Connection",
            providerId: providerBody.id,
          },
          url: "/api/v2/admin/ai/connections",
        });
        expect(connection.statusCode).toBe(201);
        const connectionBody = connection.json();

        await withTenantTransaction(
          { tenantId: owner.currentTenant.id, userId: owner.user.id },
          async (client) => {
            await client.query(
              `
                INSERT INTO ai_model_catalog (
                  tenant_id,
                  model_id,
                  model_key,
                  display_name,
                  modality,
                  model_family,
                  default_route_key
                )
                VALUES (
                  $1::uuid,
                  $2::uuid,
                  'gpt-image-2',
                  'GPT-Image-2',
                  'image',
                  'gpt-image-2',
                  NULL
                )
              `,
              [owner.currentTenant.id, modelBody.id],
            );
          },
          appPool,
        );

        const route1 = await api.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "POST",
          payload: {
            apiMode: "images",
            connectionId: connectionBody.id,
            credentialId: credentialBody.id,
            modality: "image",
            modelId: modelBody.id,
            providerId: providerBody.id,
            requestPath: "/images/generations",
            routeKey: "image.gpt-image-2.line1",
            routeLabel: "Line 1",
            upstreamModel: "gpt-image-2",
          },
          url: "/api/v2/admin/ai/routes",
        });
        expect(route1.statusCode).toBe(201);
        expect(route1.json()).toMatchObject({
          environment: "production",
          modelFamily: "gpt-image-2",
          pluginInstallId: null,
        });

        const duplicate = await api.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "POST",
          payload: {
            routeKey: "image.gpt-image-2.line2",
            routeLabel: "Line 2",
            internalLabel: "Backup Line",
          },
          url: `/api/v2/admin/ai/routes/${route1.json().id}/duplicate`,
        });
        expect(duplicate.statusCode).toBe(201);
        expect(duplicate.json()).toMatchObject({
          apiMode: "images",
          connectionId: connectionBody.id,
          environment: "production",
          internalLabel: "Backup Line",
          modelFamily: "gpt-image-2",
          requestPath: "/images/generations",
          routeKey: "image.gpt-image-2.line2",
          routeLabel: "Line 2",
          upstreamModel: "gpt-image-2",
        });

        const setDefault = await api.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "POST",
          url: `/api/v2/admin/ai/routes/${duplicate.json().id}/set-default`,
        });
        expect(setDefault.statusCode).toBe(200);
        expect(setDefault.json()).toMatchObject({
          id: duplicate.json().id,
          isDefault: true,
          routeKey: "image.gpt-image-2.line2",
        });

        const routeRows = await adminPool.query<{
          is_default: boolean;
          route_key: string;
        }>(
          `
            SELECT route_key, is_default
            FROM ai_routes
            WHERE tenant_id = $1::uuid
              AND model_family = 'gpt-image-2'
            ORDER BY route_key ASC
          `,
          [owner.currentTenant.id],
        );
        expect(routeRows.rows).toEqual([
          {
            is_default: false,
            route_key: "image.gpt-image-2.line1",
          },
          {
            is_default: true,
            route_key: "image.gpt-image-2.line2",
          },
        ]);

        const catalogRoutes = await api.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "GET",
          url: "/api/v2/ai/model-catalog/gpt-image-2/routes",
        });
        expect(catalogRoutes.statusCode).toBe(200);
        expect(catalogRoutes.json().map((item: { routeKey: string }) => item.routeKey)).toEqual([
          "image.gpt-image-2.line1",
          "image.gpt-image-2.line2",
        ]);

        const catalogModel = await api.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "GET",
          url: "/api/v2/ai/model-catalog?modality=image",
        });
        expect(catalogModel.statusCode).toBe(200);
        expect(catalogModel.json()).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              defaultRouteKey: "image.gpt-image-2.line2",
              modelKey: "gpt-image-2",
            }),
          ]),
        );

        const deleteDefault = await api.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "DELETE",
          url: `/api/v2/admin/ai/routes/${duplicate.json().id}`,
        });
        expect(deleteDefault.statusCode).toBe(409);

        const deleteNonDefault = await api.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "DELETE",
          url: `/api/v2/admin/ai/routes/${route1.json().id}`,
        });
        expect(deleteNonDefault.statusCode).toBe(200);
        expect(deleteNonDefault.json()).toEqual({ ok: true });

        const deletedRoute = await adminPool.query<{
          deleted_at: string | null;
          status: string;
        }>(
          `
            SELECT
              deleted_at::text AS deleted_at,
              status
            FROM ai_routes
            WHERE id = $1::uuid
          `,
          [route1.json().id],
        );
        expect(deletedRoute.rows[0]?.status).toBe("inactive");
        expect(deletedRoute.rows[0]?.deleted_at).toBeTruthy();

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("text runtime uses a mock provider, writes ai_call_logs, normalizes 429, and enforces tenant access", async () => {
    const mockProvider = await withMockProvider(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(Buffer.from(chunk));
      }

      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
        model: string;
      };

      if (body.model === "rate-limit-model") {
        response.statusCode = 429;
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ error: { message: "too many requests" } }));
        return;
      }

      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "mock runtime output",
              },
            },
          ],
          usage: {
            completion_tokens: 2,
            prompt_tokens: 1,
            total_tokens: 3,
          },
        }),
      );
    });

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
        const tenantAOwner = await registerOwner(api, "runtime-a@example.com", "Runtime A");
        const tenantBOwner = await registerOwner(api, "runtime-b@example.com", "Runtime B");

        const tenantARuntime = await createTextRuntimeFixture({
          accessToken: tenantAOwner.accessToken,
          api,
          baseUrl: mockProvider.url,
          routeKey: "tenant-a-text",
        });
        const tenantBRuntime = await createTextRuntimeFixture({
          accessToken: tenantBOwner.accessToken,
          api,
          baseUrl: mockProvider.url,
          routeKey: "tenant-b-text",
        });
        const rateLimitedRuntime = await createTextRuntimeFixture({
          accessToken: tenantAOwner.accessToken,
          api,
          baseUrl: mockProvider.url,
          modelKey: "rate-limit-model",
          routeKey: "tenant-a-rate-limit",
        });

        const successResponse = await api.inject({
          headers: {
            authorization: `Bearer ${tenantAOwner.accessToken}`,
          },
          method: "POST",
          payload: {
            messages: [{ content: "hello runtime", role: "user" }],
            routeKey: "tenant-a-text",
            temperature: 0.7,
          },
          url: "/api/v2/ai/text/generate",
        });
        expect(successResponse.statusCode).toBe(200);
        expect(successResponse.json()).toEqual({
          modelKey: tenantARuntime.model.modelKey,
          outputText: "mock runtime output",
          providerKey: tenantARuntime.provider.key,
          status: "succeeded",
          usage: {
            inputTokens: 1,
            outputTokens: 2,
            totalTokens: 3,
          },
        });
        expect(JSON.stringify(successResponse.json())).not.toContain("sk-");

        const successLog = await adminPool.query<{
          error: Record<string, unknown> | null;
          status: string;
        }>(
          `
            SELECT status, error
            FROM ai_call_logs
            WHERE tenant_id = $1::uuid
              AND route_id = $2::uuid
            ORDER BY created_at DESC
            LIMIT 1
          `,
          [tenantAOwner.currentTenant.id, tenantARuntime.route.id],
        );
        expect(successLog.rows[0]).toEqual({
          error: null,
          status: "succeeded",
        });

        const rateLimitResponse = await api.inject({
          headers: {
            authorization: `Bearer ${tenantAOwner.accessToken}`,
          },
          method: "POST",
          payload: {
            messages: [{ content: "please rate limit", role: "user" }],
            routeKey: "tenant-a-rate-limit",
          },
          url: "/api/v2/ai/text/generate",
        });
        expect(rateLimitResponse.statusCode).toBe(429);
        expect(rateLimitResponse.json()).toMatchObject({
          error: {
            code: "PROVIDER_RATE_LIMIT",
          },
        });

        const failedLog = await adminPool.query<{
          error: Record<string, unknown> | null;
          status: string;
        }>(
          `
            SELECT status, error
            FROM ai_call_logs
            WHERE tenant_id = $1::uuid
              AND route_id = $2::uuid
            ORDER BY created_at DESC
            LIMIT 1
          `,
          [tenantAOwner.currentTenant.id, rateLimitedRuntime.route.id],
        );
        expect(failedLog.rows[0]?.status).toBe("failed");
        expect(JSON.stringify(failedLog.rows[0]?.error ?? {})).toContain("PROVIDER_RATE_LIMIT");
        expect(JSON.stringify(failedLog.rows[0]?.error ?? {})).not.toContain("sk-tenant-a-rate-limit-secret");

        const crossTenantRuntime = await api.inject({
          headers: {
            authorization: `Bearer ${tenantAOwner.accessToken}`,
          },
          method: "POST",
          payload: {
            messages: [{ content: "cross tenant route", role: "user" }],
            routeKey: "tenant-b-text",
          },
          url: "/api/v2/ai/text/generate",
        });
        expect(crossTenantRuntime.statusCode).toBe(404);

        const viewerUserId = randomUUID();
        const viewerPassword = "ViewerPass123!";
        const viewerPasswordHash = await hashPassword(viewerPassword);

        await withTenantTransaction(
          { tenantId: tenantAOwner.currentTenant.id, userId: viewerUserId },
          async (client) => {
            await client.query(
              `
                INSERT INTO users (id, email, display_name, password_hash, updated_at)
                VALUES ($1::uuid, $2, $3, $4, now())
              `,
              [viewerUserId, "runtime-viewer@example.com", "Runtime Viewer", viewerPasswordHash],
            );
            await client.query(
              `
                INSERT INTO tenant_memberships (tenant_id, user_id, role_key, status, joined_at, updated_at)
                VALUES ($1::uuid, $2::uuid, 'viewer', 'active', now(), now())
              `,
              [tenantAOwner.currentTenant.id, viewerUserId],
            );
          },
          appPool,
        );

        const viewerLogin = await api.inject({
          method: "POST",
          payload: {
            email: "runtime-viewer@example.com",
            password: viewerPassword,
            consent: currentLegalConsent,
          },
          url: "/api/v2/auth/login",
        });
        expect(viewerLogin.statusCode).toBe(200);

        const forbiddenRuntime = await api.inject({
          headers: {
            authorization: `Bearer ${viewerLogin.json().accessToken}`,
          },
          method: "POST",
          payload: {
            messages: [{ content: "forbidden runtime", role: "user" }],
            routeKey: "tenant-a-text",
          },
          url: "/api/v2/ai/text/generate",
        });
        expect(forbiddenRuntime.statusCode).toBe(403);

        expect(tenantBRuntime.route.routeKey).toBe("tenant-b-text");
        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
        await mockProvider.close();
      }
    });
  });

  test("routes can be created under an existing product model family across providers", async () => {
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
        const owner = await registerOwner(api, "cross-provider-route@example.com", "Cross Provider Route");

        const siphonProvider = await api.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "POST",
          payload: {
            key: "openai-compatible",
            kind: "openai-compatible",
            name: "SiphonLab OpenAI Compatible",
          },
          url: "/api/v2/admin/ai/providers",
        });
        expect(siphonProvider.statusCode).toBe(201);

        const mouxiProvider = await api.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "POST",
          payload: {
            defaultBaseUrl: "https://api.mouxihub.com/v1",
            key: "mouxihub-openai",
            kind: "openai-compatible",
            name: "MouxiHub OpenAI Compatible",
          },
          url: "/api/v2/admin/ai/providers",
        });
        expect(mouxiProvider.statusCode).toBe(201);

        const siphonProviderBody = siphonProvider.json();
        const mouxiProviderBody = mouxiProvider.json();

        const catalogModel = await api.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "POST",
          payload: {
            displayName: "GPT-Image-2",
            modality: "image",
            modelKey: "gpt-image-2",
            providerId: siphonProviderBody.id,
          },
          url: "/api/v2/admin/ai/models",
        });
        expect(catalogModel.statusCode).toBe(201);

        const providerModel = await api.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "POST",
          payload: {
            displayName: "MouxiHub GPT Image",
            modality: "image",
            modelKey: "gpt-image-2",
            providerId: mouxiProviderBody.id,
          },
          url: "/api/v2/admin/ai/models",
        });
        expect(providerModel.statusCode).toBe(201);

        await withTenantTransaction(
          { tenantId: owner.currentTenant.id, userId: owner.user.id },
          async (client) => {
            await client.query(
              `
                INSERT INTO ai_model_catalog (
                  tenant_id,
                  model_id,
                  model_key,
                  display_name,
                  modality,
                  model_family,
                  default_route_key,
                  status
                )
                VALUES (
                  $1::uuid,
                  $2::uuid,
                  'gpt-image-2',
                  'GPT-Image-2',
                  'image',
                  'gpt-image-2',
                  'image.gpt-image-2',
                  'active'
                )
              `,
              [owner.currentTenant.id, catalogModel.json().id],
            );
          },
          appPool,
        );

        const mouxiCredential = await api.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "POST",
          payload: {
            name: "MouxiHub Key",
            providerId: mouxiProviderBody.id,
            secret: "sk-mouxi-secret",
          },
          url: "/api/v2/admin/credentials",
        });
        expect(mouxiCredential.statusCode).toBe(201);

        const mouxiConnection = await api.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "POST",
          payload: {
            adapterKind: "openai-compatible",
            baseUrl: "https://api.mouxihub.com/v1",
            credentialId: mouxiCredential.json().id,
            name: "MouxiHub GPT Image",
            providerId: mouxiProviderBody.id,
          },
          url: "/api/v2/admin/ai/connections",
        });
        expect(mouxiConnection.statusCode).toBe(201);

        const route = await api.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "POST",
          payload: {
            apiMode: "images",
            connectionId: mouxiConnection.json().id,
            modality: "image",
            modelFamily: "gpt-image-2",
            modelId: providerModel.json().id,
            providerId: mouxiProviderBody.id,
            requestPath: "/images/generations",
            routeKey: "image.gpt-image-2.mouxihub",
            routeLabel: "线路三",
            upstreamModel: "gpt-image-2",
          },
          url: "/api/v2/admin/ai/routes",
        });
        expect(route.statusCode).toBe(201);
        expect(route.json()).toMatchObject({
          apiMode: "images",
          connectionId: mouxiConnection.json().id,
          modelFamily: "gpt-image-2",
          providerId: mouxiProviderBody.id,
          requestPath: "/images/generations",
          routeKey: "image.gpt-image-2.mouxihub",
          routeLabel: "线路三",
          upstreamModel: "gpt-image-2",
        });

        const catalogRoutes = await api.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "GET",
          url: "/api/v2/ai/model-catalog/gpt-image-2/routes",
        });
        expect(catalogRoutes.statusCode).toBe(200);
        expect(catalogRoutes.json()).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              providerKey: "mouxihub-openai",
              providerName: "MouxiHub OpenAI Compatible",
              routeKey: "image.gpt-image-2.mouxihub",
              routeLabel: "线路三",
            }),
          ]),
        );

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("route creation rejects provider mismatches for connections and models", async () => {
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
        const owner = await registerOwner(api, "cross-provider-errors@example.com", "Cross Provider Errors");

        const providerA = await api.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "POST",
          payload: {
            key: "provider-a",
            kind: "openai-compatible",
            name: "Provider A",
          },
          url: "/api/v2/admin/ai/providers",
        });
        const providerB = await api.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "POST",
          payload: {
            key: "provider-b",
            kind: "openai-compatible",
            name: "Provider B",
          },
          url: "/api/v2/admin/ai/providers",
        });
        expect(providerA.statusCode).toBe(201);
        expect(providerB.statusCode).toBe(201);

        const providerABody = providerA.json();
        const providerBBody = providerB.json();

        const modelA = await api.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "POST",
          payload: {
            displayName: "Model A",
            modality: "image",
            modelKey: "gpt-image-2",
            providerId: providerABody.id,
          },
          url: "/api/v2/admin/ai/models",
        });
        expect(modelA.statusCode).toBe(201);

        await withTenantTransaction(
          { tenantId: owner.currentTenant.id, userId: owner.user.id },
          async (client) => {
            await client.query(
              `
                INSERT INTO ai_model_catalog (
                  tenant_id,
                  model_id,
                  model_key,
                  display_name,
                  modality,
                  model_family,
                  status
                )
                VALUES (
                  $1::uuid,
                  $2::uuid,
                  'gpt-image-2',
                  'GPT-Image-2',
                  'image',
                  'gpt-image-2',
                  'active'
                )
              `,
              [owner.currentTenant.id, modelA.json().id],
            );
          },
          appPool,
        );

        const credentialB = await api.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "POST",
          payload: {
            name: "Provider B Key",
            providerId: providerBBody.id,
            secret: "sk-provider-b",
          },
          url: "/api/v2/admin/credentials",
        });
        expect(credentialB.statusCode).toBe(201);

        const connectionB = await api.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "POST",
          payload: {
            adapterKind: "openai-compatible",
            credentialId: credentialB.json().id,
            name: "Provider B Connection",
            providerId: providerBBody.id,
          },
          url: "/api/v2/admin/ai/connections",
        });
        expect(connectionB.statusCode).toBe(201);

        const providerMismatchConnection = await api.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "POST",
          payload: {
            connectionId: connectionB.json().id,
            modality: "image",
            modelFamily: "gpt-image-2",
            providerId: providerABody.id,
            routeKey: "image.gpt-image-2.provider-a-connection-b",
          },
          url: "/api/v2/admin/ai/routes",
        });
        expect(providerMismatchConnection.statusCode).toBe(400);
        expect(providerMismatchConnection.json()).toMatchObject({
          code: "PROVIDER_CONNECTION_PROVIDER_MISMATCH",
        });

        const providerMismatchModel = await api.inject({
          headers: { authorization: `Bearer ${owner.accessToken}` },
          method: "POST",
          payload: {
            modality: "image",
            modelFamily: "gpt-image-2",
            modelId: modelA.json().id,
            providerId: providerBBody.id,
            routeKey: "image.gpt-image-2.provider-b-model-a",
          },
          url: "/api/v2/admin/ai/routes",
        });
        expect(providerMismatchModel.statusCode).toBe(400);
        expect(providerMismatchModel.json()).toMatchObject({
          code: "ROUTE_MODEL_PROVIDER_MISMATCH",
        });

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });
});
