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

export type AdminRechargePlanView = RechargePlanView & { active: boolean; createdAt: string; updatedAt: string };
export type AdminWalletPaymentView = WalletPaymentView & { userEmail: string | null };
export type EligibleRefundPayment = WalletPaymentView & { eligible: boolean };

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

type PlanRow = { id: string; key: string; name: string; amount_cents: string; credits: string; currency: string; validity_days: number; sort_order: number; active?: boolean; created_at?: string; updated_at?: string };
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

function mapAdminPlan(row: PlanRow): AdminRechargePlanView {
  return { ...mapPlan(row), active: row.active ?? false, createdAt: row.created_at ?? "", updatedAt: row.updated_at ?? "" };
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

  async listAdminPlans(): Promise<AdminRechargePlanView[]> {
    return this.withSystemAdminTransaction(async (client) => {
      const result = await client.query<PlanRow>("SELECT id::text, key, name, amount_cents::text, credits::text, currency, validity_days, sort_order, active, created_at::text, updated_at::text FROM billing_recharge_plans ORDER BY sort_order ASC, id ASC");
      return result.rows.map(mapAdminPlan);
    });
  }

  async createAdminPlan(input: { key: string; name: string; amountCents: number; credits: number; validityDays: number; active: boolean; sortOrder: number }): Promise<AdminRechargePlanView> {
    return this.withSystemAdminTransaction(async (client) => {
      try {
        const result = await client.query<PlanRow>("INSERT INTO billing_recharge_plans (key, name, amount_cents, credits, validity_days, active, sort_order) VALUES ($1, $2, $3::bigint, $4::numeric, $5, $6, $7) RETURNING id::text, key, name, amount_cents::text, credits::text, currency, validity_days, sort_order, active, created_at::text, updated_at::text", [input.key, input.name, input.amountCents, input.credits, input.validityDays, input.active, input.sortOrder]);
        if (!result.rows[0]) throw new WalletPaymentServiceError("RECHARGE_PLAN_CREATE_FAILED", "Unable to create recharge plan", 500);
        return mapAdminPlan(result.rows[0]);
      } catch (error) {
        if (isUniqueViolation(error)) throw new WalletPaymentServiceError("RECHARGE_PLAN_KEY_CONFLICT", "Recharge plan key already exists", 409);
        throw error;
      }
    });
  }

  async updateAdminPlan(planId: string, input: { name: string; amountCents: number; credits: number; validityDays: number; active: boolean; sortOrder: number }): Promise<AdminRechargePlanView> {
    return this.withSystemAdminTransaction(async (client) => {
      const result = await client.query<PlanRow>("UPDATE billing_recharge_plans SET name = $2, amount_cents = $3::bigint, credits = $4::numeric, validity_days = $5, active = $6, sort_order = $7, updated_at = now() WHERE id = $1::uuid RETURNING id::text, key, name, amount_cents::text, credits::text, currency, validity_days, sort_order, active, created_at::text, updated_at::text", [planId, input.name, input.amountCents, input.credits, input.validityDays, input.active, input.sortOrder]);
      if (!result.rows[0]) throw new WalletPaymentServiceError("RECHARGE_PLAN_NOT_FOUND", "Recharge plan not found", 404);
      return mapAdminPlan(result.rows[0]);
    });
  }

  async listAdminPayments(input?: { limit?: number; status?: string }): Promise<AdminWalletPaymentView[]> {
    return this.withSystemAdminTransaction(async (client) => {
      const result = await client.query<PaymentRow & { user_email: string | null }>(`SELECT ${paymentColumns}, users.email AS user_email FROM billing_wallet_payments JOIN users ON users.id = billing_wallet_payments.user_id WHERE ($1::text IS NULL OR billing_wallet_payments.status = $1) ORDER BY billing_wallet_payments.created_at DESC, billing_wallet_payments.id DESC LIMIT $2`, [input?.status ?? null, input?.limit ?? 50]);
      return result.rows.map((row) => ({ ...mapPayment(row), userEmail: row.user_email }));
    });
  }

  async getAdminPayment(paymentId: string): Promise<AdminWalletPaymentView> {
    return this.withSystemAdminTransaction(async (client) => {
      const result = await client.query<PaymentRow & { user_email: string | null }>(`SELECT ${paymentColumns}, users.email AS user_email FROM billing_wallet_payments JOIN users ON users.id = billing_wallet_payments.user_id WHERE billing_wallet_payments.id = $1::uuid`, [paymentId]);
      if (!result.rows[0]) throw new WalletPaymentServiceError("PAYMENT_NOT_FOUND", "Payment not found", 404);
      return { ...mapPayment(result.rows[0]), userEmail: result.rows[0].user_email };
    });
  }

  async getEligibleRefundPayment(paymentId: string): Promise<EligibleRefundPayment> {
    return this.withSystemAdminTransaction(async (client) => {
      const result = await client.query<PaymentRow>(`SELECT ${paymentColumns} FROM billing_wallet_payments WHERE id = $1::uuid FOR UPDATE`, [paymentId]);
      const row = result.rows[0];
      if (!row) throw new WalletPaymentServiceError("PAYMENT_NOT_FOUND", "Payment not found", 404);
      const grant = await client.query<{ original_credits: string; remaining_credits: string; reserved_credits: string }>("SELECT original_credits::text, remaining_credits::text, reserved_credits::text FROM billing_wallet_credit_grants WHERE wallet_id = $1::uuid AND source_type = 'payment' AND source_id = $2 FOR UPDATE", [row.wallet_id, row.id]);
      const payment = mapPayment(row);
      const grantRow = grant.rows[0];
      const eligible = payment.status === "paid" && grantRow?.original_credits === grantRow.remaining_credits && Number(grantRow.reserved_credits ?? "1") === 0;
      if (!eligible) throw new WalletPaymentServiceError("PAYMENT_CREDITS_ALREADY_USED", "Payment credits have been used or reserved", 409);
      return { ...payment, eligible };
    });
  }

  async markProviderCancelled(paymentId: string): Promise<WalletPaymentView> {
    return this.withSystemAdminTransaction(async (client) => {
      const result = await client.query<PaymentRow>(`UPDATE billing_wallet_payments
        SET status = 'cancelled', failure_code = 'PROVIDER_CANCELLED', updated_at = now()
        WHERE id = $1::uuid AND status IN ('pending', 'checkout_created')
        RETURNING ${paymentColumns}`,
      [paymentId]);
      if (result.rows[0]) return mapPayment(result.rows[0]);
      const existing = await client.query<PaymentRow>(`SELECT ${paymentColumns} FROM billing_wallet_payments WHERE id = $1::uuid`, [paymentId]);
      if (!existing.rows[0]) throw new WalletPaymentServiceError("PAYMENT_NOT_FOUND", "Payment not found", 404);
      return mapPayment(existing.rows[0]);
    });
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

  private async withSystemAdminTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', '', true)");
      await client.query("SELECT set_config('app.user_id', '', true)");
      await client.query("SELECT set_config('app.is_system_admin', 'true', true)");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally { client.release(); }
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
