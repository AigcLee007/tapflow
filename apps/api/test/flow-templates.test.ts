import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, test } from 'vitest';

import { createPgPool, withTenantTransaction } from '@aigc-flow/db';
import type { PoolClient } from 'pg';

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
import {
  mapFlowTemplateRecord,
  FlowTemplatesApiError,
  FlowTemplatesService,
  withSystemAdminFlowTemplateTransaction,
} from '../src/modules/flow-templates/flow-templates.service.js';

const originalDatabaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = hasDatabaseEnv() ? describe : describe.skip;

describe('flow template lifecycle schemas', () => {
  test('publishing stores normalized content as an immutable current-version snapshot', async () => {
    const queries: Array<{ sql: string; values?: unknown[] }> = [];
    const client = {
      query: async (sql: string, values?: unknown[]) => {
        queries.push({ sql, values });
        if ((sql.includes('SELECT id::text AS id') && sql.includes('FOR UPDATE')) || sql.includes('UPDATE flow_templates SET graph_json')) {
          return {
            rows: [
              {
                category: 'image', cover_asset_id: null, created_at: '2026-08-13T00:00:00.000Z', created_by: randomUUID(),
                description: '', estimated_credits: '2', graph_json: { nodes: [{ id: 'node-a', position: { x: 10, y: 20 } }], edges: [] },
                id: randomUUID(), input_schema: [], node_count: 1, published_at: null, published_by: null, status: 'testing',
                tenant_id: null, title: 'Snapshot', updated_at: '2026-08-13T00:00:00.000Z', version: 0, version_snapshot_id: null, visibility: 'official',
              },
            ],
          };
        }
        return { rows: [] };
      },
      release: () => undefined,
    } as unknown as PoolClient;
    const pool = { connect: async () => client } as unknown as ReturnType<typeof createPgPool>;
    const service = new FlowTemplatesService({ pool });

    await service.publish({ tenantId: randomUUID(), userId: randomUUID() }, randomUUID());

    expect(queries.some(({ sql }) => sql.includes('INSERT INTO flow_template_versions'))).toBe(true);
    expect(queries.some(({ sql }) => sql.includes("status='published'"))).toBe(true);
  });

  test('rejects publishing a draft before it has entered testing', async () => {
    const client = {
      query: async (sql: string) => ({
        rows: sql.includes('FOR UPDATE')
          ? [{ id: randomUUID(), status: 'draft', graph_json: { nodes: [], edges: [] }, input_schema: [], node_count: 0 }]
          : [],
      }),
      release: () => undefined,
    } as unknown as PoolClient;
    const pool = { connect: async () => client } as unknown as ReturnType<typeof createPgPool>;
    const service = new FlowTemplatesService({ pool });

    await expect(service.publish({ tenantId: randomUUID(), userId: randomUUID() }, randomUUID())).rejects.toMatchObject({
      code: 'FLOW_TEMPLATE_NOT_READY',
      statusCode: 409,
    } satisfies Partial<FlowTemplatesApiError>);
  });

  test('rejects template inputs that do not target an existing node data field', async () => {
    const service = new FlowTemplatesService({
      pool: { connect: async () => { throw new Error('database must not be reached'); } } as unknown as ReturnType<typeof createPgPool>,
    });

    await expect(service.createDraft({ tenantId: randomUUID(), userId: randomUUID() }, {
      category: 'image', estimatedCredits: null,
      graph: { nodes: [{ id: 'image', data: { prompt: 'hello' } }], edges: [] },
      inputSchema: [{ id: 'missing', label: 'Missing', target: { nodeId: 'image', fieldPath: 'data.notThere' }, type: 'text' }],
      title: 'Invalid input',
    })).rejects.toMatchObject({ code: 'INVALID_TEMPLATE_INPUT' });
  });

  test('rejects secret-bearing keys and signed URLs anywhere in a template graph', async () => {
    const service = new FlowTemplatesService({
      pool: { connect: async () => { throw new Error('database must not be reached'); } } as unknown as ReturnType<typeof createPgPool>,
    });
    const context = { tenantId: randomUUID(), userId: randomUUID() };
    const createInput = (data: Record<string, unknown>) => ({
      category: 'image', estimatedCredits: null,
      graph: { nodes: [{ id: 'image', data }], edges: [] }, inputSchema: [], title: 'Unsafe graph',
    });

    await expect(service.createDraft(context, createInput({ nested: { apiKey: 'value' } }))).rejects.toMatchObject({ code: 'UNSAFE_TEMPLATE_GRAPH' });
    await expect(service.createDraft(context, createInput({ previewUrl: 'https://bucket.example/file.png?X-Amz-Signature=abc&X-Amz-Credential=key' }))).rejects.toMatchObject({ code: 'UNSAFE_TEMPLATE_GRAPH' });
    await expect(service.createDraft(context, createInput({ previewUrl: 'https://storage.googleapis.com/bucket/file.png?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Signature=abc' }))).rejects.toMatchObject({ code: 'UNSAFE_TEMPLATE_GRAPH' });
  });

  test('does not mark a published template testing without a saved next draft', async () => {
    const queries: Array<{ sql: string }> = [];
    const published = {
      category: 'image', cover_asset_id: null, created_at: '2026-08-13T00:00:00.000Z', created_by: randomUUID(), description: '', estimated_credits: '2',
      graph_json: { nodes: [{ id: 'node-a', data: { prompt: 'old' } }], edges: [] }, id: randomUUID(), input_schema: [], node_count: 1,
      published_at: '2026-08-13T00:00:00.000Z', published_by: randomUUID(), status: 'published', tenant_id: null, title: 'Published', updated_at: '2026-08-13T00:00:00.000Z', version: 1, version_snapshot_id: null, visibility: 'official',
    };
    const client = { query: async (sql: string) => { queries.push({ sql }); return { rows: sql.includes('FOR UPDATE') ? [published] : [] }; }, release: () => undefined } as unknown as PoolClient;
    const service = new FlowTemplatesService({ pool: { connect: async () => client } as unknown as ReturnType<typeof createPgPool> });

    await expect(service.markTesting({ tenantId: randomUUID(), userId: randomUUID() }, published.id)).rejects.toMatchObject({ code: 'FLOW_TEMPLATE_DRAFT_REQUIRED', statusCode: 409 });
    expect(queries.some(({ sql }) => sql.includes('UPDATE flow_templates'))).toBe(false);
  });

  test('editing a published template writes its next draft without changing the published status', async () => {
    const queries: Array<{ sql: string }> = [];
    const published = {
      category: 'image', cover_asset_id: null, created_at: '2026-08-13T00:00:00.000Z', created_by: randomUUID(), description: '',
      estimated_credits: '2', graph_json: { nodes: [{ id: 'node-a', data: { prompt: 'old' } }], edges: [] }, id: randomUUID(), input_schema: [], node_count: 1,
      published_at: '2026-08-13T00:00:00.000Z', published_by: randomUUID(), status: 'published', tenant_id: null, title: 'Published',
      updated_at: '2026-08-13T00:00:00.000Z', version: 1, version_snapshot_id: null, visibility: 'official',
    };
    const client = {
      query: async (sql: string) => {
        queries.push({ sql });
        return { rows: sql.includes('FOR UPDATE') || sql.includes('UPDATE flow_templates') ? [published] : [] };
      }, release: () => undefined,
    } as unknown as PoolClient;
    const service = new FlowTemplatesService({ pool: { connect: async () => client } as unknown as ReturnType<typeof createPgPool> });

    await service.updateDraft({ tenantId: randomUUID(), userId: randomUUID() }, published.id, {
      category: 'image', estimatedCredits: 3, graph: { nodes: [{ id: 'node-a', data: { prompt: 'new' } }], edges: [] }, inputSchema: [], title: 'Published',
    });

    const updateSql = queries.find(({ sql }) => sql.includes('UPDATE flow_templates'))?.sql ?? '';
    expect(updateSql).toContain('draft_graph_json');
    expect(updateSql).not.toMatch(/\n\s*status\s*=/);
  });

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
    expect(result.inputSchema[0]?.type).toBe('text');
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

  test('maps persisted template input schema into the API response', () => {
    const template = mapFlowTemplateRecord({
      category: 'image',
      cover_asset_id: null,
      created_at: '2026-08-13T00:00:00.000Z',
      created_by: null,
      description: '',
      estimated_credits: null,
      graph_json: { edges: [], nodes: [] },
      id: randomUUID(),
      input_schema: [{ id: 'prompt', label: 'Prompt', target: { fieldPath: 'data.prompt', nodeId: 'node-a' }, type: 'text' }],
      node_count: 0,
      published_at: null,
      published_by: null,
      status: 'draft',
      tenant_id: null,
      title: 'Draft',
      updated_at: '2026-08-13T00:00:00.000Z',
      version: 1,
      version_snapshot_id: randomUUID(),
      visibility: 'official',
    });

    expect(template.inputSchema).toEqual([
      expect.objectContaining({ id: 'prompt', type: 'text' }),
    ]);
    expect(template.versionId).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('establishes the server-trusted system-admin database context', async () => {
    const queries: string[] = [];
    const client = {
      query: async (sql: string) => {
        queries.push(sql);
        return { rows: [] };
      },
      release: () => undefined,
    } as unknown as PoolClient;
    const pool = { connect: async () => client } as unknown as ReturnType<typeof createPgPool>;

    await withSystemAdminFlowTemplateTransaction(
      { tenantId: randomUUID(), userId: randomUUID() },
      async () => 'ok',
      pool,
    );

    expect(queries).toContain("SELECT set_config('app.is_system_admin', 'true', true)");
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

        const nonAdminRead = await api.inject({
          headers: { authorization: `Bearer ${ownerA.accessToken}` },
          method: 'GET',
          url: '/api/v2/admin/flow-templates',
        });
        expect(nonAdminRead.statusCode).toBe(403);

        const nonAdminMutation = await api.inject({
          headers: { authorization: `Bearer ${ownerA.accessToken}` },
          method: 'POST',
          payload: { category: 'image', graph: { edges: [], nodes: [] }, title: 'Forbidden' },
          url: '/api/v2/admin/flow-templates',
        });
        expect(nonAdminMutation.statusCode).toBe(403);

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
                  published_at,
                  input_schema,
                  graph_json,
                  node_count
                )
                VALUES
                  ($1::uuid, NULL, $4::uuid, 'Official Portrait', 'Official template', 'image', 'official', 'published', now(), '[{"id":"prompt","label":"Prompt","type":"text","target":{"nodeId":"node-a","fieldPath":"data.prompt"}}]'::jsonb, '{"nodes":[],"edges":[]}'::jsonb, 0),
                  ($2::uuid, NULL, $4::uuid, 'Draft Moodboard', 'Draft template', 'image', 'official', 'draft', NULL, '[]'::jsonb, '{"nodes":[{"id":"node-a"}],"edges":[]}'::jsonb, 1),
                  ($3::uuid, NULL, $4::uuid, 'Archived Template', 'Archived template', 'image', 'official', 'archived', NULL, '[]'::jsonb, '{"nodes":[{"id":"node-b"}],"edges":[]}'::jsonb, 1)
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
          inputSchema: [expect.objectContaining({ id: 'prompt', type: 'text' })],
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
