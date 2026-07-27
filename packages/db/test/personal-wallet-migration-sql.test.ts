import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

describe("000042_xunhupay_personal_wallet.sql", () => {
  test("defines the personal wallet schema, ownership, RLS, plans, and callback isolation", async () => {
    const migrationPath = path.resolve(
      import.meta.dirname,
      "../migrations/000042_xunhupay_personal_wallet.sql",
    );
    const sql = await readFile(migrationPath, "utf8");

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

  test("uses a trusted database role for mutation and limits plan reads to commercial fields", async () => {
    const migrationPath = path.resolve(
      import.meta.dirname,
      "../migrations/000042_xunhupay_personal_wallet.sql",
    );
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toContain("CREATE OR REPLACE FUNCTION app.current_is_wallet_service_role()");
    expect(sql).toContain("'app.apply_xunhu_payment_notification(text, bigint, text, text, text, timestamptz)'::regprocedure");
    expect(sql).toContain("CREATE POLICY billing_wallets_write_wallet_service");
    expect(sql).toContain("CREATE POLICY billing_wallet_payments_write_wallet_service");
    expect(sql).toContain("CREATE POLICY billing_wallet_ledger_insert_wallet_service");
    expect(sql).not.toContain("CREATE POLICY billing_wallets_insert_owner");
    expect(sql).not.toContain("CREATE POLICY billing_wallet_credit_grants_update_owner");
    expect(sql).not.toContain("CREATE POLICY billing_wallet_ledger_insert_owner");
    expect(sql).not.toContain("CREATE POLICY billing_wallet_credit_reservations_update_owner");
    expect(sql).not.toContain("CREATE POLICY billing_wallet_payments_update_owner");
    expect(sql).not.toContain("CREATE POLICY billing_wallet_ledger_write_system_admin");

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
  });
});
