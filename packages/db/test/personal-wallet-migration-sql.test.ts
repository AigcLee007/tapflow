import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

describe("000042_xunhupay_personal_wallet.sql", () => {
  test("assigns every personal-wallet migration a unique numeric version", async () => {
    const migrationsDir = path.resolve(import.meta.dirname, "../migrations");
    const personalWalletMigrationNames = (await readdir(migrationsDir))
      .filter((filename) => filename.includes("wallet"))
      .sort();
    const versions = personalWalletMigrationNames.map((filename) => filename.match(/^(\d+)_/)?.[1]);

    expect(new Set(versions).size).toBe(versions.length);
  });

  test("defines the personal wallet schema, ownership, RLS, plans, and callback isolation", async () => {
    const migrationPath = path.resolve(
      import.meta.dirname,
      "../migrations/000042_xunhupay_personal_wallet.sql",
    );
    const sql = await readFile(migrationPath, "utf8");

    expect(sql.trimStart()).toMatch(/^-- tapflow:non-transactional/);

    for (const table of [
      "billing_wallets",
      "billing_wallet_credit_grants",
      "billing_wallet_ledger",
      "billing_wallet_credit_reservations",
      "billing_recharge_plans",
      "billing_wallet_payments",
    ]) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }

    expect(sql).toContain("UNIQUE (user_id)");
    expect(sql).toContain("UNIQUE (user_id, idempotency_key)");
    expect(sql).toContain("merchant_order_id text NOT NULL CHECK (char_length(merchant_order_id) <= 32)");
    expect(sql).toContain("expires_at ASC NULLS LAST, created_at ASC, id ASC");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS billed_user_id uuid REFERENCES users(id)");
    expect(sql).toContain("ALTER COLUMN billed_user_id SET NOT NULL");
    expect(sql).toContain("user_id = app.current_user_id()");
    expect(sql).toContain("app.current_is_system_admin()");
    expect(sql).toContain("CREATE POLICY usage_events_select_billed_user");
    expect(sql).toContain("'credits_100', '100 AI credits', 990, 100, 365, true, 10");
    expect(sql).toContain("'credits_3300', '3,300 AI credits', 20000, 3300, 365, true, 40");
    expect(sql).toContain("'billing:plans:manage'");
    expect(sql).toContain("'billing:payments:manage'");
    expect(sql).toContain("'billing:refund'");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = pg_catalog, public, app");
    expect(sql).toContain("REVOKE ALL ON FUNCTION app.apply_xunhu_payment_notification");
    expect(sql).toContain("FOR UPDATE");
  });

  test("uses an isolated callback role and enforces wallet ownership relationships", async () => {
    const migrationPath = path.resolve(
      import.meta.dirname,
      "../migrations/000042_xunhupay_personal_wallet.sql",
    );
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toContain("CREATE ROLE tapflow_wallet_callback NOLOGIN NOINHERIT NOBYPASSRLS");
    expect(sql).toContain("ALTER FUNCTION app.apply_xunhu_payment_notification");
    expect(sql).toContain("ALTER FUNCTION app.list_active_billing_recharge_plans()");
    expect(sql).toContain("OWNER TO tapflow_wallet_callback");
    expect(sql).toContain("GRANT CREATE ON SCHEMA app TO tapflow_wallet_callback;");
    expect(sql).toContain("REVOKE CREATE ON SCHEMA app FROM tapflow_wallet_callback;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION app.apply_xunhu_payment_notification");
    expect(sql).toContain("REVOKE tapflow_wallet_callback FROM");
    expect(sql).toContain("current_user = 'tapflow_wallet_callback'");
    expect(sql).not.toContain("app.xunhu_callback_order_id");
    expect(sql).not.toContain("app.recharge_plan_projection");
    expect(sql).not.toContain("PERFORM set_config('app.user_id'");
    expect(sql).not.toContain("CREATE POLICY billing_wallets_insert_owner");
    expect(sql).not.toContain("CREATE POLICY billing_wallet_payments_update_owner");
    expect(sql).not.toContain("CREATE POLICY billing_wallet_ledger_write_system_admin");
    expect(sql).not.toContain("CREATE POLICY billing_wallet_ledger_update_");
    expect(sql).not.toContain("CREATE POLICY billing_wallet_ledger_delete_");

    expect(sql).toContain("UNIQUE (id, user_id)");
    expect(sql).toContain("FOREIGN KEY (wallet_id, user_id) REFERENCES billing_wallets(id, user_id)");
    expect(sql).toContain("FOREIGN KEY (wallet_ledger_id, wallet_id, user_id)");
    expect(sql).toContain("FOREIGN KEY (credit_grant_id, wallet_id, user_id)");

    const commercialPlanFunction = sql.match(
      /CREATE OR REPLACE FUNCTION app\.list_active_billing_recharge_plans\(\)[\s\S]*?\n\$\$;/,
    )?.[0];
    expect(commercialPlanFunction).toBeDefined();
    expect(commercialPlanFunction).toContain("RETURNS TABLE");
    expect(commercialPlanFunction).toContain("WHERE plan.active");
    expect(commercialPlanFunction).not.toContain("metadata");
    expect(commercialPlanFunction).not.toContain("updated_by");
    expect(sql).toContain("REVOKE ALL ON FUNCTION app.list_active_billing_recharge_plans() FROM PUBLIC");
    expect(sql).not.toContain("CREATE POLICY billing_recharge_plans_select_active");

    const callbackDefinition = sql.indexOf("CREATE OR REPLACE FUNCTION app.apply_xunhu_payment_notification");
    const callbackOwnership = sql.indexOf("OWNER TO tapflow_wallet_callback");
    expect(callbackDefinition).toBeGreaterThan(-1);
    expect(callbackOwnership).toBeGreaterThan(callbackDefinition);
  });

  test("recovers only the current migration user's stale callback membership", async () => {
    const sql = await readFile(
      path.resolve(import.meta.dirname, "../migrations/000042_xunhupay_personal_wallet.sql"),
      "utf8",
    );

    const staleMembershipCleanup = sql.indexOf(
      "EXECUTE format('REVOKE tapflow_wallet_callback FROM %I', current_user);",
    );
    const foreignMembershipGuard = sql.indexOf(
      "tapflow_wallet_callback must not have role members before migration",
    );

    expect(sql).toContain("member_role.rolname <> current_user");
    expect(staleMembershipCleanup).toBeGreaterThan(-1);
    expect(staleMembershipCleanup).toBeLessThan(foreignMembershipGuard);
  });

  test("allows only PostgreSQL's non-inheriting automatic CREATEROLE membership after ownership transfer", async () => {
    const sql = await readFile(
      path.resolve(import.meta.dirname, "../migrations/000042_xunhupay_personal_wallet.sql"),
      "utf8",
    );

    const finalMembershipGuard = sql.slice(
      sql.lastIndexOf("-- The migration role retains explicit execution rights"),
    );

    expect(finalMembershipGuard).toContain("membership.grantor = 10::oid");
    expect(finalMembershipGuard).toContain("membership.admin_option");
    expect(finalMembershipGuard).toContain("NOT membership.inherit_option");
    expect(finalMembershipGuard).toContain("NOT membership.set_option");
    expect(finalMembershipGuard).toContain("member_role.rolname = current_user");
    expect(finalMembershipGuard).toContain("tapflow_wallet_callback retained an unsafe role membership");
  });

  test("defines fixed definer operations instead of granting the API role financial table writes", async () => {
    const sql = await readFile(
      path.resolve(import.meta.dirname, "../migrations/000043_personal_wallet_operations.sql"),
      "utf8",
    );
    expect(sql).toContain("CREATE OR REPLACE FUNCTION app.wallet_credit");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION app.wallet_reserve");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION app.wallet_settle_or_refund");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION app.wallet_expire_due");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("OWNER TO tapflow_wallet_callback");
    expect(sql).toContain("REVOKE ALL ON FUNCTION app.wallet_reserve");
    expect(sql).not.toContain("GRANT SELECT, INSERT, UPDATE ON billing_wallets TO CURRENT_USER");
  });
});
