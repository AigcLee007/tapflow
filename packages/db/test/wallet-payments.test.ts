import { describe, expect, test } from "vitest";

import { WalletPaymentService } from "../src/wallet-payments.js";

describe("WalletPaymentService", () => {
  test("exposes server-owned fixed recharge plan and user payment operations", () => {
    const service = new WalletPaymentService({
      pool: {} as never,
    });

    expect(service.listActivePlans).toBeTypeOf("function");
    expect(service.createPendingPayment).toBeTypeOf("function");
    expect(service.getUserPayment).toBeTypeOf("function");
    expect(service.applyVerifiedNotification).toBeTypeOf("function");
    expect(service.listAdminPlans).toBeTypeOf("function");
    expect(service.updateAdminPlan).toBeTypeOf("function");
    expect(service.listAdminPayments).toBeTypeOf("function");
    expect(service.getAdminPayment).toBeTypeOf("function");
    expect(service.getEligibleRefundPayment).toBeTypeOf("function");
    expect(service.claimEligibleRefundPayment).toBeTypeOf("function");
    expect(service.releaseRefundPaymentClaim).toBeTypeOf("function");
    expect(service.markProviderCancelled).toBeTypeOf("function");
  });

  test("claims an eligible refund before an external provider request", async () => {
    const queries: string[] = [];
    const paid = { amount_cents: "990", billing_ledger_id: null, created_at: "2026-07-27T00:00:00.000Z", credits: "100", currency: "CNY", expires_at_snapshot: null, failure_code: null, id: "payment-1", merchant_order_id: "TF0001", metadata: {}, paid_at: "2026-07-27T00:00:00.000Z", plan_id: "plan-1", plan_key: "credits_100", plan_name_snapshot: "100 AI credits", provider: "xunhupay", provider_open_order_id: null, provider_transaction_id: null, status: "paid", updated_at: "2026-07-27T00:00:00.000Z", user_id: "user-1", validity_days_snapshot: 365, wallet_id: "wallet-1" };
    const client = { query: async (sql: string) => { queries.push(sql); if (sql.includes("FROM billing_wallet_payments") && sql.includes("FOR UPDATE")) return { rows: [paid] }; if (sql.includes("FROM billing_wallet_credit_grants")) return { rows: [{ original_credits: "100", remaining_credits: "100", reserved_credits: "0" }] }; if (sql.includes("SET status = 'refund_pending'")) return { rows: [{ ...paid, status: "refund_pending" }] }; return { rows: [] }; }, release: () => undefined };
    const service = new WalletPaymentService({ pool: { connect: async () => client } as never });

    await expect(service.claimEligibleRefundPayment("payment-1")).resolves.toMatchObject({ status: "refund_pending", eligible: true });
    expect(queries.findIndex(sql => sql.includes("SET status = 'refund_pending'"))).toBeGreaterThan(queries.findIndex(sql => sql.includes("FROM billing_wallet_credit_grants")));
    expect(queries.some(sql => sql.includes("SET refund_hold = true"))).toBe(true);
  });

  test("releases an unaccepted refund claim so the same paid order can be retried", async () => {
    const queries: string[] = [];
    const paid = { amount_cents: "990", billing_ledger_id: null, created_at: "2026-07-27T00:00:00.000Z", credits: "100", currency: "CNY", expires_at_snapshot: null, failure_code: null, id: "payment-1", merchant_order_id: "TF0001", metadata: {}, paid_at: "2026-07-27T00:00:00.000Z", plan_id: "plan-1", plan_key: "credits_100", plan_name_snapshot: "100 AI credits", provider: "xunhupay", provider_open_order_id: null, provider_transaction_id: null, status: "refund_pending", updated_at: "2026-07-27T00:00:00.000Z", user_id: "user-1", validity_days_snapshot: 365, wallet_id: "wallet-1" };
    const client = { query: async (sql: string) => { queries.push(sql); if (sql.includes("FROM billing_wallet_payments") && sql.includes("FOR UPDATE")) return { rows: [paid] }; if (sql.includes("SET refund_hold = false")) return { rows: [] }; if (sql.includes("SET status = 'paid'")) return { rows: [{ ...paid, status: "paid", failure_code: "REFUND_NOT_ACCEPTED" }] }; return { rows: [] }; }, release: () => undefined };
    const service = new WalletPaymentService({ pool: { connect: async () => client } as never });

    await expect(service.releaseRefundPaymentClaim("payment-1", "REFUND_NOT_ACCEPTED")).resolves.toMatchObject({ status: "paid", failureCode: "REFUND_NOT_ACCEPTED" });
    expect(queries.findIndex(sql => sql.includes("SET refund_hold = false"))).toBeGreaterThan(-1);
    expect(queries.findIndex(sql => sql.includes("SET status = 'paid'"))).toBeGreaterThan(-1);
  });

  test("derives admin refund eligibility from the untouched payment grant", async () => {
    const queries: Array<{ sql: string; values?: unknown[] }> = [];
    const row = {
      amount_cents: "990", billing_ledger_id: null, created_at: "2026-07-27T00:00:00.000Z",
      credits: "100", currency: "CNY", eligible: true, expires_at_snapshot: null,
      failure_code: null, id: "payment-1", merchant_order_id: "TF0001", metadata: {},
      paid_at: "2026-07-27T00:00:00.000Z", plan_id: "plan-1", plan_key: "credits_100",
      plan_name_snapshot: "100 AI credits", provider: "xunhupay", provider_open_order_id: null,
      provider_transaction_id: null, status: "paid", updated_at: "2026-07-27T00:00:00.000Z",
      user_email: "user@example.test", user_id: "user-1", validity_days_snapshot: 365, wallet_id: "wallet-1",
    };
    const client = {
      query: async (sql: string, values?: unknown[]) => {
        queries.push({ sql, values });
        return sql.includes("FROM billing_wallet_payments JOIN users") ? { rows: [row] } : { rows: [] };
      },
      release: () => undefined,
    };
    const service = new WalletPaymentService({ pool: { connect: async () => client } as never });

    await expect(service.listAdminPayments()).resolves.toMatchObject([{ eligible: true, id: "payment-1", userEmail: "user@example.test" }]);
    const listQuery = queries.find(({ sql }) => sql.includes("FROM billing_wallet_payments JOIN users"));
    expect(listQuery?.sql).toContain("original_credits = billing_wallet_credit_grants.remaining_credits");
    expect(listQuery?.sql).toContain("reserved_credits = 0");
    expect(listQuery?.sql).not.toContain("app_secret");
    expect(listQuery?.sql).not.toContain("callback");
  });

  test("qualifies payment columns in joined admin payment queries", async () => {
    const queries: string[] = [];
    const row = {
      amount_cents: "990", billing_ledger_id: null, created_at: "2026-07-27T00:00:00.000Z",
      credits: "100", currency: "CNY", expires_at_snapshot: null, failure_code: null,
      id: "payment-1", merchant_order_id: "TF0001", metadata: {}, paid_at: null,
      plan_id: "plan-1", plan_key: "credits_100", plan_name_snapshot: "100 AI credits",
      provider: "xunhupay", provider_open_order_id: null, provider_transaction_id: null,
      status: "checkout_created", updated_at: "2026-07-27T00:00:00.000Z",
      user_email: "user@example.test", user_id: "user-1", validity_days_snapshot: 365,
      wallet_id: "wallet-1",
    };
    const client = {
      query: async (sql: string) => {
        queries.push(sql);
        return sql.includes("FROM billing_wallet_payments JOIN users") ? { rows: [row] } : { rows: [] };
      },
      release: () => undefined,
    };
    const service = new WalletPaymentService({ pool: { connect: async () => client } as never });

    await expect(service.getAdminPayment("payment-1")).resolves.toMatchObject({ id: "payment-1" });
    const query = queries.find((sql) => sql.includes("FROM billing_wallet_payments JOIN users"));
    expect(query).toContain("billing_wallet_payments.id::text");
    expect(query).toContain("billing_wallet_payments.user_id::text");
  });
});
