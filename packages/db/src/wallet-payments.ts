import type { Pool, PoolClient } from "pg";

import { createPgPool } from "./db.js";
import { withUserTransaction } from "./transaction.js";

export type RechargePlanView = {
  id: string;
  key: string;
  name: string;
  amountCents: number;
  credits: number;
  currency: string;
  validityDays: number;
  sortOrder: number;
};

export type WalletPaymentView = {
  id: string;
  walletId: string;
  userId: string;
  planId: string;
  planKey: string;
  merchantOrderId: string;
  provider: string;
  providerTransactionId: string | null;
  providerOpenOrderId: string | null;
  amountCents: number;
  credits: number;
  currency: string;
  planNameSnapshot: string;
  validityDaysSnapshot: number;
  expiresAtSnapshot: string | null;
  status: string;
  billingLedgerId: string | null;
  failureCode: string | null;
  paidAt: string | null;
  checkoutUrl: string | null;
  qrCodeUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VerifiedXunhuNotification = {
  amountCents: number;
  eventTime: string;
  merchantOrderId: string;
  openOrderId: string | null;
  providerState: "OD" | "CD" | "RD" | "UD";
  transactionId: string | null;
};

export class WalletPaymentServiceError extends Error {
  constructor(readonly code: string, message: string, readonly statusCode = 400) {
    super(message);
    this.name = "WalletPaymentServiceError";
  }
}

type PlanRow = { id: string; key: string; name: string; amount_cents: string; credits: string; currency: string; validity_days: number; sort_order: number };
type PaymentRow = {
  id: string; wallet_id: string; user_id: string; plan_id: string; plan_key: string; merchant_order_id: string;
  provider: string; provider_transaction_id: string | null; provider_open_order_id: string | null; amount_cents: string;
  credits: string; currency: string; plan_name_snapshot: string; validity_days_snapshot: number; expires_at_snapshot: string | null;
  status: string; billing_ledger_id: string | null; failure_code: string | null; paid_at: string | null; metadata: Record<string, unknown>;
  created_at: string; updated_at: string;
};

function mapPlan(row: PlanRow): RechargePlanView {
  return { id: row.id, key: row.key, name: row.name, amountCents: Number(row.amount_cents), credits: Number(row.credits), currency: row.currency, validityDays: row.validity_days, sortOrder: row.sort_order };
}

function mapPayment(row: PaymentRow): WalletPaymentView {
  return {
    id: row.id, walletId: row.wallet_id, userId: row.user_id, planId: row.plan_id, planKey: row.plan_key,
    merchantOrderId: row.merchant_order_id, provider: row.provider, providerTransactionId: row.provider_transaction_id,
    providerOpenOrderId: row.provider_open_order_id, amountCents: Number(row.amount_cents), credits: Number(row.credits),
    currency: row.currency, planNameSnapshot: row.plan_name_snapshot, validityDaysSnapshot: row.validity_days_snapshot,
    expiresAtSnapshot: row.expires_at_snapshot, status: row.status, billingLedgerId: row.billing_ledger_id,
    failureCode: row.failure_code, paidAt: row.paid_at,
    checkoutUrl: typeof row.metadata.checkoutUrl === "string" ? row.metadata.checkoutUrl : null,
    qrCodeUrl: typeof row.metadata.qrCodeUrl === "string" ? row.metadata.qrCodeUrl : null,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

const paymentColumns = `
  id::text, wallet_id::text, user_id::text, plan_id::text, plan_key, merchant_order_id,
  provider, provider_transaction_id, provider_open_order_id, amount_cents::text, credits::text,
  currency, plan_name_snapshot, validity_days_snapshot, expires_at_snapshot::text, status,
  billing_ledger_id::text, failure_code, paid_at::text, metadata, created_at::text, updated_at::text`;

export class WalletPaymentService {
  readonly pool: Pool;
  constructor(options?: { pool?: Pool }) { this.pool = options?.pool ?? createPgPool(); }

  async listActivePlans(context: { userId: string }): Promise<RechargePlanView[]> {
    return withUserTransaction({ userId: context.userId }, async (client) => {
      const result = await client.query<PlanRow>("SELECT id::text, key, name, amount_cents::text, credits::text, currency, validity_days, sort_order FROM app.list_active_billing_recharge_plans()");
      return result.rows.map(mapPlan);
    }, this.pool);
  }

  async createPendingPayment(context: { userId: string }, input: { idempotencyKey: string; merchantOrderId: string; planKey: string }): Promise<WalletPaymentView> {
    return withUserTransaction({ userId: context.userId }, async (client) => {
      try {
        const result = await client.query<PaymentRow>(`SELECT ${paymentColumns} FROM app.create_wallet_payment($1::uuid, $2, $3, $4)`, [context.userId, input.planKey, input.idempotencyKey, input.merchantOrderId]);
        if (!result.rows[0]) throw new WalletPaymentServiceError("PAYMENT_CREATE_FAILED", "Unable to create payment", 500);
        return mapPayment(result.rows[0]);
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message.includes("recharge plan is inactive")) throw new WalletPaymentServiceError("RECHARGE_PLAN_UNAVAILABLE", "Recharge plan is unavailable", 404);
        if (message.includes("idempotency conflict")) throw new WalletPaymentServiceError("PAYMENT_IDEMPOTENCY_CONFLICT", "Payment idempotency key conflicts with an existing order", 409);
        throw error;
      }
    }, this.pool);
  }

  async markCheckoutCreated(input: { paymentId: string; checkoutUrl: string; qrCodeUrl: string }): Promise<WalletPaymentView> {
    const result = await this.pool.query<PaymentRow>(`SELECT ${paymentColumns} FROM app.mark_wallet_payment_checkout($1::uuid, $2, $3)`, [input.paymentId, input.checkoutUrl, input.qrCodeUrl]);
    if (!result.rows[0]) throw new WalletPaymentServiceError("PAYMENT_NOT_FOUND", "Payment not found", 404);
    return mapPayment(result.rows[0]);
  }

  async getUserPayment(context: { userId: string }, paymentId: string): Promise<WalletPaymentView> {
    return withUserTransaction({ userId: context.userId }, async (client) => {
      const result = await client.query<PaymentRow>(`SELECT ${paymentColumns} FROM billing_wallet_payments WHERE id = $1::uuid AND user_id = $2::uuid`, [paymentId, context.userId]);
      if (!result.rows[0]) throw new WalletPaymentServiceError("PAYMENT_NOT_FOUND", "Payment not found", 404);
      return mapPayment(result.rows[0]);
    }, this.pool);
  }

  async applyVerifiedNotification(input: VerifiedXunhuNotification): Promise<{ mutated: boolean; payment: WalletPaymentView }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const transition = await client.query<{ mutated: boolean }>("SELECT app.apply_xunhu_payment_notification($1, $2::bigint, $3, $4, $5, $6::timestamptz) AS mutated", [input.merchantOrderId, input.amountCents, input.providerState, input.transactionId, input.openOrderId, input.eventTime]);
      const payment = await client.query<PaymentRow>(`SELECT ${paymentColumns} FROM app.get_wallet_payment_by_order($1)`, [input.merchantOrderId]);
      if (!payment.rows[0]) throw new WalletPaymentServiceError("PAYMENT_NOT_FOUND", "Payment not found", 404);
      await client.query("COMMIT");
      return { mutated: transition.rows[0]?.mutated ?? false, payment: mapPayment(payment.rows[0]) };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      const message = error instanceof Error ? error.message : "";
      if (message.includes("unknown merchant order")) throw new WalletPaymentServiceError("PAYMENT_NOT_FOUND", "Payment not found", 404);
      if (message.includes("amount mismatch")) throw new WalletPaymentServiceError("PAYMENT_AMOUNT_MISMATCH", "Payment amount does not match the order", 400);
      if (message.includes("incompatible") || message.includes("conflicting")) throw new WalletPaymentServiceError("PAYMENT_STATE_CONFLICT", "Payment notification state conflicts with the order", 409);
      throw error;
    } finally { client.release(); }
  }
}
