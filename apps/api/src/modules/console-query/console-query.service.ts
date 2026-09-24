import { withUserTransaction } from "@aigc-flow/db";
import type { Pool, PoolClient } from "pg";
import { withPlatformTransaction } from "../../http/platform-transaction.js";
import { ConsoleQueryError, normalizeConsoleQuery, signConsoleCursor, type ConsoleQuery } from "./console-query.schemas.js";
import type { ConsoleActivity, ConsoleCall, ConsoleOverview, ConsolePage, ConsoleScope, ConsoleTask, ConsoleTaskAttempt, ConsoleTaskDiagnostics, ConsoleTaskTimelineItem, ConsoleUsage } from "./console-query.types.js";
type Context = {
    userId: string | null;
    tenantId?: string | null;
};
type Row = Record<string, any>;
// The aliases below are an explicit projection. Raw JSON, prompts, outputs,
// provider errors, credential fields and mutable model names are never selected.
const graph = (asOf = 'clock_timestamp()') => `
 visible_runs AS (
  SELECT w.*, f.project_id FROM workflow_runs w
  LEFT JOIN flows f ON f.id=w.flow_id AND f.tenant_id=w.tenant_id
  LEFT JOIN projects p ON p.id=f.project_id AND p.tenant_id=w.tenant_id
  WHERE ($1::boolean OR (w.created_by=$2::uuid AND app.console_member(w.tenant_id)
   AND f.deleted_at IS NULL AND p.deleted_at IS NULL AND p.id IS NOT NULL))
 ), visible_workbench AS (
  SELECT w.*,CASE WHEN w.status='failed' AND w.error_json->>'code' IN ('PROVIDER_TIMEOUT','PIXELHUB_TASK_TIMEOUT')
   THEN 'provider_result_unknown' ELSE w.status END AS execution_status
  FROM workbench_generations w WHERE $1::boolean OR (w.created_by=$2::uuid AND app.console_member(w.tenant_id))
 ), visible_agents AS (
  SELECT a.*, s.project_id FROM agent_tasks a JOIN agent_sessions s ON s.id=a.session_id AND s.tenant_id=a.tenant_id
  LEFT JOIN projects p ON p.id=s.project_id AND p.tenant_id=a.tenant_id
  WHERE $1::boolean OR (a.created_by=$2::uuid AND app.console_member(a.tenant_id)
    AND (s.project_id IS NULL OR (p.id IS NOT NULL AND p.deleted_at IS NULL)))
 ), console_nodes AS (
  SELECT n.*,CASE WHEN n.status='failed' AND (n.error_json->>'code' IN ('PROVIDER_TIMEOUT','PIXELHUB_TASK_TIMEOUT')
    OR n.output_json#>>'{providerTask,status}'='provider_result_unknown') THEN 'provider_result_unknown' ELSE n.status END AS execution_status
  FROM node_runs n
 ), generation_executions AS (
  SELECT 'node:'||n.id AS id,n.tenant_id,w.billed_user_id AS user_id,w.project_id,'workflow'::text AS source,
   n.execution_status AS status,n.created_at,n.finished_at,
   ARRAY(SELECT u.model_id FROM usage_events u WHERE u.node_run_id=n.id AND u.tenant_id=n.tenant_id AND u.created_at<=${asOf}) AS model_ids,
   ARRAY(SELECT u.route_id FROM usage_events u WHERE u.node_run_id=n.id AND u.tenant_id=n.tenant_id AND u.created_at<=${asOf}) AS route_ids
   FROM console_nodes n JOIN visible_runs w ON w.id=n.workflow_run_id AND w.tenant_id=n.tenant_id
   WHERE n.node_type IN ('image.generate','video.generate','text.generate')
  UNION ALL
  SELECT 'workbench:'||w.id,w.tenant_id,w.billed_user_id,NULL::uuid,'workbench',w.execution_status,w.created_at,w.finished_at,
   ARRAY(SELECT u.model_id FROM usage_events u WHERE u.id=w.billing_usage_event_id AND u.tenant_id=w.tenant_id AND u.created_at<=${asOf}),
   ARRAY(SELECT u.route_id FROM usage_events u WHERE u.id=w.billing_usage_event_id AND u.tenant_id=w.tenant_id AND u.created_at<=${asOf})
   FROM visible_workbench w WHERE w.batch_role<>'parent'
 )`;
