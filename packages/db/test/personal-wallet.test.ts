import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

import { describe, expect, test } from "vitest";

import { createPgPool, PersonalWalletService, withUserTransaction } from "../src/index.js";
import { runMigrations } from "../src/migrator.js";
import { hasDatabaseEnv, withDatabase } from "./helpers.js";

describe("PersonalWalletService", () => {
  test("exposes personal-only redeem alongside reserve, settlement, refund, and expiry", () => {
    const wallet = new PersonalWalletService({ pool: {} as never });

    expect(wallet.reserveUsage).toBeTypeOf("function");
    expect(wallet.settleUsageWithClient).toBeTypeOf("function");
    expect(wallet.refundUsageWithClient).toBeTypeOf("function");
    expect(wallet.expireDueGrants).toBeTypeOf("function");
    expect(wallet.redeemCode).toBeTypeOf("function");
  });

  test("uses a non-reserved alias in the wallet summary query", async () => {
    const queries: string[] = [];
    const client = {
      query: async (sql: string) => {
        queries.push(sql);
        return { rows: [] };
      },
      release: () => undefined,
    };
    const wallet = new PersonalWalletService({
      pool: { connect: async () => client } as never,
    });

    await wallet.getSummary({ userId: randomUUID() });

    const summaryQuery = queries.find((sql) => sql.includes("FROM billing_wallets"));
    expect(summaryQuery).toContain("billing_wallet_credit_grants credit_grant");
    expect(summaryQuery).not.toContain("billing_wallet_credit_grants grant");
  });
});

describe("personal wallet accounting migration", () => {
  test("makes lazy expiry wallet-scoped and keeps exact FEFO reservation allocations", async () => {
    const sql = await readFile(
      path.resolve(import.meta.dirname, "../migrations/000045_personal_wallet_accounting_hardening.sql"),
      "utf8",
    );

    expect(sql).toContain("app.wallet_expire_due_for_user");
    expect(sql).toContain("PERFORM app.wallet_expire_due_for_user(p_user_id, now())");
    expect(sql).not.toContain("PERFORM app.wallet_expire_due(500, now())");
    expect(sql).toContain("expires_at ASC NULLS LAST, created_at ASC, id ASC FOR UPDATE");
    expect(sql).toContain("status = 'expired'");
  });

  test("redeems one visible code once per user and records the wallet ledger atomically", async () => {
    const sql = await readFile(
      path.resolve(import.meta.dirname, "../migrations/000045_personal_wallet_accounting_hardening.sql"),
      "utf8",
    );

    expect(sql).toContain("wallet_ledger_id uuid REFERENCES billing_wallet_ledger(id)");
    expect(sql).toContain("ON billing_redeem_code_redemptions (redeem_code_id, user_id)");
    expect(sql).toContain("app.wallet_redeem_code");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("REDEEM_CODE_ALREADY_REDEEMED");
    expect(sql).toContain("WALLET_FORBIDDEN");
  });

  test("makes redeem-code lookup global while retaining the redemption workspace for audit", async () => {
    const sql = await readFile(
      path.resolve(import.meta.dirname, "../migrations/000051_global_redeem_code_scope.sql"),
      "utf8",
    );

    expect(sql).toContain("CREATE OR REPLACE FUNCTION app.wallet_redeem_code");
    expect(sql).toContain("WHERE code_hash = p_code_hash");
    expect(sql).not.toContain("tenant_id IS NULL OR tenant_id = p_tenant_id");
    expect(sql).toContain("v_code.id, p_tenant_id, p_user_id, v_ledger.id");
  });
});

const describeWithDatabase = hasDatabaseEnv() ? describe : describe.skip;

