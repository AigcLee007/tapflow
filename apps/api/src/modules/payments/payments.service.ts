import { randomBytes } from "node:crypto";

import { recordAuditLogWithClient, WalletPaymentService, WalletPaymentServiceError, type AdminRechargePlanView, type AdminWalletPaymentView, type EligibleRefundPayment, type RechargePlanView, type VerifiedXunhuNotification, type WalletPaymentView } from "@aigc-flow/db";
import type { Pool } from "pg";

import type { ApiEnv } from "../../config/env.js";
import { withPlatformTransaction, type PlatformDbContext } from "../../http/platform-transaction.js";
import { XunhuClient } from "./xunhu.client.js";

export class PaymentsApiError extends Error {
  constructor(readonly statusCode: number, readonly code: string, message: string) { super(message); this.name = "PaymentsApiError"; }
}
type PaymentAdminAudit = { action: string; reason?: string; requestId?: string | null; traceId?: string | null; ipHash?: string | null; userAgent?: string | null };

export class PaymentsService {
  readonly walletPayments: WalletPaymentService;
  readonly xunhu: XunhuClient;
  constructor(private readonly env: ApiEnv, options?: { pool?: Pool; xunhu?: XunhuClient; walletPayments?: WalletPaymentService }) {
    this.walletPayments = options?.walletPayments ?? new WalletPaymentService({ pool: options?.pool });
    this.xunhu = options?.xunhu ?? new XunhuClient({ appId: env.xunhuAppId, appSecret: env.xunhuAppSecret, baseUrl: env.xunhuBaseUrl, notifyUrl: env.xunhuNotifyUrl, returnUrl: env.xunhuReturnUrl, timeoutMs: env.xunhuTimeoutMs });
  }
  get appId(): string { return this.env.xunhuAppId; }
  get appSecret(): string { return this.env.xunhuAppSecret; }

  async listPlans(userId: string): Promise<RechargePlanView[]> { return this.call(() => this.walletPayments.listActivePlans({ userId })); }
  async getUserPayment(userId: string, paymentId: string): Promise<WalletPaymentView> { return this.call(() => this.walletPayments.getUserPayment({ userId }, paymentId)); }

  async createCheckout(userId: string, input: { planKey: string; idempotencyKey: string }): Promise<WalletPaymentView> {
    if (!this.env.paymentsEnabled) throw new PaymentsApiError(503, "PAYMENTS_DISABLED", "Payments are not enabled");
    const pending = await this.call(() => this.walletPayments.createPendingPayment({ userId }, {
      idempotencyKey: input.idempotencyKey,
      merchantOrderId: `TF${randomBytes(13).toString("hex").toUpperCase()}`,
      planKey: input.planKey,
    }));
    if (pending.status === "checkout_created") return pending;
    if (pending.status !== "pending") throw new PaymentsApiError(409, "PAYMENT_STATE_CONFLICT", "Payment cannot create a checkout");
    try {
      const returnUrl = new URL(this.env.xunhuReturnUrl);
      returnUrl.searchParams.set("paymentId", pending.id);
      const checkout = await this.xunhu.createCheckout({
        amountCents: pending.amountCents,
        attach: pending.id,
        merchantOrderId: pending.merchantOrderId,
        nonce: randomBytes(16).toString("hex"),
        returnUrl: returnUrl.toString(),
        title: pending.planNameSnapshot,
      });
      return await this.call(() => this.walletPayments.markCheckoutCreated({
        paymentId: pending.id, checkoutUrl: checkout.checkoutUrl, qrCodeUrl: checkout.qrCodeUrl ?? checkout.checkoutUrl,
      }));
    } catch (error) {
      if (error instanceof PaymentsApiError) throw error;
      if (error instanceof TypeError && error.message === "Invalid URL") {
        throw new PaymentsApiError(500, "PAYMENT_RETURN_URL_INVALID", "Payment return URL is misconfigured");
      }
      // The provider may have accepted a timed-out request. Keep this exact order for reconciliation.
      throw new PaymentsApiError(502, "PAYMENT_PROVIDER_UNAVAILABLE", "Unable to create payment checkout");
    }
  }

