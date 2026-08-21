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
  tenantId?: string;
  status: string;
  title: string;
  updatedAt: string;
};

export type AgentSessionLookup = {
  flowId: string | null;
  id: string;
  projectId: string | null;
  tenantId: string;
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
  agentNamespace?: string | null;
  agentVersion?: string | null;
  createdAt: string;
  eventJson: Record<string, unknown>;
  eventType: string;
  graphRevision?: number | null;
  id: string;
  idempotencyKey?: string | null;
  seq: number;
  sessionId: string;
  taskId: string | null;
  turnId: string | null;
};

export type AppendAgentSessionEventInput = {
  agentNamespace?: string | null;
  agentVersion?: string | null;
  eventJson: Record<string, unknown>;
  eventType: string;
  graphRevision?: number | null;
  idempotencyKey?: string | null;
  sessionId: string;
  taskId?: string | null;
  turnId?: string | null;
};

export type AgentTurnLease = {
  expiresAt: string;
  leaseOwner: string;
  turnId: string;
};

export type AgentV2TurnLookup = {
  cancelledAt: string | null;
  graphRevision: number | null;
  id: string;
  snapshotJson: unknown;
  status: string;
};

const DEFAULT_TURN_LEASE_MS = 30_000;
const MIN_TURN_LEASE_MS = 5_000;
const MAX_TURN_LEASE_MS = 5 * 60_000;

function boundedLeaseMs(value: number | undefined): number {
  if (value === undefined) return DEFAULT_TURN_LEASE_MS;
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("AGENT_TURN_LEASE_INVALID");
  }
  return Math.min(MAX_TURN_LEASE_MS, Math.max(MIN_TURN_LEASE_MS, Math.floor(value)));
}

