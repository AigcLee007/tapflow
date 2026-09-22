import { randomUUID } from "node:crypto";
import { createPgPool, withUserTransaction } from "@aigc-flow/db";
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { runMigrations } from "../../../packages/db/src/migrator.js";
import { hasDatabaseEnv, withDatabase } from "../../../packages/db/test/helpers.js";
import { PlatformAccessService } from "../src/modules/platform-access/platform-access.service.js";

test("platform identity migration defines independent identity and an owner-only bootstrap", () => {
  const sql = readFileSync(path.resolve(import.meta.dirname, "../../../packages/db/migrations/000084_platform_access.sql"), "utf8");
  expect(sql).toContain("platform_role_assignments");
  expect(sql).toContain("FORCE ROW LEVEL SECURITY");
  expect(sql).toContain("bootstrap_platform_super_admin");
  expect(sql).toContain("PLATFORM_LAST_SUPER_ADMIN");
  expect(sql).toContain("CREATE FUNCTION app.platform_user_role(");
  expect(sql).toContain("CREATE TRIGGER users_protect_last_platform_super_admin");
  expect(sql).not.toMatch(/INSERT INTO platform_role_assignments[^;]+FROM tenant_memberships/is);
});

test("operator gateway writes require the matching platform scope", () => {
  const sql = readFileSync(path.resolve(import.meta.dirname, "../../../packages/db/migrations/000093_platform_scope_write_policies.sql"), "utf8");
  expect(sql).toContain("DROP POLICY IF EXISTS ai_routes_operator_update ON ai_routes;");
  expect(sql).toContain("USING (app.platform_scope_allows(ARRAY['platform:routes:write']))");
  expect(sql).toContain("WITH CHECK (app.platform_scope_allows(ARRAY['platform:routes:write']))");
  expect(sql).toContain("DROP POLICY IF EXISTS ai_model_catalog_operator_default ON ai_model_catalog;");
  expect(sql).toContain("CREATE POLICY tenant_memberships_platform_users_read ON tenant_memberships FOR SELECT");
});

