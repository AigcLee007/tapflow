import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, test } from "vitest";

import { createPgPool, withTenantTransaction } from "@aigc-flow/db";
import type { StorageProvider } from "@aigc-flow/storage";

import type { ApiEnv } from "../src/config/env.js";
import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/modules/auth/password.js";
import { runMigrations } from "../../../packages/db/src/migrator.js";
import { hasDatabaseEnv, withDatabase } from "../../../packages/db/test/helpers.js";

const originalDatabaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = hasDatabaseEnv() ? describe : describe.skip;
const SMALL_PNG_BUFFER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sotk6sAAAAASUVORK5CYII=",
  "base64",
);

const testEnv: ApiEnv = {
  accessTokenTtlSeconds: 60 * 15,
  adminEmails: [],
  apiRateLimitMax: 1000,
  apiRateLimitWindowMs: 60_000,
  authRateLimitMax: 20,
  authRateLimitWindowMs: 60_000,
  credentialKeyVersion: "v1",
  corsAllowedOrigins: ["http://localhost:5188"],
  credentialMasterKey: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
  jwtAccessSecret: "test_access_secret_1234567890",
  jwtRefreshSecret: "test_refresh_secret_1234567890",
  nodeEnv: "test",
  queuePrefix: "aigc-flow:v2:test",
  redisUrl: "redis://localhost:6379",
  refreshTokenTtlSeconds: 60 * 60 * 24 * 7,
  s3AccessKeyId: "test-access",
  s3Bucket: "test-bucket",
  s3Endpoint: "http://localhost:9000",
  s3ForcePathStyle: true,
  s3Region: "us-east-1",
  s3SecretAccessKey: "test-secret",
  securityHeadersEnabled: false,
  trustProxy: false,
};

class MemoryStorageProvider implements StorageProvider {
  readonly deletedKeys: string[] = [];
  readonly headRequests: Array<{ bucket: string; key: string }> = [];
  readonly objects = new Map<string, {
    contentLength: number | null;
    contentType: string | null;
    metadata: Record<string, string>;
  }>();

  async putObject(input: {
    body: Buffer | Uint8Array | string;
    bucket: string;
    contentType?: string;
    key: string;
    metadata?: Record<string, string>;
  }): Promise<void> {
    const contentLength =
      typeof input.body === "string"
        ? Buffer.byteLength(input.body)
        : input.body instanceof Uint8Array
          ? input.body.byteLength
          : Buffer.byteLength(String(input.body));
    this.objects.set(`${input.bucket}/${input.key}`, {
      contentLength,
      contentType: input.contentType ?? null,
      metadata: input.metadata ?? {},
    });
  }

  async headObject(input: { bucket: string; key: string }) {
    this.headRequests.push(input);
    const object = this.objects.get(`${input.bucket}/${input.key}`);
    if (!object) {
      throw new Error("Object not found");
    }

    return {
      contentLength: object.contentLength,
      contentType: object.contentType,
      eTag: "etag-test",
      lastModified: new Date().toISOString(),
      metadata: object.metadata,
    };
  }

  async deleteObject(input: { bucket: string; key: string }): Promise<void> {
    this.deletedKeys.push(`${input.bucket}/${input.key}`);
  }

