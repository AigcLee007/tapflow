import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { withPlatformTransaction, type PlatformDbContext } from "../../http/platform-transaction.js";
import { ConsoleQueryError, normalizeConsoleQuery, signConsoleCursor } from "../console-query/console-query.schemas.js";

export const OPERATOR_AUDIT_ACTIONS = ["admin.user.update_status", "admin.announcement.create", "admin.announcement.update", "admin.announcement.delete", "ai.route.update", "ai.route.operate", "ai.route.set_default", "ai.route.test"];
const schema = z.object({
  action: z.string().regex(/^[a-zA-Z0-9_.:-]+$/).max(150).optional(),
  actorUserId: z.string().uuid().optional(), resourceId: z.string().max(128).optional(),
  from: z.string().optional(), to: z.string().optional(), asOf: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(), cursor: z.string().max(4096).optional(),
}).strict();
export type PlatformAuditItem = { id: string; action: string; actorUserId: string | null; resourceType: string; resourceId: string | null; tenantId: string | null; requestId: string | null; traceId: string | null; reason: string | null; statusBefore: string | null; statusAfter: string | null; createdAt: string };

export async function listPlatformAudit(pool: Pool, context: PlatformDbContext, input: unknown, secret: string) {
  if (!context.userId) throw new ConsoleQueryError(401, "UNAUTHORIZED", "Authentication is required");
  const raw = schema.parse(input);
  const { action, actorUserId, resourceId, ...base } = raw;
  const resource = `audit:${createHash('sha256').update(JSON.stringify({ action, actorUserId, resourceId })).digest('hex')}`;
  const query = normalizeConsoleQuery(base, { scope: "platform", userId: context.userId, resource }, secret);
  return withPlatformTransaction(pool, context, "platform:audit:read", async client => {
    const values: unknown[] = [query.from, query.to, query.asOf, action ?? null, actorUserId ?? null, resourceId ?? null, OPERATOR_AUDIT_ACTIONS];
    let boundary = "";
    if (query.after) { values.push(query.after.createdAt, query.after.id); boundary = `AND (created_at,id) < ($8::timestamptz,$9::text)`; }
    values.push(query.limit + 1);
    const result = await client.query(`WITH records AS (
      SELECT 'event:'||id AS id, action, actor_user_id, resource_type,resource_id,tenant_id,request_id,trace_id,
        left(metadata->>'reason',500) AS reason,
        NULLIF(COALESCE(metadata->>'beforeStatus', metadata->'before'->>'status'), '') AS status_before,
        NULLIF(COALESCE(metadata->>'status', metadata->'after'->>'status'), '') AS status_after,created_at
      FROM audit_logs WHERE app.current_platform_role()='platform_super_admin' OR action=ANY($7::text[])
      UNION ALL
      SELECT 'role:'||id,'platform.role.'||action,actor_user_id,'platform_role_assignment',target_user_id::text,NULL::uuid,request_id,NULL::text,
        reason,before_state->>'roleKey',after_state->>'roleKey',created_at
      FROM platform_role_audit WHERE app.current_platform_role()='platform_super_admin'
    ) SELECT *,created_at::text AS cursor_created_at FROM records
      WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz AND created_at <= $3::timestamptz
      AND ($4::text IS NULL OR action=$4) AND ($5::uuid IS NULL OR actor_user_id=$5)
      AND ($6::text IS NULL OR resource_id=$6) ${boundary}
      ORDER BY created_at DESC,id DESC LIMIT $${values.length}`, values);
    const hasMore = result.rows.length > query.limit;
    const rows = result.rows.slice(0, query.limit);
    const last = rows.at(-1);
    const items: PlatformAuditItem[] = rows.map(row => ({ id: row.id, action: row.action, actorUserId: row.actor_user_id, resourceType: row.resource_type, resourceId: row.resource_id, tenantId: row.tenant_id, requestId: row.request_id, traceId: row.trace_id, reason: row.reason, statusBefore: row.status_before, statusAfter: row.status_after, createdAt: new Date(row.created_at).toISOString() }));
    return { items, hasMore, nextCursor: hasMore ? signConsoleCursor(query, { id: last!.id, createdAt: last!.cursor_created_at }, secret) : null, asOf: query.asOf, from: query.from, to: query.to, scope: "platform" as const, pageSize: query.limit };
  });
}
