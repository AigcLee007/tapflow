import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { withTenantTransaction } from "@aigc-flow/db";

export type AgentV3TaskRecord = { id: string; tenantId: string; sessionId: string; projectId: string; flowId: string; prompt: string; status: string };
export type AgentV3TaskEvent = { type: string; status: string; payload?: Record<string, unknown> };

export type AgentV3TaskRepository = {
  createTask(input: { idempotencyKey: string; tenantId: string; sessionId: string; projectId: string; flowId: string; taskType: string; title: string; status: string; inputJson: Record<string, unknown> }): Promise<{ id: string }>;
  appendEvent(input: { tenantId: string; sessionId: string; taskId: string; agentNamespace: string; agentVersion: "v3"; eventType: string; eventJson: Record<string, unknown> }): Promise<unknown>;
  updateTask?(id: string, input: { tenantId: string; status: string; outputJson?: Record<string, unknown>; errorJson?: Record<string, unknown> | null }): Promise<void>;
};

export class DatabaseAgentV3TaskRepository implements AgentV3TaskRepository {
  constructor(private readonly pool: Pool) {}

  async createTask(input: Parameters<AgentV3TaskRepository["createTask"]>[0]): Promise<{ id: string }> {
    return withTenantTransaction({ tenantId: input.tenantId, userId: null }, async (client) => {
      const result = await client.query<{ id: string }>(`
        INSERT INTO agent_tasks (tenant_id, session_id, agent_namespace, agent_version, idempotency_key, task_key, task_type, title, status, input_json, updated_at)
        VALUES ($1::uuid, $2::uuid, 'canvas', 'v3', $3, $4, $5, $6, $7, $8::jsonb, now())
        ON CONFLICT DO NOTHING
        RETURNING id::text AS id`,
      [input.tenantId, input.sessionId, input.idempotencyKey, input.idempotencyKey, input.taskType, input.title, input.status, JSON.stringify(input.inputJson)]);
      if (result.rows[0]) return result.rows[0];
      const existing = await client.query<{ id: string }>(`SELECT id::text AS id FROM agent_tasks WHERE tenant_id = $1::uuid AND agent_version = 'v3' AND idempotency_key = $2 LIMIT 1`, [input.tenantId, input.idempotencyKey]);
      if (existing.rows[0]) return existing.rows[0];
      throw new Error("AGENT_V3_TASK_IDEMPOTENCY_CONFLICT");
    }, this.pool);
  }

  async appendEvent(input: Parameters<AgentV3TaskRepository["appendEvent"]>[0]): Promise<unknown> {
    return withTenantTransaction({ tenantId: input.tenantId, userId: null }, async (client) => {
      const result = await client.query(`
        INSERT INTO agent_task_events (tenant_id, session_id, task_id, agent_namespace, agent_version, idempotency_key, event_type, event_json)
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8::jsonb)
        ON CONFLICT DO NOTHING
        RETURNING id::text AS id, seq::text AS seq`,
      [input.tenantId, input.sessionId, input.taskId, input.agentNamespace, input.agentVersion, `v3:${input.taskId}:${input.eventType}:${JSON.stringify(input.eventJson)}`, input.eventType, JSON.stringify(input.eventJson)]);
      return result.rows[0] ?? null;
    }, this.pool);
  }

  async updateTask(id: string, input: { tenantId: string; status: string; outputJson?: Record<string, unknown>; errorJson?: Record<string, unknown> | null }): Promise<void> {
    await withTenantTransaction({ tenantId: input.tenantId, userId: null }, async (client) => {
      await client.query(`UPDATE agent_tasks SET status = $3, output_json = COALESCE($4::jsonb, output_json), error_json = $5::jsonb, updated_at = now(), finished_at = CASE WHEN $3 IN ('succeeded', 'partial_success', 'failed', 'cancelled') THEN now() ELSE finished_at END WHERE tenant_id = $1::uuid AND id = $2::uuid`, [input.tenantId, id, input.status, input.outputJson ? JSON.stringify(input.outputJson) : null, input.errorJson === undefined ? null : JSON.stringify(input.errorJson)]);
    }, this.pool);
  }
}

export class AgentV3TaskStore {
  constructor(private readonly repository: AgentV3TaskRepository) {}

  async create(input: { tenantId: string; sessionId: string; projectId: string; flowId: string; prompt: string; idempotencyKey?: string }): Promise<AgentV3TaskRecord> {
    const idempotencyKey = input.idempotencyKey?.trim() || `agent-v3:${input.sessionId}:${randomUUID()}`;
    const created = await this.repository.createTask({
      idempotencyKey,
      tenantId: input.tenantId,
      sessionId: input.sessionId,
      projectId: input.projectId,
      flowId: input.flowId,
      taskType: "canvas_director",
      title: input.prompt.slice(0, 120),
      status: "observing",
      inputJson: { prompt: input.prompt, projectId: input.projectId, flowId: input.flowId },
    });
    return { id: created.id, tenantId: input.tenantId, sessionId: input.sessionId, projectId: input.projectId, flowId: input.flowId, prompt: input.prompt, status: "observing" };
  }

  async append(task: AgentV3TaskRecord, event: AgentV3TaskEvent): Promise<void> {
    await this.repository.appendEvent({ tenantId: task.tenantId, sessionId: task.sessionId, taskId: task.id, agentNamespace: "canvas", agentVersion: "v3", eventType: event.type, eventJson: { taskId: task.id, status: event.status, ...(event.payload ?? {}) } });
  }
}
