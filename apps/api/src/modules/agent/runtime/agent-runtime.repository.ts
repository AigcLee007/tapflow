import type { Pool, PoolClient } from "pg";

import { createPgPool, withTenantTransaction } from "@aigc-flow/db";
import type { AgentContextSnapshot, ConversationBlock } from "./agent-protocol.js";

export type AgentRuntimeContext = { tenantId: string; userId: string | null };

export type AgentRuntimeSession = {
  id: string;
  tenantId: string;
  projectId: string | null;
  flowId: string | null;
  title: string;
  mode: "auto" | "manual_confirmation";
  phase: string;
  graphRevision: number;
  status: string;
};

export type AgentRuntimeTurnInput = {
  sessionId: string;
  prompt: string;
  graphRevision: number;
  idempotencyKey: string;
  contextSnapshot: AgentContextSnapshot;
};

export type AgentRuntimeTurn = AgentRuntimeTurnInput & {
  id: string;
  phase: string;
  executionState: string;
  blocks: ConversationBlock[];
  pendingDecision: Record<string, unknown> | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type AgentRuntimeDecision = {
  id: string;
  sessionId: string;
  turnId: string;
  blockId: string;
  decisionType: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  resultState: string;
  confirmedAt: string | null;
};

export type AgentRuntimeEvent = {
  id: string;
  sessionId: string;
  turnId: string | null;
  seq: number;
  eventType: string;
  event: Record<string, unknown>;
  graphRevision: number | null;
  idempotencyKey: string | null;
  createdAt: string;
};

export type AgentRuntimeResultRef = {
  id: string;
  resultGroupId: string;
  assetId: string | null;
  kind: "image" | "video" | "text";
  label: string;
  sourceRefs: string[];
  lineage: Record<string, unknown>;
  placedNodeId: string | null;
  status: string;
  contentText: string | null;
};

function json(value: unknown): string { return JSON.stringify(value ?? {}); }

async function requireSession(client: PoolClient, ctx: AgentRuntimeContext, sessionId: string): Promise<AgentRuntimeSession> {
  const result = await client.query<{
    id: string; tenant_id: string; project_id: string | null; flow_id: string | null;
    title: string; mode: "auto" | "manual_confirmation"; phase: string;
    graph_revision: string | null; status: string;
  }>(
    `SELECT id::text AS id, tenant_id::text AS tenant_id, project_id::text AS project_id,
            flow_id::text AS flow_id, title, COALESCE(mode, execution_mode, 'manual_confirmation') AS mode,
            COALESCE(phase, conversation_phase, 'idle') AS phase,
            COALESCE(graph_revision, 0)::text AS graph_revision, status
       FROM agent_sessions
      WHERE tenant_id = $1::uuid AND id = $2::uuid
      LIMIT 1`,
    [ctx.tenantId, sessionId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("AGENT_SESSION_NOT_FOUND");
  return {
    flowId: row.flow_id,
    graphRevision: Number(row.graph_revision ?? 0),
    id: row.id,
    mode: row.mode,
    phase: row.phase,
    projectId: row.project_id,
    status: row.status,
    tenantId: row.tenant_id,
    title: row.title,
  };
}

function mapTurn(row: {
  id: string; session_id: string; prompt: string | null; graph_revision: string | null;
  idempotency_key: string; conversation_phase: string | null; execution_state: string | null;
  blocks_json: unknown; pending_decision_json: Record<string, unknown> | null;
  status: string; created_at: string; updated_at: string;
}, input?: AgentRuntimeTurnInput): AgentRuntimeTurn {
  return {
    contextSnapshot: input?.contextSnapshot ?? (row.blocks_json as unknown as AgentContextSnapshot),
    executionState: row.execution_state ?? "idle",
    graphRevision: Number(row.graph_revision ?? input?.graphRevision ?? 0),
    id: row.id,
    idempotencyKey: row.idempotency_key,
    pendingDecision: row.pending_decision_json,
    phase: row.conversation_phase ?? "idle",
    prompt: row.prompt ?? input?.prompt ?? "",
    sessionId: row.session_id,
    blocks: Array.isArray(row.blocks_json) ? row.blocks_json as ConversationBlock[] : [],
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class AgentRuntimeRepository {
  readonly pool: Pool;

  constructor(options?: { pool?: Pool }) {
    this.pool = options?.pool ?? createPgPool();
  }

  async createSession(ctx: AgentRuntimeContext, input: { projectId: string | null; flowId: string | null; title?: string }): Promise<AgentRuntimeSession> {
    return withTenantTransaction(ctx, async (client) => {
      const result = await client.query<{ id: string }>(
        `INSERT INTO agent_sessions (tenant_id, project_id, flow_id, title, created_by, runtime_version, mode, phase, graph_revision)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, 'runtime', 'manual_confirmation', 'idle', 0)
         RETURNING id::text AS id`,
        [ctx.tenantId, input.projectId, input.flowId, input.title ?? "Agent 会话", ctx.userId],
      );
      return requireSession(client, ctx, result.rows[0]!.id);
    }, this.pool);
  }

  async getSession(ctx: AgentRuntimeContext, sessionId: string): Promise<AgentRuntimeSession> {
    return withTenantTransaction(ctx, (client) => requireSession(client, ctx, sessionId), this.pool);
  }

  async listSessions(ctx: AgentRuntimeContext, filter: { projectId?: string | null; flowId?: string | null; limit?: number } = {}): Promise<AgentRuntimeSession[]> {
    return withTenantTransaction(ctx, async (client) => {
      const values: Array<string | number | null> = [ctx.tenantId];
      const where = ["tenant_id = $1::uuid", "runtime_version = 'runtime'"];
      if (filter.projectId !== undefined) { values.push(filter.projectId); where.push(`project_id IS NOT DISTINCT FROM $${values.length}::uuid`); }
      if (filter.flowId !== undefined) { values.push(filter.flowId); where.push(`flow_id IS NOT DISTINCT FROM $${values.length}::uuid`); }
      values.push(Math.min(100, Math.max(1, filter.limit ?? 20)));
      const result = await client.query<Parameters<typeof mapSessionRow>[0]>(
        `SELECT id::text AS id, tenant_id::text AS tenant_id, project_id::text AS project_id,
                flow_id::text AS flow_id, title, COALESCE(mode, execution_mode, 'manual_confirmation') AS mode,
                COALESCE(phase, conversation_phase, 'idle') AS phase,
                COALESCE(graph_revision, 0)::text AS graph_revision, status
           FROM agent_sessions WHERE ${where.join(" AND ")}
           ORDER BY updated_at DESC LIMIT $${values.length}`,
        values,
      );
      return result.rows.map(mapSessionRow);
    }, this.pool);
  }

  async createTurnIdempotent(ctx: AgentRuntimeContext, input: AgentRuntimeTurnInput): Promise<AgentRuntimeTurn> {
    return withTenantTransaction(ctx, async (client) => {
      await requireSession(client, ctx, input.sessionId);
      const inserted = await client.query(`
        INSERT INTO agent_turns (tenant_id, session_id, status, snapshot_json, context_snapshot_json,
          blocks_json, conversation_phase, execution_state, graph_revision, idempotency_key,
          agent_namespace, agent_version, runtime_version, prompt, pending_decision_json)
        VALUES ($1::uuid, $2::uuid, 'pending', '{}'::jsonb, $3::jsonb, '[]'::jsonb,
          'understanding', 'idle', $4::bigint, $5, 'canonical', 'runtime', 'runtime', $6, NULL)
        ON CONFLICT (tenant_id, idempotency_key) WHERE runtime_version = 'runtime' DO NOTHING
        RETURNING id::text AS id, session_id::text AS session_id, prompt, graph_revision::text AS graph_revision,
          idempotency_key, conversation_phase, execution_state, blocks_json, pending_decision_json,
          status, created_at::text AS created_at, updated_at::text AS updated_at`,
      [ctx.tenantId, input.sessionId, json(input.contextSnapshot), input.graphRevision, input.idempotencyKey, input.prompt]);
      if (inserted.rows[0]) return mapTurn(inserted.rows[0] as never, input);
      const existing = await client.query(`SELECT id::text AS id, session_id::text AS session_id, prompt,
        graph_revision::text AS graph_revision, idempotency_key, conversation_phase, execution_state,
        blocks_json, pending_decision_json, status, created_at::text AS created_at, updated_at::text AS updated_at
        FROM agent_turns WHERE tenant_id = $1::uuid AND idempotency_key = $2 AND runtime_version = 'runtime' LIMIT 1`,
      [ctx.tenantId, input.idempotencyKey]);
      const row = existing.rows[0];
      if (!row || row.session_id !== input.sessionId) throw new Error("AGENT_TURN_IDEMPOTENCY_CONFLICT");
      if (Number(row.graph_revision ?? 0) !== input.graphRevision) throw new Error("AGENT_GRAPH_REVISION_CONFLICT");
      return mapTurn(row as never, input);
    }, this.pool);
  }

  async getTurn(ctx: AgentRuntimeContext, sessionId: string, turnId: string): Promise<AgentRuntimeTurn> {
    return withTenantTransaction(ctx, async (client) => {
      await requireSession(client, ctx, sessionId);
      const result = await client.query(`SELECT id::text AS id, session_id::text AS session_id, prompt,
        graph_revision::text AS graph_revision, idempotency_key, conversation_phase, execution_state,
        blocks_json, pending_decision_json, status, created_at::text AS created_at, updated_at::text AS updated_at
        FROM agent_turns WHERE tenant_id = $1::uuid AND session_id = $2::uuid AND id = $3::uuid AND runtime_version = 'runtime' LIMIT 1`,
      [ctx.tenantId, sessionId, turnId]);
      const row = result.rows[0];
      if (!row) throw new Error("AGENT_TURN_NOT_FOUND");
      return mapTurn(row as never);
    }, this.pool);
  }

  async saveTurnStateCAS(ctx: AgentRuntimeContext, input: { sessionId: string; turnId: string; expectedGraphRevision: number; graphRevision: number; phase: string; executionState: string; blocks: ConversationBlock[]; pendingDecision?: Record<string, unknown> | null; status?: string }): Promise<AgentRuntimeTurn> {
    return withTenantTransaction(ctx, async (client) => {
      const result = await client.query(`UPDATE agent_turns SET blocks_json = $4::jsonb,
        conversation_phase = $5, execution_state = $6, pending_decision_json = $7::jsonb,
        graph_revision = $8::bigint, status = COALESCE($9, status), updated_at = now()
        WHERE tenant_id = $1::uuid AND session_id = $2::uuid AND id = $3::uuid
          AND runtime_version = 'runtime' AND graph_revision = $10::bigint
        RETURNING id::text AS id, session_id::text AS session_id, prompt,
          graph_revision::text AS graph_revision, idempotency_key, conversation_phase, execution_state,
          blocks_json, pending_decision_json, status, created_at::text AS created_at, updated_at::text AS updated_at`,
      [ctx.tenantId, input.sessionId, input.turnId, json(input.blocks), input.phase, input.executionState,
        json(input.pendingDecision), input.graphRevision, input.status ?? null, input.expectedGraphRevision]);
      if (!result.rows[0]) throw new Error("AGENT_GRAPH_REVISION_CONFLICT");
      return mapTurn(result.rows[0] as never);
    }, this.pool);
  }

  async createDecisionIdempotent(ctx: AgentRuntimeContext, input: { sessionId: string; turnId: string; blockId: string; decisionType: string; payload: Record<string, unknown>; idempotencyKey: string }): Promise<AgentRuntimeDecision> {
    return withTenantTransaction(ctx, async (client) => {
      await requireSession(client, ctx, input.sessionId);
      const result = await client.query(`INSERT INTO agent_decisions
        (tenant_id, session_id, turn_id, block_id, decision_type, payload_json, idempotency_key, created_by)
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6::jsonb, $7, $8::uuid)
        ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
        RETURNING id::text AS id, session_id::text AS session_id, turn_id::text AS turn_id,
          block_id, decision_type, payload_json, idempotency_key, result_state, confirmed_at::text AS confirmed_at`,
      [ctx.tenantId, input.sessionId, input.turnId, input.blockId, input.decisionType, json(input.payload), input.idempotencyKey, ctx.userId]);
      const row = result.rows[0] ?? (await client.query(`SELECT id::text AS id, session_id::text AS session_id,
        turn_id::text AS turn_id, block_id, decision_type, payload_json, idempotency_key, result_state,
        confirmed_at::text AS confirmed_at FROM agent_decisions WHERE tenant_id = $1::uuid AND idempotency_key = $2 LIMIT 1`, [ctx.tenantId, input.idempotencyKey])).rows[0];
      if (!row || row.session_id !== input.sessionId || row.turn_id !== input.turnId) throw new Error("AGENT_DECISION_IDEMPOTENCY_CONFLICT");
      return { confirmedAt: row.confirmed_at, decisionType: row.decision_type, id: row.id, idempotencyKey: row.idempotency_key, payload: row.payload_json ?? {}, resultState: row.result_state, sessionId: row.session_id, turnId: row.turn_id, blockId: row.block_id };
    }, this.pool);
  }

  async getPendingDecision(ctx: AgentRuntimeContext, sessionId: string, turnId: string): Promise<AgentRuntimeDecision | null> {
    return withTenantTransaction(ctx, async (client) => {
      await requireSession(client, ctx, sessionId);
      const result = await client.query(`SELECT id::text AS id, session_id::text AS session_id, turn_id::text AS turn_id,
        block_id, decision_type, payload_json, idempotency_key, result_state, confirmed_at::text AS confirmed_at
        FROM agent_decisions WHERE tenant_id = $1::uuid AND session_id = $2::uuid AND turn_id = $3::uuid
        AND result_state = 'pending' ORDER BY created_at DESC LIMIT 1`, [ctx.tenantId, sessionId, turnId]);
      const row = result.rows[0];
      return row ? { confirmedAt: row.confirmed_at, decisionType: row.decision_type, id: row.id, idempotencyKey: row.idempotency_key, payload: row.payload_json ?? {}, resultState: row.result_state, sessionId: row.session_id, turnId: row.turn_id, blockId: row.block_id } : null;
    }, this.pool);
  }

  async appendEvent(ctx: AgentRuntimeContext, input: { sessionId: string; turnId?: string | null; eventType: string; event: Record<string, unknown>; graphRevision?: number | null; idempotencyKey?: string | null }): Promise<AgentRuntimeEvent> {
    return withTenantTransaction(ctx, async (client) => {
      await requireSession(client, ctx, input.sessionId);
      const result = await client.query(`INSERT INTO agent_events (tenant_id, session_id, turn_id, seq, event_type, event_json, graph_revision, idempotency_key)
        VALUES ($1::uuid, $2::uuid, $3::uuid, COALESCE((SELECT MAX(seq) + 1 FROM agent_events WHERE tenant_id = $1::uuid AND session_id = $2::uuid), 1), $4, $5::jsonb, $6::bigint, $7)
        ON CONFLICT (tenant_id, session_id, seq) DO NOTHING
        RETURNING id::text AS id, session_id::text AS session_id, turn_id::text AS turn_id, seq::text AS seq,
          event_type, event_json, graph_revision::text AS graph_revision, idempotency_key, created_at::text AS created_at`,
      [ctx.tenantId, input.sessionId, input.turnId ?? null, input.eventType, json(input.event), input.graphRevision ?? null, input.idempotencyKey ?? null]);
      const row = result.rows[0];
      if (!row) throw new Error("AGENT_EVENT_CONFLICT");
      return { createdAt: row.created_at, event: row.event_json ?? {}, eventType: row.event_type, graphRevision: row.graph_revision === null ? null : Number(row.graph_revision), id: row.id, idempotencyKey: row.idempotency_key, seq: Number(row.seq), sessionId: row.session_id, turnId: row.turn_id };
    }, this.pool);
  }

  async listEvents(ctx: AgentRuntimeContext, sessionId: string, afterSeq = 0): Promise<AgentRuntimeEvent[]> {
    return withTenantTransaction(ctx, async (client) => {
      await requireSession(client, ctx, sessionId);
      const result = await client.query(`SELECT id::text AS id, session_id::text AS session_id, turn_id::text AS turn_id,
        seq::text AS seq, event_type, event_json, graph_revision::text AS graph_revision, idempotency_key, created_at::text AS created_at
        FROM agent_events WHERE tenant_id = $1::uuid AND session_id = $2::uuid AND seq > $3::bigint ORDER BY seq ASC`, [ctx.tenantId, sessionId, afterSeq]);
      return result.rows.map((row) => ({ createdAt: row.created_at, event: row.event_json ?? {}, eventType: row.event_type, graphRevision: row.graph_revision === null ? null : Number(row.graph_revision), id: row.id, idempotencyKey: row.idempotency_key, seq: Number(row.seq), sessionId: row.session_id, turnId: row.turn_id }));
    }, this.pool);
  }

  async saveResultGroup(ctx: AgentRuntimeContext, input: { sessionId: string; turnId: string; runId?: string | null; status?: string }): Promise<string> {
    return withTenantTransaction(ctx, async (client) => {
      await requireSession(client, ctx, input.sessionId);
      const result = await client.query<{ id: string }>(`INSERT INTO agent_result_groups (tenant_id, session_id, turn_id, run_id, status) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5) RETURNING id::text AS id`, [ctx.tenantId, input.sessionId, input.turnId, input.runId ?? null, input.status ?? "pending"]);
      return result.rows[0]!.id;
    }, this.pool);
  }

  async saveResultRef(ctx: AgentRuntimeContext, input: { resultGroupId: string; assetId?: string | null; kind: "image" | "video" | "text"; label: string; sourceRefs?: string[]; lineage?: Record<string, unknown>; status?: string; contentText?: string | null }): Promise<AgentRuntimeResultRef> {
    return withTenantTransaction(ctx, async (client) => {
      const result = await client.query(`INSERT INTO agent_result_refs (tenant_id, result_group_id, asset_id, kind, label, source_refs_json, lineage_json, status, content_text)
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6::jsonb, $7::jsonb, $8, $9)
        RETURNING id::text AS id, result_group_id::text AS result_group_id, asset_id::text AS asset_id, kind, label, source_refs_json, lineage_json, placed_node_id, status, content_text`, [ctx.tenantId, input.resultGroupId, input.assetId ?? null, input.kind, input.label, json(input.sourceRefs ?? []), json(input.lineage ?? {}), input.status ?? "pending", input.contentText ?? null]);
      return mapResultRef(result.rows[0]);
    }, this.pool);
  }

  async markResultPlacedCAS(ctx: AgentRuntimeContext, input: { resultId: string; placedNodeId: string }): Promise<AgentRuntimeResultRef> {
    return withTenantTransaction(ctx, async (client) => {
      const result = await client.query(`UPDATE agent_result_refs SET placed_node_id = $2, status = 'placed'
        WHERE tenant_id = $1::uuid AND id = $3::uuid AND placed_node_id IS NULL
        RETURNING id::text AS id, result_group_id::text AS result_group_id, asset_id::text AS asset_id, kind, label, source_refs_json, lineage_json, placed_node_id, status, content_text`, [ctx.tenantId, input.placedNodeId, input.resultId]);
      if (!result.rows[0]) throw new Error("AGENT_RESULT_ALREADY_PLACED_OR_NOT_FOUND");
      return mapResultRef(result.rows[0]);
    }, this.pool);
  }
}

function mapSessionRow(row: { id: string; tenant_id: string; project_id: string | null; flow_id: string | null; title: string; mode: "auto" | "manual_confirmation"; phase: string; graph_revision: string | null; status: string }): AgentRuntimeSession {
  return { flowId: row.flow_id, graphRevision: Number(row.graph_revision ?? 0), id: row.id, mode: row.mode, phase: row.phase, projectId: row.project_id, status: row.status, tenantId: row.tenant_id, title: row.title };
}

function mapResultRef(row: { id: string; result_group_id: string; asset_id: string | null; kind: "image" | "video" | "text"; label: string; source_refs_json: string[]; lineage_json: Record<string, unknown>; placed_node_id: string | null; status: string; content_text: string | null }): AgentRuntimeResultRef {
  return { assetId: row.asset_id, contentText: row.content_text, id: row.id, kind: row.kind, label: row.label, lineage: row.lineage_json ?? {}, placedNodeId: row.placed_node_id, resultGroupId: row.result_group_id, sourceRefs: row.source_refs_json ?? [], status: row.status };
}