  async applyNotification(input: VerifiedXunhuNotification): Promise<void> { await this.call(() => this.walletPayments.applyVerifiedNotification(input)); }

  async listAdminPlans(context: PlatformDbContext): Promise<AdminRechargePlanView[]> { return withPlatformTransaction(this.walletPayments.pool, context, "platform:billing:manage", client => this.walletPayments.listAdminPlansWithClient(client)); }
  async createAdminPlan(context: PlatformDbContext, input: { key: string; name: string; amountCents: number; credits: number; validityDays: number; active: boolean; sortOrder: number }, audit: PaymentAdminAudit): Promise<AdminRechargePlanView> {
    return withPlatformTransaction(this.walletPayments.pool, context, "platform:billing:manage", async client => {
      const plan = await this.walletPayments.createAdminPlanWithClient(client, input);
      await recordAuditLogWithClient(client, { action: audit.action, actorType: "user", actorUserId: context.userId, tenantId: null, requestId: audit.requestId, traceId: audit.traceId, ipHash: audit.ipHash, userAgent: audit.userAgent, resourceType: "billing_recharge_plan", resourceId: plan.id, metadata: { reason: audit.reason ?? null, after: { active: plan.active, amountCents: plan.amountCents, credits: plan.credits, key: plan.key, validityDays: plan.validityDays } } });
      return plan;
    });
  }
  async updateAdminPlan(context: PlatformDbContext, planId: string, input: { name: string; amountCents: number; credits: number; validityDays: number; active: boolean; sortOrder: number }, audit: PaymentAdminAudit): Promise<AdminRechargePlanView> {
    return withPlatformTransaction(this.walletPayments.pool, context, "platform:billing:manage", async client => {
      const plan = await this.walletPayments.updateAdminPlanWithClient(client, planId, input);
      await recordAuditLogWithClient(client, { action: audit.action, actorType: "user", actorUserId: context.userId, tenantId: null, requestId: audit.requestId, traceId: audit.traceId, ipHash: audit.ipHash, userAgent: audit.userAgent, resourceType: "billing_recharge_plan", resourceId: plan.id, metadata: { reason: audit.reason ?? null, after: { active: plan.active, amountCents: plan.amountCents, credits: plan.credits, key: plan.key, validityDays: plan.validityDays } } });
      return plan;
    });
  }
  async listAdminPayments(context: PlatformDbContext, input?: { limit?: number; status?: string }): Promise<AdminWalletPaymentView[]> {
    return withPlatformTransaction(this.walletPayments.pool, context, "platform:payments:read", client => this.walletPayments.listAdminPaymentsWithClient(client, input));
  }