type SessionRow = {
  created_at: string;
  flow_id: string | null;
  id: string;
  project_id: string | null;
  status: string;
  tenant_id?: string | null;
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

  async getV2TurnByIdempotency(context: AgentContext, idempotencyKey: string): Promise<AgentV2TurnLookup | null> {
    return withTenantTransaction(context, async (client) => {
      const result = await client.query<{
        cancelled_at: string | null;
        graph_revision: string | null;
        id: string;
        snapshot_json: unknown;
        status: string;
      }>(
        `SELECT id::text AS id, status, snapshot_json, graph_revision::text AS graph_revision, cancelled_at::text AS cancelled_at
         FROM agent_turns
         WHERE tenant_id = $1::uuid AND agent_version = 'v2' AND idempotency_key = $2
         LIMIT 1`,
        [context.tenantId, idempotencyKey],
      );
      const row = result.rows[0];
      return row
        ? {
            cancelledAt: row.cancelled_at,
            graphRevision: row.graph_revision === null ? null : Number(row.graph_revision),
            id: row.id,
            snapshotJson: row.snapshot_json,
            status: row.status,
          }
        : null;
    }, this.pool);
  }

  async getSession(context: AgentContext, sessionId: string): Promise<AgentSessionLookup> {
    return withTenantTransaction(context, async (client) => {
      const session = await this.requireSession(client, sessionId);
      return {
        flowId: session.flow_id,
        id: session.id,
        projectId: session.project_id,
        tenantId: String(session.tenant_id || context.tenantId),
      };
    }, this.pool);
  }

  async getSessionEvents(context: AgentContext, sessionId: string, afterSeq = 0): Promise<AgentSessionEventRecord[]> {
    return withTenantTransaction(context, async (client) => {
      await this.requireSession(client, sessionId);
      const result = await client.query<{
        agent_namespace: string | null;
        agent_version: string | null;
        created_at: string;
        event_json: Record<string, unknown>;
        event_type: string;
        graph_revision: string | null;
        id: string;
        idempotency_key: string | null;
        seq: string;
        session_id: string;
        task_id: string | null;
        turn_id: string | null;
      }>(
        `
          SELECT
            id::text AS id,
            agent_namespace,
            agent_version,
            graph_revision::text AS graph_revision,
            idempotency_key,
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
        agentNamespace: row.agent_namespace,
        agentVersion: row.agent_version,
        createdAt: row.created_at,
        eventJson: row.event_json ?? {},
        eventType: row.event_type,
        graphRevision: row.graph_revision === null ? null : Number(row.graph_revision),
        id: row.id,
        idempotencyKey: row.idempotency_key,
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
      if (input.agentVersion === "v2" && input.turnId) {
        await this.assertTurnActiveClient(client, context.tenantId, input.turnId);
      }

      const result = await client.query<{
        agent_namespace: string | null;
        agent_version: string | null;
        created_at: string;
        event_json: Record<string, unknown>;
        event_type: string;
        graph_revision: string | null;
        id: string;
        idempotency_key: string | null;
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
            agent_namespace,
            agent_version,
            graph_revision,
            idempotency_key,
            event_type,
            event_json
          )
          VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7::bigint, $8, $9, $10::jsonb)
          ON CONFLICT DO NOTHING
          RETURNING
            id::text AS id,
            agent_namespace,
            agent_version,
            graph_revision::text AS graph_revision,
            idempotency_key,
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
          input.agentNamespace ?? null,
          input.agentVersion ?? null,
          input.graphRevision ?? null,
          input.idempotencyKey ?? null,
          input.eventType,
          JSON.stringify(input.eventJson),
        ],
      );

      let row = result.rows[0];
      if (!row && input.agentVersion === "v2" && input.idempotencyKey) {
        const existing = await client.query<typeof result.rows[number]>(
          `
            SELECT
              id::text AS id,
              agent_namespace,
              agent_version,
              graph_revision::text AS graph_revision,
              idempotency_key,
              session_id::text AS session_id,
              turn_id::text AS turn_id,
              task_id::text AS task_id,
              seq::text AS seq,
              event_type,
              event_json,
              created_at::text AS created_at
            FROM agent_task_events
            WHERE tenant_id = $1::uuid
              AND agent_version = 'v2'
              AND idempotency_key = $2
            LIMIT 1
          `,
          [context.tenantId, input.idempotencyKey],
        );
        row = existing.rows[0];
      }
      if (!row) throw new Error("AGENT_EVENT_IDEMPOTENCY_CONFLICT");
      return {
        agentNamespace: row.agent_namespace,
        agentVersion: row.agent_version,
        createdAt: row.created_at,
        eventJson: row.event_json ?? {},
        eventType: row.event_type,
        graphRevision: row.graph_revision === null ? null : Number(row.graph_revision),
        id: row.id,
        idempotencyKey: row.idempotency_key,
        seq: Number(row.seq),
        sessionId: row.session_id,
        taskId: row.task_id,
        turnId: row.turn_id,
      };
    }, this.pool);
  }

  async assertTurnActive(context: AgentContext, turnId: string): Promise<void> {
    return withTenantTransaction(context, async (client) => {
      await this.assertTurnActiveClient(client, context.tenantId, turnId);
    }, this.pool);
  }

  async acquireTurnLease(
    context: AgentContext,
    input: { leaseMs?: number; leaseOwner: string; turnId: string },
  ): Promise<AgentTurnLease | null> {
    const leaseMs = boundedLeaseMs(input.leaseMs);
    return withTenantTransaction(context, async (client) => {
      const result = await client.query<{ expires_at: string; id: string }>(
        `
          UPDATE agent_turns
          SET lease_owner = $3,
              lease_expires_at = now() + ($4::int * interval '1 millisecond'),
              updated_at = now()
          WHERE tenant_id = $1::uuid
            AND id = $2::uuid
            AND cancelled_at IS NULL
            AND (
              lease_owner IS NULL
              OR lease_expires_at IS NULL
              OR lease_expires_at <= now()
              OR lease_owner = $3
            )
          RETURNING id::text AS id, lease_expires_at::text AS expires_at
        `,
        [context.tenantId, input.turnId, input.leaseOwner, leaseMs],
      );
      const row = result.rows[0];
      return row ? { expiresAt: row.expires_at, leaseOwner: input.leaseOwner, turnId: row.id } : null;
    }, this.pool);
  }

  async renewTurnLease(
    context: AgentContext,
    input: { leaseMs?: number; leaseOwner: string; turnId: string },
  ): Promise<AgentTurnLease | null> {
    const leaseMs = boundedLeaseMs(input.leaseMs);
    return withTenantTransaction(context, async (client) => {
      const result = await client.query<{ expires_at: string; id: string }>(
        `
          UPDATE agent_turns
          SET lease_expires_at = now() + ($4::int * interval '1 millisecond'), updated_at = now()
          WHERE tenant_id = $1::uuid
            AND id = $2::uuid
            AND cancelled_at IS NULL
            AND lease_owner = $3
            AND lease_expires_at > now()
          RETURNING id::text AS id, lease_expires_at::text AS expires_at
        `,
        [context.tenantId, input.turnId, input.leaseOwner, leaseMs],
      );
      const row = result.rows[0];
      return row ? { expiresAt: row.expires_at, leaseOwner: input.leaseOwner, turnId: row.id } : null;
    }, this.pool);
  }

  async releaseTurnLease(
    context: AgentContext,
    input: { leaseOwner: string; turnId: string },
  ): Promise<boolean> {
    return withTenantTransaction(context, async (client) => {
      const result = await client.query(
        `
          UPDATE agent_turns
          SET lease_owner = NULL, lease_expires_at = NULL, updated_at = now()
          WHERE tenant_id = $1::uuid AND id = $2::uuid AND lease_owner = $3
        `,
        [context.tenantId, input.turnId, input.leaseOwner],
      );
      return result.rowCount === 1;
    }, this.pool);
  }

  async cancelTurn(
    context: AgentContext,
    input: { reason?: string; turnId: string },
  ): Promise<boolean> {
    return withTenantTransaction(context, async (client) => {
      const result = await client.query(
        `
          UPDATE agent_turns
          SET cancelled_at = COALESCE(cancelled_at, now()),
              lease_owner = NULL,
              lease_expires_at = NULL,
              error_json = COALESCE(error_json, '{}'::jsonb) || jsonb_build_object(
                'code', 'AGENT_TURN_CANCELLED',
                'reason', $3
              ),
              updated_at = now()
          WHERE tenant_id = $1::uuid AND id = $2::uuid
        `,
        [context.tenantId, input.turnId, input.reason ?? "Cancelled by user"],
      );
      return result.rowCount === 1;
    }, this.pool);
  }

  private async assertTurnActiveClient(client: PoolClient, tenantId: string, turnId: string): Promise<void> {
    const result = await client.query<{ cancelled_at: string | null }>(
      `SELECT cancelled_at::text AS cancelled_at FROM agent_turns WHERE tenant_id = $1::uuid AND id = $2::uuid LIMIT 1`,
      [tenantId, turnId],
    );
    if (result.rowCount === 0) throw new Error("AGENT_TURN_NOT_FOUND");
    if (result.rows[0]!.cancelled_at) throw new Error("AGENT_TURN_CANCELLED");
  }

  private async requireSession(client: PoolClient, sessionId: string): Promise<SessionRow> {
    const result = await client.query<SessionRow>(
      `
        SELECT
          id::text AS id,
          tenant_id::text AS tenant_id,
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
      tenantId: row.tenant_id ?? undefined,
      status: row.status,
      title: row.title,
      updatedAt: row.updated_at,
    };
  }
}