const dbDescribe = hasDatabaseEnv() ? describe : describe.skip;
dbDescribe("platform assignment database boundary", () => {
  test("RLS, bootstrap, optimistic changes, final admin, sessions and mandatory audit", async () => {
    await withDatabase(async ({ databaseUrl, createAppDatabaseUrl }) => {
      const admin = createPgPool({ connectionString: databaseUrl });
      let app = admin;
      try {
        await runMigrations(admin);
        app = createPgPool({ connectionString: await createAppDatabaseUrl() });
        const [superId, operatorId, ordinaryId, nextSuperId] = Array.from({ length: 4 }, () => randomUUID());
        for (const id of [superId, operatorId, ordinaryId, nextSuperId]) {
          await admin.query("INSERT INTO users(id, email, email_verified_at) VALUES ($1, $2, now())", [id, `${id}@platform.test`]);
        }
        const roles = new PlatformAccessService({ pool: app });
        expect((await roles.resolveForUser(superId)).roles).toEqual([]);
        await expect(app.query("SELECT app.bootstrap_platform_super_admin($1, $2, $3)", [superId, "Reviewed named owner", "BOOTSTRAP_PLATFORM_SUPER_ADMIN"]))
          .rejects.toThrow("PLATFORM_BOOTSTRAP_FORBIDDEN");
        await expect(admin.query("SELECT app.bootstrap_platform_super_admin($1, $2, $3)", [superId, "Reviewed named owner", "incorrect"]))
          .rejects.toThrow("PLATFORM_BOOTSTRAP_CONFIRMATION_REQUIRED");
        await admin.query("SELECT app.bootstrap_platform_super_admin($1, $2, $3)", [superId, "Reviewed named owner", "BOOTSTRAP_PLATFORM_SUPER_ADMIN"]);
        await expect(admin.query("SELECT app.bootstrap_platform_super_admin($1, $2, $3)", [nextSuperId, "Reviewed second owner", "BOOTSTRAP_PLATFORM_SUPER_ADMIN"]))
          .rejects.toThrow("PLATFORM_BOOTSTRAP_ALREADY_COMPLETED");
        const superContext = { userId: superId, requestId: "role-test" };
        const operator = await roles.changeRole(superContext, { targetUserId: operatorId, roleKey: "platform_operator", expectedVersion: 0, reason: "Approved operator assignment" });
        expect(operator).toMatchObject({ userId: operatorId, roleKey: "platform_operator", version: 1, grantedBy: superId, revokedAt: null });
        expect((await roles.resolveForUser(operatorId)).permissions).not.toContain("platform:roles:manage");
        await expect(withUserTransaction({ userId: ordinaryId }, (client) =>
          client.query("SELECT app.platform_user_role($1)", [superId]), app)).rejects.toThrow("PLATFORM_ACCESS_FORBIDDEN");
        await withUserTransaction({ userId: operatorId }, async (client) => {
          expect((await client.query("SELECT app.platform_user_role($1) AS role", [superId])).rows[0].role).toBe("platform_super_admin");
          expect((await client.query("SELECT app.platform_user_role($1) AS role", [ordinaryId])).rows[0].role).toBeNull();
        }, app);
        await admin.query("UPDATE users SET status = 'disabled' WHERE id = $1", [operatorId]);
        await withUserTransaction({ userId: superId }, async (client) => {
          expect((await client.query("SELECT app.platform_user_role($1) AS role", [operatorId])).rows[0].role).toBe("platform_operator");
        }, app);
        await admin.query("UPDATE users SET status = 'active' WHERE id = $1", [operatorId]);
        await expect(roles.listAssignments({ userId: operatorId })).rejects.toMatchObject({ code: "PLATFORM_ACCESS_FORBIDDEN" });
        await expect(roles.changeRole({ userId: operatorId }, { targetUserId: ordinaryId, roleKey: "platform_super_admin", expectedVersion: 0, reason: "Attempted escalation" }))
          .rejects.toMatchObject({ code: "PLATFORM_ACCESS_FORBIDDEN" });
        await withUserTransaction({ userId: ordinaryId }, async (client) => {
          await client.query("SELECT set_config('app.is_system_admin', 'true', true)");
          expect((await client.query("SELECT * FROM platform_role_assignments")).rows).toEqual([]);
          expect((await client.query("SELECT * FROM platform_role_audit")).rows).toEqual([]);
          await expect(client.query("INSERT INTO platform_role_assignments(user_id, role_key, version, reason) VALUES ($1, 'platform_super_admin', 1, 'self elevation')", [ordinaryId]))
            .rejects.toThrow(/row-level security|permission denied/);
        }, app).catch((error) => { if (!String(error).includes("aborted")) throw error; });
        await expect(roles.changeRole(superContext, { targetUserId: superId, roleKey: null, expectedVersion: 1, reason: "Attempt to remove final owner" }))
          .rejects.toMatchObject({ code: "PLATFORM_LAST_SUPER_ADMIN" });
        await expect(admin.query("UPDATE users SET status = 'disabled' WHERE id = $1", [superId]))
          .rejects.toThrow("PLATFORM_LAST_SUPER_ADMIN");
        await expect(admin.query("DELETE FROM users WHERE id = $1", [superId]))
          .rejects.toThrow("PLATFORM_LAST_SUPER_ADMIN");
        await expect(roles.changeRole(superContext, { targetUserId: operatorId, roleKey: null, expectedVersion: 0, reason: "Stale removal attempt" }))
          .rejects.toMatchObject({ code: "PLATFORM_ROLE_VERSION_CONFLICT" });
        const sessionId = randomUUID();
        await admin.query("INSERT INTO auth_sessions(id, user_id, expires_at) VALUES ($1, $2, now() + interval '1 day')", [sessionId, operatorId]);
        await admin.query("INSERT INTO refresh_tokens(session_id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, now() + interval '1 day')", [sessionId, operatorId, randomUUID()]);
        const revoked = await roles.changeRole(superContext, { targetUserId: operatorId, roleKey: null, expectedVersion: 1, reason: "Approved removal of access" });
        expect(revoked).toMatchObject({ revokedBy: superId, version: 2 });
        expect(revoked.revokedAt).toBeTruthy();
        expect((await roles.resolveForUser(operatorId)).permissions).toEqual([]);
        expect((await admin.query("SELECT status FROM auth_sessions WHERE id = $1", [sessionId])).rows[0].status).toBe("revoked");
        expect((await admin.query("SELECT revoked_at FROM refresh_tokens WHERE session_id = $1", [sessionId])).rows[0].revoked_at).toBeTruthy();
        const events = (await admin.query("SELECT action, reason, actor_user_id, request_id FROM platform_role_audit ORDER BY created_at, id")).rows;
        expect(events).toHaveLength(3);
        expect(events.at(-1)).toMatchObject({ action: "revoke", actor_user_id: superId, request_id: "role-test", reason: "Approved removal of access" });
        // Audit errors must abort grants rather than quietly publishing access.
        await admin.query(`CREATE FUNCTION public.reject_platform_audit() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN RAISE EXCEPTION 'test audit storage failure'; END $$;
          CREATE TRIGGER reject_platform_audit BEFORE INSERT ON platform_role_audit
          FOR EACH ROW EXECUTE FUNCTION public.reject_platform_audit();`);
        await expect(roles.changeRole(superContext, { targetUserId: ordinaryId, roleKey: "platform_operator", expectedVersion: 0, reason: "Must roll back on audit failure" }))
          .rejects.toThrow("test audit storage failure");
        expect((await roles.resolveForUser(ordinaryId)).roles).toEqual([]);
        await admin.query("DROP TRIGGER reject_platform_audit ON platform_role_audit; DROP FUNCTION public.reject_platform_audit()");
        await withUserTransaction({ userId: superId }, async (client) => {
          expect((await client.query("UPDATE platform_role_audit SET reason = 'tampered audit' RETURNING id")).rowCount).toBe(0);
          expect((await client.query("DELETE FROM platform_role_audit RETURNING id")).rowCount).toBe(0);
        }, app);
        await roles.changeRole(superContext, { targetUserId: nextSuperId, roleKey: "platform_super_admin", expectedVersion: 0, reason: "Approved additional owner" });
        await expect(admin.query("UPDATE users SET status = 'disabled' WHERE id = ANY($1::uuid[])", [[superId, nextSuperId]]))
          .rejects.toThrow("PLATFORM_LAST_SUPER_ADMIN");
        const concurrentDisable = await Promise.allSettled([
          admin.query("UPDATE users SET status = 'disabled' WHERE id = $1", [superId]),
          admin.query("UPDATE users SET status = 'disabled' WHERE id = $1", [nextSuperId]),
        ]);
        expect(concurrentDisable.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        await admin.query("UPDATE users SET status = 'active' WHERE id = ANY($1::uuid[])", [[superId, nextSuperId]]);
        const concurrent = await Promise.allSettled([
          roles.changeRole(superContext, { targetUserId: superId, roleKey: null, expectedVersion: 1, reason: "Concurrent owner removal A" }),
          roles.changeRole({ userId: nextSuperId }, { targetUserId: nextSuperId, roleKey: null, expectedVersion: 1, reason: "Concurrent owner removal B" }),
        ]);
        expect(concurrent.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        expect((await admin.query("SELECT count(*)::int AS count FROM platform_role_assignments WHERE role_key = 'platform_super_admin' AND revoked_at IS NULL")).rows[0].count).toBe(1);
      } finally {
        if (app !== admin) await app.end();
        await admin.end();
      }
    });
  }, 120_000);
});
