import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { createPgPool, withTenantTransaction } from "@aigc-flow/db";
import { normalizeAgentContextSnapshot, normalizeConversationBlocks, type AgentContextSnapshot, type ConversationBlock } from "./agent-protocol.js";

export type AgentRuntimeContext = { tenantId: string; userId: string | null };
export type AgentRuntimeSession = { id: string; tenantId: string; projectId: string | null; flowId: string | null; title: string; mode: "auto" | "manual_confirmation"; phase: string; graphRevision: number; status: string };
export type AgentRuntimeTurnInput = { sessionId: string; prompt: string; graphRevision: number; idempotencyKey: string; contextSnapshot: AgentContextSnapshot };
export type AgentRuntimeTurn = AgentRuntimeTurnInput & { id: string; phase: string; executionState: string; stateVersion: number; planJson: Record<string, unknown>; blocks: ConversationBlock[]; pendingDecision: Record<string, unknown> | null; status: string; createdAt: string; updatedAt: string };
export type AgentRuntimeDecision = { id: string; decisionId: string; sessionId: string; turnId: string; blockId: string; graphRevision: number; decisionType: string; payload: Record<string, unknown>; idempotencyKey: string; resultState: string; confirmedAt: string | null; resultSnapshot: Record<string, unknown> | null };
export type AgentRuntimeEvent = { id: string; sessionId: string; turnId: string | null; seq: number; eventType: string; event: Record<string, unknown>; graphRevision: number | null; idempotencyKey: string | null; createdAt: string };
export type AgentRuntimeResultRef = { id: string; resultGroupId: string; assetId: string | null; runId: string | null; kind: "image" | "video" | "text"; label: string; sourceRefs: string[]; lineage: Record<string, unknown>; placedNodeId: string | null; status: string; contentText: string | null };
export type AgentRuntimeStateInput = { sessionId: string; turnId: string; expectedStateVersion: number; expectedGraphRevision: number; graphRevision: number; phase: string; executionState: string; blocks: ConversationBlock[]; pendingDecision?: Record<string, unknown> | null; planJson?: Record<string, unknown>; status?: string };
export type AgentRuntimeDecisionInput = { sessionId: string; turnId: string; decisionId: string; blockId: string; graphRevision: number; idempotencyKey: string; type: string; payload: Record<string, unknown> };
export type AgentRuntimeHistory = { session: AgentRuntimeSession; turns: AgentRuntimeTurn[]; lastSeq: number; hasMore: boolean; nextCursor: string | null };

type Row = Record<string, any>;
const sessionColumns = "id,tenant_id,project_id,flow_id,title,execution_mode,conversation_phase,graph_revision,status,event_seq";
// Text timestamps preserve PostgreSQL microseconds for lossless keyset cursors.
const turnColumns = "id,session_id,prompt,graph_revision,initial_graph_revision,idempotency_key,context_snapshot_json,conversation_phase,execution_state,state_version,plan_json,blocks_json,pending_decision_json,status,created_at::text AS created_at,updated_at::text AS updated_at";
const date = (value: Date | string) => value instanceof Date ? value.toISOString() : value;
const json = (value: unknown) => JSON.stringify(value);
function canonical(value: unknown): string { return JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item); }
function same(a: unknown, b: unknown): boolean { return canonical(a) === canonical(b); }
function fail(code: string): never { throw new Error(code); }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function assertUser(ctx: AgentRuntimeContext): void { if (!ctx.userId) fail("AGENT_USER_REQUIRED"); }
function assertStorage(value: unknown): void {
  const seen = new Set<object>();
  const visit = (item: unknown, depth: number): void => {
    if (depth > 24) fail("AGENT_STORAGE_UNSAFE");
    if (typeof item === "string") {
      if (item.length > 32000 || /^(?:data:|blob:)|base64,/i.test(item.trim()) || /https?:\/\/[^\s]*[?&](?:x-amz-[^=]+|signature|expires|token|sig|se|sv)=/i.test(item) || /^Bearer\s+\S+/i.test(item)) fail("AGENT_STORAGE_UNSAFE");
    } else if (item && typeof item === "object") {
      if (seen.has(item) || (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null)) fail("AGENT_STORAGE_UNSAFE");
      seen.add(item);
      const entries = Object.entries(item);
      if (entries.length > 512) fail("AGENT_STORAGE_UNSAFE");
      for (const [key, child] of entries) {
        if (/^(?:credential(?:s|Id)?|authorization|api[_-]?key|secret|password|nonce|auth[_-]?tag|access[_-]?token|refresh[_-]?token|signed[_-]?url|preview[_-]?url|base64)$/i.test(key)) fail("AGENT_STORAGE_UNSAFE");
        visit(child, depth + 1);
      }
      seen.delete(item);
    } else if (item !== null && !["boolean", "number", "undefined"].includes(typeof item)) fail("AGENT_STORAGE_UNSAFE");
  };
  visit(value, 0);
  if (Buffer.byteLength(JSON.stringify(value) ?? "") > 512000) fail("AGENT_STORAGE_UNSAFE");
}
function mapSession(row: Row): AgentRuntimeSession { return { id: row.id, tenantId: row.tenant_id, projectId: row.project_id, flowId: row.flow_id, title: row.title, mode: row.execution_mode, phase: row.conversation_phase, graphRevision: Number(row.graph_revision), status: row.status }; }
function mapTurn(row: Row): AgentRuntimeTurn { return { id: row.id, sessionId: row.session_id, prompt: row.prompt ?? "", graphRevision: Number(row.graph_revision), idempotencyKey: row.idempotency_key, contextSnapshot: row.context_snapshot_json, phase: row.conversation_phase, executionState: row.execution_state, stateVersion: Number(row.state_version), planJson: row.plan_json ?? {}, blocks: row.blocks_json ?? [], pendingDecision: row.pending_decision_json ?? null, status: row.status, createdAt: date(row.created_at), updatedAt: date(row.updated_at) }; }
function mapDecision(row: Row): AgentRuntimeDecision { return { id: row.id, decisionId: row.decision_key, sessionId: row.session_id, turnId: row.turn_id, blockId: row.block_id, graphRevision: Number(row.graph_revision), decisionType: row.decision_type, payload: row.payload_json, idempotencyKey: row.idempotency_key, resultState: row.result_state, confirmedAt: row.confirmed_at ? date(row.confirmed_at) : null, resultSnapshot: row.result_snapshot_json ?? null }; }
function mapEvent(row: Row): AgentRuntimeEvent { return { id: row.id, sessionId: row.session_id, turnId: row.turn_id, seq: Number(row.seq), eventType: row.event_type, event: row.event_json, graphRevision: row.graph_revision === null ? null : Number(row.graph_revision), idempotencyKey: row.idempotency_key, createdAt: date(row.created_at) }; }
function mapResult(row: Row): AgentRuntimeResultRef { return { id: row.id, resultGroupId: row.result_group_id, assetId: row.asset_id, runId: row.run_id, kind: row.kind, label: row.label, sourceRefs: row.source_refs_json ?? [], lineage: row.lineage_json ?? {}, placedNodeId: row.placed_node_id, status: row.status, contentText: row.content_text }; }
function publicTurn(turn: AgentRuntimeTurn): Record<string, unknown> { const { planJson: _planJson, ...view } = turn; return view; }

