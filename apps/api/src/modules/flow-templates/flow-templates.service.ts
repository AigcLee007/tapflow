import { createPgPool, withTenantTransaction } from '@aigc-flow/db';
import type { Pool, PoolClient } from 'pg';

import type { FlowTemplateListQuery } from './flow-templates.schemas.js';

type PgPool = Pool;

type FlowTemplateContext = {
  tenantId: string;
  userId: string | null;
};

export type SystemAdminFlowTemplateContext = Required<FlowTemplateContext>;

/**
 * Establishes the database RLS context for service methods reached through an
 * already-authorized `admin:system` route. Never derive this flag from input.
 */
export async function withSystemAdminFlowTemplateTransaction<T>(
  ctx: SystemAdminFlowTemplateContext,
  fn: (client: PoolClient) => Promise<T>,
  pool: Pool,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [ctx.tenantId]);
    await client.query("SELECT set_config('app.user_id', $1, true)", [ctx.userId]);
    await client.query("SELECT set_config('app.is_system_admin', 'true', true)");
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

type FlowTemplateRecord = {
  category: string;
  cover_asset_id: string | null;
  created_at: string;
  created_by: string | null;
  description: string;
  estimated_credits: string | null;
  graph_json: Record<string, unknown>;
  id: string;
  input_schema: unknown[];
  node_count: number;
  published_at: string | null;
  published_by: string | null;
  status: 'archived' | 'draft' | 'published' | 'testing';
  tenant_id: string | null;
  title: string;
  updated_at: string;
  version: number;
  version_snapshot_id: string | null;
  visibility: 'official' | 'private' | 'tenant';
};

export type FlowTemplateView = {
  category: string;
  coverAssetId: string | null;
  createdAt: string;
  createdBy: string | null;
  description: string;
  estimatedCredits: number | null;
  graph: Record<string, unknown>;
  id: string;
  inputSchema: unknown[];
  nodeCount: number;
  publishedAt: string | null;
  publishedBy: string | null;
  status: 'archived' | 'draft' | 'published' | 'testing';
  tenantId: string | null;
  title: string;
  updatedAt: string;
  version: number;
  versionId: string | null;
  visibility: 'official' | 'private' | 'tenant';
};

export class FlowTemplatesApiError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'FlowTemplatesApiError';
    this.statusCode = statusCode;
  }
}

export function mapFlowTemplateRecord(row: FlowTemplateRecord): FlowTemplateView {
  return {
    category: row.category,
    coverAssetId: row.cover_asset_id,
    createdAt: row.created_at,
    createdBy: row.created_by,
    description: row.description,
    estimatedCredits: row.estimated_credits === null ? null : Number(row.estimated_credits),
    graph: row.graph_json,
    id: row.id,
    inputSchema: row.input_schema,
    nodeCount: row.node_count,
    publishedAt: row.published_at,
    publishedBy: row.published_by,
    status: row.status,
    tenantId: row.tenant_id,
    title: row.title,
    updatedAt: row.updated_at,
    version: row.version,
    versionId: row.version_snapshot_id,
    visibility: row.visibility,
  };
}

export class FlowTemplatesService {
  readonly pool: PgPool;

  constructor(options?: { pool?: PgPool }) {
    this.pool = options?.pool ?? createPgPool();
  }

  async listTemplates(ctx: FlowTemplateContext, query: FlowTemplateListQuery): Promise<FlowTemplateView[]> {
    return withTenantTransaction(ctx, async (client) => {
      const result = await client.query<FlowTemplateRecord>(
        `
          SELECT
            id::text AS id,
            tenant_id::text AS tenant_id,
            created_by::text AS created_by,
            title,
            description,
            category,
            visibility,
            cover_asset_id::text AS cover_asset_id,
            graph_json,
            input_schema,
            node_count,
            estimated_credits::text AS estimated_credits,
            status,
            version,
            version_snapshot.id::text AS version_snapshot_id,
            published_at::text AS published_at,
            published_by::text AS published_by,
            created_at::text AS created_at,
            updated_at::text AS updated_at
          FROM flow_templates
          LEFT JOIN flow_template_versions AS version_snapshot
            ON version_snapshot.template_id = flow_templates.id
            AND version_snapshot.version = flow_templates.version
          WHERE tenant_id IS NULL
            AND visibility = 'official'
            AND status = 'published'
            AND ($1::text IS NULL OR category = $1)
            AND (
              $2::text IS NULL
              OR title ILIKE '%' || $2 || '%'
              OR description ILIKE '%' || $2 || '%'
            )
          ORDER BY
            updated_at DESC,
            id ASC
        `,
        [query.category ?? null, query.query?.trim() || null],
      );

      return result.rows.map(mapFlowTemplateRecord);
    }, this.pool);
  }

  async getTemplateGraph(ctx: FlowTemplateContext, templateId: string): Promise<FlowTemplateView> {
    return withTenantTransaction(ctx, async (client) => {
      const result = await client.query<FlowTemplateRecord>(
        `
          SELECT
            id::text AS id,
            tenant_id::text AS tenant_id,
            created_by::text AS created_by,
            title,
            description,
            category,
            visibility,
            cover_asset_id::text AS cover_asset_id,
            graph_json,
            input_schema,
            node_count,
            estimated_credits::text AS estimated_credits,
            status,
            version,
            version_snapshot.id::text AS version_snapshot_id,
            published_at::text AS published_at,
            published_by::text AS published_by,
            created_at::text AS created_at,
            updated_at::text AS updated_at
          FROM flow_templates
          LEFT JOIN flow_template_versions AS version_snapshot
            ON version_snapshot.template_id = flow_templates.id
            AND version_snapshot.version = flow_templates.version
          WHERE id = $1::uuid
            AND tenant_id IS NULL
            AND visibility = 'official'
            AND status = 'published'
          LIMIT 1
        `,
        [templateId],
      );

      const row = result.rows[0];
      if (!row) {
        throw new FlowTemplatesApiError(404, 'FLOW_TEMPLATE_NOT_FOUND', '未找到对应模板');
      }

      return mapFlowTemplateRecord(row);
    }, this.pool);
  }

  async recordUsage(ctx: FlowTemplateContext, templateId: string, projectId?: string): Promise<{ ok: true }> {
    return withTenantTransaction(ctx, async (client) => {
      const template = await client.query<{ id: string }>(
        `
          SELECT id::text AS id
          FROM flow_templates
          WHERE id = $1::uuid
            AND tenant_id IS NULL
            AND visibility = 'official'
            AND status = 'published'
          LIMIT 1
        `,
        [templateId],
      );

      if (!template.rows[0]) {
        throw new FlowTemplatesApiError(404, 'FLOW_TEMPLATE_NOT_FOUND', '未找到对应模板');
      }

      if (projectId) {
        const project = await client.query<{ id: string }>(
          `
            SELECT id::text AS id
            FROM projects
            WHERE id = $1::uuid
              AND tenant_id = $2::uuid
              AND deleted_at IS NULL
            LIMIT 1
          `,
          [projectId, ctx.tenantId],
        );

        if (!project.rows[0]) {
          throw new FlowTemplatesApiError(404, 'PROJECT_NOT_FOUND', '未找到对应项目');
        }
      }

      await client.query(
        `
          INSERT INTO flow_template_usage (
            tenant_id,
            template_id,
            user_id,
            project_id
          )
          VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid)
        `,
        [ctx.tenantId, templateId, ctx.userId, projectId ?? null],
      );

      return { ok: true as const };
    }, this.pool);
  }
}
