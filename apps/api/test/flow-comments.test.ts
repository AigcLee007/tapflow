import { afterAll, describe, expect, test } from 'vitest';

import { createPgPool } from '@aigc-flow/db';

import { buildApp } from '../src/app.js';
import type { ApiEnv } from '../src/config/env.js';
import { runMigrations } from '../../../packages/db/src/migrator.js';
import { hasDatabaseEnv, withDatabase } from '../../../packages/db/test/helpers.js';
import { currentLegalConsent } from './legal-consent.fixture.js';

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
      consent: currentLegalConsent,
      tenantName,
    },
    url: '/api/v2/auth/register',
  });

  expect(response.statusCode).toBe(201);
  return response.json();
}

describeWithDatabase('flow comments API', () => {
  test('creates project/node comments, lists, resolves, and blocks cross-tenant access', async () => {
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

        const ownerA = await registerOwner(api, 'comments-owner-a@example.com', 'Comments Tenant A');
        const ownerB = await registerOwner(api, 'comments-owner-b@example.com', 'Comments Tenant B');

        const projectA = await api.inject({
          headers: {
            authorization: `Bearer ${ownerA.accessToken}`,
          },
          method: 'POST',
          payload: {
            name: 'Comments Project A',
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
            title: 'Comments Flow A',
          },
          url: `/api/v2/projects/${projectA.json().id}/flows`,
        });
        expect(flowA.statusCode).toBe(201);

        const projectComment = await api.inject({
          headers: {
            authorization: `Bearer ${ownerA.accessToken}`,
          },
          method: 'POST',
          payload: {
            body: 'Project-level review note',
          },
          url: `/api/v2/projects/${projectA.json().id}/comments`,
        });
        expect(projectComment.statusCode).toBe(201);

        const nodeComment = await api.inject({
          headers: {
            authorization: `Bearer ${ownerA.accessToken}`,
          },
          method: 'POST',
          payload: {
            anchor: { x: 120, y: 240 },
            body: 'Node-level change request',
            flowId: flowA.json().id,
            nodeId: 'node-123',
          },
          url: `/api/v2/projects/${projectA.json().id}/comments`,
        });
        expect(nodeComment.statusCode).toBe(201);
        expect(nodeComment.json()).toMatchObject({
          flowId: flowA.json().id,
          nodeId: 'node-123',
          status: 'open',
        });

        const listOpen = await api.inject({
          headers: {
            authorization: `Bearer ${ownerA.accessToken}`,
          },
          method: 'GET',
          url: `/api/v2/projects/${projectA.json().id}/comments`,
        });
        expect(listOpen.statusCode).toBe(200);
        expect(listOpen.json().items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              body: 'Project-level review note',
              nodeId: null,
              status: 'open',
            }),
            expect.objectContaining({
              body: 'Node-level change request',
              nodeId: 'node-123',
              status: 'open',
            }),
          ]),
        );

        const resolved = await api.inject({
          headers: {
            authorization: `Bearer ${ownerA.accessToken}`,
          },
          method: 'PATCH',
          payload: {
            status: 'resolved',
          },
          url: `/api/v2/projects/${projectA.json().id}/comments/${nodeComment.json().id}`,
        });
        expect(resolved.statusCode).toBe(200);
        expect(resolved.json()).toMatchObject({
          id: nodeComment.json().id,
          status: 'resolved',
        });

        const projectB = await api.inject({
          headers: {
            authorization: `Bearer ${ownerB.accessToken}`,
          },
          method: 'POST',
          payload: {
            name: 'Comments Project B',
          },
          url: '/api/v2/projects',
        });
        expect(projectB.statusCode).toBe(201);

        const crossTenantList = await api.inject({
          headers: {
            authorization: `Bearer ${ownerB.accessToken}`,
          },
          method: 'GET',
          url: `/api/v2/projects/${projectA.json().id}/comments`,
        });
        expect(crossTenantList.statusCode).toBe(404);

        await api.close();
      } finally {
        await appPool.end();
        await adminPool.end();
      }
    });
  });
});
