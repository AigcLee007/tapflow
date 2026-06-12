import { afterAll, describe, expect, test } from 'vitest';

import { createPgPool } from '@aigc-flow/db';

import { buildApp } from '../src/app.js';
import type { ApiEnv } from '../src/config/env.js';
import { runMigrations } from '../../../packages/db/src/migrator.js';
import { hasDatabaseEnv, withDatabase } from '../../../packages/db/test/helpers.js';

const originalDatabaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = hasDatabaseEnv() ? describe : describe.skip;

const testEnv: ApiEnv = {
  accessTokenTtlSeconds: 60 * 15,
  adminEmails: [],
  apiRateLimitMax: 1000,
  apiRateLimitWindowMs: 60_000,
  authRateLimitMax: 20,
  authRateLimitWindowMs: 60_000,
  corsAllowedOrigins: ['http://localhost:5173'],
  credentialKeyVersion: 'v1',
  credentialMasterKey: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
  jwtAccessSecret: 'test_access_secret_1234567890',
  jwtRefreshSecret: 'test_refresh_secret_1234567890',
  nodeEnv: 'test',
  refreshTokenTtlSeconds: 60 * 60 * 24 * 7,
  s3AccessKeyId: 'test-access',
  s3Bucket: 'test-bucket',
  s3Endpoint: 'http://localhost:9000',
  s3ForcePathStyle: true,
  s3Region: 'us-east-1',
  s3SecretAccessKey: 'test-secret',
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

function buildTestApp(pool: ReturnType<typeof createPgPool>) {
  return buildApp({
    env: testEnv,
    logger: false,
    pool,
  });
}

async function registerOwner(
  api: ReturnType<typeof buildTestApp>,
  email: string,
  tenantName: string,
) {
  const response = await api.inject({
    method: 'POST',
    payload: {
      email,
      password: 'StrongPass123!',
      tenantName,
    },
    url: '/api/v2/auth/register',
  });

  expect(response.statusCode).toBe(201);
  return response.json();
}

describeWithDatabase('flow history API', () => {
  test('creates snapshots, lists newest history first, restores a version, and blocks cross-tenant access', async () => {
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

        const ownerA = await registerOwner(api, 'history-owner-a@example.com', 'History Tenant A');
        const ownerB = await registerOwner(api, 'history-owner-b@example.com', 'History Tenant B');

        const projectA = await api.inject({
          headers: {
            authorization: `Bearer ${ownerA.accessToken}`,
          },
          method: 'POST',
          payload: {
            name: 'History Project A',
          },
          url: '/api/v2/projects',
        });
        expect(projectA.statusCode).toBe(201);

        const flowA = await api.inject({
          headers: {
            authorization: `Bearer ${ownerA.accessToken}`,
          },
          method: 'POST',
          payload: {
            title: 'History Flow A',
          },
          url: `/api/v2/projects/${projectA.json().id}/flows`,
        });
        expect(flowA.statusCode).toBe(201);

        const initialDraft = await api.inject({
          headers: {
            authorization: `Bearer ${ownerA.accessToken}`,
          },
          method: 'GET',
          url: `/api/v2/flows/${flowA.json().id}/draft`,
        });
        expect(initialDraft.statusCode).toBe(200);

        const savedDraft = await api.inject({
          headers: {
            authorization: `Bearer ${ownerA.accessToken}`,
          },
          method: 'PUT',
          payload: {
            expectedRevision: initialDraft.json().revision,
            graph: {
              edges: [{ id: 'edge-a-1', source: 'image-a-1', target: 'text-a-1' }],
              nodes: [
                {
                  id: 'image-a-1',
                  type: 'image',
                  position: { x: 80, y: 120 },
                  data: {
                    assetId: 'asset-a-1',
                    kind: 'image',
                    thumbnailUrl: 'https://cdn.test/a1.png',
                    title: 'History Image A1',
                  },
                },
                {
                  id: 'text-a-1',
                  type: 'text',
                  position: { x: 360, y: 120 },
                  data: {
                    kind: 'text',
                    prompt: 'first draft prompt',
                    title: 'History Prompt A1',
                  },
                },
              ],
              viewport: { x: 10, y: 20, zoom: 0.9 },
            },
          },
          url: `/api/v2/flows/${flowA.json().id}/draft`,
        });
        expect(savedDraft.statusCode).toBe(200);

        const snapshotOne = await api.inject({
          headers: {
            authorization: `Bearer ${ownerA.accessToken}`,
          },
          method: 'POST',
          payload: {
            label: 'First checkpoint',
          },
          url: `/api/v2/projects/${projectA.json().id}/history/snapshot`,
        });
        expect(snapshotOne.statusCode).toBe(201);
        expect(snapshotOne.json()).toMatchObject({
          label: 'First checkpoint',
          projectId: projectA.json().id,
          version: 1,
        });

        const secondDraft = await api.inject({
          headers: {
            authorization: `Bearer ${ownerA.accessToken}`,
          },
          method: 'PUT',
          payload: {
            expectedRevision: savedDraft.json().revision,
            graph: {
              edges: [{ id: 'edge-a-2', source: 'image-a-2', target: 'text-a-2' }],
              nodes: [
                {
                  id: 'image-a-2',
                  type: 'image',
                  position: { x: 140, y: 200 },
                  data: {
                    assetId: 'asset-a-2',
                    kind: 'image',
                    thumbnailUrl: 'https://cdn.test/a2.png',
                    title: 'History Image A2',
                  },
                },
                {
                  id: 'text-a-2',
                  type: 'text',
                  position: { x: 460, y: 200 },
                  data: {
                    kind: 'text',
                    prompt: 'second draft prompt',
                    title: 'History Prompt A2',
                  },
                },
              ],
              viewport: { x: 32, y: 48, zoom: 0.72 },
            },
          },
          url: `/api/v2/flows/${flowA.json().id}/draft`,
        });
        expect(secondDraft.statusCode).toBe(200);

        const snapshotTwo = await api.inject({
          headers: {
            authorization: `Bearer ${ownerA.accessToken}`,
          },
          method: 'POST',
          payload: {
            label: 'Second checkpoint',
          },
          url: `/api/v2/projects/${projectA.json().id}/history/snapshot`,
        });
        expect(snapshotTwo.statusCode).toBe(201);
        expect(snapshotTwo.json()).toMatchObject({
          label: 'Second checkpoint',
          version: 2,
        });

        const history = await api.inject({
          headers: {
            authorization: `Bearer ${ownerA.accessToken}`,
          },
          method: 'GET',
          url: `/api/v2/projects/${projectA.json().id}/history`,
        });
        expect(history.statusCode).toBe(200);
        expect(history.json().items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: 'snapshot',
              versionId: snapshotOne.json().versionId,
            }),
            expect.objectContaining({
              type: 'snapshot',
              versionId: snapshotTwo.json().versionId,
            }),
          ]),
        );
        expect(history.json().items[0]).toMatchObject({
          label: 'Second checkpoint',
          type: 'snapshot',
          versionId: snapshotTwo.json().versionId,
        });

        const restored = await api.inject({
          headers: {
            authorization: `Bearer ${ownerA.accessToken}`,
          },
          method: 'POST',
          url: `/api/v2/projects/${projectA.json().id}/history/${snapshotOne.json().versionId}/restore`,
        });
        expect(restored.statusCode).toBe(200);
        expect(restored.json()).toMatchObject({
          flowId: flowA.json().id,
          graph: {
            nodes: [
              expect.objectContaining({
                id: 'image-a-1',
              }),
            ],
            viewport: { x: 10, y: 20, zoom: 0.9 },
          },
        });

        const restoredDraft = await api.inject({
          headers: {
            authorization: `Bearer ${ownerA.accessToken}`,
          },
          method: 'GET',
          url: `/api/v2/flows/${flowA.json().id}/draft`,
        });
        expect(restoredDraft.statusCode).toBe(200);
        expect(restoredDraft.json()).toMatchObject({
          graph: {
            nodes: [
              expect.objectContaining({
                id: 'image-a-1',
              }),
            ],
            viewport: { x: 10, y: 20, zoom: 0.9 },
          },
        });

        const crossTenantHistory = await api.inject({
          headers: {
            authorization: `Bearer ${ownerB.accessToken}`,
          },
          method: 'GET',
          url: `/api/v2/projects/${projectA.json().id}/history`,
        });
        expect(crossTenantHistory.statusCode).toBe(404);

        const crossTenantRestore = await api.inject({
          headers: {
            authorization: `Bearer ${ownerB.accessToken}`,
          },
          method: 'POST',
          url: `/api/v2/projects/${projectA.json().id}/history/${snapshotOne.json().versionId}/restore`,
        });
        expect(crossTenantRestore.statusCode).toBe(404);

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });
});
