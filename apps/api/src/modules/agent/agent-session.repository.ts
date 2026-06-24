import type { Pool, PoolClient } from "pg";

import { createPgPool, withTenantTransaction } from "@aigc-flow/db";

type AgentContext = {
  tenantId: string;
  userId: string | null;
};

export type AgentSessionListItem = {
  createdAt: string;
  flowId: string | null;
  id: string;
  projectId: string | null;
  status: string;
  title: string;
  updatedAt: string;
};

export type AgentHistoryMessage = {
  content: string;
  createdAt: string;
  id: string;
  metadata: Record<string, unknown>;
  role: "assistant" | "system" | "user";
  sessionId: string;
};

export type AgentHistoryTurn = {
  createdAt: string;
  errorJson: unknown;
  id: string;
  planJson: unknown;
  sessionId: string;
  snapshotJson: unknown;
  status: string;
  updatedAt: string;
};

export type AgentSessionEventRecord = {
  createdAt: string;
  eventJson: Record<string, unknown>;
  eventType: string;
  id: string;
  seq: number;
  sessionId: string;
  taskId: string | null;
  turnId: string | null;
};

export type AppendAgentSessionEventInput = {
  eventJson: Record<string, unknown>;
  eventType: string;
  sessionId: string;
  taskId?: string | null;
  turnId?: string | null;
};

type SessionRow = {
  created_at: string;
  flow_id: string | null;
  id: string;
  project_id: string | null;
  status: string;
  title: string;
  updated_at: string;
};

export class AgentSessionRepository {
  readonly pool: Pool;

  constructor(options?: { pool?: Pool }) {
    this.pool = options?.pool ?? createPgPool();
  }

  async listSessions(
    context: AgentContext,
    filter: { flowId?: string | null; limit?: number; projectId?: string | null },
  ): Promise<AgentSessionListItem[]> {
    return withTenantTransaction(context, async (client) => {
      const values: Array<number | string | null> = [];
      const where: string[] = [];

      if (filter.projectId !== undefined) {
        values.push(filter.projectId);
        where.push(`project_id IS NOT DISTINCT FROM $${values.length}::uuid`);
      }

      if (filter.flowId !== undefined) {
        values.push(filter.flowId);
        where.push(`flow_id IS NOT DISTINCT FROM $${values.length}::uuid`);
      }

      values.push(filter.limit ?? 20);

      const result = await client.query<SessionRow>(
        `
          SELECT
            id::text AS id,
            project_id::text AS project_id,
            flow_id::text AS flow_id,
            title,
            status,
            created_at::text AS created_at,
            updated_at::text AS updated_at
          FROM agent_sessions
          ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
          ORDER BY updated_at DESC, created_at DESC
          LIMIT $${values.length}
        `,
        values,
      );

      return result.rows.map((row) => this.mapSession(row));
    }, this.pool);
  }

  async getSessionHistory(context: AgentContext, sessionId: string) {
    return withTenantTransaction(context, async (client) => {
      const session = await this.requireSession(client, sessionId);
      const messages = await client.query<{
        content: string;
        created_at: string;
        id: string;
        metadata_json: Record<string, unknown>;
        role: "assistant" | "system" | "user";
        session_id: string;
      }>(
        `
          SELECT
            id::text AS id,
            session_id::text AS session_id,
            role,
            content,
            metadata_json,
            created_at::text AS created_at
          FROM agent_messages
          WHERE session_id = $1::uuid
          ORDER BY created_at ASC, id ASC
        `,
        [sessionId],
      );
      const turns = await client.query<{
        created_at: string;
        error_json: unknown;
        id: string;
        plan_json: unknown;
        session_id: string;
        snapshot_json: unknown;
        status: string;
        updated_at: string;
      }>(
        `
          SELECT
            id::text AS id,
            session_id::text AS session_id,
            status,
            snapshot_json,
            plan_json,
            error_json,
            created_at::text AS created_at,
            updated_at::text AS updated_at
          FROM agent_turns
          WHERE session_id = $1::uuid
          ORDER BY created_at ASC, id ASC
        `,
        [sessionId],
      );

      return {
        messages: messages.rows.map((row) => ({
          content: row.content,
          createdAt: row.created_at,
          id: row.id,
          metadata: row.metadata_json ?? {},
          role: row.role,
          sessionId: row.session_id,
        })),
        session: this.mapSession(session),
        turns: turns.rows.map((row) => ({
          createdAt: row.created_at,
          errorJson: row.error_json,
          id: row.id,
          planJson: row.plan_json,
          sessionId: row.session_id,
          snapshotJson: row.snapshot_json,
          status: row.status,
          updatedAt: row.updated_at,
        })),
      };
    }, this.pool);
  }

