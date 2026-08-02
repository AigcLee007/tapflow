import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";

import { PersonalWalletService } from "../src/index.js";

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

describe("PersonalWalletService administrator wallet mutations", () => {
  test("calls the fixed administrator functions and batches wallet summaries", async () => {
    const userId = randomUUID();
    const otherUserId = randomUUID();
    const tenantId = randomUUID();
    const actorUserId = randomUUID();
    const queries: Array<{ sql: string; values: unknown[] }> = [];
    const client = {
      query: async (sql: string, values: unknown[] = []) => {
        queries.push({ sql, values });
        if (sql.includes("wallet_admin_credit")) {
          return { rows: [{ id: "credit-1", wallet_id: "wallet-1", user_id: userId, tenant_id: tenantId, usage_event_id: null, entry_type: "admin_credit", amount_credits: "100", idempotency_key: "admin-credit:1", created_at: "2030-01-01T00:00:00.000Z" }] };
        }
        if (sql.includes("wallet_admin_debit")) {
          return { rows: [{ id: "debit-1", wallet_id: "wallet-1", user_id: userId, tenant_id: tenantId, usage_event_id: null, entry_type: "admin_debit", amount_credits: "60", idempotency_key: "admin-debit:1", created_at: "2030-01-01T00:00:00.000Z" }] };
        }
        return { rows: [{ wallet_id: "wallet-1", user_id: userId, balance: "100", reserved: "20", expiring: "0", nearest: null }] };
      },
    };
    const wallet = new PersonalWalletService({ pool: {} as never });

    await expect(wallet.adminCreditWithClient(client as never, { actorUserId, tenantId, userId }, {
      amountCredits: 100,
      description: "Administrator grant",
      expiresAt: null,
      idempotencyKey: "admin-credit:1",
      sourceId: "admin-credit:1",
    })).resolves.toMatchObject({ amountCredits: 100, entryType: "admin_credit" });
    await expect(wallet.adminDebitWithClient(client as never, { actorUserId, tenantId, userId }, {
      amountCredits: 60,
      description: "Administrator debit",
      idempotencyKey: "admin-debit:1",
    })).resolves.toMatchObject({ amountCredits: 60, entryType: "admin_debit" });
    await expect(wallet.getSummariesWithClient(client as never, [userId, otherUserId])).resolves.toEqual(new Map([
      [userId, expect.objectContaining({ availableCredits: 80, walletId: "wallet-1" })],
      [otherUserId, expect.objectContaining({ availableCredits: 0, walletId: "" })],
    ]));

    expect(queries[0]?.sql).toContain("app.wallet_admin_credit");
    expect(queries[0]?.values).toEqual([actorUserId, userId, tenantId, 100, null, "admin-credit:1", "admin-credit:1", "Administrator grant", "{}"]);
    expect(queries[1]?.sql).toContain("app.wallet_admin_debit");
    expect(queries[1]?.values).toEqual([actorUserId, userId, tenantId, 60, "admin-debit:1", "Administrator debit", "{}"]);
    expect(queries[2]?.sql).toContain("wallet.user_id = ANY($1::uuid[])");
  });
});