async function requireSession(client: PoolClient, ctx: AgentRuntimeContext, sessionId: string, lock = false): Promise<AgentRuntimeSession> {
  assertUser(ctx);
  const result = await client.query(`SELECT ${sessionColumns} FROM agent_sessions WHERE tenant_id=$1::uuid AND id=$2::uuid AND created_by=$3::uuid AND runtime_version='runtime' ${lock ? "FOR UPDATE" : ""}`, [ctx.tenantId, sessionId, ctx.userId]);
  if (!result.rows[0]) fail("AGENT_SESSION_NOT_FOUND");
  return mapSession(result.rows[0]);
}
async function requireTurn(client: PoolClient, ctx: AgentRuntimeContext, sessionId: string, turnId: string): Promise<AgentRuntimeTurn> {
  const result = await client.query(`SELECT ${turnColumns} FROM agent_turns WHERE tenant_id=$1::uuid AND session_id=$2::uuid AND id=$3::uuid AND runtime_version='runtime'`, [ctx.tenantId, sessionId, turnId]);
  if (!result.rows[0]) fail("AGENT_TURN_NOT_FOUND");
  return mapTurn(result.rows[0]);
}
async function requireDraft(client: PoolClient, ctx: AgentRuntimeContext, session: AgentRuntimeSession, revision?: number, lock = false): Promise<Row | null> {
  if (!session.flowId) { if (revision !== undefined && revision !== 0) fail("AGENT_GRAPH_REVISION_CONFLICT"); return null; }
  const result = await client.query(`SELECT d.revision,d.graph_json FROM flow_drafts d JOIN flows f ON f.id=d.flow_id AND f.tenant_id=d.tenant_id JOIN projects p ON p.id=f.project_id AND p.tenant_id=f.tenant_id WHERE d.tenant_id=$1::uuid AND d.flow_id=$2::uuid AND d.project_id=$3::uuid AND p.created_by=$4::uuid AND f.deleted_at IS NULL AND p.deleted_at IS NULL ${lock ? "FOR UPDATE OF d" : ""}`, [ctx.tenantId, session.flowId, session.projectId, ctx.userId]);
  const row = result.rows[0];
  if (!row) fail("AGENT_FLOW_NOT_FOUND");
  if (revision !== undefined && Number(row.revision) !== revision) fail("AGENT_GRAPH_REVISION_CONFLICT");
  return row;
}
async function requireAsset(client: PoolClient, ctx: AgentRuntimeContext, session: AgentRuntimeSession, assetId: string): Promise<Row> {
  const row = (await client.query("SELECT id,kind,workflow_run_id FROM assets WHERE tenant_id=$1::uuid AND id=$2::uuid AND owner_user_id=$3::uuid AND (project_id IS NULL OR project_id=$4::uuid) AND deleted_at IS NULL AND status='available'", [ctx.tenantId, assetId, ctx.userId, session.projectId])).rows[0];
  if (!row) fail("AGENT_ASSET_NOT_FOUND");
  return row;
}
async function requireRun(client: PoolClient, ctx: AgentRuntimeContext, session: AgentRuntimeSession, runId: string): Promise<void> {
  const row = (await client.query("SELECT id FROM workflow_runs WHERE tenant_id=$1::uuid AND id=$2::uuid AND flow_id=$3::uuid AND created_by=$4::uuid", [ctx.tenantId, runId, session.flowId, ctx.userId])).rows[0];
  if (!row) fail("AGENT_RUN_NOT_FOUND");
}
async function appendLocked(client: PoolClient, ctx: AgentRuntimeContext, input: { sessionId: string; turnId?: string | null; eventType: string; event: Record<string, unknown>; graphRevision?: number | null; idempotencyKey?: string | null }): Promise<AgentRuntimeEvent> {
  assertStorage(input.event);
  if (input.turnId) await requireTurn(client, ctx, input.sessionId, input.turnId);
  if (input.idempotencyKey) {
    const prior = (await client.query("SELECT * FROM agent_events WHERE tenant_id=$1::uuid AND session_id=$2::uuid AND idempotency_key=$3", [ctx.tenantId, input.sessionId, input.idempotencyKey])).rows[0];
    if (prior) {
      if (prior.turn_id !== (input.turnId ?? null) || prior.event_type !== input.eventType || !same(prior.event_json, input.event) || (prior.graph_revision === null ? null : Number(prior.graph_revision)) !== (input.graphRevision ?? null)) fail("AGENT_EVENT_IDEMPOTENCY_CONFLICT");
      return mapEvent(prior);
    }
  }
  const seq = (await client.query("UPDATE agent_sessions SET event_seq=event_seq+1,updated_at=now() WHERE tenant_id=$1::uuid AND id=$2::uuid RETURNING event_seq", [ctx.tenantId, input.sessionId])).rows[0].event_seq;
  const result = await client.query("INSERT INTO agent_events(tenant_id,session_id,turn_id,seq,event_type,event_json,graph_revision,idempotency_key) VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6::jsonb,$7,$8) RETURNING *", [ctx.tenantId, input.sessionId, input.turnId ?? null, seq, input.eventType, json(input.event), input.graphRevision ?? null, input.idempotencyKey ?? null]);
  return mapEvent(result.rows[0]);
}
async function snapshotLocked(client: PoolClient, ctx: AgentRuntimeContext, turn: AgentRuntimeTurn): Promise<void> {
  await client.query("UPDATE agent_sessions SET conversation_phase=$3,graph_revision=$4,updated_at=now() WHERE tenant_id=$1::uuid AND id=$2::uuid", [ctx.tenantId, turn.sessionId, turn.phase, turn.graphRevision]);
  await appendLocked(client, ctx, { sessionId: turn.sessionId, turnId: turn.id, eventType: "snapshot", event: { turn: publicTurn(turn) }, graphRevision: turn.graphRevision, idempotencyKey: `snapshot:${turn.id}:${turn.stateVersion}` });
}
async function validateResultGroupBinding(client: PoolClient, ctx: AgentRuntimeContext, session: AgentRuntimeSession, turnId: string, block: ConversationBlock | undefined, resultIds: string[], expectedGroupId?: string): Promise<void> {
  if (!block || block.type !== "result_group" || !uuidPattern.test(block.id ?? "") || (expectedGroupId !== undefined && expectedGroupId !== block.id)) fail("AGENT_RESULT_GROUP_CONFLICT");
  const group = (await client.query("SELECT id,session_id,turn_id,run_id FROM agent_result_groups WHERE tenant_id=$1::uuid AND id=$2::uuid", [ctx.tenantId, block.id])).rows[0];
  if (!group || group.session_id !== session.id || group.turn_id !== turnId) fail("AGENT_RESULT_GROUP_SCOPE_CONFLICT");
  const ids = [...new Set(resultIds)];
  if (!ids.length) return;
  if (ids.some((id) => !uuidPattern.test(id))) fail("AGENT_RESULT_GROUP_SCOPE_CONFLICT");
  const rows = (await client.query("SELECT r.id FROM agent_result_refs r WHERE r.tenant_id=$1::uuid AND r.result_group_id=$2::uuid AND r.id=ANY($3::uuid[]) AND r.run_id IS NOT DISTINCT FROM $4::uuid", [ctx.tenantId, block.id, ids, group.run_id])).rows;
  if (rows.length !== ids.length) fail("AGENT_RESULT_GROUP_SCOPE_CONFLICT");
}
async function saveStateLocked(client: PoolClient, ctx: AgentRuntimeContext, session: AgentRuntimeSession, input: AgentRuntimeStateInput): Promise<AgentRuntimeTurn> {
  if (!Number.isSafeInteger(input.expectedStateVersion) || input.expectedStateVersion < 0) fail("AGENT_STATE_VERSION_REQUIRED");
  assertStorage(input.planJson); assertStorage(input.pendingDecision);
  const blocks = normalizeConversationBlocks(input.blocks);
  if (input.pendingDecision && (!input.pendingDecision.id || !input.pendingDecision.blockId || !blocks.some(block => block.id === input.pendingDecision!.blockId) || input.pendingDecision.graphRevision !== input.graphRevision)) fail("AGENT_PENDING_DECISION_INVALID");
  if (input.pendingDecision && (Array.isArray(input.pendingDecision.allowedTypes) ? input.pendingDecision.allowedTypes : []).includes("result_action")) {
    const block = blocks.find((candidate) => candidate.id === input.pendingDecision!.blockId);
    const resultIds = block?.type === "result_group" ? block.results.map((result) => result.id) : [];
    const currentTurn = await requireTurn(client, ctx, input.sessionId, input.turnId);
    const planResultGroupId = typeof input.planJson?.resultGroupId === "string" ? input.planJson.resultGroupId : typeof currentTurn.planJson.resultGroupId === "string" ? currentTurn.planJson.resultGroupId : undefined;
    if (!planResultGroupId) fail("AGENT_RESULT_GROUP_CONFLICT");
    await validateResultGroupBinding(client, ctx, session, input.turnId, block, resultIds, planResultGroupId);
  }
  await requireDraft(client, ctx, session, input.graphRevision, true);
  const result = await client.query(`UPDATE agent_turns SET blocks_json=$4::jsonb,conversation_phase=$5,execution_state=$6,pending_decision_json=$7::jsonb,graph_revision=$8,status=COALESCE($9,status),plan_json=COALESCE($10::jsonb,plan_json),state_version=state_version+1,updated_at=now() WHERE tenant_id=$1::uuid AND session_id=$2::uuid AND id=$3::uuid AND runtime_version='runtime' AND state_version=$11 AND graph_revision=$12 RETURNING ${turnColumns}`, [ctx.tenantId, input.sessionId, input.turnId, json(blocks), input.phase, input.executionState, json(input.pendingDecision ?? null), input.graphRevision, input.status ?? null, input.planJson === undefined ? null : json(input.planJson), input.expectedStateVersion, input.expectedGraphRevision]);
  if (!result.rows[0]) fail("AGENT_STATE_VERSION_CONFLICT");
  const turn = mapTurn(result.rows[0]);
  await snapshotLocked(client, ctx, turn);
  return turn;
}