  async queryAdminPayment(context: PlatformDbContext, paymentId: string, audit: PaymentAdminAudit): Promise<AdminWalletPaymentView | WalletPaymentView> {
    if (!this.env.paymentsEnabled) throw new PaymentsApiError(503, "PAYMENTS_DISABLED", "Payments are not enabled");
    const payment = await withPlatformTransaction(this.walletPayments.pool, context, "platform:billing:manage", client => this.walletPayments.getAdminPaymentWithClient(client, paymentId));
    const result = await this.xunhu.queryPayment({ merchantOrderId: payment.merchantOrderId, nonce: randomBytes(16).toString("hex") });
    if (result.amountCents !== null && result.amountCents !== payment.amountCents) throw new PaymentsApiError(502, "PAYMENT_PROVIDER_AMOUNT_MISMATCH", "Provider payment amount does not match the order");
    if (result.providerState === "OD" && payment.status === "refund_pending") {
      return withPlatformTransaction(this.walletPayments.pool, context, "platform:billing:manage", async client => {
        const released = await this.walletPayments.releaseRefundPaymentClaimWithClient(client, payment.id, "REFUND_NOT_ACCEPTED");
        await recordAuditLogWithClient(client, { action: `${audit.action}.refund_released`, actorType: "user", actorUserId: context.userId, tenantId: null, requestId: audit.requestId, traceId: audit.traceId, ipHash: audit.ipHash, userAgent: audit.userAgent, resourceType: "billing_wallet_payment", resourceId: paymentId, metadata: { statusBefore: "refund_pending", statusAfter: released.status, providerState: result.providerState } });
        return released;
      });
    }
    if (result.providerState === "WP") {
      return withPlatformTransaction(this.walletPayments.pool, context, "platform:billing:manage", async client => {
        await recordAuditLogWithClient(client, { action: audit.action, actorType: "user", actorUserId: context.userId, tenantId: null, requestId: audit.requestId, traceId: audit.traceId, ipHash: audit.ipHash, userAgent: audit.userAgent, resourceType: "billing_wallet_payment", resourceId: paymentId, metadata: { status: payment.status, providerState: result.providerState } });
        return payment;
      });
    }
    if (result.providerState === "CD" && payment.status !== "refund_pending") {
      return withPlatformTransaction(this.walletPayments.pool, context, "platform:billing:manage", async client => {
        const cancelled = await this.walletPayments.markProviderCancelledWithClient(client, payment.id);
        await recordAuditLogWithClient(client, { action: audit.action, actorType: "user", actorUserId: context.userId, tenantId: null, requestId: audit.requestId, traceId: audit.traceId, ipHash: audit.ipHash, userAgent: audit.userAgent, resourceType: "billing_wallet_payment", resourceId: paymentId, metadata: { status: cancelled.status, providerState: result.providerState } });
        return cancelled;
      });
    }
    const notification: VerifiedXunhuNotification = {
      amountCents: payment.amountCents,
      eventTime: new Date().toISOString(),
      merchantOrderId: payment.merchantOrderId,
      openOrderId: result.openOrderId,
      providerState: asNotificationState(result.providerState),
      transactionId: result.transactionId,
    };
    return withPlatformTransaction(this.walletPayments.pool, context, "platform:billing:manage", async client => {
      const applied = (await this.walletPayments.applyVerifiedNotificationWithClient(client, notification)).payment;
      await recordAuditLogWithClient(client, { action: audit.action, actorType: "user", actorUserId: context.userId, tenantId: null, requestId: audit.requestId, traceId: audit.traceId, ipHash: audit.ipHash, userAgent: audit.userAgent, resourceType: "billing_wallet_payment", resourceId: paymentId, metadata: { status: applied.status, providerState: result.providerState } });
      return applied;
    });
  }

  /** Worker-only reconciliation path. It has no interactive actor; provider state is still applied idempotently. */
  async queryAdminPaymentInternal(paymentId: string): Promise<AdminWalletPaymentView | WalletPaymentView> {
    if (!this.env.paymentsEnabled) throw new PaymentsApiError(503, "PAYMENTS_DISABLED", "Payments are not enabled");
    const payment = await this.call(() => this.walletPayments.getAdminPayment(paymentId));
    const result = await this.xunhu.queryPayment({ merchantOrderId: payment.merchantOrderId, nonce: randomBytes(16).toString("hex") });
    if (result.amountCents !== null && result.amountCents !== payment.amountCents) throw new PaymentsApiError(502, "PAYMENT_PROVIDER_AMOUNT_MISMATCH", "Provider payment amount does not match the order");
    if (result.providerState === "OD" && payment.status === "refund_pending") {
      return this.call(() => this.walletPayments.releaseRefundPaymentClaim(payment.id, "REFUND_NOT_ACCEPTED"));
    }
    if (result.providerState === "WP") return payment;
    if (result.providerState === "CD" && payment.status !== "refund_pending") return this.call(() => this.walletPayments.markProviderCancelled(payment.id));
    return (await this.call(() => this.walletPayments.applyVerifiedNotification({ amountCents: payment.amountCents, eventTime: new Date().toISOString(), merchantOrderId: payment.merchantOrderId, openOrderId: result.openOrderId, providerState: asNotificationState(result.providerState), transactionId: result.transactionId }))).payment;
  }

