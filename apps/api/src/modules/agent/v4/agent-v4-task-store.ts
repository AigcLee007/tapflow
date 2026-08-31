import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { withTenantTransaction } from "@aigc-flow/db";

import type { AgentV4GenerationItem, AgentV4SafeToolResult, AgentV4Status } from "./agent-v4-types.js";

export type AgentV4TaskRecord = {
  id: string;
  tenantId: string;
  sessionId: string;
  projectId: string;
  flowId: string;
  graphRevision: number;
  prompt: string;
  status: AgentV4Status;
  outputJson?: Record<string, unknown>;
};

export type AgentV4TaskEvent = {
  type: string;
  status: AgentV4Status;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
};

export type AgentV4TaskRepository = {
  createTask(input: {
    idempotencyKey: string;
    tenantId: string;
    sessionId: string;
    projectId: string;
    flowId: string;
    graphRevision: number;
    prompt: string;
    taskType: string;
    title: string;
    status: AgentV4Status;
    inputJson: Record<string, unknown>;
  }): Promise<{ id: string }>;
  getTask?(input: { tenantId: string; taskId: string }): Promise<AgentV4TaskRecord | null>;
  updateTask?(id: string, input: { tenantId: string; status: AgentV4Status; outputJson?: Record<string, unknown>; errorJson?: Record<string, unknown> | null }): Promise<void>;
  appendEvent(input: { tenantId: string; sessionId: string; taskId: string; agentNamespace: string; agentVersion: "v4"; eventType: string; eventJson: Record<string, unknown>; idempotencyKey: string }): Promise<{ id?: string; seq?: number } | null>;
  getEvents?(input: { tenantId: string; taskId: string; afterSeq: number }): Promise<Array<{ seq: number; eventType: string; eventJson: Record<string, unknown> }>>;
  findGenerationItem?(input: { tenantId: string; taskId: string; itemId: string }): Promise<AgentV4GenerationItem | null>;
  updateGenerationItem?(input: { tenantId: string; taskId: string; itemId: string; patch: Partial<AgentV4GenerationItem> }): Promise<AgentV4GenerationItem | null>;
};

const forbiddenKey = /provider|credential|authorization|signedurl|signed_url|rawresponse|raw_response|base64|secret|api[_-]?key/i;
const forbiddenValue = /(?:data\s*:|blob\s*:|[a-z][a-z0-9+.-]*:\/\/|(?:javascript|mailto):|\b(?:sk|rk|pk)-[a-z0-9_-]{8,}|\b(?:token|api[_-]?key|secret)\s*[:=])/i;
const allowedKeys = new Set([
  "taskId", "status", "summary", "text", "errorCode", "callId", "name", "round", "finishReason", "assetId", "nodeId", "runIds",
  "itemId", "itemIds", "assetIds", "items", "references", "referenceIds", "usage", "modelOutput", "toolCall",
  "generationItems", "suitePlan", "visualBible", "promptSet", "dependencyGraph", "appliedCanvas", "conversationId", "turnId",
  "operationSetId", "inverseOperations", "revision", "requiresApproval", "risk", "graphRevision", "pendingTool", "arguments",
  "pageKey", "prompt", "referenceAssetIds", "workflowRunId", "retryCount", "purpose", "mainImageCount", "detailPageCount", "targetPlatform",
  "palette", "lighting", "background", "typography", "composition", "prohibitions", "productLock", "operations",
  "inputTokens", "outputTokens", "totalTokens", "rawCost",
]);

function safeEventValue(value: unknown, depth = 0): unknown {
  if (depth > 5) return undefined;
  if (typeof value === "string") return forbiddenValue.test(value) ? undefined : value.slice(0, 12_000);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 24).map((item) => safeEventValue(item, depth + 1)).filter((item) => item !== undefined);
  if (!value || typeof value !== "object") return undefined;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (forbiddenKey.test(key) || !allowedKeys.has(key)) continue;
    const safe = safeEventValue(child, depth + 1);
    if (safe !== undefined) output[key] = safe;
  }
  return output;
}

export function sanitizeV4EventPayload(payload: Record<string, unknown> | undefined): Record<string, unknown> {
  const safe = safeEventValue(payload ?? {});
  return safe && typeof safe === "object" && !Array.isArray(safe) ? safe as Record<string, unknown> : {};
}

export class DatabaseAgentV4TaskRepository implements AgentV4TaskRepository {
  constructor(private readonly pool: Pool) {}

