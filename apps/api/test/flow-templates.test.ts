import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, test } from 'vitest';

import { createPgPool, withTenantTransaction } from '@aigc-flow/db';

import { buildApp } from '../src/app.js';
import type { ApiEnv } from '../src/config/env.js';
import { runMigrations } from '../../../packages/db/src/migrator.js';
import { hasDatabaseEnv, withDatabase } from '../../../packages/db/test/helpers.js';
import { currentLegalConsent } from './legal-consent.fixture.js';
import {
  flowTemplateInputDefinitionSchema,
  flowTemplateLifecycleStatusSchema,
  saveFlowTemplateDraftSchema,
} from '../src/modules/flow-templates/flow-templates.schemas.js';

const originalDatabaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = hasDatabaseEnv() ? describe : describe.skip;

describe('flow template lifecycle schemas', () => {
  test('accepts a draft with the supported template input definitions', () => {
    const result = saveFlowTemplateDraftSchema.parse({
      category: 'video',
      graph: { edges: [], nodes: [{ id: 'image-node' }] },
      inputSchema: [
        { id: 'prompt', label: 'Prompt', target: { fieldPath: 'data.prompt', nodeId: 'image-node' }, type: 'text' },
        { id: 'source', label: 'Source', target: { fieldPath: 'data.assetId', nodeId: 'image-node' }, type: 'asset' },
        {
          defaultValue: '16:9',
          id: 'ratio',
          label: 'Ratio',
          options: ['16:9', '9:16'],
          target: { fieldPath: 'data.ratio', nodeId: 'image-node' },
          type: 'enum',
        },
        {
          defaultValue: 4,
          id: 'duration',
          label: 'Duration',
          maximum: 12,
          minimum: 1,
          target: { fieldPath: 'data.duration', nodeId: 'image-node' },
          type: 'number',
        },
      ],
      title: 'Product video',
    });

    expect(result.inputSchema).toHaveLength(4);
    expect(flowTemplateLifecycleStatusSchema.parse('testing')).toBe('testing');
  });

  test('rejects duplicate input IDs and invalid type-specific defaults', () => {
    expect(() =>
      saveFlowTemplateDraftSchema.parse({
        graph: { edges: [], nodes: [] },
        inputSchema: [
          { id: 'duplicate', label: 'First', target: { fieldPath: 'data.a', nodeId: 'a' }, type: 'text' },
          { id: 'duplicate', label: 'Second', target: { fieldPath: 'data.b', nodeId: 'b' }, type: 'text' },
        ],
        title: 'Duplicate inputs',
      }),
    ).toThrow();

    expect(() =>
      flowTemplateInputDefinitionSchema.parse({
        defaultValue: '1:1',
        id: 'ratio',
        label: 'Ratio',
        options: ['16:9'],
        target: { fieldPath: 'data.ratio', nodeId: 'node-a' },
        type: 'enum',
      }),
    ).toThrow();

    expect(() =>
      flowTemplateInputDefinitionSchema.parse({
        defaultValue: 16,
        id: 'duration',
        label: 'Duration',
        maximum: 12,
        target: { fieldPath: 'data.duration', nodeId: 'node-a' },
        type: 'number',
      }),
    ).toThrow();
  });
});

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
        const draftTemplateId = randomUUID();
        const archivedTemplateId = randomUUID();

        await withTenantTransaction(
          { tenantId: ownerA.currentTenant.id, userId: ownerA.user.id },
          async (client) => {
            await client.query("SELECT set_config('app.is_system_admin', 'true', true)");
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
                  status,
                  graph_json,
                  node_count
                )
                VALUES
                  ($1::uuid, NULL, $4::uuid, 'Official Portrait', 'Official template', 'image', 'official', 'published', '{"nodes":[],"edges":[]}'::jsonb, 0),
                  ($2::uuid, NULL, $4::uuid, 'Draft Moodboard', 'Draft template', 'image', 'official', 'draft', '{"nodes":[{"id":"node-a"}],"edges":[]}'::jsonb, 1),
                  ($3::uuid, NULL, $4::uuid, 'Archived Template', 'Archived template', 'image', 'official', 'archived', '{"nodes":[{"id":"node-b"}],"edges":[]}'::jsonb, 1)
              `,
              [officialTemplateId, draftTemplateId, archivedTemplateId, ownerA.user.id],
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
          ]),
        );
        expect(
          listResponse.json().some((item: { id: string }) => item.id === draftTemplateId || item.id === archivedTemplateId),
        ).toBe(false);

        const detailResponse = await api.inject({
          headers: {
            authorization: `Bearer ${ownerA.accessToken}`,
          },
          method: 'GET',
          url: `/api/v2/flow-templates/${officialTemplateId}`,
        });
        expect(detailResponse.statusCode).toBe(200);
        expect(detailResponse.json()).toMatchObject({
          id: officialTemplateId,
          graph: {
            edges: [],
            nodes: [],
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
          url: `/api/v2/flow-templates/${officialTemplateId}/usage`,
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
          [officialTemplateId],
        );
        expect(usageRows.rows).toEqual([
          expect.objectContaining({
            project_id: projectA.json().id,
            template_id: officialTemplateId,
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
