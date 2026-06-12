import { createPgPool, withTenantTransaction } from '@aigc-flow/db';
import type { Pool, PoolClient } from 'pg';

import type { CreateFlowCommentInput, UpdateFlowCommentInput } from './flow-comments.schemas.js';

type PgPool = Pool;

type FlowCommentContext = {
  tenantId: string;
  userId: string | null;
};

type FlowCommentRecord = {
  anchor_json: Record<string, unknown> | null;
  author_user_id: string;
  body: string;
  created_at: string;
  flow_id: string | null;
  id: string;
  node_id: string | null;
  project_id: string;
  status: 'open' | 'resolved';
  tenant_id: string;
  updated_at: string;
};

export type FlowCommentView = {
  anchor: Record<string, unknown> | null;
  authorUserId: string;
  body: string;
  createdAt: string;
  flowId: string | null;
  id: string;
  nodeId: string | null;
  projectId: string;
  status: 'open' | 'resolved';
  tenantId: string;
  updatedAt: string;
};

export class FlowCommentsApiError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'FlowCommentsApiError';
    this.statusCode = statusCode;
  }
}

function mapComment(row: FlowCommentRecord): FlowCommentView {
  return {
    anchor: row.anchor_json,
    authorUserId: row.author_user_id,
    body: row.body,
    createdAt: row.created_at,
    flowId: row.flow_id,
    id: row.id,
    nodeId: row.node_id,
    projectId: row.project_id,
    status: row.status,
    tenantId: row.tenant_id,
    updatedAt: row.updated_at,
  };
}

export class FlowCommentsService {
  readonly pool: PgPool;

  constructor(options?: { pool?: PgPool }) {
    this.pool = options?.pool ?? createPgPool();
  }

  async listComments(context: FlowCommentContext, projectId: string): Promise<FlowCommentView[]> {
    return withTenantTransaction(context, async (client) => {
      await this.getProjectOrThrow(client, context.tenantId, projectId);

      const result = await client.query<FlowCommentRecord>(
        `
          SELECT
            id::text AS id,
            tenant_id::text AS tenant_id,
            project_id::text AS project_id,
            flow_id::text AS flow_id,
            node_id,
            author_user_id::text AS author_user_id,
            body,
            status,
            anchor_json,
            created_at::text AS created_at,
            updated_at::text AS updated_at
          FROM flow_comments
          WHERE tenant_id = $1::uuid
            AND project_id = $2::uuid
          ORDER BY
            CASE WHEN status = 'open' THEN 0 ELSE 1 END,
            created_at DESC,
            id ASC
        `,
        [context.tenantId, projectId],
      );

      return result.rows.map(mapComment);
    }, this.pool);
  }

  async createComment(
    context: FlowCommentContext,
    projectId: string,
    input: CreateFlowCommentInput,
  ): Promise<FlowCommentView> {
    return withTenantTransaction(context, async (client) => {
      await this.getProjectOrThrow(client, context.tenantId, projectId);

      if (!context.userId) {
        throw new FlowCommentsApiError(401, 'UNAUTHORIZED', '请先登录后再继续操作');
      }

      if (input.flowId) {
        await this.getFlowOrThrow(client, context.tenantId, projectId, input.flowId);
      }

      const result = await client.query<FlowCommentRecord>(
        `
          INSERT INTO flow_comments (
            tenant_id,
            project_id,
            flow_id,
            node_id,
            author_user_id,
            body,
            anchor_json,
            updated_at
          )
          VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6, $7::jsonb, now())
          RETURNING
            id::text AS id,
            tenant_id::text AS tenant_id,
            project_id::text AS project_id,
            flow_id::text AS flow_id,
            node_id,
            author_user_id::text AS author_user_id,
            body,
            status,
            anchor_json,
            created_at::text AS created_at,
            updated_at::text AS updated_at
        `,
        [
          context.tenantId,
          projectId,
          input.flowId ?? null,
          input.nodeId ?? null,
          context.userId,
          input.body.trim(),
          input.anchor ? JSON.stringify(input.anchor) : null,
        ],
      );

      return mapComment(result.rows[0]);
    }, this.pool);
  }

  async updateComment(
    context: FlowCommentContext,
    projectId: string,
    commentId: string,
    input: UpdateFlowCommentInput,
  ): Promise<FlowCommentView> {
    return withTenantTransaction(context, async (client) => {
      await this.getProjectOrThrow(client, context.tenantId, projectId);

      const existing = await client.query<FlowCommentRecord>(
        `
          SELECT
            id::text AS id,
            tenant_id::text AS tenant_id,
            project_id::text AS project_id,
            flow_id::text AS flow_id,
            node_id,
            author_user_id::text AS author_user_id,
            body,
            status,
            anchor_json,
            created_at::text AS created_at,
            updated_at::text AS updated_at
          FROM flow_comments
          WHERE tenant_id = $1::uuid
            AND project_id = $2::uuid
            AND id = $3::uuid
          LIMIT 1
        `,
        [context.tenantId, projectId, commentId],
      );

      const row = existing.rows[0];
      if (!row) {
        throw new FlowCommentsApiError(404, 'FLOW_COMMENT_NOT_FOUND', '未找到对应评论');
      }

      const updated = await client.query<FlowCommentRecord>(
        `
          UPDATE flow_comments
          SET
            body = $4,
            status = $5,
            updated_at = now()
          WHERE tenant_id = $1::uuid
            AND project_id = $2::uuid
            AND id = $3::uuid
          RETURNING
            id::text AS id,
            tenant_id::text AS tenant_id,
            project_id::text AS project_id,
            flow_id::text AS flow_id,
            node_id,
            author_user_id::text AS author_user_id,
            body,
            status,
            anchor_json,
            created_at::text AS created_at,
            updated_at::text AS updated_at
        `,
        [
          context.tenantId,
          projectId,
          commentId,
          input.body?.trim() ?? row.body,
          input.status ?? row.status,
        ],
      );

      return mapComment(updated.rows[0]);
    }, this.pool);
  }

  private async getProjectOrThrow(client: PoolClient, tenantId: string, projectId: string) {
    const project = await client.query<{ id: string }>(
      `
        SELECT id::text AS id
        FROM projects
        WHERE id = $1::uuid
          AND tenant_id = $2::uuid
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [projectId, tenantId],
    );

    if (!project.rows[0]) {
      throw new FlowCommentsApiError(404, 'PROJECT_NOT_FOUND', '未找到对应项目');
    }
  }

  private async getFlowOrThrow(client: PoolClient, tenantId: string, projectId: string, flowId: string) {
    const flow = await client.query<{ id: string }>(
      `
        SELECT id::text AS id
        FROM flows
        WHERE id = $1::uuid
          AND tenant_id = $2::uuid
          AND project_id = $3::uuid
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [flowId, tenantId, projectId],
    );

    if (!flow.rows[0]) {
      throw new FlowCommentsApiError(404, 'FLOW_NOT_FOUND', '未找到对应流程');
    }
  }
}
