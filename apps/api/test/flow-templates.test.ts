import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, test } from 'vitest';

import { createPgPool, withTenantTransaction } from '@aigc-flow/db';

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

describeWithDatabase('flow templates API', () => {
  test('requires auth, respects tenant visibility, and records usage', async () => {
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

        const ownerA = await registerOwner(api, 'templates-owner-a@example.com', 'Templates Tenant A');
        const ownerB = await registerOwner(api, 'templates-owner-b@example.com', 'Templates Tenant B');

        const projectA = await api.inject({
          headers: {
            authorization: `Bearer ${ownerA.accessToken}`,
          },
          method: 'POST',
          payload: {
            name: 'Template Project A',
          },
          url: '/api/v2/projects',
        });
        expect(projectA.statusCode).toBe(201);

        const officialTemplateId = randomUUID();
        const tenantTemplateId = randomUUID();
        const privateOtherTenantTemplateId = randomUUID();

        await withTenantTransaction(
          { tenantId: ownerA.currentTenant.id, userId: ownerA.user.id },
          async (client) => {
            await client.query(
              `
                INSERT INTO flow_templates (
                  id,
                  tenant_id,
                  created_by,
                  title,
                  description,
                  category,
                  visibility,
                  graph_json,
                  node_count
                )
                VALUES
                  ($1::uuid, NULL, $4::uuid, 'Official Portrait', 'Official template', 'image', 'official', '{"nodes":[],"edges":[]}'::jsonb, 0),
                  ($2::uuid, $3::uuid, $4::uuid, 'Tenant Moodboard', 'Tenant template', 'image', 'tenant', '{"nodes":[{"id":"node-a"}],"edges":[]}'::jsonb, 1)
              `,
              [officialTemplateId, tenantTemplateId, ownerA.currentTenant.id, ownerA.user.id],
            );
          },
          adminPool,
        );

        await withTenantTransaction(
          { tenantId: ownerB.currentTenant.id, userId: ownerB.user.id },
          async (client) => {
            await client.query(
              `
                INSERT INTO flow_templates (
                  id,
                  tenant_id,
                  created_by,
                  title,
                  description,
                  category,
                  visibility,
                  graph_json,
                  node_count
                )
                VALUES
                  ($1::uuid, $2::uuid, $3::uuid, 'Other Tenant Private', 'Private template', 'image', 'private', '{"nodes":[{"id":"node-b"}],"edges":[]}'::jsonb, 1)
              `,
              [privateOtherTenantTemplateId, ownerB.currentTenant.id, ownerB.user.id],
            );
          },
          adminPool,
        );

        const anonymous = await api.inject({
          method: 'GET',
          url: '/api/v2/flow-templates',
        });
        expect(anonymous.statusCode).toBe(401);

        const listResponse = await api.inject({
          headers: {
            authorization: `Bearer ${ownerA.accessToken}`,
          },
          method: 'GET',
          url: '/api/v2/flow-templates',
        });
        expect(listResponse.statusCode).toBe(200);
        expect(listResponse.json()).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: officialTemplateId,
              title: 'Official Portrait',
              visibility: 'official',
            }),
            expect.objectContaining({
              id: tenantTemplateId,
              title: 'Tenant Moodboard',
              visibility: 'tenant',
            }),
          ]),
        );
        expect(
          listResponse.json().some((item: { id: string }) => item.id === privateOtherTenantTemplateId),
        ).toBe(false);

        const detailResponse = await api.inject({
          headers: {
            authorization: `Bearer ${ownerA.accessToken}`,
          },
          method: 'GET',
          url: `/api/v2/flow-templates/${tenantTemplateId}`,
        });
        expect(detailResponse.statusCode).toBe(200);
        expect(detailResponse.json()).toMatchObject({
          id: tenantTemplateId,
          graph: {
            edges: [],
            nodes: [{ id: 'node-a' }],
          },
        });

        const usageResponse = await api.inject({
          headers: {
            authorization: `Bearer ${ownerA.accessToken}`,
          },
          method: 'POST',
          payload: {
            projectId: projectA.json().id,
          },
          url: `/api/v2/flow-templates/${tenantTemplateId}/usage`,
        });
        expect(usageResponse.statusCode).toBe(201);
        expect(usageResponse.json()).toEqual({ ok: true });

        const usageRows = await adminPool.query<{
          project_id: string | null;
          template_id: string;
          tenant_id: string;
          user_id: string;
        }>(
          `
            SELECT
              tenant_id::text AS tenant_id,
              template_id::text AS template_id,
              user_id::text AS user_id,
              project_id::text AS project_id
            FROM flow_template_usage
            WHERE template_id = $1::uuid
          `,
          [tenantTemplateId],
        );
        expect(usageRows.rows).toEqual([
          expect.objectContaining({
            project_id: projectA.json().id,
            template_id: tenantTemplateId,
            tenant_id: ownerA.currentTenant.id,
            user_id: ownerA.user.id,
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