const usageBase = (asOf = 'clock_timestamp()') => `${graph(asOf)}, wallet_usage AS (
 SELECT usage_event_id,user_id,SUM(-amount_credits)::text AS charged_credits
 FROM billing_wallet_ledger WHERE entry_type='settle' AND usage_event_id IS NOT NULL AND created_at<=${asOf}
 GROUP BY usage_event_id,user_id
), wallet_reserves AS (
 SELECT r.wallet_ledger_id,r.user_id,l.node_run_id,
  CASE WHEN bool_or(r.status='reserved') THEN 'reserved' WHEN bool_and(r.status='refunded') THEN 'released' ELSE 'unknown' END AS billing_status
 FROM billing_wallet_credit_reservations r JOIN billing_wallet_ledger l ON l.id=r.wallet_ledger_id AND l.user_id=r.user_id
 WHERE r.created_at<=${asOf} AND l.created_at<=${asOf}
 GROUP BY r.wallet_ledger_id,r.user_id,l.node_run_id
), node_billing AS (
 SELECT node_run_id,user_id,CASE WHEN bool_or(billing_status='reserved') THEN 'reserved'
  WHEN bool_and(billing_status='released') THEN 'released' ELSE 'unknown' END AS billing_status
 FROM wallet_reserves WHERE node_run_id IS NOT NULL GROUP BY node_run_id,user_id
), records AS (
 SELECT 'usage:'||u.id AS id,u.id AS usage_event_id,u.tenant_id,u.billed_user_id AS user_id,w.project_id,
  CASE WHEN u.workflow_run_id IS NOT NULL THEN 'workflow' WHEN wg.id IS NOT NULL THEN 'workbench' ELSE 'unknown' END AS source,
  CASE WHEN w.id IS NOT NULL THEN 'workflow:'||w.id WHEN wg.id IS NOT NULL THEN 'workbench:'||wg.id ELSE NULL END AS task_id,
  n.id AS node_run_id,u.model_id,u.route_id,u.modality,CASE WHEN wu.charged_credits IS NOT NULL THEN 'settled' ELSE u.status END AS status,
  COALESCE(n.execution_status,wg.execution_status,'unknown') AS execution_status,CASE WHEN wu.charged_credits IS NOT NULL THEN 'settled' ELSE u.status END AS billing_status,
  COALESCE(wu.charged_credits,CASE WHEN u.status='settled' THEN u.billable_cents::text ELSE NULL END) AS charged_credits,
  u.input_tokens,u.output_tokens,u.units::text AS quantity,u.unit_type AS unit,u.created_at,
  CASE WHEN n.id IS NULL AND wg.id IS NULL THEN 'legacy' ELSE 'partial' END AS data_quality
 FROM usage_events u LEFT JOIN wallet_usage wu ON wu.usage_event_id=u.id AND wu.user_id=u.billed_user_id
 LEFT JOIN visible_runs w ON w.id=u.workflow_run_id AND w.tenant_id=u.tenant_id
 LEFT JOIN console_nodes n ON n.id=u.node_run_id AND n.tenant_id=u.tenant_id AND n.workflow_run_id=w.id
 LEFT JOIN LATERAL (SELECT id,execution_status FROM visible_workbench g WHERE g.billing_usage_event_id=u.id AND g.tenant_id=u.tenant_id ORDER BY g.id LIMIT 1) wg ON true
 WHERE ($1::boolean OR u.billed_user_id=$2::uuid)
 UNION ALL
 SELECT 'node:'||n.id,NULL::uuid,n.tenant_id,w.billed_user_id,w.project_id,'workflow','workflow:'||w.id,n.id,NULL::uuid,NULL::uuid,
  split_part(n.node_type,'.',1),n.execution_status,n.execution_status,COALESCE(nb.billing_status,'unbilled'),NULL::text,NULL::int,NULL::int,NULL::text,NULL::text,n.created_at,'partial'
 FROM console_nodes n JOIN visible_runs w ON w.id=n.workflow_run_id AND w.tenant_id=n.tenant_id
 LEFT JOIN node_billing nb ON nb.node_run_id=n.id AND nb.user_id=w.billed_user_id
 WHERE n.node_type IN ('image.generate','video.generate','text.generate') AND ($1::boolean OR w.billed_user_id=$2::uuid)
 AND NOT EXISTS(SELECT 1 FROM usage_events u WHERE u.node_run_id=n.id AND u.tenant_id=n.tenant_id AND u.created_at<=${asOf})
 UNION ALL
 SELECT 'workbench:'||w.id,NULL::uuid,w.tenant_id,w.billed_user_id,NULL::uuid,'workbench','workbench:'||w.id,NULL::uuid,NULL::uuid,NULL::uuid,
  'image',w.execution_status,w.execution_status,COALESCE(wr.billing_status,'unbilled'),NULL::text,NULL::int,NULL::int,NULL::text,NULL::text,w.created_at,'partial'
 FROM visible_workbench w LEFT JOIN wallet_reserves wr ON wr.wallet_ledger_id=w.reserve_ledger_id AND wr.user_id=w.billed_user_id
 WHERE w.batch_role<>'parent' AND ($1::boolean OR w.billed_user_id=$2::uuid)
 AND NOT EXISTS(SELECT 1 FROM usage_events u WHERE u.id=w.billing_usage_event_id AND u.tenant_id=w.tenant_id AND u.created_at<=${asOf})
)`;
const taskBase = (asOf = 'clock_timestamp()') => `${graph(asOf)}, records AS (
 SELECT 'workflow:'||w.id AS id,w.id AS source_id,w.tenant_id,w.created_by AS user_id,w.project_id,'workflow'::text AS source,w.status,w.created_at,w.started_at,w.finished_at,
  ARRAY(SELECT u.model_id FROM usage_events u WHERE u.workflow_run_id=w.id AND u.tenant_id=w.tenant_id AND u.created_at<=${asOf}) AS model_ids,
  ARRAY(SELECT u.route_id FROM usage_events u WHERE u.workflow_run_id=w.id AND u.tenant_id=w.tenant_id AND u.created_at<=${asOf}) AS route_ids FROM visible_runs w
 UNION ALL SELECT 'workbench:'||w.id,w.id,w.tenant_id,w.created_by,NULL::uuid,'workbench',w.status,w.created_at,w.started_at,w.finished_at,
   ARRAY(SELECT u.model_id FROM usage_events u WHERE u.id=w.billing_usage_event_id AND u.tenant_id=w.tenant_id AND u.created_at<=${asOf}),
  ARRAY(SELECT u.route_id FROM usage_events u WHERE u.id=w.billing_usage_event_id AND u.tenant_id=w.tenant_id AND u.created_at<=${asOf}) FROM visible_workbench w
 UNION ALL SELECT 'agent:'||a.id,a.id,a.tenant_id,a.created_by,a.project_id,'agent',a.status,a.created_at,a.started_at,a.finished_at,ARRAY[]::uuid[],ARRAY[]::uuid[] FROM visible_agents a
)`;
const callBase = `records AS (
 SELECT c.id::text AS id,c.tenant_id,
 CASE WHEN c.record_level='request' THEN c.actor_user_id ELSE COALESCE(c.actor_user_id,w.created_by) END AS user_id,f.project_id,
 CASE WHEN c.source IN ('workflow','workbench','agent','unknown') THEN c.source WHEN c.record_level='request' THEN 'unknown' WHEN c.workflow_run_id IS NOT NULL THEN 'workflow' ELSE 'unknown' END AS source,
 c.workflow_run_id,c.node_run_id,c.model_id,c.route_id,c.product_model_key,c.route_key_snapshot,c.route_label_snapshot,
 c.status,c.record_level,c.operation,c.traffic_class,c.execution_id,c.attempt,c.http_status,
 c.latency_ms,c.input_tokens,c.output_tokens,c.actor_user_id,c.billed_user_id,c.provider_request_id,c.provider_task_id,c.trace_id,
 c.connection_name_snapshot,c.upstream_model_snapshot,c.error->>'code' AS error_code,c.created_at
 FROM ai_call_logs c LEFT JOIN workflow_runs w ON w.id=c.workflow_run_id AND w.tenant_id=c.tenant_id
 LEFT JOIN flows f ON f.id=w.flow_id AND f.tenant_id=w.tenant_id
 WHERE $1::boolean AND $2::uuid IS NOT NULL
)`;
const activityBase = `records AS (
 SELECT l.id::text AS id,l.tenant_id,l.user_id,l.usage_event_id,l.entry_type,l.amount_credits::text AS amount_credits,
 l.entry_type AS status,l.created_at,NULL::uuid AS project_id,NULL::uuid AS model_id,NULL::uuid AS route_id,'unknown'::text AS source
 FROM billing_wallet_ledger l WHERE $1::boolean OR l.user_id=$2::uuid
)`;
function iso(value: Date | string | null): string | null { return value ? new Date(value).toISOString() : null; }
function mapUsage(r: Row): ConsoleUsage { return { id: r.id, usageEventId: r.usage_event_id, tenantId: r.tenant_id, userId: r.user_id, projectId: r.project_id, source: r.source, taskId: r.task_id, nodeRunId: r.node_run_id, modelId: r.model_id, routeId: r.route_id, modality: r.modality, status: r.status, executionStatus: r.execution_status, billingStatus: r.billing_status, chargedCredits: r.charged_credits, inputTokens: r.input_tokens, outputTokens: r.output_tokens, quantity: r.quantity, unit: r.unit, createdAt: iso(r.created_at)!, dataQuality: r.data_quality }; }
function mapTask(r: Row): ConsoleTask { return { id: r.id, sourceId: r.source_id, tenantId: r.tenant_id, userId: r.user_id, projectId: r.project_id, source: r.source, status: r.status, createdAt: iso(r.created_at)!, startedAt: iso(r.started_at), finishedAt: iso(r.finished_at), dataQuality: 'partial' }; }
function mapCall(r: Row): ConsoleCall {
    const recordLevel = r.record_level === 'request' ? 'request' : 'summary';
    const operation = ['generate', 'submit', 'poll', 'stream'].includes(r.operation) ? r.operation : 'unknown';
    const trafficClass = ['user_generation', 'admin_test', 'agent_control', 'system'].includes(r.traffic_class) ? r.traffic_class : 'unknown';
    return { id: r.id, tenantId: r.tenant_id, workflowRunId: r.workflow_run_id, nodeRunId: r.node_run_id, modelId: r.model_id, routeId: r.route_id, productModelKey: r.product_model_key, routeKey: r.route_key_snapshot, routeLabel: r.route_label_snapshot, status: r.status, recordLevel, operation, trafficClass, transportStatus: recordLevel === 'request' ? r.status : null, executionId: r.execution_id ?? null, attempt: r.attempt ?? null, httpStatus: r.http_status ?? null, latencyMs: r.latency_ms, inputTokens: r.input_tokens, outputTokens: r.output_tokens, actorUserId: r.actor_user_id ?? null, billedUserId: r.billed_user_id ?? null, providerRequestId: r.provider_request_id ?? null, providerTaskId: r.provider_task_id ?? null, traceId: r.trace_id ?? null, errorCode: r.error_code ?? null, connectionName: r.connection_name_snapshot ?? null, upstreamModel: r.upstream_model_snapshot ?? null, createdAt: iso(r.created_at)!, dataQuality: recordLevel === 'request' ? 'partial' : 'legacy' };
}
function mapActivity(r: Row): ConsoleActivity {
    const direction = ['reserve', 'settle', 'admin_debit', 'expire', 'payment_refund'].includes(r.entry_type) ? 'debit' : 'credit';
    return { id: r.id, tenantId: r.tenant_id, usageEventId: r.usage_event_id, entryType: r.entry_type, amountCredits: String(r.amount_credits).replace(/^-/, ''), direction, createdAt: iso(r.created_at)! };
}