export class AgentRuntimeRepository {
  readonly pool: Pool;
  constructor(options?: { pool?: Pool }) { this.pool = options?.pool ?? createPgPool(); }

  async createSession(ctx: AgentRuntimeContext, input: { projectId: string | null; flowId: string | null; title?: string }): Promise<AgentRuntimeSession> {
    assertUser(ctx); assertStorage(input.title);
    if (input.flowId && !input.projectId) fail("AGENT_SESSION_SCOPE_INVALID");
    return withTenantTransaction(ctx, async client => {
      if (input.projectId) {
        const project = (await client.query("SELECT id FROM projects WHERE tenant_id=$1::uuid AND id=$2::uuid AND created_by=$3::uuid AND deleted_at IS NULL", [ctx.tenantId, input.projectId, ctx.userId])).rows[0];
        if (!project) fail("AGENT_PROJECT_NOT_FOUND");
      }
      let graphRevision = 0;
      if (input.flowId) {
        const flow = (await client.query("SELECT f.id,d.revision FROM flows f JOIN flow_drafts d ON d.flow_id=f.id AND d.tenant_id=f.tenant_id WHERE f.tenant_id=$1::uuid AND f.id=$2::uuid AND f.project_id=$3::uuid AND d.project_id=$3::uuid AND f.deleted_at IS NULL", [ctx.tenantId, input.flowId, input.projectId])).rows[0];
        if (!flow) fail("AGENT_FLOW_NOT_FOUND");
        graphRevision = Number(flow.revision);
      }
      const row = (await client.query(`INSERT INTO agent_sessions(tenant_id,project_id,flow_id,title,created_by,runtime_version,graph_revision) VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5::uuid,'runtime',$6) RETURNING ${sessionColumns}`, [ctx.tenantId, input.projectId, input.flowId, input.title?.trim().slice(0, 200) || "Agent 会话", ctx.userId, graphRevision])).rows[0];
      return mapSession(row);
    }, this.pool);
  }
  async getSession(ctx: AgentRuntimeContext, sessionId: string): Promise<AgentRuntimeSession> { return withTenantTransaction(ctx, client => requireSession(client, ctx, sessionId), this.pool); }
  async listSessions(ctx: AgentRuntimeContext, filter: { projectId?: string | null; flowId?: string | null; limit?: number } = {}): Promise<AgentRuntimeSession[]> {
    assertUser(ctx);
    return withTenantTransaction(ctx, async client => {
      const values: unknown[] = [ctx.tenantId, ctx.userId];
      const where = ["tenant_id=$1::uuid", "created_by=$2::uuid", "runtime_version='runtime'"];
      for (const [key, column] of [["projectId", "project_id"], ["flowId", "flow_id"]] as const) if (filter[key] !== undefined) { values.push(filter[key]); where.push(`${column} IS NOT DISTINCT FROM $${values.length}::uuid`); }
      values.push(Math.min(100, Math.max(1, filter.limit ?? 20)));
      return (await client.query(`SELECT ${sessionColumns} FROM agent_sessions WHERE ${where.join(" AND ")} ORDER BY updated_at DESC,id DESC LIMIT $${values.length}`, values)).rows.map(mapSession);
    }, this.pool);
  }
  async updateSession(ctx: AgentRuntimeContext, sessionId: string, input: { title?: string; mode?: "auto" | "manual_confirmation"; status?: "active" | "archived" }): Promise<AgentRuntimeSession> {
    assertStorage(input);
    return withTenantTransaction(ctx, async client => {
      await requireSession(client, ctx, sessionId, true);
      const row = (await client.query(`UPDATE agent_sessions SET title=COALESCE($3,title),execution_mode=COALESCE($4,execution_mode),status=COALESCE($5,status),updated_at=now() WHERE tenant_id=$1::uuid AND id=$2::uuid RETURNING ${sessionColumns}`, [ctx.tenantId, sessionId, input.title?.trim().slice(0, 200) || null, input.mode ?? null, input.status ?? null])).rows[0];
      const session = mapSession(row);
      await appendLocked(client, ctx, { sessionId, eventType: "session_updated", event: { session } });
      return session;
    }, this.pool);
  }
  async createTurnIdempotent(ctx: AgentRuntimeContext, input: AgentRuntimeTurnInput): Promise<AgentRuntimeTurn> {
    const context = normalizeAgentContextSnapshot(input.contextSnapshot); assertStorage(input.prompt);
    if (!input.idempotencyKey || !input.prompt.trim() || input.prompt.length > 16000) fail("AGENT_TURN_INVALID");
    return withTenantTransaction(ctx, async client => {
      const session = await requireSession(client, ctx, input.sessionId, true);
      const findExisting = async (): Promise<AgentRuntimeTurn | null> => {
        const row = (await client.query(`SELECT ${turnColumns} FROM agent_turns WHERE tenant_id=$1::uuid AND idempotency_key=$2 AND runtime_version='runtime'`, [ctx.tenantId, input.idempotencyKey])).rows[0];
        if (!row) return null;
        if (row.session_id !== input.sessionId || row.prompt !== input.prompt || Number(row.initial_graph_revision) !== input.graphRevision || !same(row.context_snapshot_json, context)) fail("AGENT_TURN_IDEMPOTENCY_CONFLICT");
        return mapTurn(row);
      };
      const existing = await findExisting(); if (existing) return existing;
      if (session.status !== "active") fail("AGENT_SESSION_ARCHIVED");
      if (context.projectId !== session.projectId || context.flowId !== session.flowId || context.graphRevision !== input.graphRevision) fail("AGENT_CONTEXT_SCOPE_INVALID");
      const draft = await requireDraft(client, ctx, session, input.graphRevision, true);
      for (const ref of context.refs) {
        if (ref.assetId) await requireAsset(client, ctx, session, ref.assetId);
        if (ref.nodeId) {
          const nodes = (draft?.graph_json?.nodes ?? []) as Row[];
          const node = nodes.find(node => node.id === ref.nodeId);
          if (!node || (ref.assetId && node.data?.assetId !== ref.assetId)) fail("AGENT_REFERENCE_NOT_FOUND");
        }
      }
      const result = await client.query(`INSERT INTO agent_turns(tenant_id,session_id,status,context_snapshot_json,conversation_phase,execution_state,graph_revision,initial_graph_revision,idempotency_key,agent_namespace,agent_version,runtime_version,prompt) VALUES($1::uuid,$2::uuid,'pending',$3::jsonb,'understanding','idle',$4,$4,$5,'canonical','runtime','runtime',$6) ON CONFLICT (tenant_id,idempotency_key) WHERE runtime_version='runtime' AND idempotency_key IS NOT NULL DO NOTHING RETURNING ${turnColumns}`, [ctx.tenantId, input.sessionId, json(context), input.graphRevision, input.idempotencyKey, input.prompt]);
      if (!result.rows[0]) return (await findExisting()) ?? fail("AGENT_TURN_IDEMPOTENCY_CONFLICT");
      const turn = mapTurn(result.rows[0]); await snapshotLocked(client, ctx, turn); return turn;
    }, this.pool);
  }
  async getTurn(ctx: AgentRuntimeContext, sessionId: string, turnId: string): Promise<AgentRuntimeTurn> { return withTenantTransaction(ctx, async client => { await requireSession(client, ctx, sessionId); return requireTurn(client, ctx, sessionId, turnId); }, this.pool); }
  async saveTurnStateCAS(ctx: AgentRuntimeContext, input: AgentRuntimeStateInput): Promise<AgentRuntimeTurn> { return withTenantTransaction(ctx, async client => saveStateLocked(client, ctx, await requireSession(client, ctx, input.sessionId, true), input), this.pool); }
  async getHistory(ctx: AgentRuntimeContext, sessionId: string, options: { limit?: number; cursor?: string | null } = {}): Promise<AgentRuntimeHistory> {
    return withTenantTransaction(ctx, async client => {
      const session = await requireSession(client, ctx, sessionId, true);
      const limit = Math.min(100, Math.max(1, options.limit ?? 30));
      let boundary: [string, string] | null = null;
      if (options.cursor) { try { boundary = JSON.parse(Buffer.from(options.cursor, "base64url").toString()) as [string, string]; if (!Array.isArray(boundary) || boundary.length !== 2 || typeof boundary[0] !== "string" || typeof boundary[1] !== "string") fail("AGENT_HISTORY_CURSOR_INVALID"); } catch { fail("AGENT_HISTORY_CURSOR_INVALID"); } }
      const rows = (await client.query(`SELECT ${turnColumns} FROM agent_turns WHERE tenant_id=$1::uuid AND session_id=$2::uuid AND runtime_version='runtime' AND ($3::timestamptz IS NULL OR (created_at,id)<($3::timestamptz,$4::uuid)) ORDER BY created_at DESC,id DESC LIMIT $5`, [ctx.tenantId, sessionId, boundary?.[0] ?? null, boundary?.[1] ?? null, limit + 1])).rows;
      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit);
      const oldest = page.at(-1);
      const lastSeq = Number((await client.query("SELECT event_seq FROM agent_sessions WHERE tenant_id=$1::uuid AND id=$2::uuid", [ctx.tenantId, sessionId])).rows[0].event_seq);
      return { session, turns: page.reverse().map(mapTurn), lastSeq, hasMore, nextCursor: hasMore && oldest ? Buffer.from(JSON.stringify([date(oldest.created_at), oldest.id])).toString("base64url") : null };
    }, this.pool);
  }
  async beginDecision(ctx: AgentRuntimeContext, input: AgentRuntimeDecisionInput): Promise<{ decision: AgentRuntimeDecision; turn: AgentRuntimeTurn; replay: boolean }> {
    assertStorage(input.payload);
    return withTenantTransaction(ctx, async client => {
      const session = await requireSession(client, ctx, input.sessionId, true);
      const turn = await requireTurn(client, ctx, input.sessionId, input.turnId);
      const prior = (await client.query("SELECT * FROM agent_decisions WHERE tenant_id=$1::uuid AND idempotency_key=$2", [ctx.tenantId, input.idempotencyKey])).rows[0];
      if (prior) {
        if (prior.session_id !== input.sessionId || prior.turn_id !== input.turnId || prior.decision_key !== input.decisionId || prior.block_id !== input.blockId || prior.decision_type !== input.type || Number(prior.graph_revision) !== input.graphRevision || !same(prior.payload_json, input.payload)) fail("AGENT_DECISION_IDEMPOTENCY_CONFLICT");
        return { decision: mapDecision(prior), turn, replay: true };
      }
      if ((await client.query("SELECT id FROM agent_decisions WHERE tenant_id=$1::uuid AND turn_id=$2::uuid AND decision_key=$3", [ctx.tenantId, input.turnId, input.decisionId])).rowCount) fail("AGENT_DECISION_ALREADY_SUBMITTED");
      const pending = turn.pendingDecision;
      if (!pending || pending.id !== input.decisionId || pending.blockId !== input.blockId || pending.graphRevision !== input.graphRevision || turn.graphRevision !== input.graphRevision) fail("AGENT_PENDING_DECISION_CONFLICT");
      const allowed = Array.isArray(pending.allowedTypes) ? pending.allowedTypes : pending.type ? [pending.type] : [];
      if (!allowed.includes(input.type)) fail("AGENT_DECISION_TYPE_INVALID");
      if (input.type === "result_action") {
        const block = turn.blocks.find((candidate) => candidate.id === input.blockId);
        const resultIds = Array.isArray(input.payload.resultIds) ? input.payload.resultIds.filter((id): id is string => typeof id === "string") : [];
        await validateResultGroupBinding(client, ctx, session, input.turnId, block, resultIds, input.blockId);
      }
      await requireDraft(client, ctx, session, input.graphRevision, true);
      const decision = mapDecision((await client.query("INSERT INTO agent_decisions(tenant_id,session_id,turn_id,decision_key,block_id,graph_revision,decision_type,payload_json,idempotency_key,created_by) VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8::jsonb,$9,$10::uuid) RETURNING *", [ctx.tenantId, input.sessionId, input.turnId, input.decisionId, input.blockId, input.graphRevision, input.type, json(input.payload), input.idempotencyKey, ctx.userId])).rows[0]);
      const claimedTurn = mapTurn((await client.query(`UPDATE agent_turns SET pending_decision_json=NULL,state_version=state_version+1,updated_at=now() WHERE tenant_id=$1::uuid AND session_id=$2::uuid AND id=$3::uuid AND state_version=$4 RETURNING ${turnColumns}`, [ctx.tenantId, input.sessionId, input.turnId, turn.stateVersion])).rows[0]);
      await snapshotLocked(client, ctx, claimedTurn);
      return { decision, turn: claimedTurn, replay: false };
    }, this.pool);
  }
  async completeDecision(ctx: AgentRuntimeContext, input: AgentRuntimeStateInput & { decisionId: string }): Promise<AgentRuntimeTurn> {
    return withTenantTransaction(ctx, async client => {
      const session = await requireSession(client, ctx, input.sessionId, true);
      const decision = (await client.query("SELECT * FROM agent_decisions WHERE tenant_id=$1::uuid AND session_id=$2::uuid AND turn_id=$3::uuid AND id=$4::uuid", [ctx.tenantId, input.sessionId, input.turnId, input.decisionId])).rows[0];
      if (!decision) fail("AGENT_DECISION_NOT_FOUND");
      if (decision.result_state === "completed") return requireTurn(client, ctx, input.sessionId, input.turnId);
      const turn = await saveStateLocked(client, ctx, session, input);
      await client.query("UPDATE agent_decisions SET result_state='completed',confirmed_at=now(),result_snapshot_json=$3::jsonb WHERE tenant_id=$1::uuid AND id=$2::uuid", [ctx.tenantId, decision.id, json(publicTurn(turn))]);
      return turn;
    }, this.pool);
  }
  async getPendingDecision(ctx: AgentRuntimeContext, sessionId: string, turnId: string): Promise<Record<string, unknown> | null> { return (await this.getTurn(ctx, sessionId, turnId)).pendingDecision; }
  /** Accepted submissions awaiting recovery; never inferred from in-memory promises. */
  async listIncompleteDecisions(ctx: AgentRuntimeContext, sessionId: string): Promise<AgentRuntimeDecision[]> {
    return withTenantTransaction(ctx, async client => {
      await requireSession(client, ctx, sessionId);
      return (await client.query("SELECT * FROM agent_decisions WHERE tenant_id=$1::uuid AND session_id=$2::uuid AND result_state='processing' ORDER BY created_at,id LIMIT 100", [ctx.tenantId, sessionId])).rows.map(mapDecision);
    }, this.pool);
  }
  async appendEvent(ctx: AgentRuntimeContext, input: { sessionId: string; turnId?: string | null; eventType: string; event: Record<string, unknown>; graphRevision?: number | null; idempotencyKey?: string | null }): Promise<AgentRuntimeEvent> { return withTenantTransaction(ctx, async client => { await requireSession(client, ctx, input.sessionId, true); return appendLocked(client, ctx, input); }, this.pool); }
  async listEvents(ctx: AgentRuntimeContext, sessionId: string, afterSeq = 0, limit = 200): Promise<AgentRuntimeEvent[]> {
    return withTenantTransaction(ctx, async client => {
      await requireSession(client, ctx, sessionId);
      return (await client.query("SELECT * FROM agent_events WHERE tenant_id=$1::uuid AND session_id=$2::uuid AND seq>$3 ORDER BY seq ASC LIMIT $4", [ctx.tenantId, sessionId, Math.max(0, afterSeq), Math.min(1000, Math.max(1, limit))])).rows.map(mapEvent);
    }, this.pool);
  }
  async claimExecution(ctx: AgentRuntimeContext, input: { sessionId: string; turnId: string; owner: string; leaseMs?: number }): Promise<boolean> {
    return withTenantTransaction(ctx, async client => {
      await requireSession(client, ctx, input.sessionId, true);
      const result = await client.query("UPDATE agent_turns SET lease_owner=$4,lease_expires_at=now()+($5::double precision*interval '1 millisecond') WHERE tenant_id=$1::uuid AND session_id=$2::uuid AND id=$3::uuid AND runtime_version='runtime' AND status NOT IN ('succeeded','cancelled') AND (lease_expires_at IS NULL OR lease_expires_at<=now()) RETURNING id", [ctx.tenantId, input.sessionId, input.turnId, input.owner, Math.max(1000, Math.min(300000, input.leaseMs ?? 60000))]);
      return Boolean(result.rowCount);
    }, this.pool);
  }
  async renewExecution(ctx: AgentRuntimeContext, input: { sessionId: string; turnId: string; owner: string; leaseMs?: number }): Promise<boolean> {
    return withTenantTransaction(ctx, async client => {
      await requireSession(client, ctx, input.sessionId);
      return Boolean((await client.query("UPDATE agent_turns SET lease_expires_at=now()+($5::double precision*interval '1 millisecond') WHERE tenant_id=$1::uuid AND session_id=$2::uuid AND id=$3::uuid AND lease_owner=$4 AND lease_expires_at>now() RETURNING id", [ctx.tenantId, input.sessionId, input.turnId, input.owner, Math.max(1000, Math.min(300000, input.leaseMs ?? 60000))])).rowCount);
    }, this.pool);
  }
  async releaseExecution(ctx: AgentRuntimeContext, input: { sessionId: string; turnId: string; owner: string }): Promise<void> {
    return withTenantTransaction(ctx, async client => {
      await requireSession(client, ctx, input.sessionId);
      await client.query("UPDATE agent_turns SET lease_owner=NULL,lease_expires_at=NULL WHERE tenant_id=$1::uuid AND session_id=$2::uuid AND id=$3::uuid AND lease_owner=$4", [ctx.tenantId, input.sessionId, input.turnId, input.owner]);
    }, this.pool);
  }
  async saveResultGroup(ctx: AgentRuntimeContext, input: { sessionId: string; turnId: string; runId?: string | null; status?: string; idempotencyKey?: string }): Promise<string> {
    return withTenantTransaction(ctx, async client => {
      const session = await requireSession(client, ctx, input.sessionId, true);
      await requireTurn(client, ctx, input.sessionId, input.turnId);
      if (input.runId) await requireRun(client, ctx, session, input.runId);
      const key = input.idempotencyKey ?? `result-group:${input.turnId}:${input.runId ?? "default"}`;
      const prior = (await client.query("SELECT * FROM agent_result_groups WHERE tenant_id=$1::uuid AND idempotency_key=$2", [ctx.tenantId, key])).rows[0];
      if (prior) { if (prior.session_id !== input.sessionId || prior.turn_id !== input.turnId || prior.run_id !== (input.runId ?? null)) fail("AGENT_RESULT_IDEMPOTENCY_CONFLICT"); return prior.id; }
      return (await client.query("INSERT INTO agent_result_groups(tenant_id,session_id,turn_id,run_id,status,idempotency_key) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6) RETURNING id", [ctx.tenantId, input.sessionId, input.turnId, input.runId ?? null, input.status ?? "pending", key])).rows[0].id;
    }, this.pool);
  }
  private async requireGroup(client: PoolClient, ctx: AgentRuntimeContext, groupId: string): Promise<{ group: Row; session: AgentRuntimeSession; turn: AgentRuntimeTurn }> {
    const group = (await client.query("SELECT * FROM agent_result_groups WHERE tenant_id=$1::uuid AND id=$2::uuid", [ctx.tenantId, groupId])).rows[0];
    if (!group) fail("AGENT_RESULT_GROUP_NOT_FOUND");
    const session = await requireSession(client, ctx, group.session_id, true);
    return { group, session, turn: await requireTurn(client, ctx, session.id, group.turn_id) };
  }
  async saveResultRef(ctx: AgentRuntimeContext, input: { resultGroupId: string; assetId?: string | null; runId?: string | null; kind: "image" | "video" | "text"; label: string; sourceRefs?: string[]; lineage?: Record<string, unknown>; status?: string; contentText?: string | null; idempotencyKey?: string }): Promise<AgentRuntimeResultRef> {
    assertStorage(input);
    if ((input.kind === "text" && !input.contentText?.trim()) || (input.kind !== "text" && !input.assetId)) fail("AGENT_RESULT_INVALID");
    return withTenantTransaction(ctx, async client => {
      const { group, session, turn } = await this.requireGroup(client, ctx, input.resultGroupId);
      const runId = input.runId ?? group.run_id ?? null;
      if (runId) await requireRun(client, ctx, session, runId);
      if (input.assetId) {
        const asset = await requireAsset(client, ctx, session, input.assetId);
        if (asset.kind !== input.kind || (runId && asset.workflow_run_id !== runId)) fail("AGENT_RESULT_ASSET_MISMATCH");
      }
      const sourceRefs = input.sourceRefs ?? [];
      if (sourceRefs.some(ref => !turn.contextSnapshot.refs.some(contextRef => contextRef.refId === ref))) fail("AGENT_RESULT_SOURCE_REF_INVALID");
      const key = input.idempotencyKey ?? `result:${input.resultGroupId}:${input.assetId ?? createHash("sha256").update(input.contentText ?? "").digest("hex")}`;
      const prior = (await client.query("SELECT * FROM agent_result_refs WHERE tenant_id=$1::uuid AND idempotency_key=$2", [ctx.tenantId, key])).rows[0];
      if (prior) {
        if (prior.result_group_id !== input.resultGroupId || prior.asset_id !== (input.assetId ?? null) || prior.run_id !== runId || prior.kind !== input.kind || prior.label !== input.label || prior.content_text !== (input.contentText ?? null) || !same(prior.source_refs_json, sourceRefs) || !same(prior.lineage_json, input.lineage ?? {})) fail("AGENT_RESULT_IDEMPOTENCY_CONFLICT");
        return mapResult(prior);
      }
      return mapResult((await client.query("INSERT INTO agent_result_refs(tenant_id,result_group_id,asset_id,run_id,idempotency_key,kind,label,source_refs_json,lineage_json,status,content_text) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11) RETURNING *", [ctx.tenantId, input.resultGroupId, input.assetId ?? null, runId, key, input.kind, input.label, json(sourceRefs), json(input.lineage ?? {}), input.status ?? "ready", input.contentText ?? null])).rows[0]);
    }, this.pool);
  }
  async getResultRef(ctx: AgentRuntimeContext, resultId: string, scope?: { sessionId: string; turnId: string }): Promise<AgentRuntimeResultRef> {
    return withTenantTransaction(ctx, async client => {
      const row = (await client.query("SELECT * FROM agent_result_refs WHERE tenant_id=$1::uuid AND id=$2::uuid", [ctx.tenantId, resultId])).rows[0];
      if (!row) fail("AGENT_RESULT_NOT_FOUND");
      const { group } = await this.requireGroup(client, ctx, row.result_group_id);
      if (scope && (group.session_id !== scope.sessionId || group.turn_id !== scope.turnId)) fail("AGENT_RESULT_SCOPE_CONFLICT");
      return mapResult(row);
    }, this.pool);
  }

  async getResultRefsForTurn(ctx: AgentRuntimeContext, input: { sessionId: string; turnId: string; resultIds: string[] }): Promise<AgentRuntimeResultRef[]> {
    return withTenantTransaction(ctx, async client => {
      await requireSession(client, ctx, input.sessionId);
      await requireTurn(client, ctx, input.sessionId, input.turnId);
      const rows = (await client.query("SELECT r.* FROM agent_result_refs r JOIN agent_result_groups g ON g.tenant_id=r.tenant_id AND g.id=r.result_group_id WHERE r.tenant_id=$1::uuid AND g.session_id=$2::uuid AND g.turn_id=$3::uuid AND r.id=ANY($4::uuid[]) ORDER BY array_position($4::uuid[], r.id)", [ctx.tenantId, input.sessionId, input.turnId, input.resultIds])).rows;
      if (rows.length !== input.resultIds.length) fail("AGENT_RESULT_SCOPE_CONFLICT");
      return rows.map(mapResult);
    }, this.pool);
  }

  async updateResultRef(ctx: AgentRuntimeContext, input: { resultId: string; sessionId?: string; turnId?: string; status?: string; lineage?: Record<string, unknown> }): Promise<AgentRuntimeResultRef> {
    assertStorage(input.lineage);
    return withTenantTransaction(ctx, async client => {
      const row = (await client.query("SELECT * FROM agent_result_refs WHERE tenant_id=$1::uuid AND id=$2::uuid FOR UPDATE", [ctx.tenantId, input.resultId])).rows[0];
      if (!row) fail("AGENT_RESULT_NOT_FOUND");
      const { group } = await this.requireGroup(client, ctx, row.result_group_id);
      if ((input.sessionId && group.session_id !== input.sessionId) || (input.turnId && group.turn_id !== input.turnId)) fail("AGENT_RESULT_SCOPE_CONFLICT");
      const updated = (await client.query("UPDATE agent_result_refs SET status=COALESCE($3,status),lineage_json=CASE WHEN $4::jsonb IS NULL THEN lineage_json ELSE lineage_json || $4::jsonb END WHERE tenant_id=$1::uuid AND id=$2::uuid RETURNING *", [ctx.tenantId, input.resultId, input.status ?? null, input.lineage ? json(input.lineage) : null])).rows[0];
      return mapResult(updated);
    }, this.pool);
  }
  async listResultRefs(ctx: AgentRuntimeContext, sessionId: string, turnId?: string): Promise<AgentRuntimeResultRef[]> {
    return withTenantTransaction(ctx, async client => {
      await requireSession(client, ctx, sessionId);
      if (turnId) await requireTurn(client, ctx, sessionId, turnId);
      return (await client.query("SELECT r.* FROM agent_result_refs r JOIN agent_result_groups g ON g.tenant_id=r.tenant_id AND g.id=r.result_group_id WHERE g.tenant_id=$1::uuid AND g.session_id=$2::uuid AND ($3::uuid IS NULL OR g.turn_id=$3::uuid) ORDER BY r.created_at,r.id LIMIT 500", [ctx.tenantId, sessionId, turnId ?? null])).rows.map(mapResult);
    }, this.pool);
  }
  /** Canvas CAS and placement marker commit together. Never mark after an external write. */
  async placeResultAtomic(ctx: AgentRuntimeContext, input: { resultId: string; placedNodeId: string; expectedGraphRevision: number; graph: Record<string, unknown> }): Promise<{ result: AgentRuntimeResultRef; graphRevision: number }> {
    assertStorage(input.graph);
    return withTenantTransaction(ctx, async client => {
      let row = (await client.query("SELECT * FROM agent_result_refs WHERE tenant_id=$1::uuid AND id=$2::uuid", [ctx.tenantId, input.resultId])).rows[0];
      if (!row) fail("AGENT_RESULT_NOT_FOUND");
      const { session, turn } = await this.requireGroup(client, ctx, row.result_group_id);
      row = (await client.query("SELECT * FROM agent_result_refs WHERE tenant_id=$1::uuid AND id=$2::uuid FOR UPDATE", [ctx.tenantId, input.resultId])).rows[0];
      const draft = await requireDraft(client, ctx, session, undefined, true);
      if (!draft) fail("AGENT_FLOW_NOT_FOUND");
      if (row.placed_node_id) {
        if (row.placed_node_id !== input.placedNodeId) fail("AGENT_RESULT_ALREADY_PLACED");
        return { result: mapResult(row), graphRevision: Number(draft.revision) };
      }
      if (Number(draft.revision) !== input.expectedGraphRevision) fail("AGENT_GRAPH_REVISION_CONFLICT");
      const nodes = Array.isArray(input.graph.nodes) ? input.graph.nodes as Row[] : [];
      const node = nodes.find((value: Row) => value.id === input.placedNodeId);
      if (!node || !Array.isArray(input.graph.edges) || !input.graph.viewport || (row.asset_id && node.data?.assetId !== row.asset_id) || (row.kind === "text" && ![node.data?.content, node.data?.text].includes(row.content_text))) fail("AGENT_RESULT_PLACEMENT_INVALID");
      // Placement can only append its own new node; existing graph content is immutable here.
      const oldGraph = draft.graph_json;
      const oldNodes = oldGraph.nodes ?? [];
      if (oldNodes.some((old: Row) => old.id === input.placedNodeId) || nodes.length !== oldNodes.length + 1 || !same(nodes.filter((value: Row) => value.id !== input.placedNodeId), oldNodes) || !same(input.graph.edges, oldGraph.edges ?? []) || !same(input.graph.viewport, oldGraph.viewport)) fail("AGENT_RESULT_PLACEMENT_INVALID");
      const updated = await client.query("UPDATE flow_drafts SET graph_json=$4::jsonb,revision=revision+1,last_saved_by=$5::uuid,updated_at=now() WHERE tenant_id=$1::uuid AND flow_id=$2::uuid AND revision=$3 RETURNING revision", [ctx.tenantId, session.flowId, input.expectedGraphRevision, json(input.graph), ctx.userId]);
      if (!updated.rows[0]) fail("AGENT_GRAPH_REVISION_CONFLICT");
      const result = mapResult((await client.query("UPDATE agent_result_refs SET placed_node_id=$3,status='placed' WHERE tenant_id=$1::uuid AND id=$2::uuid RETURNING *", [ctx.tenantId, input.resultId, input.placedNodeId])).rows[0]);
      const graphRevision = Number(updated.rows[0].revision);
      await appendLocked(client, ctx, { sessionId: session.id, turnId: turn.id, eventType: "result_placed", event: { result, graphRevision }, graphRevision, idempotencyKey: `placement:${result.id}` });
      return { result, graphRevision };
    }, this.pool);
  }
}