  async getSessionEvents(context: AgentContext, sessionId: string, afterSeq = 0): Promise<AgentSessionEventRecord[]> {
    return withTenantTransaction(context, async (client) => {
      await this.requireSession(client, sessionId);
      const result = await client.query<{
        created_at: string;
        event_json: Record<string, unknown>;
        event_type: string;
        id: string;
        seq: string;
        session_id: string;
        task_id: string | null;
        turn_id: string | null;
      }>(
        `
          SELECT
            id::text AS id,
            session_id::text AS session_id,
            turn_id::text AS turn_id,
            task_id::text AS task_id,
            seq::text AS seq,
            event_type,
            event_json,
            created_at::text AS created_at
          FROM agent_task_events
          WHERE session_id = $1::uuid
            AND seq > $2::bigint
          ORDER BY seq ASC
        `,
        [sessionId, afterSeq],
      );

      return result.rows.map((row) => ({
        createdAt: row.created_at,
        eventJson: row.event_json ?? {},
        eventType: row.event_type,
        id: row.id,
        seq: Number(row.seq),
        sessionId: row.session_id,
        taskId: row.task_id,
        turnId: row.turn_id,
      }));
    }, this.pool);
  }

  async appendUserMessage(
    context: AgentContext,
    sessionId: string,
    input: { content: string; metadata?: Record<string, unknown> },
  ): Promise<AgentHistoryMessage> {
    return withTenantTransaction(context, async (client) => {
      await this.requireSession(client, sessionId);
      const result = await client.query<{
        content: string;
        created_at: string;
        id: string;
        metadata_json: Record<string, unknown>;
        role: "user";
        session_id: string;
      }>(
        `
          INSERT INTO agent_messages (
            tenant_id,
            session_id,
            role,
            content,
            metadata_json
          )
          VALUES ($1::uuid, $2::uuid, 'user', $3, $4::jsonb)
          RETURNING
            id::text AS id,
            session_id::text AS session_id,
            role,
            content,
            metadata_json,
            created_at::text AS created_at
        `,
        [context.tenantId, sessionId, input.content, JSON.stringify(input.metadata ?? {})],
      );

      return {
        content: result.rows[0]!.content,
        createdAt: result.rows[0]!.created_at,
        id: result.rows[0]!.id,
        metadata: result.rows[0]!.metadata_json ?? {},
        role: "user",
        sessionId: result.rows[0]!.session_id,
      };
    }, this.pool);
  }

  async appendSessionEvent(
    context: AgentContext,
    input: AppendAgentSessionEventInput,
  ): Promise<AgentSessionEventRecord> {
    return withTenantTransaction(context, async (client) => {
      await this.requireSession(client, input.sessionId);
      const result = await client.query<{
        created_at: string;
        event_json: Record<string, unknown>;
        event_type: string;
        id: string;
        seq: string;
        session_id: string;
        task_id: string | null;
        turn_id: string | null;
      }>(
        `
          INSERT INTO agent_task_events (
            tenant_id,
            session_id,
            turn_id,
            task_id,
            event_type,
            event_json
          )
          VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6::jsonb)
          RETURNING
            id::text AS id,
            session_id::text AS session_id,
            turn_id::text AS turn_id,
            task_id::text AS task_id,
            seq::text AS seq,
            event_type,
            event_json,
            created_at::text AS created_at
        `,
        [
          context.tenantId,
          input.sessionId,
          input.turnId ?? null,
          input.taskId ?? null,
          input.eventType,
          JSON.stringify(input.eventJson),
        ],
      );

      const row = result.rows[0]!;
      return {
        createdAt: row.created_at,
        eventJson: row.event_json ?? {},
        eventType: row.event_type,
        id: row.id,
        seq: Number(row.seq),
        sessionId: row.session_id,
        taskId: row.task_id,
        turnId: row.turn_id,
      };
    }, this.pool);
  }

  private async requireSession(client: PoolClient, sessionId: string): Promise<SessionRow> {
    const result = await client.query<SessionRow>(
      `
        SELECT
          id::text AS id,
          project_id::text AS project_id,
          flow_id::text AS flow_id,
          title,
          status,
          created_at::text AS created_at,
          updated_at::text AS updated_at
        FROM agent_sessions
        WHERE id = $1::uuid
        LIMIT 1
      `,
      [sessionId],
    );

    if (result.rowCount === 0) {
      throw new Error("AGENT_SESSION_NOT_FOUND");
    }

    return result.rows[0]!;
  }

  private mapSession(row: SessionRow): AgentSessionListItem {
    return {
      createdAt: row.created_at,
      flowId: row.flow_id,
      id: row.id,
      projectId: row.project_id,
      status: row.status,
      title: row.title,
      updatedAt: row.updated_at,
    };
  }
}