type SafeProjectionRow = Record<string, unknown>;
function boundedText(value: unknown, max = 200): string | null {
    if (typeof value !== "string")
        return null;
    const normalized = value.replace(/[\r\n\t]/g, " ").trim();
    return normalized && normalized.length <= max ? normalized : normalized ? normalized.slice(0, max) : null;
}
function opaqueId(value: unknown): string | null {
    const normalized = boundedText(value);
    return normalized && /^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,199}$/.test(normalized) ? normalized : null;
}
function uuidText(value: unknown): string | null {
    return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}
function unique(values: Array<string | null>): string[] {
    return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
function errorCode(row: SafeProjectionRow): string | null {
    return boundedText(row.error_code) ?? (row.error && typeof row.error === "object" && !Array.isArray(row.error) ? boundedText((row.error as Record<string, unknown>).code) : null);
}
export function projectTaskTimeline(rows: SafeProjectionRow[]): ConsoleTaskTimelineItem[] {
    return rows.map(row => ({
        id: opaqueId(row.id) ?? "unknown",
        kind: (row.kind === "node" ? "node" : row.kind === "event" ? "event" : "task") as ConsoleTaskTimelineItem["kind"],
        label: boundedText(row.event_type ?? row.label) ?? "unknown",
        status: boundedText(row.status),
        nodeRunId: uuidText(row.node_run_id),
        executionId: opaqueId(row.execution_id),
        attempt: typeof row.attempt === "number" && Number.isInteger(row.attempt) ? row.attempt : null,
        createdAt: iso(row.created_at as Date | string | null) ?? new Date(0).toISOString(),
        finishedAt: iso(row.finished_at as Date | string | null),
    })).sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
}
export function projectTaskAttempts(rows: SafeProjectionRow[]): ConsoleTaskAttempt[] {
    return rows.map(row => ({
        id: opaqueId(row.id) ?? "unknown",
        nodeRunId: uuidText(row.node_run_id),
        executionId: opaqueId(row.execution_id),
        attempt: typeof row.attempt === "number" && Number.isInteger(row.attempt) ? row.attempt : null,
        operation: boundedText(row.operation) ?? "unknown",
        transportStatus: boundedText(row.status) ?? "unknown",
        trafficClass: boundedText(row.traffic_class) ?? "unknown",
        providerRequestId: opaqueId(row.provider_request_id),
        providerTaskId: opaqueId(row.provider_task_id),
        traceId: opaqueId(row.trace_id),
        httpStatus: typeof row.http_status === "number" && Number.isInteger(row.http_status) ? row.http_status : null,
        latencyMs: typeof row.latency_ms === "number" && Number.isFinite(row.latency_ms) ? row.latency_ms : null,
        connectionName: boundedText(row.connection_name_snapshot),
        upstreamModel: boundedText(row.upstream_model_snapshot),
        productModelKey: boundedText(row.product_model_key),
        routeKey: boundedText(row.route_key_snapshot),
        routeLabel: boundedText(row.route_label_snapshot),
        errorCode: errorCode(row),
        requestStartedAt: iso(row.request_started_at as Date | string | null),
        requestCompletedAt: iso(row.request_completed_at as Date | string | null),
        createdAt: iso(row.created_at as Date | string | null) ?? new Date(0).toISOString(),
    }));
}
export function projectTaskDiagnostics(rows: SafeProjectionRow[]): ConsoleTaskDiagnostics {
    return {
        actorUserId: rows.map(row => uuidText(row.actor_user_id)).find(Boolean) ?? null,
        billedUserId: rows.map(row => uuidText(row.billed_user_id)).find(Boolean) ?? null,
        traceIds: unique(rows.map(row => opaqueId(row.trace_id))),
        providerRequestIds: unique(rows.map(row => opaqueId(row.provider_request_id))),
        providerTaskIds: unique(rows.map(row => opaqueId(row.provider_task_id))),
        connectionNames: unique(rows.map(row => boundedText(row.connection_name_snapshot))),
        upstreamModels: unique(rows.map(row => boundedText(row.upstream_model_snapshot))),
        errorCodes: unique(rows.map(errorCode)),
    };
}
async function loadTaskInspection(client: PoolClient, row: Row): Promise<Pick<ConsoleTask, "timeline" | "attempts" | "diagnostics">> {
    const tenantId = row.tenant_id as string;
    const sourceId = row.source_id as string;
    const source = row.source as string;
    const timelineRows: SafeProjectionRow[] = [{
        id: `task:${sourceId}`,
        kind: "task",
        event_type: "created",
        status: row.status,
        node_run_id: null,
        execution_id: sourceId,
        attempt: null,
        created_at: row.created_at,
        finished_at: row.finished_at,
    }];
    if (row.started_at) {
        timelineRows.push({ id: `task-started:${sourceId}`, kind: "task", event_type: "started", status: "running", node_run_id: null, execution_id: sourceId, attempt: null, created_at: row.started_at, finished_at: null });
    }
    if (row.finished_at) {
        timelineRows.push({ id: `task-finished:${sourceId}`, kind: "task", event_type: "finished", status: row.status, node_run_id: null, execution_id: sourceId, attempt: null, created_at: row.finished_at, finished_at: row.finished_at });
    }
    const executionIds = [sourceId];
    if (source === "workflow") {
        const [events, nodes] = await Promise.all([
            client.query(`SELECT 'event:'||id::text AS id,'event' AS kind,event_type,NULL::text AS status,node_run_id,NULL::text AS execution_id,NULL::int AS attempt,created_at,NULL::timestamptz AS finished_at FROM workflow_run_events WHERE tenant_id=$1::uuid AND workflow_run_id=$2::uuid ORDER BY sequence ASC`, [tenantId, sourceId]),
            client.query(`SELECT 'node:'||id::text AS id,'node' AS kind,node_type AS event_type,status,id::text AS node_run_id,id::text AS execution_id,attempt,created_at,finished_at FROM node_runs WHERE tenant_id=$1::uuid AND workflow_run_id=$2::uuid ORDER BY created_at ASC,id ASC`, [tenantId, sourceId]),
        ]);
        timelineRows.push(...events.rows, ...nodes.rows);
        executionIds.push(...nodes.rows.map(item => String(item.node_run_id)));
    }
    else if (source === "workbench") {
        const generations = await client.query(`SELECT id::text AS id,batch_role,status,created_at,finished_at FROM workbench_generations WHERE tenant_id=$1::uuid AND (id=$2::uuid OR parent_generation_id=$2::uuid OR batch_id=(SELECT batch_id FROM workbench_generations WHERE tenant_id=$1::uuid AND id=$2::uuid)) ORDER BY created_at ASC,id ASC`, [tenantId, sourceId]);
        for (const item of generations.rows) {
            const id = String(item.id);
            if (!executionIds.includes(id))
                executionIds.push(id);
            timelineRows.push({ id: `generation:${id}`, kind: "node", event_type: item.batch_role === "child" ? "batch.child" : "generation", status: item.status, node_run_id: null, execution_id: id, attempt: null, created_at: item.created_at, finished_at: item.finished_at });
        }
    }
    else if (source === "agent") {
        const [events, tasks] = await Promise.all([
            client.query(`SELECT 'event:'||id::text AS id,'event' AS kind,event_type,NULL::text AS status,NULL::uuid AS node_run_id,NULL::text AS execution_id,NULL::int AS attempt,created_at,NULL::timestamptz AS finished_at FROM agent_task_events WHERE tenant_id=$1::uuid AND task_id=$2::uuid ORDER BY seq ASC`, [tenantId, sourceId]),
            client.query(`SELECT id::text AS id,'node' AS kind,task_type AS event_type,status,NULL::uuid AS node_run_id,id::text AS execution_id,NULL::int AS attempt,created_at,finished_at FROM agent_tasks WHERE tenant_id=$1::uuid AND id=$2::uuid`, [tenantId, sourceId]),
        ]);
        timelineRows.push(...events.rows, ...tasks.rows);
    }
    const attempts = await client.query(`SELECT id::text AS id,record_level,node_run_id,execution_id,attempt,operation,status,traffic_class,provider_request_id,provider_task_id,trace_id,http_status,latency_ms,connection_name_snapshot,upstream_model_snapshot,product_model_key,route_key_snapshot,route_label_snapshot,error->>'code' AS error_code,request_started_at,request_completed_at,created_at,actor_user_id,billed_user_id FROM ai_call_logs WHERE tenant_id=$1::uuid AND (execution_id = ANY($2::text[]) OR workflow_run_id=$3::uuid OR node_run_id = ANY($4::uuid[])) ORDER BY created_at ASC,id ASC`, [tenantId, executionIds, source === "workflow" ? sourceId : null, source === "workflow" ? executionIds.slice(1) : []]);
    return { timeline: projectTaskTimeline(timelineRows), attempts: projectTaskAttempts(attempts.rows.filter(item => item.record_level === "request")), diagnostics: projectTaskDiagnostics(attempts.rows) };
}
function conditions(q: ConsoleQuery, page = false, arrayAssociations = q.resource === 'tasks'): {
    sql: string;
    values: unknown[];
} {
    const values: unknown[] = [q.scope === 'platform', q.userId, q.from, q.to, q.asOf];
    const clauses = ['created_at >= $3::timestamptz', 'created_at < $4::timestamptz', 'created_at <= $5::timestamptz'];
    const pairs: Array<[string, string | undefined]> = [['tenant_id', q.tenantId], ['user_id', q.filterUserId], ['project_id', q.projectId], ['model_id', q.modelId], ['route_id', q.routeId], ['status', q.status], ['source', q.source]];
    if (q.resource === 'usage' && q.billingStatus) pairs.push(['billing_status', q.billingStatus]);
    if (q.resource === 'calls' && q.trafficClass) pairs.push(['traffic_class', q.trafficClass]);
    for (const pair of pairs) {
        const column = pair[0];
        const value = pair[1];
        if (value) {
            values.push(value);
            clauses.push(arrayAssociations && (column === 'model_id' || column === 'route_id') ? `$${values.length}::uuid=ANY(${column}s)` : `${column}=$${values.length}${column.endsWith('_id') ? '::uuid' : '::text'}`);
        }
    }
    if (page && q.after) {
        values.push(q.after.createdAt, q.after.id);
        clauses.push(`(created_at,id) < ($${values.length - 1}::timestamptz,$${values.length}::text)`);
    }
    return { sql: clauses.join(' AND '), values };
}
export class ConsoleQueryService {
    constructor(readonly options: {
        pool: Pool;
        cursorSecret: string;
    }) { }
    private async query(context: Context, scope: ConsoleScope, resource: string, input: unknown): Promise<ConsoleQuery> {
        if (!context.userId)
            throw new ConsoleQueryError(401, 'UNAUTHORIZED', 'Authentication is required');
        const binding = { scope, userId: context.userId, resource };
        const q = normalizeConsoleQuery(input, binding, this.options.cursorSecret);
        const raw = input as Record<string, unknown>;
        if (raw.cursor || raw.asOf)
            return q;
        const clock = await this.options.pool.query("SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS stamp");
        return normalizeConsoleQuery({ ...raw, asOf: clock.rows[0].stamp }, binding, this.options.cursorSecret);
    }
    private transaction<T>(context: Context, scope: ConsoleScope, resource: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
        if (scope === 'platform')
            return withPlatformTransaction(this.options.pool, context, resource === 'tasks' ? 'platform:tasks:read' : resource === 'wallet-activity' ? 'platform:users:read' : 'platform:usage:read', fn);
        return withUserTransaction({ userId: context.userId! }, fn, this.options.pool);
    }
    private async page<T extends {
        id: string;
        createdAt: string;
    }>(context: Context, q: ConsoleQuery, base: string, map: (r: Row) => T): Promise<ConsolePage<T>> {
        return this.transaction(context, q.scope, q.resource, async (client) => {
            const filter = conditions(q, true);
            filter.values.push(q.limit + 1);
            const result = await client.query(`WITH ${base} SELECT *,created_at::text AS cursor_created_at FROM records WHERE ${filter.sql} ORDER BY created_at DESC,id DESC LIMIT $${filter.values.length}`, filter.values);
            const hasMore = result.rows.length > q.limit;
            const items = result.rows.slice(0, q.limit).map(map);
            const last = result.rows[items.length - 1];
            return { items, hasMore, nextCursor: hasMore ? signConsoleCursor(q, { id: last.id, createdAt: last.cursor_created_at }, this.options.cursorSecret) : null, asOf: q.asOf, from: q.from, to: q.to, scope: q.scope, pageSize: q.limit };
        });
    }
    private async detail<T>(context: Context, scope: ConsoleScope, resource: string, id: string, base: string, map: (r: Row) => T): Promise<{
        item: T;
    }> {
        await this.query(context, scope, resource, {});
        if (!/^(?:(?:usage|node|workflow|workbench|agent):)?[0-9a-f-]{36}$/i.test(id))
            throw new ConsoleQueryError(400, 'INVALID_ID', 'Invalid record id');
        return this.transaction(context, scope, resource, async (client) => {
            const result = await client.query(`WITH ${base} SELECT * FROM records WHERE id=$3`, [scope === 'platform', context.userId, id]);
            if (!result.rows[0])
                throw new ConsoleQueryError(404, 'NOT_FOUND', 'Record not found');
            return { item: map(result.rows[0]) };
        });
    }
    async listUsage(context: Context, scope: ConsoleScope, input: unknown) { return this.page(context, await this.query(context, scope, 'usage', input), usageBase('$5::timestamptz'), mapUsage); }
    getUsage(context: Context, scope: ConsoleScope, id: string) { return this.detail(context, scope, 'usage', id, usageBase(), mapUsage); }
    async listTasks(context: Context, scope: ConsoleScope, input: unknown) { return this.page(context, await this.query(context, scope, 'tasks', input), taskBase('$5::timestamptz'), mapTask); }
    async getTask(context: Context, scope: ConsoleScope, id: string) {
        await this.query(context, scope, 'tasks', {});
        if (!/^(?:workflow|workbench|agent):[0-9a-f-]{36}$/i.test(id))
            throw new ConsoleQueryError(400, 'INVALID_ID', 'Invalid task id');
        return this.transaction(context, scope, 'tasks', async (client) => {
            const result = await client.query(`WITH ${taskBase()} SELECT * FROM records WHERE id=$3`, [scope === 'platform', context.userId, id]);
            if (!result.rows[0])
                throw new ConsoleQueryError(404, 'NOT_FOUND', 'Record not found');
            const item = mapTask(result.rows[0]);
            return { item: { ...item, ...(await loadTaskInspection(client, result.rows[0])) } };
        });
    }
    async listCalls(context: Context, input: unknown) { return this.page(context, await this.query(context, 'platform', 'calls', input), callBase, mapCall); }
    getCall(context: Context, id: string) { return this.detail(context, 'platform', 'calls', id, callBase, mapCall); }
    async listActivity(context: Context, input: unknown) { return this.page(context, await this.query(context, 'self', 'activity', input), activityBase, mapActivity); }
    async listUserActivity(context: Context, userId: string, input: unknown) {
        return this.page(context, await this.query(context, 'platform', 'wallet-activity', { ...(input as object), userId }), activityBase, mapActivity);
    }
    async overview(context: Context, scope: ConsoleScope, input: unknown): Promise<ConsoleOverview> {
        const q = await this.query(context, scope, 'overview', input);
        const f = conditions(q);
        const tf = conditions(q, false, true);
        return this.transaction(context, scope, 'overview', async (client) => {
            const usage = (await client.query(`WITH ${usageBase('$5::timestamptz')} SELECT count(*)::int AS total,count(*) FILTER(WHERE billing_status='settled')::int AS settled,count(*) FILTER(WHERE billing_status='unbilled')::int AS unbilled,COALESCE(sum(charged_credits::numeric),0)::text AS charged FROM records WHERE ${f.sql}`, f.values)).rows[0];
            const taskRows = (await client.query(`WITH ${taskBase('$5::timestamptz')} SELECT source,count(*)::int AS total FROM records WHERE ${tf.sql} GROUP BY source`, tf.values)).rows;
            const gen = (await client.query(`WITH ${graph('$5::timestamptz')}, records AS (SELECT * FROM generation_executions WHERE $1::boolean OR user_id=$2::uuid)
    SELECT count(*)::int AS total,count(*) FILTER(WHERE status='succeeded')::int AS succeeded,count(*) FILTER(WHERE status='failed')::int AS failed,count(*) FILTER(WHERE status IN ('canceled','cancelled'))::int AS canceled FROM records WHERE ${tf.sql}`, tf.values)).rows[0];
            const upstream = scope === 'platform' ? (await client.query(`WITH ${callBase} SELECT
              count(*) FILTER (WHERE record_level='request' AND COALESCE(traffic_class,'unknown') IN ('user_generation','unknown'))::int AS total,
              count(*) FILTER (WHERE record_level='request' AND COALESCE(traffic_class,'unknown') IN ('user_generation','unknown') AND status='http_succeeded')::int AS succeeded,
              count(*) FILTER (WHERE record_level='request' AND traffic_class='admin_test')::int AS admin_test_total,
              count(*) FILTER (WHERE record_level='request' AND traffic_class='admin_test' AND status='http_succeeded')::int AS admin_test_succeeded,
              count(*) FILTER (WHERE record_level='request' AND traffic_class IN ('agent_control','system'))::int AS other_total,
              count(*) FILTER (WHERE record_level='request' AND traffic_class IN ('agent_control','system') AND status='http_succeeded')::int AS other_succeeded
              FROM records WHERE ${f.sql}`, f.values)).rows[0] : null;
            const requestTotal = Number(upstream?.total ?? 0);
            const requestSucceeded = Number(upstream?.succeeded ?? 0);
            const adminTestTotal = Number(upstream?.admin_test_total ?? 0);
            const adminTestSucceeded = Number(upstream?.admin_test_succeeded ?? 0);
            const otherTotal = Number(upstream?.other_total ?? 0);
            const otherSucceeded = Number(upstream?.other_succeeded ?? 0);
            const physicalRequestTotal = requestTotal + adminTestTotal + otherTotal;
            return { scope, asOf: q.asOf, from: q.from, to: q.to, usage: { total: usage.total, settled: usage.settled, unbilled: usage.unbilled, chargedCredits: usage.charged }, tasks: { total: taskRows.reduce((a, r) => a + r.total, 0), bySource: Object.fromEntries(taskRows.map(r => [r.source, r.total])) }, generation: { total: gen.total, succeeded: gen.succeeded, failed: gen.failed, canceled: gen.canceled, pendingOrUnknown: gen.total - gen.succeeded - gen.failed - gen.canceled, successRate: gen.succeeded + gen.failed ? gen.succeeded / (gen.succeeded + gen.failed) : null }, upstream: upstream ? { total: requestTotal, operationCoverage: physicalRequestTotal ? 'request' : 'legacy', requestSuccessRate: requestTotal ? requestSucceeded / requestTotal : null, adminTestTotal, adminTestSuccessRate: adminTestTotal ? adminTestSucceeded / adminTestTotal : null, otherTotal, otherSuccessRate: otherTotal ? otherSucceeded / otherTotal : null } : null, dataQuality: 'partial' };
        });
    }
}