  async refundAdminPayment(context: PlatformDbContext, paymentId: string, reason: string, audit: PaymentAdminAudit): Promise<WalletPaymentView> {
    if (!this.env.paymentsEnabled) throw new PaymentsApiError(503, "PAYMENTS_DISABLED", "Payments are not enabled");
    const payment: EligibleRefundPayment = await withPlatformTransaction(this.walletPayments.pool, context, "platform:billing:manage", async client => {
      const claimed = await this.walletPayments.claimEligibleRefundPaymentWithClient(client, paymentId);
      await recordAuditLogWithClient(client, { action: `${audit.action}.requested`, actorType: "user", actorUserId: context.userId, tenantId: null, requestId: audit.requestId, traceId: audit.traceId, ipHash: audit.ipHash, userAgent: audit.userAgent, resourceType: "billing_wallet_payment", resourceId: paymentId, metadata: { reason, statusBefore: "paid", statusAfter: "refund_pending" } });
      return claimed;
    });
    let result: Awaited<ReturnType<XunhuClient["refundPayment"]>>;
    try {
      result = await this.xunhu.refundPayment({ merchantOrderId: payment.merchantOrderId, nonce: randomBytes(16).toString("hex"), reason });
    } catch {
      // The provider outcome is unknown. Keep the claim held and let the
      // reconciler query the order before any retry is allowed.
      throw new PaymentsApiError(502, "PAYMENT_PROVIDER_UNAVAILABLE", "Unable to submit refund request");
    }
    if (result.providerState === "OD" || result.providerState === "WP") {
      await withPlatformTransaction(this.walletPayments.pool, context, "platform:billing:manage", async client => {
        const released = await this.walletPayments.releaseRefundPaymentClaimWithClient(client, payment.id, "REFUND_NOT_ACCEPTED");
        await recordAuditLogWithClient(client, { action: `${audit.action}.rejected`, actorType: "user", actorUserId: context.userId, tenantId: null, requestId: audit.requestId, traceId: audit.traceId, ipHash: audit.ipHash, userAgent: audit.userAgent, resourceType: "billing_wallet_payment", resourceId: paymentId, metadata: { reason, statusBefore: "refund_pending", statusAfter: released.status, providerState: result.providerState } });
      });
      throw new PaymentsApiError(502, "PAYMENT_PROVIDER_STATE_INVALID", "Provider did not accept the refund request");
    }
    const notification: VerifiedXunhuNotification = {
      amountCents: payment.amountCents,
      eventTime: new Date().toISOString(),
      merchantOrderId: payment.merchantOrderId,
      openOrderId: result.openOrderId,
      providerState: asNotificationState(result.providerState),
      transactionId: result.transactionId,
    };
    return withPlatformTransaction(this.walletPayments.pool, context, "platform:billing:manage", async client => {
      const applied = (await this.walletPayments.applyVerifiedNotificationWithClient(client, notification)).payment;
      await recordAuditLogWithClient(client, { action: `${audit.action}.completed`, actorType: "user", actorUserId: context.userId, tenantId: null, requestId: audit.requestId, traceId: audit.traceId, ipHash: audit.ipHash, userAgent: audit.userAgent, resourceType: "billing_wallet_payment", resourceId: paymentId, metadata: { reason, status: applied.status, providerState: result.providerState } });
      return applied;
    });
  }

  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try { return await fn(); }
    catch (error) {
      if (error instanceof WalletPaymentServiceError) throw new PaymentsApiError(error.statusCode, error.code, error.message);
      throw error;
    }
  }
}

function asNotificationState(state: "OD" | "CD" | "RD" | "UD" | "WP"): "OD" | "CD" | "RD" | "UD" {
  if (state === "WP") throw new PaymentsApiError(502, "PAYMENT_PROVIDER_STATE_INVALID", "Provider returned a non-terminal payment state");
  return state;
}
