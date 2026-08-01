import { access, readFile } from "node:fs/promises";
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

  test("keeps runtime wallet function ACLs aligned with the API database role", async () => {
    const sql = await readFile(
      path.resolve(import.meta.dirname, "../migrations/000046_wallet_runtime_acl.sql"),
      "utf8",
    );

    expect(sql).toContain("current_setting('app.api_database_role', true)");
    expect(sql).toContain("SESSION_USER");
    expect(sql).toContain("GRANT tapflow_wallet_callback TO CURRENT_USER WITH INHERIT FALSE, SET TRUE GRANTED BY CURRENT_USER;");
    expect(sql).toContain("SET LOCAL ROLE tapflow_wallet_callback;");
    expect(sql).toContain("RESET ROLE;");
    for (const signature of [
      "app.list_active_billing_recharge_plans()",
      "app.create_wallet_payment(uuid, text, text, text)",
      "app.mark_wallet_payment_checkout(uuid, text, text)",
      "app.get_wallet_payment_by_order(text)",
      "app.apply_xunhu_payment_notification(text, bigint, text, text, text, timestamptz)",
      "app.wallet_reserve(uuid, uuid, numeric, text, uuid, uuid, jsonb)",
      "app.wallet_redeem_code(uuid, uuid, text, text, jsonb)",
      "app.wallet_settle_or_refund(text, uuid, uuid, uuid, uuid, text, jsonb)",
    ]) {
      expect(sql).toContain(signature);
    }
  });

  test("reasserts callback table privileges required by checkout functions", async () => {
    const sql = await readFile(
      path.resolve(import.meta.dirname, "../migrations/000047_wallet_checkout_table_acl.sql"),
      "utf8",
    );

    expect(sql).toContain("GRANT SELECT ON billing_recharge_plans TO tapflow_wallet_callback");
    expect(sql).toContain("GRANT SELECT, INSERT, UPDATE ON billing_wallets TO tapflow_wallet_callback");
    expect(sql).toContain("GRANT SELECT, INSERT, UPDATE ON billing_wallet_payments TO tapflow_wallet_callback");
    expect(sql).toMatch(/ALTER FUNCTION app\.create_wallet_payment\(uuid, text, text, text\)\s+OWNER TO tapflow_wallet_callback/);
    expect(sql).toMatch(/ALTER FUNCTION app\.mark_wallet_payment_checkout\(uuid, text, text\)\s+OWNER TO tapflow_wallet_callback/);
    expect(sql).toMatch(/ALTER FUNCTION app\.get_wallet_payment_by_order\(text\)\s+OWNER TO tapflow_wallet_callback/);
  });

  test("creates checkout without requiring recharge-plan update privileges", async () => {
    const sql = await readFile(
      path.resolve(import.meta.dirname, "../migrations/000048_wallet_checkout_plan_lock.sql"),
      "utf8",
    );

    expect(sql).toContain("CREATE OR REPLACE FUNCTION app.create_wallet_payment");
    expect(sql).not.toMatch(/FROM billing_recharge_plans[^;]*FOR SHARE/);
    expect(sql).not.toContain("GRANT UPDATE ON billing_recharge_plans");
    expect(sql).toMatch(/ALTER FUNCTION app\.create_wallet_payment\(uuid, text, text, text\)\s+OWNER TO tapflow_wallet_callback/);
  });

  test("credits paid orders without requiring callback ledger visibility", async () => {
    const sql = await readFile(
      path.resolve(import.meta.dirname, "../migrations/000049_wallet_payment_ledger_insert.sql"),
      "utf8",
    );

    expect(sql).toContain("CREATE OR REPLACE FUNCTION app.apply_xunhu_payment_notification");
    expect(sql).toContain("v_ledger_id := gen_random_uuid();");
    expect(sql).toMatch(/INSERT INTO billing_wallet_ledger \(\s*id, wallet_id/);
    expect(sql).not.toContain("RETURNING id INTO v_ledger_id");
    expect(sql).not.toContain("CREATE POLICY billing_wallet_ledger_select_callback");
    expect(sql).toMatch(/ALTER FUNCTION app\.apply_xunhu_payment_notification\(text, bigint, text, text, text, timestamptz\)\s+OWNER TO tapflow_wallet_callback/);
  });

  test("lets callback mutators see wallet rows and reconciles cached wallet totals", async () => {
    const sql = await readFile(
      path.resolve(import.meta.dirname, "../migrations/000050_wallet_balance_reconciliation.sql"),
      "utf8",
    );

    expect(sql).toContain("CREATE POLICY billing_wallets_select_callback");
    expect(sql).toContain("FOR SELECT TO tapflow_wallet_callback");
    expect(sql).toContain("current_user = 'tapflow_wallet_callback'");
    expect(sql).toContain("FROM billing_wallet_credit_grants");
    expect(sql).toMatch(/UPDATE billing_wallets AS wallet[\s\S]*balance_credits = totals\.balance_credits/);
    expect(sql).toContain("reserved_credits = totals.reserved_credits");
  });

  test("allows redeem entries in the personal wallet ledger", async () => {
    const sql = await readFile(
      path.resolve(import.meta.dirname, "../migrations/000052_wallet_redeem_ledger_entry_type.sql"),
      "utf8",
    );

    const dropConstraint = sql.indexOf(
      "DROP CONSTRAINT IF EXISTS billing_wallet_ledger_entry_type_check",
    );
    const addConstraint = sql.indexOf(
      "ADD CONSTRAINT billing_wallet_ledger_entry_type_check",
    );

    expect(dropConstraint).toBeGreaterThan(-1);
    expect(addConstraint).toBeGreaterThan(dropConstraint);
    for (const entryType of [
      "payment",
      "migration_credit",
      "admin_credit",
      "redeem",
      "reserve",
      "settle",
      "refund",
      "expire",
      "payment_refund",
    ]) {
      expect(sql).toContain(`'${entryType}'`);
    }
  });

  test("qualifies wallet redeem columns that collide with RETURNS TABLE output names", async () => {
    const sql = await readFile(
      path.resolve(import.meta.dirname, "../migrations/000053_wallet_redeem_qualified_columns.sql"),
      "utf8",
    );

    expect(sql).toContain("FROM billing_redeem_code_redemptions AS redemption");
    expect(sql).toContain("WHERE redemption.user_id = p_user_id");
    expect(sql).toContain("WHERE redemption.redeem_code_id = v_code.id");
    expect(sql).toContain("FROM billing_redeem_codes AS redeem_code");
    expect(sql).toContain("WHERE redeem_code.code_hash = p_code_hash");
    expect(sql).toContain("UPDATE billing_redeem_codes AS redeem_code");
    expect(sql).toContain("WHERE redeem_code.id = v_code.id");
    expect(sql).toContain("GRANT SELECT, INSERT, UPDATE ON billing_redeem_code_redemptions TO tapflow_wallet_callback");
    expect(sql).toContain("FROM billing_wallets AS wallet");
    expect(sql).toContain("WHERE wallet.user_id = p_user_id");
    expect(sql).toContain("UPDATE billing_wallets AS wallet");
    expect(sql).toContain("WHERE wallet.id = v_wallet.id");
    expect(sql).toContain("WHEN 'redeem' THEN 'redeem'");
    expect(sql).toContain("ON CONFLICT ON CONSTRAINT billing_wallets_user_id_key DO NOTHING");
    expect(sql).toContain("ON CONFLICT ON CONSTRAINT billing_wallet_ledger_user_id_idempotency_key_key DO NOTHING");
    expect(sql).toContain("NULL::uuid AS workflow_run_id");
    expect(sql).toContain("NULL::uuid AS node_run_id");
    expect(sql).not.toContain("SELECT * INTO v_ledger\n  FROM app.wallet_credit(");
  });

  test("qualifies wallet reserve columns that collide with RETURNS TABLE output names", async () => {
    const migrationPath = path.resolve(
      import.meta.dirname,
      "../migrations/000055_wallet_reserve_qualified_columns.sql",
    );
    let migrationExists = true;
    try {
      await access(migrationPath);
    } catch {
      migrationExists = false;
    }

    expect(migrationExists).toBe(true);
    if (!migrationExists) return;

    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION app.wallet_reserve(uuid, uuid, numeric, text, uuid, uuid, jsonb)",
    );
    expect(sql).toContain("FROM billing_wallets AS wallet");
    expect(sql).toContain("WHERE wallet.user_id = p_user_id");
    expect(sql).toContain("FROM billing_wallet_ledger AS ledger");
    expect(sql).toContain("WHERE ledger.user_id = p_user_id");
    expect(sql).toContain("FROM billing_wallet_credit_grants AS credit_grant");
    expect(sql).toContain("WHERE credit_grant.wallet_id = v_wallet.id");
    expect(sql).toContain("UPDATE billing_wallet_credit_grants AS credit_grant");
    expect(sql).toContain("UPDATE billing_wallets AS wallet");
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION app.wallet_reserve(uuid, uuid, numeric, text, uuid, uuid, jsonb) TO SESSION_USER;",
    );
  });

  test("repairs runtime wallet completion and expiry execution without financial table grants", async () => {
    const migrationPath = path.resolve(
      import.meta.dirname,
      "../migrations/000058_wallet_completion_runtime_recovery.sql",
    );
    let migrationExists = true;
    try {
      await access(migrationPath);
    } catch {
      migrationExists = false;
    }

    expect(migrationExists).toBe(true);
    if (!migrationExists) return;

    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION app.wallet_settle_or_refund");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("GRANT USAGE, CREATE ON SCHEMA app TO tapflow_wallet_callback;");
    expect(sql).toContain(
      "GRANT tapflow_wallet_callback TO CURRENT_USER WITH INHERIT FALSE, SET TRUE GRANTED BY CURRENT_USER;",
    );
    expect(sql).toContain("SET LOCAL ROLE tapflow_wallet_callback;");
    expect(sql).toContain("FROM billing_wallets AS wallet");
    expect(sql).toContain("WHERE wallet.user_id = p_user_id");
    expect(sql).toContain("FROM billing_wallet_ledger AS ledger");
    expect(sql).toContain("WHERE ledger.user_id = p_user_id");
    expect(sql).toContain("FROM billing_wallet_ledger AS reserve_ledger");
    expect(sql).toContain("WHERE reserve_ledger.id = p_reserve_ledger_id");
    expect(sql).toContain("FROM billing_wallet_credit_reservations AS reservation");
    expect(sql).toContain("WHERE reservation.user_id = p_user_id");
    expect(sql).toContain("FROM billing_wallet_credit_grants AS credit_grant");
    expect(sql).toContain("WHERE credit_grant.id = v_reservation.credit_grant_id");
    expect(sql).toContain("UPDATE billing_wallet_credit_grants AS credit_grant");
    expect(sql).toContain("UPDATE billing_wallet_credit_reservations AS reservation");
    expect(sql).toContain("UPDATE billing_wallets AS wallet");
    expect(sql).toContain("current_setting('app.api_database_role', true)");
    expect(sql).toContain("session_user");
    expect(sql).toContain(
      "app.wallet_settle_or_refund(text, uuid, uuid, uuid, uuid, text, jsonb)",
    );
    expect(sql).toContain("app.wallet_expire_due(integer, timestamptz)");
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION app.wallet_settle_or_refund(text, uuid, uuid, uuid, uuid, text, jsonb) FROM PUBLIC;",
    );
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION app.wallet_expire_due(integer, timestamptz) FROM PUBLIC;",
    );
    expect(Array.from(sql.matchAll(/'GRANT EXECUTE ON FUNCTION ([^']+) TO %I'/g), (match) => match[1])).toEqual([
      "app.wallet_settle_or_refund(text, uuid, uuid, uuid, uuid, text, jsonb)",
      "app.wallet_expire_due(integer, timestamptz)",
    ]);
    expect(sql).not.toMatch(
      /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE)(?:\s*,\s*(?:SELECT|INSERT|UPDATE|DELETE))*\s+ON\s+[^;]+\s+TO\s+(?:%I|runtime_role)/i,
    );
  });

  test("allows the callback role to lock reserve ledger rows without granting the runtime role ledger access", async () => {
    const migrationPath = path.resolve(
      import.meta.dirname,
      "../migrations/000059_wallet_completion_ledger_lock_acl.sql",
    );
    let migrationExists = true;
    try {
      await access(migrationPath);
    } catch {
      migrationExists = false;
    }

    expect(migrationExists).toBe(true);
    if (!migrationExists) return;

    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("CREATE POLICY billing_wallet_ledger_update_callback");
    expect(sql).toContain(
      "ON billing_wallet_ledger FOR UPDATE TO tapflow_wallet_callback",
    );
    expect(sql).toContain("USING (current_user = 'tapflow_wallet_callback')");
    expect(sql).toContain("WITH CHECK (current_user = 'tapflow_wallet_callback')");
    expect(sql).toContain(
      "GRANT UPDATE ON billing_wallet_ledger TO tapflow_wallet_callback;",
    );
    expect(sql).not.toContain("TO CURRENT_USER");
    expect(sql).not.toContain("TO postgres");
  });

  test("keeps wallet grant reservations within the remaining credit balance", async () => {
    const migrationPath = path.resolve(
      import.meta.dirname,
      "../migrations/000056_wallet_credit_grant_reservation_constraint.sql",
    );
    let migrationExists = true;
    try {
      await access(migrationPath);
    } catch {
      migrationExists = false;
    }

    expect(migrationExists).toBe(true);
    if (!migrationExists) return;

    const sql = await readFile(migrationPath, "utf8");
    const dropLegacyCombinedCheck = sql.indexOf(
      "DROP CONSTRAINT IF EXISTS billing_wallet_credit_grants_check",
    );
    const dropLegacyRemainingCheck = sql.indexOf(
      "DROP CONSTRAINT IF EXISTS billing_wallet_credit_grants_remaining_credits_check",
    );
    const dropLegacyReservedCheck = sql.indexOf(
      "DROP CONSTRAINT IF EXISTS billing_wallet_credit_grants_reserved_credits_check",
    );
    const addRemainingBoundsCheck = sql.indexOf(
      "ADD CONSTRAINT billing_wallet_credit_grants_remaining_credits_check",
    );
    const addReservedBoundsCheck = sql.indexOf(
      "ADD CONSTRAINT billing_wallet_credit_grants_reserved_credits_check",
    );

    expect(dropLegacyCombinedCheck).toBeGreaterThan(-1);
    expect(dropLegacyRemainingCheck).toBeGreaterThan(dropLegacyCombinedCheck);
    expect(dropLegacyReservedCheck).toBeGreaterThan(dropLegacyRemainingCheck);
    expect(addRemainingBoundsCheck).toBeGreaterThan(dropLegacyReservedCheck);
    expect(addReservedBoundsCheck).toBeGreaterThan(addRemainingBoundsCheck);
    expect(sql).toContain(
      "ADD CONSTRAINT billing_wallet_credit_grants_remaining_credits_check",
    );
    expect(sql).toContain(
      "CHECK (remaining_credits >= 0 AND remaining_credits <= original_credits)",
    );
    expect(sql).toContain(
      "ADD CONSTRAINT billing_wallet_credit_grants_reserved_credits_check",
    );
    expect(sql).toContain(
      "CHECK (reserved_credits >= 0 AND reserved_credits <= remaining_credits)",
    );
    expect(sql).not.toContain("remaining_credits + reserved_credits <= original_credits");
  });

  test("lets callback wallet mutators read ledger rows and manage reservation allocations", async () => {
    const migrationPath = path.resolve(
      import.meta.dirname,
      "../migrations/000057_wallet_reservation_runtime_rls.sql",
    );
    let migrationExists = true;
    try {
      await access(migrationPath);
    } catch {
      migrationExists = false;
    }

    expect(migrationExists).toBe(true);
    if (!migrationExists) return;

    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("CREATE POLICY billing_wallet_ledger_select_callback");
    expect(sql).toContain("ON billing_wallet_ledger FOR SELECT TO tapflow_wallet_callback");
    expect(sql).toContain(
      "CREATE POLICY billing_wallet_credit_reservations_select_callback",
    );
    expect(sql).toContain(
      "ON billing_wallet_credit_reservations FOR SELECT TO tapflow_wallet_callback",
    );
    expect(sql).toContain(
      "CREATE POLICY billing_wallet_credit_reservations_insert_callback",
    );
    expect(sql).toContain(
      "ON billing_wallet_credit_reservations FOR INSERT TO tapflow_wallet_callback",
    );
    expect(sql).toContain(
      "CREATE POLICY billing_wallet_credit_reservations_update_callback",
    );
    expect(sql).toContain(
      "ON billing_wallet_credit_reservations FOR UPDATE TO tapflow_wallet_callback",
    );
    expect(sql).toContain("USING (current_user = 'tapflow_wallet_callback')");
    expect(sql).toContain("WITH CHECK (current_user = 'tapflow_wallet_callback')");
    expect(sql).toContain("GRANT SELECT, INSERT ON billing_wallet_ledger TO tapflow_wallet_callback");
    expect(sql).toContain(
      "GRANT SELECT, INSERT, UPDATE ON billing_wallet_credit_reservations TO tapflow_wallet_callback",
    );
    expect(sql).not.toContain(
      "ON billing_wallet_credit_reservations FOR ALL TO tapflow_wallet_callback",
    );
    expect(sql).not.toContain("TO CURRENT_USER");
  });

  test("uses a current-grantor callback-role switch in managed PostgreSQL follow-up migrations", async () => {
    const migrationsDir = path.resolve(import.meta.dirname, "../migrations");
    const migrationExpectations = [
      {
        filename: "000044_wallet_payment_checkout_functions.sql",
        functions: [
          "app.create_wallet_payment(uuid, text, text, text)",
          "app.mark_wallet_payment_checkout(uuid, text, text)",
          "app.get_wallet_payment_by_order(text)",
        ],
        apiFunctions: [
          "app.create_wallet_payment(uuid, text, text, text)",
          "app.mark_wallet_payment_checkout(uuid, text, text)",
          "app.get_wallet_payment_by_order(text)",
        ],
        aclGrantee: "CURRENT_USER",
        aclRunsAsCallback: false,
      },
      {
        filename: "000045_personal_wallet_accounting_hardening.sql",
        functions: [
          "app.wallet_expire_due_for_user(uuid, timestamptz)",
          "app.wallet_reserve(uuid, uuid, numeric, text, uuid, uuid, jsonb)",
          "app.wallet_redeem_code(uuid, uuid, text, text, jsonb)",
          "app.wallet_settle_or_refund(text, uuid, uuid, uuid, uuid, text, jsonb)",
        ],
        apiFunctions: [
          "app.wallet_reserve(uuid, uuid, numeric, text, uuid, uuid, jsonb)",
          "app.wallet_redeem_code(uuid, uuid, text, text, jsonb)",
          "app.wallet_settle_or_refund(text, uuid, uuid, uuid, uuid, text, jsonb)",
        ],
        aclGrantee: "SESSION_USER",
        aclRunsAsCallback: true,
      },
    ];

    for (const {
      filename,
      functions,
      apiFunctions,
      aclGrantee,
      aclRunsAsCallback,
    } of migrationExpectations) {
      const sql = await readFile(path.join(migrationsDir, filename), "utf8");
      const grantSchemaAccess = sql.indexOf(
        "GRANT USAGE, CREATE ON SCHEMA app TO tapflow_wallet_callback;",
      );
      const grantSet = sql.indexOf(
        "GRANT tapflow_wallet_callback TO CURRENT_USER WITH INHERIT FALSE, SET TRUE GRANTED BY CURRENT_USER;",
      );
      const setRole = sql.indexOf("SET LOCAL ROLE tapflow_wallet_callback;");
      const resetRole = sql.indexOf("RESET ROLE;");
      const revokeCreate = sql.indexOf("REVOKE CREATE ON SCHEMA app FROM tapflow_wallet_callback;");
      const revokeTemporaryMembership = sql.indexOf(
        "REVOKE tapflow_wallet_callback FROM CURRENT_USER GRANTED BY CURRENT_USER;",
      );

      expect(grantSchemaAccess).toBeGreaterThan(-1);
      expect(grantSet).toBeGreaterThan(grantSchemaAccess);
      expect(setRole).toBeGreaterThan(grantSet);
      expect(resetRole).toBeGreaterThan(setRole);
      expect(revokeCreate).toBeGreaterThan(resetRole);
      expect(revokeTemporaryMembership).toBeGreaterThan(revokeCreate);

      for (const signature of functions) {
        const functionName = signature.slice(0, signature.indexOf("("));
        const definitionStart = sql.indexOf(`CREATE OR REPLACE FUNCTION ${functionName}(`);
        const definitionEnd = sql.indexOf("\n$$;", definitionStart);
        expect(definitionStart).toBeGreaterThan(setRole);
        expect(definitionEnd).toBeGreaterThan(definitionStart);
        expect(definitionEnd).toBeLessThan(resetRole);
        expect(sql.slice(definitionStart, definitionEnd)).toContain("SECURITY DEFINER");
        const publicRevoke = sql.indexOf(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC;`);
        expect(publicRevoke).toBeGreaterThan(
          aclRunsAsCallback ? definitionEnd : resetRole,
        );
        if (aclRunsAsCallback) {
          expect(publicRevoke).toBeLessThan(resetRole);
        }
        expect(publicRevoke).toBeLessThan(revokeTemporaryMembership);
      }

      for (const signature of apiFunctions) {
        const apiGrant = sql.indexOf(
          `GRANT EXECUTE ON FUNCTION ${signature} TO ${aclGrantee};`,
        );
        expect(apiGrant).toBeGreaterThan(aclRunsAsCallback ? setRole : resetRole);
        if (aclRunsAsCallback) {
          expect(apiGrant).toBeLessThan(resetRole);
        }
        expect(apiGrant).toBeLessThan(revokeTemporaryMembership);
      }

      if (filename.startsWith("000045")) {
        expect(sql.indexOf("CREATE POLICY billing_redeem_codes_select_callback")).toBeGreaterThan(
          resetRole,
        );
      }

      expect(sql).not.toContain("GRANT tapflow_wallet_callback TO CURRENT_USER;");
      expect(sql).not.toContain("REVOKE tapflow_wallet_callback FROM CURRENT_USER;");
      expect(sql).not.toContain("WITH ADMIN TRUE");
      expect(sql).not.toMatch(/GRANT tapflow_wallet_callback[^;]*SET FALSE/);
      expect(sql).not.toMatch(/ALTER FUNCTION[\s\S]*OWNER TO tapflow_wallet_callback/);
    }
  });
});
