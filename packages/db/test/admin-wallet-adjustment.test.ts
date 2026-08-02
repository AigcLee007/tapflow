import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";

describe("wallet admin adjustment migration", () => {
  test("defines the admin credit and debit wallet mutation contract", async () => {
    const migrationPath = path.resolve(
      import.meta.dirname,
      "../migrations/000060_wallet_admin_debit.sql",
    );
    const sql = await readFile(migrationPath, "utf8");

    for (const entryType of [
      "payment",
      "migration_credit",
      "admin_credit",
      "admin_debit",
      "redeem",
      "reserve",
      "settle",
      "refund",
      "expire",
      "payment_refund",
    ]) {
      expect(sql).toContain(`'${entryType}'`);
    }

    expect(sql).toContain("billing_wallet_ledger_entry_type_check");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION app.wallet_admin_credit");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION app.wallet_admin_debit");
    expect(sql).toMatch(
      /app\.wallet_admin_credit\(\s*p_actor_user_id uuid,\s*p_target_user_id uuid,\s*p_tenant_id uuid,\s*p_amount numeric,\s*p_expires_at timestamptz,\s*p_idempotency_key text,\s*p_source_id text,\s*p_description text,\s*p_metadata jsonb DEFAULT '\{\}'::jsonb\s*\)/,
    );
    expect(sql).toMatch(
      /app\.wallet_admin_debit\(\s*p_actor_user_id uuid,\s*p_target_user_id uuid,\s*p_tenant_id uuid,\s*p_amount numeric,\s*p_idempotency_key text,\s*p_description text,\s*p_metadata jsonb DEFAULT '\{\}'::jsonb\s*\)/,
    );
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = pg_catalog, public, app");
    expect(sql).toContain("OWNER TO tapflow_wallet_callback");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("hashtextextended('wallet-admin:' || p_idempotency_key, 0)");
    expect(sql).toContain("app.current_is_system_admin()");
    expect(sql).toContain("app.current_user_id() <> p_actor_user_id");
    expect([
      ...sql.matchAll(/IF NOT app\.current_is_system_admin\(\) THEN\s+RAISE EXCEPTION 'WALLET_FORBIDDEN';/g),
    ]).toHaveLength(2);
    expect(sql).not.toMatch(/p_actor_user_id IS NULL OR p_target_user_id IS NULL/);
    expect(sql).toContain("WALLET_IDEMPOTENCY_CONFLICT");
    expect(
      [...sql.matchAll(/WHERE ledger\.idempotency_key = p_idempotency_key\s+FOR UPDATE;/g)],
    ).toHaveLength(2);
    expect(sql).not.toMatch(
      /WHERE ledger\.idempotency_key = p_idempotency_key\s+AND ledger\.entry_type IN \('admin_credit', 'admin_debit'\)/g,
    );
    expect(sql).toContain("app.wallet_expire_due_for_user(p_target_user_id, now())");
    expect(sql).toContain("v_grant.remaining_credits - v_grant.reserved_credits");
    expect(sql).toContain("expires_at ASC NULLS LAST, created_at ASC, id ASC");
    expect(sql).toContain("SET LOCAL ROLE tapflow_wallet_callback;");
    expect(sql).toContain("RESET ROLE;");
    expect(sql).toContain("REVOKE tapflow_wallet_callback FROM CURRENT_USER GRANTED BY CURRENT_USER;");
    expect(sql).toContain("creditGrantAllocations");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION app.wallet_admin_credit");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION app.wallet_admin_debit");
    expect(sql).toContain("REVOKE ALL ON FUNCTION app.wallet_admin_credit");
    expect(sql).toContain("REVOKE ALL ON FUNCTION app.wallet_admin_debit");
    expect(sql).toContain("current_setting('app.api_database_role', true)");
    expect(sql).toContain("session_user");
    expect(sql).not.toMatch(/GRANT\s+(?:SELECT|INSERT|UPDATE)[^;]*billing_wallets[^;]*TO\s+%I/i);
    expect(sql).not.toMatch(/GRANT\s+(?:SELECT|INSERT|UPDATE)[^;]*billing_wallets[^;]*TO\s+SESSION_USER/i);
    expect(sql).not.toMatch(/DISABLE\s+ROW\s+LEVEL\s+SECURITY/i);
  });
});
