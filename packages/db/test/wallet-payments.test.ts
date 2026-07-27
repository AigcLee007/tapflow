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
    expect(service.markProviderCancelled).toBeTypeOf("function");
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
});