  async createTask(input: Parameters<AgentV4TaskRepository["createTask"]>[0]): Promise<{ id: string }> {
    return withTenantTransaction({ tenantId: input.tenantId, userId: null }, async (client) => {
      const result = await client.query<{ id: string }>(
        `INSERT INTO agent_tasks (tenant_id, session_id, agent_namespace, agent_version, idempotency_key, task_key, task_type, title, status, graph_revision, input_json, updated_at)
         VALUES ($1::uuid, $2::uuid, 'canvas', 'v4', $3, $3, $4, $5, $6, $7, $8::jsonb, now())
         ON CONFLICT DO NOTHING RETURNING id::text AS id`,
        [input.tenantId, input.sessionId, input.idempotencyKey, input.taskType, input.title, input.status, input.graphRevision, JSON.stringify(input.inputJson)],
      );
      if (result.rows[0]) return result.rows[0];
      const existing = await client.query<{ id: string }>(
        `SELECT id::text AS id FROM agent_tasks WHERE tenant_id = $1::uuid AND agent_version = 'v4' AND idempotency_key = $2 LIMIT 1`,
        [input.tenantId, input.idempotencyKey],
      );
      if (existing.rows[0]) return existing.rows[0];
      throw new Error("AGENT_V4_TASK_IDEMPOTENCY_CONFLICT");
    }, this.pool);
  }

  async appendEvent(input: Parameters<AgentV4TaskRepository["appendEvent"]>[0]): Promise<{ id?: string; seq?: number } | null> {
    return withTenantTransaction({ tenantId: input.tenantId, userId: null }, async (client) => {
      const result = await client.query<{ id: string; seq: string }>(
        `INSERT INTO agent_task_events (tenant_id, session_id, task_id, agent_namespace, agent_version, idempotency_key, event_type, event_json)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'v4', $5, $6, $7::jsonb)
         ON CONFLICT DO NOTHING RETURNING id::text AS id, seq::text AS seq`,
        [input.tenantId, input.sessionId, input.taskId, input.agentNamespace, input.idempotencyKey, input.eventType, JSON.stringify(sanitizeV4EventPayload(input.eventJson))],
      );
      const row = result.rows[0];
      if (row) return { id: row.id, seq: Number(row.seq) };
      const existing = await client.query<{ id: string; seq: string }>(
        `SELECT id::text AS id, seq::text AS seq FROM agent_task_events WHERE tenant_id = $1::uuid AND agent_version = 'v4' AND idempotency_key = $2 LIMIT 1`,
        [input.tenantId, input.idempotencyKey],
      );
      return existing.rows[0] ? { id: existing.rows[0].id, seq: Number(existing.rows[0].seq) } : null;
    }, this.pool);
  }

  async updateTask(id: string, input: { tenantId: string; status: AgentV4Status; outputJson?: Record<string, unknown>; errorJson?: Record<string, unknown> | null }): Promise<void> {
    await withTenantTransaction({ tenantId: input.tenantId, userId: null }, async (client) => {
      const errorExpression = input.errorJson === undefined ? "error_json" : "$5::jsonb";
      await client.query(
        `UPDATE agent_tasks SET status = $3, output_json = COALESCE($4::jsonb, output_json), error_json = ${errorExpression}, updated_at = now(), finished_at = CASE WHEN $3 IN ('succeeded', 'partial_success', 'needs_review', 'failed', 'cancelled') THEN now() ELSE finished_at END
         WHERE tenant_id = $1::uuid AND id = $2::uuid AND agent_version = 'v4'`,
        [input.tenantId, id, input.status, input.outputJson ? JSON.stringify(sanitizeV4EventPayload(input.outputJson)) : null, input.errorJson === undefined || input.errorJson === null ? null : JSON.stringify(sanitizeV4EventPayload(input.errorJson))],
      );
    }, this.pool);
  }

  async getTask(input: { tenantId: string; taskId: string }): Promise<AgentV4TaskRecord | null> {
    return withTenantTransaction({ tenantId: input.tenantId, userId: null }, async (client) => {
      const result = await client.query<AgentV4TaskRecord & { tenant_id: string; session_id: string; project_id?: string; flow_id?: string; graph_revision?: number; input_json: Record<string, unknown>; output_json: Record<string, unknown> | null }>(
        `SELECT id::text AS id, tenant_id::text AS tenant_id, session_id::text AS session_id, graph_revision, input_json, output_json, status
         FROM agent_tasks WHERE tenant_id = $1::uuid AND id = $2::uuid AND agent_version = 'v4' LIMIT 1`,
        [input.tenantId, input.taskId],
      );
      const row = result.rows[0];
      if (!row) return null;
      const taskInput = row.input_json ?? {};
      return {
        id: row.id, tenantId: row.tenant_id, sessionId: row.session_id,
        projectId: typeof taskInput.projectId === "string" ? taskInput.projectId : "",
        flowId: typeof taskInput.flowId === "string" ? taskInput.flowId : "",
        graphRevision: Number(row.graph_revision ?? taskInput.graphRevision ?? 0),
        prompt: typeof taskInput.prompt === "string" ? taskInput.prompt : "",
        status: row.status as AgentV4Status,
        outputJson: sanitizeV4EventPayload(row.output_json ?? {}),
      };
    }, this.pool);
  }

  async getEvents(input: { tenantId: string; taskId: string; afterSeq: number }) {
    return withTenantTransaction({ tenantId: input.tenantId, userId: null }, async (client) => {
      const result = await client.query<{ seq: string; event_type: string; event_json: Record<string, unknown> }>(
        `SELECT seq::text AS seq, event_type, event_json FROM agent_task_events
         WHERE tenant_id = $1::uuid AND task_id = $2::uuid AND agent_version = 'v4' AND seq > $3::bigint ORDER BY seq ASC`,
        [input.tenantId, input.taskId, input.afterSeq],
      );
      return result.rows.map((row) => ({ seq: Number(row.seq), eventType: row.event_type, eventJson: sanitizeV4EventPayload(row.event_json) }));
    }, this.pool);
  }

