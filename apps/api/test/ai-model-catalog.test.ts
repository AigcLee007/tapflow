import { afterAll, describe, expect, test } from "vitest";

import { createPgPool } from "@aigc-flow/db";
import type { StorageProvider } from "@aigc-flow/storage";

import { buildApp } from "../src/app.js";
import type { ApiEnv } from "../src/config/env.js";
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
      consent: currentLegalConsent,
      tenantName,
    },
    url: "/api/v2/auth/register",
  });

  expect(response.statusCode).toBe(201);
  return response.json();
}

describeWithDatabase("ai model catalog API", () => {
  test("publishes GPT-Image-2 production image modes into the safe runtime catalog", async () => {
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
        const owner = await registerOwner(api, "gpt-image-production-owner@example.com", "GPT Image Production Owner");

        const install = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "POST",
          payload: {
            credential: {
              name: "GPT Image Catalog Key",
              secret: "gpt-image-catalog-secret",
            },
            publishImmediately: true,
          },
          url: "/api/v2/admin/ai/plugins/openai-compatible.gpt-image-2/install",
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
        expect(catalog.json()).toEqual([
          expect.objectContaining({
            defaultRouteKey: "image.gpt-image-2",
            modality: "image",
            modelFamily: "gpt-image-2",
            modelKey: "gpt-image-2",
          }),
        ]);

        const routes = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "GET",
          url: "/api/v2/ai/model-catalog/gpt-image-2/routes",
        });
        expect(routes.statusCode).toBe(200);
        expect(routes.json()).toEqual([
          expect.objectContaining({
            capabilities: {
              supportedGenerationModes: [
                "standard",
                "panorama_360",
                "wraparound_270",
                "subject_orbit_270",
              ],
              supportedVideoWorkflows: [],
            },
            pricingUnit: "image_generation",
            providerKey: "openai-compatible",
            routeKey: "image.gpt-image-2",
          }),
          expect.objectContaining({
            capabilities: {
              supportedGenerationModes: [
                "standard",
                "panorama_360",
                "wraparound_270",
                "subject_orbit_270",
              ],
              supportedVideoWorkflows: [],
            },
            pricingUnit: "image_generation",
            providerKey: "openai-compatible",
            routeKey: "image.gpt-image-2.line2",
          }),
        ]);
        expect(JSON.stringify(routes.json())).not.toContain("requestConfig");

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("publishes GPT-Image-2 MouxiHub lines three and four into the safe runtime catalog", async () => {
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
        const owner = await registerOwner(api, "gpt-image-mouxihub-owner@example.com", "GPT Image MouxiHub Owner");

        for (const packageKey of [
          "openai-compatible.gpt-image-2",
          "mouxihub.gpt-image-2-line3",
          "mouxihub.gpt-image-2-line4",
        ]) {
          const install = await api.inject({
            headers: {
              authorization: `Bearer ${owner.accessToken}`,
            },
            method: "POST",
            payload: {
              credential: {
                name: `${packageKey} Catalog Key`,
                secret: `${packageKey}-catalog-secret`,
              },
              publishImmediately: true,
            },
            url: `/api/v2/admin/ai/plugins/${packageKey}/install`,
          });
          expect(install.statusCode).toBe(201);
        }

        const routes = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "GET",
          url: "/api/v2/ai/model-catalog/gpt-image-2/routes",
        });
        expect(routes.statusCode).toBe(200);

        const supportedGenerationModes = [
          "standard",
          "panorama_360",
          "wraparound_270",
          "subject_orbit_270",
        ];
        expect(routes.json()).toEqual([
          expect.objectContaining({
            capabilities: {
              supportedGenerationModes,
              supportedVideoWorkflows: [],
            },
            minChargeCredits: 2.5,
            pricingUnit: "image_generation",
            providerKey: "openai-compatible",
            routeKey: "image.gpt-image-2",
          }),
          expect.objectContaining({
            capabilities: {
              supportedGenerationModes,
              supportedVideoWorkflows: [],
            },
            minChargeCredits: 3,
            pricingUnit: "image_generation",
            providerKey: "openai-compatible",
            routeKey: "image.gpt-image-2.line2",
          }),
          expect.objectContaining({
            capabilities: {
              supportedGenerationModes,
              supportedVideoWorkflows: [],
            },
            minChargeCredits: 1,
            pricingUnit: "image_generation",
            providerKey: "mouxihub-openai",
            routeKey: "image.gpt-image-2.line3",
          }),
          expect.objectContaining({
            capabilities: {
              supportedGenerationModes,
              supportedVideoWorkflows: [],
            },
            minChargeCredits: 3,
            pricingUnit: "image_generation",
            providerKey: "mouxihub-openai",
            routeKey: "image.gpt-image-2.line4",
          }),
        ]);
        expect(JSON.stringify(routes.json())).not.toContain("requestConfig");

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("publishes the internal video editor FFmpeg route into the safe runtime catalog", async () => {
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
        const owner = await registerOwner(api, "video-catalog-owner@example.com", "Video Catalog Owner");

        const pluginList = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "GET",
          url: "/api/v2/admin/ai/plugins?modality=video",
        });
        expect(pluginList.statusCode).toBe(200);
        expect(pluginList.json()).toEqual([
          expect.objectContaining({
            credentials: expect.objectContaining({
              fields: [],
              required: false,
              type: "bearer",
            }),
            packageKey: "tapflow.video-editor-ffmpeg",
          }),
        ]);

        const install = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "POST",
          payload: {
            publishImmediately: true,
          },
          url: "/api/v2/admin/ai/plugins/tapflow.video-editor-ffmpeg/install",
        });
        expect(install.statusCode).toBe(201);

        const catalog = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "GET",
          url: "/api/v2/ai/model-catalog?modality=video",
        });
        expect(catalog.statusCode).toBe(200);
        expect(catalog.json()).toEqual([
          expect.objectContaining({
            defaultRouteKey: "video.editor.ffmpeg",
            modality: "video",
            modelFamily: "tapflow.video-editor",
            modelKey: "video-editor-ffmpeg",
          }),
        ]);

        const routes = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "GET",
          url: "/api/v2/ai/model-catalog/video-editor-ffmpeg/routes",
        });
        expect(routes.statusCode).toBe(200);
        expect(routes.json()).toEqual([
          expect.objectContaining({
            capabilities: {
              supportedGenerationModes: ["standard"],
              supportedVideoWorkflows: ["video_editor_export"],
            },
            estimatedCredits: 50,
            minChargeCredits: 50,
            pricingUnit: "video_generation",
            providerKey: "tapflow-local-render",
            routeKey: "video.editor.ffmpeg",
          }),
        ]);
        expect(JSON.stringify(routes.json())).not.toContain("videoEditorRenderEngine");
        expect(JSON.stringify(routes.json())).not.toContain("internalRender");
        expect(JSON.stringify(routes.json())).not.toContain("requestConfig");

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

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
              name: "PixelleLabs Pro Catalog Key",
              secret: "pixellelabs-pro-catalog-secret",
            },
            publishImmediately: true,
          },
          url: "/api/v2/admin/ai/plugins/pixellelabs.nano-banana-pro/install",
        });
        expect(install.statusCode).toBe(201);

        const installFlash = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "POST",
          payload: {
            credential: {
              name: "PixelleLabs 2 Catalog Key",
              secret: "pixellelabs-2-catalog-secret",
            },
            publishImmediately: true,
          },
          url: "/api/v2/admin/ai/plugins/pixellelabs.nano-banana-2/install",
        });
        expect(installFlash.statusCode).toBe(201);

        const catalog = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "GET",
          url: "/api/v2/ai/model-catalog?modality=image",
        });
        expect(catalog.statusCode).toBe(200);
        expect(catalog.json().map((item: { modelKey: string }) => item.modelKey)).toEqual([
          "gemini-3-pro-image-preview",
          "gemini-3.1-flash-image-preview",
        ]);
        expect(catalog.json()[0]).toMatchObject({
          defaultRouteKey: "image.pixellelabs.nano-banana-pro",
          modality: "image",
          modelFamily: "pixellelabs.nano-banana-pro",
        });

        const proRoutes = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "GET",
          url: "/api/v2/ai/model-catalog/gemini-3-pro-image-preview/routes",
        });
        expect(proRoutes.statusCode).toBe(200);
        expect(proRoutes.json()).toEqual([
          expect.objectContaining({
            estimatedCredits: 24,
            minChargeCredits: 24,
            modelFamily: "pixellelabs.nano-banana-pro",
            modelKey: "gemini-3-pro-image-preview",
            pricingUnit: "image_generation",
            providerKey: "pixellelabs",
            routeKey: "image.pixellelabs.nano-banana-pro",
          }),
        ]);

        const tenantRouteRow = await adminPool.query<{
          id: string;
          model_family: string;
          model_id: string;
          provider_id: string;
          route_key: string;
        }>(
          `
            SELECT
              id::text AS id,
              provider_id::text AS provider_id,
              model_id::text AS model_id,
              model_family,
              route_key
            FROM ai_routes
            WHERE tenant_id = $1::uuid
              AND route_key = 'image.pixellelabs.nano-banana-pro'
            LIMIT 1
          `,
          [owner.currentTenant.id],
        );
        expect(tenantRouteRow.rows[0]?.id).toBeTruthy();

        await adminPool.query(
          `
            INSERT INTO ai_routes (
              tenant_id,
              provider_id,
              model_id,
              route_key,
              modality,
              priority,
              weight,
              request_config,
              pricing,
              rate_limit,
              status,
              model_family,
              environment,
              route_label,
              updated_at
            )
            VALUES (
              NULL,
              $1::uuid,
              $2::uuid,
              $3,
              'image',
              1,
              1,
              '{}'::jsonb,
              '{}'::jsonb,
              '{}'::jsonb,
              'active',
              $4,
              'production',
              'System Fallback Route',
              now()
            )
            ON CONFLICT (route_key) WHERE tenant_id IS NULL
            DO UPDATE SET
              provider_id = EXCLUDED.provider_id,
              model_id = EXCLUDED.model_id,
              model_family = EXCLUDED.model_family,
              route_label = EXCLUDED.route_label,
              status = EXCLUDED.status,
              updated_at = now()
          `,
          [
            tenantRouteRow.rows[0]?.provider_id,
            tenantRouteRow.rows[0]?.model_id,
            tenantRouteRow.rows[0]?.route_key,
            tenantRouteRow.rows[0]?.model_family,
          ],
        );

        const proRoutesWithSystemDuplicate = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "GET",
          url: "/api/v2/ai/model-catalog/gemini-3-pro-image-preview/routes",
        });
        expect(proRoutesWithSystemDuplicate.statusCode).toBe(200);
        expect(proRoutesWithSystemDuplicate.json()).toEqual([
          expect.objectContaining({
            routeId: tenantRouteRow.rows[0]?.id,
            routeKey: "image.pixellelabs.nano-banana-pro",
          }),
        ]);

        const proFamilyRoutes = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "GET",
          url: "/api/v2/ai/model-catalog/pixellelabs.nano-banana-pro/routes",
        });
        expect(proFamilyRoutes.statusCode).toBe(200);
        expect(proFamilyRoutes.json()).toEqual(proRoutes.json());

        const flashRoutes = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "GET",
          url: "/api/v2/ai/model-catalog/gemini-3.1-flash-image-preview/routes",
        });
        expect(flashRoutes.statusCode).toBe(200);
        expect(flashRoutes.json()).toEqual([
          expect.objectContaining({
            estimatedCredits: 24,
            minChargeCredits: 24,
            modelFamily: "pixellelabs.nano-banana-2",
            modelKey: "gemini-3.1-flash-image-preview",
            routeKey: "image.pixellelabs.nano-banana-2",
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
