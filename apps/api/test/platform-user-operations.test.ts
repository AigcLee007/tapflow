import { describe, expect, test, vi } from "vitest";
import { AdminApiService } from "../src/modules/admin/admin.service.js";
import { resolvePlatformCapabilities } from "../src/modules/platform-access/platform-access.policy.js";

const actor = "11111111-1111-4111-8111-111111111111";
const target = "22222222-2222-4222-8222-222222222222";
const context = (role: string) => ({
  permissions: resolvePlatformCapabilities(role), roles: [role], userId: actor, tenantId: actor,
  isAuthenticated: true, sessionId: actor, requestId: "test", traceId: "test", ipHash: null, userAgent: null,
});

function fixture(targetRole: string | null) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("SELECT app.current_platform_role")) return { rows: [{ role_key: "platform_operator" }] };
    if (sql.includes("SELECT app.platform_user_role")) return { rows: [{ role_key: targetRole }] };
    if (sql.includes("UPDATE users")) return { rows: [{ id: target, status: "disabled" }] };
    if (sql.includes("INSERT INTO audit_logs")) return { rows: [{ id: target, action: "admin.user.update_status", metadata: {} }] };
    return { rows: [], rowCount: 1 };
  });
  const client = { query, release: vi.fn() };
  const pool = { connect: vi.fn(async () => client), query };
  return { service: new AdminApiService({ pool: pool as never }), query, pool };
}

describe("platform user operations", () => {
  test("platform operations do not require a selected creator workspace", async () => {
    const { service } = fixture(null);
    await expect(service.updateUserStatus({ ...context("platform_operator"), tenantId: null }, { targetUserId: target, status: "disabled", reason: "Confirmed abuse report" })).resolves.toEqual({ id: target, status: "disabled" });
  });
  test("financial writes require a retry key before opening a transaction", async () => {
    const { service, pool } = fixture(null);
    const input = { credits: 10, reason: "Approved support adjustment", targetUserId: target, tenantId: target };
    await expect(service.grantCredits(context("platform_super_admin"), input)).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REQUIRED", statusCode: 400 });
    await expect(service.adjustCredits(context("platform_super_admin"), { ...input, direction: "add" })).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REQUIRED", statusCode: 400 });
    expect(pool.connect).not.toHaveBeenCalled();
  });
  test("operator can disable an ordinary user with reason and revoke sessions", async () => {
    const { service, query } = fixture(null);
    await expect(service.updateUserStatus(context("platform_operator"), { targetUserId: target, status: "disabled", reason: "Confirmed abuse report" })).resolves.toEqual({ id: target, status: "disabled" });
    const statements = query.mock.calls.map(([sql]) => sql);
    expect(statements.some(sql => sql.includes("advisory_xact_lock"))).toBe(true);
    expect(statements.some(sql => sql.includes("UPDATE auth_sessions"))).toBe(true);
    expect(statements.some(sql => sql.includes("UPDATE refresh_tokens"))).toBe(true);
    expect(statements.filter(sql => sql.includes("set_config('app.is_system_admin', 'true'"))).toHaveLength(0);
  });
  test.each(["platform_operator", "platform_super_admin"])("operator cannot disable %s", async (role) => {
    const { service, query } = fixture(role);
    await expect(service.updateUserStatus(context("platform_operator"), { targetUserId: target, status: "disabled", reason: "Confirmed abuse report" })).rejects.toMatchObject({ statusCode: 403 });
    expect(query.mock.calls.some(([sql]) => sql.includes("UPDATE users"))).toBe(false);
  });
  test("legacy roles and missing reasons are rejected before a transaction", async () => {
    const { service, pool } = fixture(null);
    await expect(service.updateUserStatus(context("system_admin"), { targetUserId: target, status: "disabled", reason: "Confirmed report" })).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.updateUserStatus(context("platform_operator"), { targetUserId: target, status: "disabled", reason: "" })).rejects.toMatchObject({ statusCode: 400 });
    expect(pool.connect).not.toHaveBeenCalled();
  });
});
