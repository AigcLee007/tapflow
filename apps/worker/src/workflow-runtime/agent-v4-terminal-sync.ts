import type { Pool } from "pg";
import { withTenantTransaction } from "@aigc-flow/db";

export type V4TerminalItem = { itemId: string; status: "succeeded" | "failed" | "cancelled"; assetId?: string; errorCode?: string };
export type V4TaskEventWriter = { appendEvent(input: { tenantId: string; sessionId: string; taskId: string; agentNamespace: string; agentVersion: "v4"; eventType: string; eventJson: Record<string, unknown>; idempotencyKey: string }): Promise<unknown>; updateTask(input: { id: string; tenantId: string; status: string; outputJson?: Record<string, unknown>; errorJson?: Record<string, unknown> | null }): Promise<void> };

const V4_WORKFLOW_TERMINAL_STATUSES = new Set(["succeeded", "partial_success", "failed", "cancelled", "canceled"]);

export function isV4WorkflowTerminal(status: string | null | undefined): boolean {
  return typeof status === "string" && V4_WORKFLOW_TERMINAL_STATUSES.has(status);
}

export async function syncV4TerminalResult(input: { writer: V4TaskEventWriter; tenantId: string; sessionId: string; taskId: string; runId: string; items: V4TerminalItem[] }): Promise<{ status: "succeeded" | "partial_success" | "failed" | "cancelled" }> {
  const safeItems = input.items.slice(0, 24).map((item) => ({ itemId: item.itemId.slice(0, 200), status: item.status, ...(item.assetId ? { assetId: item.assetId.slice(0, 200) } : {}), ...(item.errorCode ? { errorCode: item.errorCode.slice(0, 200) } : {}) }));
  const succeeded = safeItems.filter((item) => item.status === "succeeded").length;
  const cancelled = safeItems.filter((item) => item.status === "cancelled").length;
  const status = succeeded === safeItems.length && safeItems.length > 0 ? "succeeded" : cancelled === safeItems.length && safeItems.length > 0 ? "cancelled" : succeeded > 0 ? "partial_success" : "failed";
  await input.writer.appendEvent({ tenantId: input.tenantId, sessionId: input.sessionId, taskId: input.taskId, agentNamespace: "canvas", agentVersion: "v4", eventType: "delivery_verified", eventJson: { taskId: input.taskId, runId: input.runId.slice(0, 200), status, items: safeItems }, idempotencyKey: `v4:${input.taskId}:delivery:${input.runId}` });
  await input.writer.updateTask({ id: input.taskId, tenantId: input.tenantId, status, outputJson: { generationItems: safeItems, workflowRunIds: [input.runId.slice(0, 200)] }, errorJson: status === "failed" ? { code: "AGENT_V4_GENERATION_FAILED" } : null });
  return { status };
}

export function createDatabaseV4TerminalProjector(pool: Pool) {
  return async (input: { tenantId: string; workflowRunId: string }) => withTenantTransaction({ tenantId: input.tenantId, userId: null }, async (client) => {
    const binding = await client.query<{ task_id: string; session_id: string; workflow_status: string; item_id: string | null }>(`SELECT (wr.input_json->>'agentV4TaskId') AS task_id, at.session_id::text AS session_id, wr.status AS workflow_status, (wr.input_json->>'agentV4ItemId') AS item_id FROM workflow_runs wr JOIN agent_tasks at ON at.id = (wr.input_json->>'agentV4TaskId')::uuid WHERE wr.tenant_id = $1::uuid AND wr.id = $2::uuid AND at.tenant_id = wr.tenant_id AND at.agent_version = 'v4' LIMIT 1`, [input.tenantId, input.workflowRunId]);
    const row = binding.rows[0]; if (!row?.task_id || !isV4WorkflowTerminal(row.workflow_status)) return null;
    const result = await client.query<{ node_id: string; status: string; output_json: Record<string, unknown> | null; error_json: Record<string, unknown> | null }>(`SELECT node_id, status, output_json, error_json FROM node_runs WHERE tenant_id = $1::uuid AND workflow_run_id = $2::uuid ORDER BY created_at ASC`, [input.tenantId, input.workflowRunId]);
    const items = result.rows.map((item) => ({ itemId: row.item_id ?? item.node_id, status: item.status === "succeeded" ? "succeeded" : item.status === "cancelled" ? "cancelled" : "failed", ...(typeof item.output_json?.assetId === "string" ? { assetId: item.output_json.assetId } : {}), ...(typeof item.error_json?.code === "string" ? { errorCode: item.error_json.code } : {}) })) as V4TerminalItem[];
    return syncV4TerminalResult({ writer: { appendEvent: async (event) => { await client.query(`INSERT INTO agent_task_events (tenant_id, session_id, task_id, agent_namespace, agent_version, idempotency_key, event_type, event_json) VALUES ($1::uuid,$2::uuid,$3::uuid,'canvas','v4',$4,$5,$6::jsonb) ON CONFLICT DO NOTHING`, [event.tenantId, event.sessionId, event.taskId, event.idempotencyKey, event.eventType, JSON.stringify(event.eventJson)]); }, updateTask: async (task) => { await client.query(`UPDATE agent_tasks SET status=$3, output_json=COALESCE($4::jsonb, output_json), error_json=$5::jsonb, updated_at=now(), finished_at=CASE WHEN $3 IN ('succeeded','partial_success','failed','cancelled') THEN now() ELSE finished_at END WHERE tenant_id=$1::uuid AND id=$2::uuid AND agent_version='v4'`, [task.tenantId, task.id, task.status, JSON.stringify(task.outputJson ?? {}), JSON.stringify(task.errorJson ?? null)]); } }, tenantId: input.tenantId, sessionId: row.session_id, taskId: row.task_id, runId: input.workflowRunId, items });
  }, pool);
}
