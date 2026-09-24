import { describe, expect, test, vi } from "vitest";

import { AdminApiService, type AdminContext } from "../src/modules/admin/admin.service.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";

function context(): AdminContext {
  return {
    ipHash: null,
    isAuthenticated: true,
    permissions: ["platform:console:access", "platform:content:manage"],
    requestId: "request-1",
    roles: ["platform_operator"],
    sessionId: "session-1",
    tenantId,
    traceId: "trace-1",
    userAgent: null,
    userId,
  };
}

test("admin announcement writes establish the platform content scope", async () => {
  const queries: string[] = [];
  const client = {
    query: vi.fn(async (sql: string) => {
      queries.push(sql);
      if (sql.includes("current_platform_role")) return { rows: [{ role_key: "platform_operator" }] };
      if (sql.includes("INSERT INTO audit_logs")) return { rows: [{ action: "admin.announcement.create", actor_type: "user", actor_user_id: userId, created_at: "2026-09-21T00:00:00.000Z", id: "audit-1", ip_hash: null, metadata: {}, request_id: null, resource_id: "33333333-3333-4333-8333-333333333333", resource_type: "announcement", tenant_id: tenantId, trace_id: null, user_agent: null }] };
      if (sql.includes("INSERT INTO announcements")) {
        return {
          rows: [{
            id: "33333333-3333-4333-8333-333333333333",
            tenant_id: tenantId,
            title: "公告",
            body: "内容",
            link_url: null,
            image_url: null,
            pinned: false,
            status: "draft",
            audience: "all",
            published_at: null,
            starts_at: null,
            ends_at: null,
            created_by: userId,
            created_by_email: null,
            is_read: false,
            created_at: "2026-09-21T00:00:00.000Z",
            updated_at: "2026-09-21T00:00:00.000Z",
          }],
        };
      }
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  const pool = { connect: vi.fn(async () => client) };
  const service = new AdminApiService({
    pool: pool as never,
    personalWalletService: {} as never,
  });

  await service.createAnnouncement(context(), {
    audience: "all",
    body: "内容",
    status: "draft",
    title: "公告",
  });

  expect(queries.some((sql) => sql.includes("set_config('app.platform_scope'"))).toBe(true);
});

describe("announcement mutations and audit are atomic", () => {
  const announcementId = "33333333-3333-4333-8333-333333333333";
  const row = {
    id: announcementId, tenant_id: tenantId, title: "公告", body: "内容", status: "draft",
    audience: "all", pinned: false, created_by: userId,
  };
  const actions = ["create", "update", "delete"] as const;
  function fixture(role: string | null, failAudit = false) {
    const query = vi.fn(async (sql: string, _values?: unknown[]) => {
      if (sql.includes("current_platform_role")) return { rows: [{ role_key: role }] };
      if (sql.includes("INSERT INTO audit_logs")) {
        if (failAudit) throw new Error("audit unavailable");
        return { rows: [{ id: announcementId, metadata: {} }] };
      }
      if (sql.includes("announcements")) return { rows: [row], rowCount: 1 };
      return { rows: [] };
    });
    const pool = { connect: vi.fn(async () => ({ query, release: vi.fn() })) };
    return { service: new AdminApiService({ pool: pool as never }), query };
  }
  function run(service: AdminApiService, action: typeof actions[number]) {
    if (action === "create") return service.createAnnouncement(context(), { audience: "all", body: "内容", status: "draft", title: "公告" });
    if (action === "update") return service.updateAnnouncement(context(), announcementId, { status: "published" });
    return service.deleteAnnouncement(context(), announcementId);
  }
  test.each(actions)("records the actor/resource before committing %s", async action => {
    const { service, query } = fixture("platform_operator");
    await run(service, action);
    const auditIndex = query.mock.calls.findIndex(([sql]) => sql.includes("INSERT INTO audit_logs"));
    const commitIndex = query.mock.calls.findIndex(([sql]) => sql === "COMMIT");
    expect(auditIndex).toBeGreaterThan(-1);
    expect(auditIndex).toBeLessThan(commitIndex);
    expect(query.mock.calls[auditIndex][1]).toEqual(expect.arrayContaining([userId, announcementId, `admin.announcement.${action}`]));
  });
  test.each(actions)("rolls back %s if audit fails", async action => {
    const { service, query } = fixture("platform_operator", true);
    await expect(run(service, action)).rejects.toThrow("audit unavailable");
    expect(query.mock.calls.some(([sql]) => sql === "ROLLBACK")).toBe(true);
    expect(query.mock.calls.some(([sql]) => sql === "COMMIT")).toBe(false);
  });
  test.each(actions)("rejects %s after platform authority is revoked", async action => {
    const { service, query } = fixture(null);
    await expect(run(service, action)).rejects.toMatchObject({ statusCode: 403 });
    expect(query.mock.calls.some(([sql]) => sql.includes("announcements"))).toBe(false);
  });
});
