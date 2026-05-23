import {
  BillingService,
  BillingServiceError,
  createPgPool,
  type BillingSummaryView,
  type BillingRedeemResultView,
  type BillingLedgerView,
  type BillingPaymentView,
  type UsageEventView,
} from "@aigc-flow/db";
import type { Pool } from "pg";

type PgPool = Pool;

type BillingContext = {
  tenantId: string;
  userId: string | null;
};

export class BillingApiError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "BillingApiError";
    this.statusCode = statusCode;
  }
}

export class BillingApiService {
  readonly billingService: BillingService;
  readonly pool: PgPool;

  constructor(options?: {
    billingService?: BillingService;
    pool?: PgPool;
  }) {
    this.pool = options?.pool ?? createPgPool();
    this.billingService = options?.billingService ?? new BillingService({ pool: this.pool });
  }

  async getBillingSummary(context: BillingContext): Promise<BillingSummaryView & {
    availableCredits: number;
    balanceCredits: number;
    reservedCredits: number;
    thisMonthUsageCredits: number;
  }> {
    const summary = await this.call(() => this.billingService.getBillingSummary(context));
    return {
      ...summary,
      availableCredits: Math.max(summary.account.balanceCents - summary.account.reservedCents, 0),
      balanceCredits: summary.account.balanceCents,
      reservedCredits: summary.account.reservedCents,
      thisMonthUsageCredits: summary.usageTotals.totalBillableCents,
    };
  }

  async listUsageEvents(
    context: BillingContext,
    input?: {
      limit?: number;
      page?: number;
    },
  ): Promise<{
    items: UsageEventView[];
    page: number;
    pageSize: number;
  }> {
    return this.call(() => this.billingService.listUsageEvents(context, input));
  }

  async listLedgerEntries(
    context: BillingContext,
    input?: {
      limit?: number;
      page?: number;
    },
  ): Promise<{
    items: BillingLedgerView[];
    page: number;
    pageSize: number;
  }> {
    return this.call(() => this.billingService.listLedgerEntries(context, input));
  }

  async redeemCode(
    context: BillingContext,
    input: {
      code: string;
      idempotencyKey?: string;
    },
  ): Promise<BillingRedeemResultView> {
    return this.call(() => this.billingService.redeemCode(context, input));
  }

  async createPaymentCheckout(
    context: BillingContext,
    input: {
      amountCents: number;
      credits: number;
      idempotencyKey: string;
      provider: string;
    },
  ): Promise<{
    checkoutUrl: null;
    payment: BillingPaymentView;
  }> {
    const payment = await this.call(() => this.billingService.createPayment(context, {
      amountCents: input.amountCents,
      credits: input.credits,
      idempotencyKey: input.idempotencyKey,
      metadata: {
        note: "Payment provider integration is not configured in Sprint 5",
      },
      provider: input.provider,
      status: "pending",
    }));

    return {
      checkoutUrl: null,
      payment,
    };
  }

  async adjustBillingAccount(
    context: BillingContext,
    input: {
      amountCents: number;
      direction: "credit" | "debit";
      idempotencyKey: string;
      note?: string;
    },
  ): Promise<BillingLedgerView> {
    const payload = {
      amountCents: input.amountCents,
      description: input.note ?? `Admin ${input.direction}`,
      entryType: input.direction === "credit" ? "admin_credit" : "admin_debit",
      idempotencyKey: input.idempotencyKey,
      metadata: {
        adjustedByUserId: context.userId,
        note: input.note ?? null,
      },
    };

    return this.call(() => (
      input.direction === "credit"
        ? this.billingService.creditAccount(context, payload)
        : this.billingService.debitAccount(context, payload)
    ));
  }

  async listPricing(context: BillingContext): Promise<Array<{
    active: boolean;
    id: string;
    minChargeCredits: number;
    model: string;
    provider: string;
    route: string;
    unit: string;
    unitCredits: number;
  }>> {
    const pricing = await this.call(() => this.billingService.listModelPricing(context));
    return pricing.map((item) => ({
      active: item.active,
      id: item.id,
      minChargeCredits: item.minChargeCredits,
      model: item.model,
      provider: item.provider,
      route: item.route,
      unit: item.unit,
      unitCredits: item.unitCredits,
    }));
  }

  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof BillingServiceError) {
        throw new BillingApiError(error.statusCode, error.code, error.message);
      }

      throw error;
    }
  }
}
