import { apiGet } from "../services/v2HttpClient";

export type PlatformAuditItem = {
  id: string;
  action: string;
  actorUserId: string | null;
  resourceType: string;
  resourceId: string | null;
  tenantId: string | null;
  requestId: string | null;
  traceId: string | null;
  reason: string | null;
  statusBefore: string | null;
  statusAfter: string | null;
  createdAt: string;
};

export type PlatformAuditQuery = { action?: string; actorUserId?: string; resourceId?: string; cursor?: string; asOf?: string; from?: string; to?: string; limit?: number };
export type PlatformAuditPage = { items: PlatformAuditItem[]; hasMore: boolean; nextCursor: string | null; asOf: string; from: string; to: string; pageSize: number; scope: "platform" };

export function listPlatformAudit(query: PlatformAuditQuery = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== "") params.set(key, String(value));
  return apiGet<PlatformAuditPage>(`/admin/audit/logs${params.size ? `?${params.toString()}` : ""}`);
}