  async findGenerationItem(input: { tenantId: string; taskId: string; itemId: string }): Promise<AgentV4GenerationItem | null> {
    const task = await this.getTaskJson(input.tenantId, input.taskId);
    const items = Array.isArray(task?.generationItems) ? task?.generationItems : [];
    const item = items.find((candidate) => candidate && typeof candidate === "object" && (candidate as Record<string, unknown>).itemId === input.itemId);
    return item && typeof item === "object" ? item as AgentV4GenerationItem : null;
  }

  async updateGenerationItem(input: { tenantId: string; taskId: string; itemId: string; patch: Partial<AgentV4GenerationItem> }): Promise<AgentV4GenerationItem | null> {
    return withTenantTransaction({ tenantId: input.tenantId, userId: null }, async (client) => {
      const result = await client.query<{ output_json: Record<string, unknown> }>(`SELECT output_json FROM agent_tasks WHERE tenant_id = $1::uuid AND id = $2::uuid AND agent_version = 'v4' FOR UPDATE`, [input.tenantId, input.taskId]);
      const output = result.rows[0]?.output_json ?? {};
      const items = Array.isArray(output.generationItems) ? output.generationItems.slice() : [];
      const index = items.findIndex((candidate) => candidate && typeof candidate === "object" && (candidate as Record<string, unknown>).itemId === input.itemId);
      if (index < 0) return null;
      items[index] = { ...(items[index] as Record<string, unknown>), ...input.patch };
      await client.query(`UPDATE agent_tasks SET output_json = $3::jsonb, updated_at = now() WHERE tenant_id = $1::uuid AND id = $2::uuid AND agent_version = 'v4'`, [input.tenantId, input.taskId, JSON.stringify(sanitizeV4EventPayload({ ...output, generationItems: items }))]);
      return items[index] as AgentV4GenerationItem;
    }, this.pool);
  }

  private async getTaskJson(tenantId: string, taskId: string): Promise<Record<string, unknown> | null> {
    return withTenantTransaction({ tenantId, userId: null }, async (client) => {
      const result = await client.query<{ output_json: Record<string, unknown> }>(`SELECT output_json FROM agent_tasks WHERE tenant_id = $1::uuid AND id = $2::uuid AND agent_version = 'v4'`, [tenantId, taskId]);
      return result.rows[0]?.output_json ?? null;
    }, this.pool);
  }
}

export class AgentV4TaskStore {
  constructor(private readonly repository: AgentV4TaskRepository) {}

  async create(input: { tenantId: string; sessionId: string; projectId: string; flowId: string; graphRevision?: number; prompt: string; idempotencyKey?: string }): Promise<AgentV4TaskRecord> {
    const idempotencyKey = input.idempotencyKey?.trim() || `agent-v4:${input.sessionId}:${randomUUID()}`;
    const graphRevision = input.graphRevision ?? 0;
    const created = await this.repository.createTask({
      idempotencyKey, tenantId: input.tenantId, sessionId: input.sessionId, projectId: input.projectId, flowId: input.flowId,
      graphRevision, prompt: input.prompt, taskType: "responses_session", title: input.prompt.slice(0, 120), status: "draft",
      inputJson: { prompt: input.prompt, projectId: input.projectId, flowId: input.flowId, graphRevision },
    });
    return { id: created.id, tenantId: input.tenantId, sessionId: input.sessionId, projectId: input.projectId, flowId: input.flowId, graphRevision, prompt: input.prompt, status: "draft", outputJson: {} };
  }

  async append(task: AgentV4TaskRecord, event: AgentV4TaskEvent): Promise<{ id?: string; seq?: number } | null> {
    const payload = sanitizeV4EventPayload({ taskId: task.id, status: event.status, ...(event.payload ?? {}) });
    const idempotencyKey = event.idempotencyKey?.trim() || `v4:${task.id}:${event.type}:${JSON.stringify(payload)}`;
    return this.repository.appendEvent({ tenantId: task.tenantId, sessionId: task.sessionId, taskId: task.id, agentNamespace: "canvas", agentVersion: "v4", eventType: event.type, eventJson: payload, idempotencyKey });
  }

  async listEvents(input: { tenantId: string; taskId: string; afterSeq?: number }) {
    if (!this.repository.getEvents) return [];
    return this.repository.getEvents({ ...input, afterSeq: input.afterSeq ?? 0 });
  }

  async update(task: AgentV4TaskRecord, input: { status: AgentV4Status; outputJson?: Record<string, unknown>; errorJson?: Record<string, unknown> | null }) {
    await this.repository.updateTask?.(task.id, { tenantId: task.tenantId, ...input });
    task.status = input.status;
    if (input.outputJson) task.outputJson = input.outputJson;
  }
}

export type AgentV4SafeResult = AgentV4SafeToolResult;
