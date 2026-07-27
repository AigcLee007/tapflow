import { randomBytes } from "node:crypto";

import { WalletPaymentService, WalletPaymentServiceError, type RechargePlanView, type VerifiedXunhuNotification, type WalletPaymentView } from "@aigc-flow/db";
import type { Pool } from "pg";

import type { ApiEnv } from "../../config/env.js";
import { XunhuClient } from "./xunhu.client.js";

export class PaymentsApiError extends Error {
  constructor(readonly statusCode: number, readonly code: string, message: string) { super(message); this.name = "PaymentsApiError"; }
}

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
      const checkout = await this.xunhu.createCheckout({
        amountCents: pending.amountCents,
        attach: pending.id,
        merchantOrderId: pending.merchantOrderId,
        nonce: randomBytes(16).toString("hex"),
        title: pending.planNameSnapshot,
      });
      return await this.call(() => this.walletPayments.markCheckoutCreated({
        paymentId: pending.id, checkoutUrl: checkout.checkoutUrl, qrCodeUrl: checkout.qrCodeUrl ?? checkout.checkoutUrl,
      }));
    } catch (error) {
      if (error instanceof PaymentsApiError) throw error;
      // The provider may have accepted a timed-out request. Keep this exact order for reconciliation.
      throw new PaymentsApiError(502, "PAYMENT_PROVIDER_UNAVAILABLE", "Unable to create payment checkout");
    }
  }

  async applyNotification(input: VerifiedXunhuNotification): Promise<void> { await this.call(() => this.walletPayments.applyVerifiedNotification(input)); }

  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try { return await fn(); }
    catch (error) {
      if (error instanceof WalletPaymentServiceError) throw new PaymentsApiError(error.statusCode, error.code, error.message);
      throw error;
    }
  }
}