  async createPresignedPutUrl(input: {
    bucket: string;
    contentLength?: number | null;
    contentType?: string | null;
    expiresInSeconds: number;
    key: string;
    metadata?: Record<string, string>;
  }) {
    this.objects.set(`${input.bucket}/${input.key}`, {
      contentLength: input.contentLength ?? null,
      contentType: input.contentType ?? null,
      metadata: input.metadata ?? {},
    });

    return {
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000).toISOString(),
      headers: input.contentType ? { "content-type": input.contentType } : {},
      method: "PUT" as const,
      url: `memory://put/${input.bucket}/${input.key}`,
    };
  }

  async createPresignedGetUrl(input: {
    bucket: string;
    expiresInSeconds: number;
    key: string;
    responseContentDisposition?: string | null;
    responseContentType?: string | null;
  }) {
    return {
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000).toISOString(),
      headers: {},
      method: "GET" as const,
      url: `memory://get/${input.bucket}/${input.key}?contentType=${encodeURIComponent(input.responseContentType ?? "")}&disposition=${encodeURIComponent(input.responseContentDisposition ?? "")}`,
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

function buildTestApp(
  pool: ReturnType<typeof createPgPool>,
  storageProvider: StorageProvider,
) {
  return buildApp({
    env: testEnv,
    logger: false,
    pool,
    storageProvider,
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

async function insertAvailableImageAssetWithVariant(
  pool: ReturnType<typeof createPgPool>,
  tenantId: string,
  userId: string,
  input: {
    variantKey: string;
    variantObjectKey: string;
  },
): Promise<string> {
  const assetId = randomUUID();

  await withTenantTransaction(
    { tenantId, userId },
    async (client) => {
      await client.query(
        `
          INSERT INTO assets (
            id,
            tenant_id,
            owner_user_id,
            kind,
            mime_type,
            bucket,
            object_key,
            original_filename,
            size_bytes,
            status
          )
          VALUES (
            $1::uuid,
            $2::uuid,
            $3::uuid,
            'image',
            'image/png',
            'test-bucket',
            $4,
            'image.png',
            1024,
            'available'
          )
        `,
        [assetId, tenantId, userId, `tenants/${tenantId}/assets/${assetId}/original.png`],
      );

      await client.query(
        `
          INSERT INTO asset_variants (
            tenant_id,
            asset_id,
            variant_key,
            bucket,
            object_key,
            mime_type,
            width,
            height,
            size_bytes,
            metadata
          )
          VALUES (
            $1::uuid,
            $2::uuid,
            $3,
            'test-bucket',
            $4,
            'image/webp',
            320,
            200,
            512,
            '{}'::jsonb
          )
        `,
        [tenantId, assetId, input.variantKey, input.variantObjectKey],
      );
    },
    pool,
  );

  return assetId;
}

describeWithDatabase("assets v2", () => {
  test("asset:create can create a presigned upload and a viewer cannot", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();

      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });
        const storageProvider = new MemoryStorageProvider();
        const api = buildTestApp(appPool, storageProvider);

        const owner = await registerOwner(api, "owner-assets@example.com", "Owner Assets");

        const createUpload = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "POST",
          payload: {
            kind: "image",
            mimeType: "image/png",
            originalFilename: "sample image.png",
            sizeBytes: 128,
          },
          url: "/api/v2/assets/presigned-upload",
        });

        expect(createUpload.statusCode).toBe(201);
        expect(createUpload.json()).toMatchObject({
          asset: {
            bucket: "test-bucket",
            kind: "image",
            mimeType: "image/png",
            originalFilename: "sample image.png",
            status: "uploading",
            tenantId: owner.currentTenant.id,
          },
          upload: {
            method: "PUT",
          },
        });

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
              [viewerUserId, "viewer-assets@example.com", "Viewer Assets", viewerPasswordHash],
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
            email: "viewer-assets@example.com",
            password: viewerPassword,
          },
          url: "/api/v2/auth/login",
        });
        expect(viewerLogin.statusCode).toBe(200);

        const forbiddenCreate = await api.inject({
          headers: {
            authorization: `Bearer ${viewerLogin.json().accessToken}`,
          },
          method: "POST",
          payload: {
            kind: "image",
            mimeType: "image/png",
            originalFilename: "forbidden.png",
          },
          url: "/api/v2/assets/presigned-upload",
        });
        expect(forbiddenCreate.statusCode).toBe(403);

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("complete-upload HEADs the object, metadata is readable, download url is scoped, and deleted assets cannot be downloaded", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();

      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });
        const storageProvider = new MemoryStorageProvider();
        const api = buildTestApp(appPool, storageProvider);

        const tenantAOwner = await registerOwner(api, "tenant-a-assets@example.com", "Tenant A Assets");
        const tenantBOwner = await registerOwner(api, "tenant-b-assets@example.com", "Tenant B Assets");

        const created = await api.inject({
          headers: {
            authorization: `Bearer ${tenantAOwner.accessToken}`,
          },
          method: "POST",
          payload: {
            kind: "image",
            metadata: {
              source: "manual-upload",
            },
            mimeType: "image/png",
            originalFilename: "hero.png",
            sizeBytes: 512,
          },
          url: "/api/v2/assets/presigned-upload",
        });
        expect(created.statusCode).toBe(201);
        const createdBody = created.json();

        const complete = await api.inject({
          headers: {
            authorization: `Bearer ${tenantAOwner.accessToken}`,
          },
          method: "POST",
          payload: {
            width: 1024,
          },
          url: `/api/v2/assets/${createdBody.asset.id}/complete-upload`,
        });
        expect(complete.statusCode).toBe(200);
        expect(storageProvider.headRequests).toHaveLength(1);
        expect(complete.json()).toMatchObject({
          id: createdBody.asset.id,
          mimeType: "image/png",
          sizeBytes: 512,
          status: "available",
          width: 1024,
        });

        const getAsset = await api.inject({
          headers: {
            authorization: `Bearer ${tenantAOwner.accessToken}`,
          },
          method: "GET",
          url: `/api/v2/assets/${createdBody.asset.id}`,
        });
        expect(getAsset.statusCode).toBe(200);
        expect(getAsset.json()).toMatchObject({
          id: createdBody.asset.id,
          metadata: {
            source: "manual-upload",
          },
          status: "available",
        });
        expect(getAsset.json()).not.toHaveProperty("publicUrl");

        const download = await api.inject({
          headers: {
            authorization: `Bearer ${tenantAOwner.accessToken}`,
          },
          method: "GET",
          url: `/api/v2/assets/${createdBody.asset.id}/download-url`,
        });
        expect(download.statusCode).toBe(200);
        expect(download.json()).toMatchObject({
          method: "GET",
        });
        expect(download.json().url).toContain(`memory://get/test-bucket/${createdBody.asset.objectKey}`);

        const crossTenantGet = await api.inject({
          headers: {
            authorization: `Bearer ${tenantBOwner.accessToken}`,
          },
          method: "GET",
          url: `/api/v2/assets/${createdBody.asset.id}`,
        });
        expect(crossTenantGet.statusCode).toBe(404);

        const crossTenantDownload = await api.inject({
          headers: {
            authorization: `Bearer ${tenantBOwner.accessToken}`,
          },
          method: "GET",
          url: `/api/v2/assets/${createdBody.asset.id}/download-url`,
        });
        expect(crossTenantDownload.statusCode).toBe(404);

        const deleted = await api.inject({
          headers: {
            authorization: `Bearer ${tenantAOwner.accessToken}`,
          },
          method: "DELETE",
          url: `/api/v2/assets/${createdBody.asset.id}`,
        });
        expect(deleted.statusCode).toBe(200);

        const deletedDownload = await api.inject({
          headers: {
            authorization: `Bearer ${tenantAOwner.accessToken}`,
          },
          method: "GET",
          url: `/api/v2/assets/${createdBody.asset.id}/download-url`,
        });
        expect(deletedDownload.statusCode).toBe(404);

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("tenant asset listings, folders, and folder assignments stay isolated", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();

      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });
        const storageProvider = new MemoryStorageProvider();
        const api = buildTestApp(appPool, storageProvider);

        const tenantAOwner = await registerOwner(api, "tenant-a-list-assets@example.com", "Tenant A List Assets");
        const tenantBOwner = await registerOwner(api, "tenant-b-list-assets@example.com", "Tenant B List Assets");

        const tenantAUpload = await api.inject({
          headers: {
            authorization: `Bearer ${tenantAOwner.accessToken}`,
          },
          method: "POST",
          payload: {
            kind: "image",
            mimeType: "image/png",
            originalFilename: "tenant-a.png",
            sizeBytes: 128,
          },
          url: "/api/v2/assets/presigned-upload",
        });
        expect(tenantAUpload.statusCode).toBe(201);
        const tenantAAssetId = tenantAUpload.json().asset.id as string;

        await api.inject({
          headers: {
            authorization: `Bearer ${tenantAOwner.accessToken}`,
          },
          method: "POST",
          payload: {
            width: 512,
          },
          url: `/api/v2/assets/${tenantAAssetId}/complete-upload`,
        });

        const tenantBUpload = await api.inject({
          headers: {
            authorization: `Bearer ${tenantBOwner.accessToken}`,
          },
          method: "POST",
          payload: {
            kind: "image",
            mimeType: "image/png",
            originalFilename: "tenant-b.png",
            sizeBytes: 128,
          },
          url: "/api/v2/assets/presigned-upload",
        });
        expect(tenantBUpload.statusCode).toBe(201);
        const tenantBAssetId = tenantBUpload.json().asset.id as string;

        await api.inject({
          headers: {
            authorization: `Bearer ${tenantBOwner.accessToken}`,
          },
          method: "POST",
          payload: {
            width: 256,
          },
          url: `/api/v2/assets/${tenantBAssetId}/complete-upload`,
        });

        const folderA = await api.inject({
          headers: {
            authorization: `Bearer ${tenantAOwner.accessToken}`,
          },
          method: "POST",
          payload: {
            name: "Tenant A Folder",
          },
          url: "/api/v2/assets/folders",
        });
        expect(folderA.statusCode).toBe(201);
        const folderAId = folderA.json().id as string;

        const folderB = await api.inject({
          headers: {
            authorization: `Bearer ${tenantBOwner.accessToken}`,
          },
          method: "POST",
          payload: {
            name: "Tenant B Folder",
          },
          url: "/api/v2/assets/folders",
        });
        expect(folderB.statusCode).toBe(201);
        const folderBId = folderB.json().id as string;

        const tenantAList = await api.inject({
          headers: {
            authorization: `Bearer ${tenantAOwner.accessToken}`,
          },
          method: "GET",
          url: "/api/v2/assets",
        });
        expect(tenantAList.statusCode).toBe(200);
        expect(JSON.stringify(tenantAList.json())).toContain(tenantAAssetId);
        expect(JSON.stringify(tenantAList.json())).not.toContain(tenantBAssetId);

        const tenantAFolders = await api.inject({
          headers: {
            authorization: `Bearer ${tenantAOwner.accessToken}`,
          },
          method: "GET",
          url: "/api/v2/assets/folders",
        });
        expect(tenantAFolders.statusCode).toBe(200);
        expect(JSON.stringify(tenantAFolders.json())).toContain(folderAId);
        expect(JSON.stringify(tenantAFolders.json())).not.toContain(folderBId);

        const crossTenantFolderAssignment = await api.inject({
          headers: {
            authorization: `Bearer ${tenantAOwner.accessToken}`,
          },
          method: "POST",
          payload: {
            assetId: tenantBAssetId,
          },
          url: `/api/v2/assets/folders/${folderAId}/items`,
        });
        expect(crossTenantFolderAssignment.statusCode).toBe(404);

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("upload-bytes can proxy an asset upload when browser direct storage upload is unavailable", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();

      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });
        const storageProvider = new MemoryStorageProvider();
        const api = buildTestApp(appPool, storageProvider);

        const owner = await registerOwner(api, "proxy-upload-owner@example.com", "Proxy Upload Owner");

        const created = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "POST",
          payload: {
            kind: "image",
            mimeType: "image/png",
            originalFilename: "proxy-upload.png",
            sizeBytes: 5,
          },
          url: "/api/v2/assets/presigned-upload",
        });
        expect(created.statusCode).toBe(201);
        const createdBody = created.json();

        const proxied = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
            "content-type": "application/octet-stream",
            "x-asset-upload-content-type": "image/png",
          },
          method: "POST",
          payload: Buffer.from("hello"),
          url: `/api/v2/assets/${createdBody.asset.id}/upload-bytes`,
        });
        expect(proxied.statusCode).toBe(204);

        const complete = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "POST",
          payload: {},
          url: `/api/v2/assets/${createdBody.asset.id}/complete-upload`,
        });
        expect(complete.statusCode).toBe(200);
        expect(complete.json()).toMatchObject({
          id: createdBody.asset.id,
          mimeType: "image/png",
          sizeBytes: 5,
          status: "available",
        });

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("upload-bytes accepts multi-megabyte image payloads without Fastify 413", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();

      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });
        const storageProvider = new MemoryStorageProvider();
        const api = buildTestApp(appPool, storageProvider);

        const owner = await registerOwner(api, "large-upload-owner@example.com", "Large Upload Owner");

        const payload = Buffer.alloc(2 * 1024 * 1024, 1);
        const created = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "POST",
          payload: {
            kind: "image",
            mimeType: "image/png",
            originalFilename: "large-upload.png",
            sizeBytes: payload.length,
          },
          url: "/api/v2/assets/presigned-upload",
        });
        expect(created.statusCode).toBe(201);
        const createdBody = created.json();

        const proxied = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
            "content-type": "application/octet-stream",
            "x-asset-upload-content-type": "image/png",
          },
          method: "POST",
          payload,
          url: `/api/v2/assets/${createdBody.asset.id}/upload-bytes`,
        });

        expect(proxied.statusCode).toBe(204);
        expect(storageProvider.objects.get(`test-bucket/${createdBody.asset.objectKey}`)?.contentLength).toBe(payload.length);

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("upload-bytes creates preview variants for valid uploaded images", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();

      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });
        const storageProvider = new MemoryStorageProvider();
        const api = buildTestApp(appPool, storageProvider);

        const owner = await registerOwner(api, "variant-upload-owner@example.com", "Variant Upload Owner");

        const created = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "POST",
          payload: {
            kind: "image",
            mimeType: "image/png",
            originalFilename: "variant-upload.png",
            sizeBytes: SMALL_PNG_BUFFER.length,
          },
          url: "/api/v2/assets/presigned-upload",
        });
        expect(created.statusCode).toBe(201);
        const createdBody = created.json();

        const proxied = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
            "content-type": "application/octet-stream",
            "x-asset-upload-content-type": "image/png",
          },
          method: "POST",
          payload: SMALL_PNG_BUFFER,
          url: `/api/v2/assets/${createdBody.asset.id}/upload-bytes`,
        });
        expect(proxied.statusCode).toBe(204);

        const complete = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "POST",
          payload: {},
          url: `/api/v2/assets/${createdBody.asset.id}/complete-upload`,
        });
        expect(complete.statusCode).toBe(200);

        const previewResponse = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "GET",
          url: `/api/v2/assets/${createdBody.asset.id}/download-url?variantKey=preview`,
        });

        expect(previewResponse.statusCode).toBe(200);
        expect(previewResponse.json().variantKey).toBe("preview");
        expect(previewResponse.json().url).toContain("preview.webp");

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("download-url can sign a variant instead of the original", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();

      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });
        const storageProvider = new MemoryStorageProvider();
        const api = buildTestApp(appPool, storageProvider);

        const owner = await registerOwner(api, "variant-owner@example.com", "Variant Owner");
        const assetId = await insertAvailableImageAssetWithVariant(
          appPool,
          owner.currentTenant.id,
          owner.user.id,
          {
            variantKey: "preview",
            variantObjectKey: "tenants/test/assets/asset-preview.webp",
          },
        );

        const response = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "GET",
          url: `/api/v2/assets/${assetId}/download-url?variantKey=preview`,
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().url).toContain("asset-preview.webp");

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });

  test("signed-urls returns thumb urls in one request", async () => {
    await withDatabase(async ({ createAppDatabaseUrl, databaseUrl }) => {
      process.env.DATABASE_URL = databaseUrl;
      const adminPool = createPgPool();
      let appPool = createPgPool();

      try {
        await runMigrations(adminPool);
        appPool = createPgPool({
          connectionString: await createAppDatabaseUrl(),
        });
        const storageProvider = new MemoryStorageProvider();
        const api = buildTestApp(appPool, storageProvider);

        const owner = await registerOwner(api, "bulk-variant-owner@example.com", "Bulk Variant Owner");
        const assetId = await insertAvailableImageAssetWithVariant(
          appPool,
          owner.currentTenant.id,
          owner.user.id,
          {
            variantKey: "thumb",
            variantObjectKey: "tenants/test/assets/asset-thumb.webp",
          },
        );

        const response = await api.inject({
          headers: {
            authorization: `Bearer ${owner.accessToken}`,
          },
          method: "POST",
          payload: {
            requests: [{ assetId, variantKey: "thumb" }],
          },
          url: "/api/v2/assets/signed-urls",
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().items).toEqual([
          expect.objectContaining({
            assetId,
            method: "GET",
            variantKey: "thumb",
          }),
        ]);

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });
});
