import { describe, expect, test, vi } from "vitest";

import { createPaymentCheckoutSchema } from "../src/modules/payments/payments.schemas.js";
import { PaymentsService } from "../src/modules/payments/payments.service.js";

function platformPool() {
  const client = {
    query: vi.fn(async (sql: string) => {
      if (sql.includes("current_platform_role")) return { rows: [{ role_key: "platform_super_admin" }] };
      if (sql.includes("INSERT INTO audit_logs")) return { rows: [{ action: "billing.payment.refund.requested", actor_type: "user", actor_user_id: "operator-1", created_at: new Date().toISOString(), id: "audit-1", ip_hash: null, metadata: {}, request_id: null, resource_id: "payment-1", resource_type: "billing_wallet_payment", tenant_id: null, trace_id: null, user_agent: null }] };
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  return { pool: { connect: vi.fn(async () => client) }, client };
}

describe("payment checkout request", () => {
  test("accepts only a server-selected plan and idempotency key", () => {
    expect(createPaymentCheckoutSchema.safeParse({
      planKey: "credits_100",
      idempotencyKey: "checkout:user:1",
    }).success).toBe(true);
    expect(createPaymentCheckoutSchema.safeParse({
      planKey: "credits_100",
      idempotencyKey: "checkout:user:1",
      amountCents: 1,
      credits: 999999,
    }).success).toBe(false);
  });
});

test("releases an accepted local claim when the provider explicitly rejects a refund", async () => {
  const calls: string[] = [];
  const payment = { id: "payment-1", merchantOrderId: "TF1", amountCents: 990, status: "refund_pending" };
  const walletPayments = {
    pool: platformPool().pool,
    claimEligibleRefundPaymentWithClient: async () => { calls.push("claim"); return { ...payment, eligible: true }; },
    releaseRefundPaymentClaimWithClient: async () => { calls.push("release"); return { ...payment, status: "paid" }; },
  };
  const xunhu = { refundPayment: async () => ({ providerState: "OD" as const }) };
  const service = new PaymentsService({ paymentsEnabled: true } as never, { walletPayments: walletPayments as never, xunhu: xunhu as never });

  await expect(service.refundAdminPayment({ userId: "operator-1", tenantId: null }, "payment-1", "duplicate charge", { action: "billing.payment.refund" }))
    .rejects.toMatchObject({ code: "PAYMENT_PROVIDER_STATE_INVALID" });
  expect(calls).toEqual(["claim", "release"]);
});

test("keeps a refund claim pending when the provider outcome is unknown", async () => {
  const calls: string[] = [];
  const walletPayments = {
    pool: platformPool().pool,
    claimEligibleRefundPaymentWithClient: async () => { calls.push("claim"); return { id: "payment-1", merchantOrderId: "TF1", amountCents: 990, status: "refund_pending", eligible: true }; },
    releaseRefundPaymentClaimWithClient: async () => { calls.push("release"); return { id: "payment-1", status: "paid" }; },
  };
  const xunhu = { refundPayment: async () => { throw new Error("timeout"); } };
  const service = new PaymentsService({ paymentsEnabled: true } as never, { walletPayments: walletPayments as never, xunhu: xunhu as never });

  await expect(service.refundAdminPayment({ userId: "operator-1", tenantId: null }, "payment-1", "duplicate charge", { action: "billing.payment.refund" }))
    .rejects.toMatchObject({ code: "PAYMENT_PROVIDER_UNAVAILABLE", statusCode: 502 });
  expect(calls).toEqual(["claim"]);
});

test("audits provider query results, including non-mutating pending responses", async () => {
  const { pool } = platformPool();
  const payment = { id: "payment-1", merchantOrderId: "TF1", amountCents: 990, status: "pending" };
  const walletPayments = {
    pool,
    getAdminPaymentWithClient: async () => payment,
    markProviderCancelledWithClient: async () => ({ ...payment, status: "cancelled" }),
  };
  const xunhu = { queryPayment: async () => ({ providerState: "WP", amountCents: 990, openOrderId: null, transactionId: null }) };
  const service = new PaymentsService({ paymentsEnabled: true } as never, { walletPayments: walletPayments as never, xunhu: xunhu as never });

  await expect(service.queryAdminPayment({ userId: "operator-1", tenantId: null }, "payment-1", { action: "billing.payment.query" })).resolves.toMatchObject({ status: "pending" });
});
