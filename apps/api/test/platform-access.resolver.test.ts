import type { Pool } from "pg";
import { describe, expect, test, vi } from "vitest";
import { resolvePermissionsForTenant } from "../src/modules/auth/permission-resolver.js";

function database(role: string | null, membership = "tenant_admin") {
  let activeRole = role;
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("FROM platform_role_assignments")) return { rows: activeRole ? [{ role_key: activeRole, version: 2 }] : [] };
    if (sql.includes("FROM tenant_memberships")) return { rows: [{ role_key: membership }] };
    if (sql.includes("FROM roles")) return { rows: [{ role_id: "role-id" }] };
    if (sql.includes("FROM role_permissions")) return { rows: ["flow:update", "admin:system", "provider:manage", "credential:manage", "billing:refund", "platform:roles:manage"].map(permission_key => ({ permission_key })) };
    return { rows: [] };
  });
  const client = { query, release: vi.fn() };
  return { pool: { connect: async () => client } as unknown as Pool, query, setRole: (value: string | null) => { activeRole = value; } };
}

describe("effective authentication permissions", () => {
  test("tenant administrator retains team permission but receives no platform privileges", async () => {
    const db = database(null);
    const result = await resolvePermissionsForTenant({ tenantId: "tenant", userId: "user" }, db.pool);
    expect(result).toEqual({ permissions: ["flow:update"], roles: ["tenant_admin"] });
  });

  test("platform role is independent of selected tenant and no legacy alias is fabricated", async () => {
    const db = database("platform_operator");
    const result = await resolvePermissionsForTenant({ tenantId: null, userId: "user" }, db.pool);
    expect(result.roles).toEqual(["platform_operator"]);
    expect(result.permissions).toContain("platform:console:access");
    expect(result.permissions).not.toContain("admin:system");
    expect(db.query.mock.calls.some(([sql]) => sql.includes("FROM tenant_memberships"))).toBe(false);
    expect(db.query.mock.calls.some(([sql]) => sql.includes("set_config('app.user_id'"))).toBe(true);
  });

  test("each request resolves the current assignment, so revocation cannot remain cached", async () => {
    const db = database("platform_super_admin");
    const first = await resolvePermissionsForTenant({ tenantId: "tenant", userId: "user" }, db.pool);
    expect(first.roles).toEqual(["tenant_admin", "platform_super_admin"]);
    expect(first.permissions).toContain("platform:roles:manage");
    db.setRole(null);
    expect(await resolvePermissionsForTenant({ tenantId: "tenant", userId: "user" }, db.pool))
      .toEqual({ permissions: ["flow:update"], roles: ["tenant_admin"] });
  });

  test("missing user never queries global role data", async () => {
    const db = database("platform_super_admin");
    expect(await resolvePermissionsForTenant({ tenantId: "tenant", userId: null }, db.pool))
      .toEqual({ permissions: [], roles: [] });
    expect(db.query).not.toHaveBeenCalled();
  });

  test("a tenant membership named like a platform role cannot spoof platform identity", async () => {
    const db = database(null, "platform_super_admin");
    expect(await resolvePermissionsForTenant({ tenantId: "tenant", userId: "user" }, db.pool))
      .toEqual({ permissions: ["flow:update"], roles: [] });
  });
});
