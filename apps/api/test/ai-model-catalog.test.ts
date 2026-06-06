import { afterAll, describe, expect, test } from "vitest";

import { createPgPool } from "@aigc-flow/db";
import type { StorageProvider } from "@aigc-flow/storage";

import { buildApp } from "../src/app.js";
import type { ApiEnv } from "../src/config/env.js";
import { runMigrations } from "../../../packages/db/src/migrator.js";
import { hasDatabaseEnv, withDatabase } from "../../../packages/db/test/helpers.js";

const originalDatabaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = hasDatabaseEnv() ? describe : describe.skip;

const testEnv: ApiEnv = {
  accessTokenTtlSeconds: 60 * 15,
  adminEmails: [],
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

describeWithDatabase("ai model catalog API", () => {
  test("returns published models and only the selected model routes", async () => {
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
        const owner = await registerOwner(api, "catalog-owner@example.com", "Catalog Owner");

        const beforeInstall = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "GET",
          url: "/api/v2/ai/model-catalog?modality=image",
        });
        expect(beforeInstall.statusCode).toBe(200);
        expect(beforeInstall.json()).toEqual([]);

        const install = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "POST",
          payload: {
            credential: {
              name: "Visionary Catalog Key",
              secret: "visionary-catalog-secret",
            },
            publishImmediately: true,
          },
          url: "/api/v2/admin/ai/plugins/visionary.nano-banana/install",
        });
        expect(install.statusCode).toBe(201);

        const catalog = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "GET",
          url: "/api/v2/ai/model-catalog?modality=image",
        });
        expect(catalog.statusCode).toBe(200);
        expect(catalog.json().map((item: { modelKey: string }) => item.modelKey)).toEqual([
          "nano-banana-pro",
          "nano-banana-pro-fast",
        ]);
        expect(catalog.json()[0]).toMatchObject({
          defaultRouteKey: "image.nano-banana-pro",
          modality: "image",
          modelFamily: "nano-banana-pro",
        });

        const proRoutes = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "GET",
          url: "/api/v2/ai/model-catalog/nano-banana-pro/routes",
        });
        expect(proRoutes.statusCode).toBe(200);
        expect(proRoutes.json()).toEqual([
          expect.objectContaining({
            estimatedCredits: 24,
            minChargeCredits: 24,
            modelFamily: "nano-banana-pro",
            modelKey: "nano-banana-pro",
            pricingUnit: "image_generation",
            providerKey: "visionary",
            routeKey: "image.nano-banana-pro",
          }),
        ]);

        const fastRoutes = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "GET",
          url: "/api/v2/ai/model-catalog/nano-banana-pro-fast/routes",
        });
        expect(fastRoutes.statusCode).toBe(200);
        expect(fastRoutes.json()).toEqual([
          expect.objectContaining({
            estimatedCredits: 48,
            minChargeCredits: 48,
            modelFamily: "nano-banana-pro-fast",
            modelKey: "nano-banana-pro-fast",
            routeKey: "image.nano-banana-pro-fast",
          }),
        ]);

        const missingModelRoutes = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "GET",
          url: "/api/v2/ai/model-catalog/unknown-model/routes",
        });
        expect(missingModelRoutes.statusCode).toBe(404);

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });
});
