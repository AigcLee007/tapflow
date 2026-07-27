import {
  BillingService,
  BillingServiceError,
  createPgPool,
  type BillingLedgerView,
  PersonalWalletService,
  withUserTransaction,
  type UsageEventView,
  type WalletLedgerView,
  type WalletRedeemResultView,
  type WalletSummaryView,
} from "@aigc-flow/db";
import type { Pool } from "pg";

type PgPool = Pool;

type BillingContext = {
  tenantId: string;
  userId: string | null;
};

type PersonalBillingContext = {
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
  readonly personalWalletService: PersonalWalletService;
  readonly pool: PgPool;

  constructor(options?: {
    billingService?: BillingService;
    personalWalletService?: PersonalWalletService;
    pool?: PgPool;
  }) {
    this.pool = options?.pool ?? createPgPool();
    this.billingService = options?.billingService ?? new BillingService({ pool: this.pool });
    this.personalWalletService = options?.personalWalletService ?? new PersonalWalletService({ pool: this.pool });
  }

  async getBillingSummary(context: PersonalBillingContext): Promise<WalletSummaryView> {
    return this.personalWalletService.getSummary({ userId: this.requireUserId(context) });
  }

  async listUsageEvents(
    context: PersonalBillingContext,
    input?: {
      limit?: number;
      page?: number;
    },
  ): Promise<{
    items: UsageEventView[];
    page: number;
    pageSize: number;
  }> {
    const userId = this.requireUserId(context);
    const pageSize = Math.max(1, Math.min(input?.limit ?? 20, 100));
    const page = Math.max(1, input?.page ?? 1);
    const offset = (page - 1) * pageSize;
    return withUserTransaction({ userId }, async (client) => {
      const result = await client.query<UsageEventRow>(
        `
          SELECT
            id::text AS id,
            tenant_id::text AS tenant_id,
            billed_user_id::text AS billed_user_id,
            workflow_run_id::text AS workflow_run_id,
            node_run_id::text AS node_run_id,
            provider_id::text AS provider_id,
            model_id::text AS model_id,
            route_id::text AS route_id,
            event_type,
            modality,
            status,
            idempotency_key,
            input_tokens,
            output_tokens,
            total_tokens,
            units::text AS units,
            unit_type,
            raw_cost::text AS raw_cost,
            billable_cents::text AS billable_cents,
            metadata,
            occurred_at::text AS occurred_at,
            created_at::text AS created_at
          FROM usage_events
          WHERE billed_user_id = $3::uuid
          ORDER BY created_at DESC, id DESC
          LIMIT $1::int
          OFFSET $2::int
        `,
        [pageSize, offset, userId],
      );
      return { items: result.rows.map(mapUsageEvent), page, pageSize };
    }, this.pool);
  }

  async listLedgerEntries(
    context: PersonalBillingContext,
    input?: {
      limit?: number;
      page?: number;
    },
  ): Promise<{
    items: WalletLedgerView[];
    page: number;
    pageSize: number;
  }> {
    return this.personalWalletService.listLedger({ userId: this.requireUserId(context) }, input);
  }

  async redeemCode(
    context: BillingContext,
    input: {
      code: string;
      idempotencyKey?: string;
    },
  ): Promise<WalletRedeemResultView> {
    return this.call(() => this.personalWalletService.redeemCode({
      tenantId: context.tenantId,
      userId: this.requireUserId(context),
    }, input));
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

  private requireUserId(context: PersonalBillingContext): string {
    if (!context.userId) {
      throw new BillingApiError(401, "UNAUTHORIZED", "Authentication is required");
    }
    return context.userId;
  }
}

type UsageEventRow = {
  billed_user_id: string;
  billable_cents: string;
  created_at: string;
  event_type: string;
  id: string;
  idempotency_key: string;
  input_tokens: number | null;
  metadata: Record<string, unknown>;
  modality: string;
  model_id: string | null;
  node_run_id: string | null;
  occurred_at: string;
  output_tokens: number | null;
  provider_id: string | null;
  raw_cost: string | null;
  route_id: string | null;
  status: string;
  tenant_id: string;
  total_tokens: number | null;
  unit_type: string | null;
  units: string | null;
  workflow_run_id: string | null;
};

function mapUsageEvent(row: UsageEventRow): UsageEventView {
  return {
    billedUserId: row.billed_user_id,
    billableCents: Number(row.billable_cents),
    createdAt: row.created_at,
    eventType: row.event_type,
    id: row.id,
    idempotencyKey: row.idempotency_key,
    inputTokens: row.input_tokens,
    metadata: row.metadata ?? {},
    modality: row.modality,
    modelId: row.model_id,
    nodeRunId: row.node_run_id,
    occurredAt: row.occurred_at,
    outputTokens: row.output_tokens,
    providerId: row.provider_id,
    rawCost: row.raw_cost,
    routeId: row.route_id,
    status: row.status,
    tenantId: row.tenant_id,
    totalTokens: row.total_tokens,
    unitType: row.unit_type,
    units: row.units,
    workflowRunId: row.workflow_run_id,
  };
}