describeWithDatabase("PersonalWalletService integration", () => {
  test("uses one user wallet across tenants and persists FEFO reservations", async () => {
    await withDatabase(async ({ databaseUrl }) => {
      const pool = createPgPool({ connectionString: databaseUrl });
      const userId = randomUUID();
      const tenantA = randomUUID();
      const tenantB = randomUUID();
      try {
        await runMigrations(pool);
        await pool.query("INSERT INTO users (id, email) VALUES ($1::uuid, $2)", [userId, `${userId}@example.test`]);
        await pool.query("INSERT INTO tenants (id, name, slug) VALUES ($1::uuid, 'wallet-a', $2)", [tenantA, `wallet-a-${tenantA.slice(0, 8)}`]);
        await pool.query("INSERT INTO tenants (id, name, slug) VALUES ($1::uuid, 'wallet-b', $2)", [tenantB, `wallet-b-${tenantB.slice(0, 8)}`]);
        const wallet = new PersonalWalletService({ pool });
        await wallet.credit({ userId }, { amountCredits: 40, expiresAt: "2030-01-01T00:00:00.000Z", idempotencyKey: `credit:${userId}:early`, sourceId: "early", sourceType: "admin_grant" });
        await wallet.credit({ userId }, { amountCredits: 60, expiresAt: "2031-01-01T00:00:00.000Z", idempotencyKey: `credit:${userId}:late`, sourceId: "late", sourceType: "admin_grant" });
        const reserve = await wallet.reserveUsage({ tenantId: tenantA, userId }, { amountCredits: 50, idempotencyKey: `reserve:${userId}:a` });
        const reserveB = await wallet.reserveUsage({ tenantId: tenantB, userId }, { amountCredits: 10, idempotencyKey: `reserve:${userId}:b` });
        const summary = await wallet.getSummary({ userId });
        const allocations = await pool.query<{ amount_credits: string; source_id: string }>(
          `SELECT reservation.amount_credits::text AS amount_credits, credit_grant.source_id
           FROM billing_wallet_credit_reservations reservation
           JOIN billing_wallet_credit_grants credit_grant ON credit_grant.id = reservation.credit_grant_id
           WHERE reservation.wallet_ledger_id = $1::uuid ORDER BY credit_grant.expires_at ASC NULLS LAST`,
          [reserve.id],
        );
        expect(summary.walletId).not.toBe("");
        expect(summary.reservedCredits).toBe(60);
        expect(allocations.rows).toEqual([{ amount_credits: "40.0000", source_id: "early" }, { amount_credits: "10.0000", source_id: "late" }]);

        await wallet.expireDueGrants({ now: "2032-01-01T00:00:00.000Z" });
        await withUserTransaction({ tenantId: tenantB, userId }, (client) => wallet.refundUsageWithClient(client, { tenantId: tenantB, userId }, { idempotencyKey: `refund:${userId}:b`, reserveLedgerId: reserveB.id }), pool);
        const afterExpiredRefund = await wallet.getSummary({ userId });
        expect(afterExpiredRefund.availableCredits).toBe(0);
        expect(afterExpiredRefund.reservedCredits).toBe(50);

        const redeemCode = "PERSONAL-WALLET-TEST";
        await pool.query(
          `INSERT INTO billing_redeem_codes (tenant_id, code_hash, credits, max_redemptions)
           VALUES ($1::uuid, $2, 15, 5)`,
          [tenantA, createHash("sha256").update(redeemCode).digest("hex")],
        );
        const redemption = await wallet.redeemCode({ tenantId: tenantA, userId }, { code: redeemCode });
        await expect(wallet.redeemCode({ tenantId: tenantA, userId }, { code: redeemCode, idempotencyKey: `redeem:${userId}:different` }))
          .rejects.toMatchObject({ code: "REDEEM_CODE_ALREADY_REDEEMED" });
        expect(redemption.credits).toBe(15);

        const anotherUserId = randomUUID();
        await pool.query("INSERT INTO users (id, email) VALUES ($1::uuid, $2)", [anotherUserId, `${anotherUserId}@example.test`]);
        expect(await wallet.getSummary({ userId: anotherUserId })).toMatchObject({ availableCredits: 0, walletId: "" });
      } finally {
        await pool.end();
      }
    });
  });
});
