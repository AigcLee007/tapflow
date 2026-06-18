import { createHash } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import { createPgPool } from "./db.js";
import { withTenantTransaction, type TenantDbContext } from "./transaction.js";

export type BillingAccountRecord = {
  balance_cents: string;
  created_at: string;
  currency: string;
  id: string;
  metadata: Record<string, unknown>;
  membership_tier: string;
  membership_tier_expires_at: string | null;
  membership_tier_source: string;
  reserved_cents: string;
  status: string;
  tenant_id: string;
  updated_at: string;
};

export type UsageEventRecord = {
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

export type BillingLedgerRecord = {
  amount_cents: string;
  billing_account_id: string;
  created_at: string;
  currency: string;
  description: string | null;
  entry_type: string;
  id: string;
  idempotency_key: string;
  metadata: Record<string, unknown>;
  tenant_id: string;
  usage_event_id: string | null;
};

export type BillingAccountView = {
  balanceCents: number;
  createdAt: string;
  currency: string;
  id: string;
  metadata: Record<string, unknown>;
  membershipTier: MembershipTier;
  membershipTierExpiresAt: string | null;
  membershipTierSource: string;
  reservedCents: number;
  status: string;
  tenantId: string;
  updatedAt: string;
};

export type UsageEventView = {
  billableCents: number;
  createdAt: string;
  eventType: string;
  id: string;
  idempotencyKey: string;
  inputTokens: number | null;
  metadata: Record<string, unknown>;
  modality: string;
  modelId: string | null;
  nodeRunId: string | null;
  occurredAt: string;
  outputTokens: number | null;
  providerId: string | null;
  rawCost: string | null;
  routeId: string | null;
  status: string;
  tenantId: string;
  totalTokens: number | null;
  unitType: string | null;
  units: string | null;
  workflowRunId: string | null;
};

export type BillingLedgerView = {
  amountCents: number;
  billingAccountId: string;
  createdAt: string;
  currency: string;
  description: string | null;
  entryType: string;
  id: string;
  idempotencyKey: string;
  metadata: Record<string, unknown>;
  tenantId: string;
  usageEventId: string | null;
};

export type BillingSummaryView = {
  account: BillingAccountView;
  creditGrants: {
    availableCredits: number;
    expiringSoonCredits: number;
    lifetimeCredits: number;
    reservedCredits: number;
  };
  ledgerTotals: {
    refundCents: number;
    reserveCents: number;
    settleCents: number;
  };
  membership: {
    discountMultiplier: number;
    tier: MembershipTier;
  };
  usageTotals: {
    eventCount: number;
    pendingCount: number;
    rawCostTotal: string;
    settledCount: number;
    totalBillableCents: number;
  };
};

export type BillingRedeemResultView = {
  account: BillingAccountView;
  credits: number;
  ledgerEntry: BillingLedgerView;
  redemptionId: string;
};

export type BillingPaymentView = {
  amountCents: number;
  billingLedgerId: string | null;
  createdAt: string;
  credits: number;
  currency: string;
  id: string;
  idempotencyKey: string;
  metadata: Record<string, unknown>;
  provider: string;
  providerPaymentId: string | null;
  status: string;
  tenantId: string;
  updatedAt: string;
  userId: string | null;
};

export type ModelPricingView = {
  active: boolean;
  createdAt: string;
  id: string;
  metadata: Record<string, unknown>;
  minChargeCredits: number;
  model: string;
  provider: string;
  route: string;
  unit: string;
  unitCredits: number;
};

type BillingPaymentRecord = {
  amount_cents: string;
  billing_ledger_id: string | null;
  created_at: string;
  credits: string;
  currency: string;
  id: string;
  idempotency_key: string;
  metadata: Record<string, unknown>;
  provider: string;
  provider_payment_id: string | null;
  status: string;
  tenant_id: string;
  updated_at: string;
  user_id: string | null;
};

export type UsageEventInput = {
  billableCents?: number;
  eventType: string;
  idempotencyKey: string;
  inputTokens?: number | null;
  metadata?: Record<string, unknown>;
  modality: string;
  modelId?: string | null;
  nodeRunId?: string | null;
  occurredAt?: string | null;
  outputTokens?: number | null;
  providerId?: string | null;
  rawCost?: string | number | null;
  routeId?: string | null;
  status?: string;
  totalTokens?: number | null;
  unitType?: string | null;
  units?: string | number | null;
  workflowRunId?: string | null;
};

export type ReserveUsageInput = {
  amountCents: number;
  currency?: string | null;
  description?: string | null;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
};

export type SettleUsageInput = {
  amountCents: number;
  currency?: string | null;
  description?: string | null;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
  reservedAmountCents?: number;
  usageEventId: string;
};

export type RefundUsageInput = {
  amountCents: number;
  currency?: string | null;
  description?: string | null;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
  usageEventId?: string | null;
};

export type RedeemCodeInput = {
  code: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
};

export type CreditAccountInput = {
  amountCents: number;
  description?: string | null;
  entryType: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
};

export type DebitAccountInput = CreditAccountInput;

export type CreatePaymentInput = {
  amountCents: number;
  credits: number;
  currency?: string | null;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
  provider: string;
  providerPaymentId?: string | null;
  status?: string;
};

export type BillingListOptions = {
  limit?: number;
  page?: number;
};

export class BillingServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "BillingServiceError";
    this.statusCode = statusCode;
  }
}

export type MembershipTier = "standard" | "silver" | "gold" | "platinum";

export type MembershipDiscount = {
  multiplier: number;
  tier: MembershipTier;
};

function parseNumericString(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function resolveMembershipDiscount(value: string | null | undefined): MembershipDiscount {
  if (value === "silver") {
    return { multiplier: 0.95, tier: "silver" };
  }
  if (value === "gold") {
    return { multiplier: 0.9, tier: "gold" };
  }
  if (value === "platinum") {
    return { multiplier: 0.8, tier: "platinum" };
  }
  return { multiplier: 1, tier: "standard" };
}

export function applyMembershipDiscount(amountCredits: number, discount: MembershipDiscount): number {
  const discounted = amountCredits * discount.multiplier;
  return Math.round(discounted * 10_000) / 10_000;
}

function normalizeDecimalValue(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return value.toString();
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

export function hashBillingRedeemCode(code: string): string {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

function mapBillingAccount(row: BillingAccountRecord): BillingAccountView {
  return {
    balanceCents: parseNumericString(row.balance_cents),
    createdAt: row.created_at,
    currency: row.currency,
    id: row.id,
    metadata: row.metadata ?? {},
    membershipTier: resolveMembershipDiscount(row.membership_tier).tier,
    membershipTierExpiresAt: row.membership_tier_expires_at,
    membershipTierSource: row.membership_tier_source,
    reservedCents: parseNumericString(row.reserved_cents),
    status: row.status,
    tenantId: row.tenant_id,
    updatedAt: row.updated_at,
  };
}

function mapUsageEvent(row: UsageEventRecord): UsageEventView {
  return {
    billableCents: parseNumericString(row.billable_cents),
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

function mapLedgerEntry(row: BillingLedgerRecord): BillingLedgerView {
  return {
    amountCents: parseNumericString(row.amount_cents),
    billingAccountId: row.billing_account_id,
    createdAt: row.created_at,
    currency: row.currency,
    description: row.description,
    entryType: row.entry_type,
    id: row.id,
    idempotencyKey: row.idempotency_key,
    metadata: row.metadata ?? {},
    tenantId: row.tenant_id,
    usageEventId: row.usage_event_id,
  };
}

function mapPayment(row: {
  amount_cents: string;
  billing_ledger_id: string | null;
  created_at: string;
  credits: string;
  currency: string;
  id: string;
  idempotency_key: string;
  metadata: Record<string, unknown>;
  provider: string;
  provider_payment_id: string | null;
  status: string;
  tenant_id: string;
  updated_at: string;
  user_id: string | null;
}): BillingPaymentView {
  return {
    amountCents: parseNumericString(row.amount_cents),
    billingLedgerId: row.billing_ledger_id,
    createdAt: row.created_at,
    credits: parseNumericString(row.credits),
    currency: row.currency,
    id: row.id,
    idempotencyKey: row.idempotency_key,
    metadata: row.metadata ?? {},
    provider: row.provider,
    providerPaymentId: row.provider_payment_id,
    status: row.status,
    tenantId: row.tenant_id,
    updatedAt: row.updated_at,
    userId: row.user_id,
  };
}

function mapPricing(row: {
  active: boolean;
  created_at: string;
  id: string;
  metadata: Record<string, unknown>;
  min_charge_credits: string;
  model: string;
  provider: string;
  route: string;
  unit: string;
  unit_credits: string;
}): ModelPricingView {
  return {
    active: row.active,
    createdAt: row.created_at,
    id: row.id,
    metadata: row.metadata ?? {},
    minChargeCredits: parseNumericString(row.min_charge_credits),
    model: row.model,
    provider: row.provider,
    route: row.route,
    unit: row.unit,
    unitCredits: parseNumericString(row.unit_credits),
  };
}

type UsageEventConflictComparable = Pick<
  UsageEventInput,
  "billableCents" | "eventType" | "modality" | "nodeRunId" | "workflowRunId"
>;

type LedgerConflictComparable = {
  amountCents: number;
  entryType: string;
  usageEventId: string | null;
};

type CreditGrantAllocation = {
  amountCredits: number;
  grantId: string;
};

function assertUsageEventConflictSafe(
  existing: UsageEventView,
  input: UsageEventConflictComparable,
): void {
  if (
    existing.eventType !== input.eventType ||
    existing.modality !== input.modality ||
    existing.workflowRunId !== (input.workflowRunId ?? null) ||
    existing.nodeRunId !== (input.nodeRunId ?? null) ||
    existing.billableCents !== (input.billableCents ?? 0)
  ) {
    throw new BillingServiceError(
      409,
      "USAGE_EVENT_IDEMPOTENCY_CONFLICT",
      "The usage event idempotency key was reused with different billing data",
    );
  }
}

function assertLedgerConflictSafe(
  existing: BillingLedgerView,
  input: LedgerConflictComparable,
): void {
  if (
    existing.entryType !== input.entryType ||
    existing.amountCents !== input.amountCents ||
    existing.usageEventId !== input.usageEventId
  ) {
    throw new BillingServiceError(
      409,
      "LEDGER_IDEMPOTENCY_CONFLICT",
      "The billing ledger idempotency key was reused with different settlement data",
    );
  }
}

function assertPaymentConflictSafe(
  existing: BillingPaymentView,
  input: CreatePaymentInput,
): void {
  if (
    existing.amountCents !== input.amountCents ||
    existing.credits !== input.credits ||
    existing.provider !== input.provider ||
    existing.providerPaymentId !== (input.providerPaymentId ?? null) ||
    existing.status !== (input.status ?? "pending")
  ) {
    throw new BillingServiceError(
      409,
      "PAYMENT_IDEMPOTENCY_CONFLICT",
      "The payment idempotency key was reused with different payment data",
    );
  }
}

export class BillingService {
  readonly pool: Pool;

  constructor(options?: { pool?: Pool }) {
    this.pool = options?.pool ?? createPgPool();
  }

  async getOrCreateBillingAccount(
    context: TenantDbContext,
    tenantId = context.tenantId,
  ): Promise<BillingAccountView> {
    return withTenantTransaction(context, async (client) => {
      return this.getOrCreateBillingAccountInTransaction(client, tenantId);
    }, this.pool);
  }

  async getOrCreateBillingAccountWithClient(
    client: PoolClient,
    tenantId: string,
  ): Promise<BillingAccountView> {
    return this.getOrCreateBillingAccountInTransaction(client, tenantId);
  }

  async recordUsageEvent(
    context: TenantDbContext,
    input: UsageEventInput,
  ): Promise<UsageEventView> {
    return withTenantTransaction(context, async (client) => {
      return this.recordUsageEventInTransaction(client, context.tenantId, input);
    }, this.pool);
  }

  async recordUsageEventWithClient(
    client: PoolClient,
    tenantId: string,
    input: UsageEventInput,
  ): Promise<UsageEventView> {
    return this.recordUsageEventInTransaction(client, tenantId, input);
  }

  async reserveUsage(
    context: TenantDbContext,
    input: ReserveUsageInput,
  ): Promise<BillingLedgerView> {
    return withTenantTransaction(context, async (client) => {
      return this.reserveUsageWithClient(client, context.tenantId, input);
    }, this.pool);
  }

  async reserveUsageWithClient(
    client: PoolClient,
    tenantId: string,
    input: ReserveUsageInput,
  ): Promise<BillingLedgerView> {
    const account = await this.getOrCreateBillingAccountForUpdateInTransaction(client, tenantId);
    const allocations = await this.allocateCreditGrantsForReserve(client, tenantId, input.amountCents);
    return this.createLedgerEntryInTransaction(client, {
      amountCents: input.amountCents,
      applyAccountMutation: async (ledgerEntry) => {
        await client.query(
          `
            UPDATE billing_accounts
            SET
              reserved_cents = reserved_cents + $2::numeric,
              updated_at = now()
            WHERE id = $1::uuid
          `,
          [account.id, input.amountCents],
        );
        await this.createCreditReservationsForLedger(client, {
          allocations,
          ledgerId: ledgerEntry.id,
          tenantId,
        });
      },
      billingAccountId: account.id,
      currency: input.currency ?? account.currency,
      description: input.description ?? null,
      entryType: "reserve",
      idempotencyKey: input.idempotencyKey,
      metadata: {
        ...(input.metadata ?? {}),
        creditGrantAllocations: allocations,
      },
      tenantId,
      usageEventId: null,
    });
  }

  async settleUsage(
    context: TenantDbContext,
    input: SettleUsageInput,
  ): Promise<BillingLedgerView> {
    return withTenantTransaction(context, async (client) => {
      return this.settleUsageWithClient(client, context.tenantId, input);
    }, this.pool);
  }

  async settleUsageWithClient(
    client: PoolClient,
    tenantId: string,
    input: SettleUsageInput,
  ): Promise<BillingLedgerView> {
    const account = await this.getOrCreateBillingAccountInTransaction(client, tenantId);
    const usageEvent = await this.getUsageEventOrThrow(client, input.usageEventId);

    return this.createLedgerEntryInTransaction(client, {
      amountCents: input.amountCents,
      applyAccountMutation: async () => {
        await client.query(
          `
            UPDATE billing_accounts
            SET
              balance_cents = balance_cents - $2::numeric,
              reserved_cents = GREATEST(reserved_cents - $3::numeric, 0),
              updated_at = now()
            WHERE id = $1::uuid
          `,
          [account.id, input.amountCents, input.reservedAmountCents ?? 0],
        );

        await client.query(
          `
            UPDATE usage_events
            SET
              status = 'settled',
              billable_cents = $2::numeric
            WHERE id = $1::uuid
          `,
          [usageEvent.id, input.amountCents],
        );
        await this.settleCreditReservations(client, tenantId, {
          reserveLedgerId: this.resolveReserveLedgerId(input.metadata),
          usageEventId: usageEvent.id,
        });
      },
      billingAccountId: account.id,
      currency: input.currency ?? account.currency,
      description: input.description ?? null,
      entryType: "settle",
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata ?? {},
      tenantId,
      usageEventId: usageEvent.id,
    });
  }

  async refundUsage(
    context: TenantDbContext,
    input: RefundUsageInput,
  ): Promise<BillingLedgerView> {
    return withTenantTransaction(context, async (client) => {
      return this.refundUsageWithClient(client, context.tenantId, input);
    }, this.pool);
  }

  async refundUsageWithClient(
    client: PoolClient,
    tenantId: string,
    input: RefundUsageInput,
  ): Promise<BillingLedgerView> {
    const account = await this.getOrCreateBillingAccountInTransaction(client, tenantId);
    const usageEventId = input.usageEventId ?? null;
    if (usageEventId) {
      await this.getUsageEventOrThrow(client, usageEventId);
    }

    return this.createLedgerEntryInTransaction(client, {
      amountCents: input.amountCents,
      applyAccountMutation: async () => {
        await client.query(
          `
            UPDATE billing_accounts
            SET
              reserved_cents = GREATEST(reserved_cents - $2::numeric, 0),
              updated_at = now()
            WHERE id = $1::uuid
          `,
          [account.id, input.amountCents],
        );
      },
      billingAccountId: account.id,
      currency: input.currency ?? account.currency,
      description: input.description ?? null,
      entryType: "refund",
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata ?? {},
      tenantId,
      usageEventId,
    });
  }

  async getBillingSummary(
    context: TenantDbContext,
  ): Promise<BillingSummaryView> {
    return withTenantTransaction(context, async (client) => {
      const account = await this.getOrCreateBillingAccountInTransaction(client, context.tenantId);
      const usageTotalsResult = await client.query<{
        event_count: number;
        pending_count: number;
        raw_cost_total: string | null;
        settled_count: number;
        total_billable_cents: string;
      }>(
        `
          SELECT
            COUNT(*)::int AS event_count,
            COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_count,
            COUNT(*) FILTER (WHERE status = 'settled')::int AS settled_count,
            COALESCE(SUM(billable_cents), 0)::text AS total_billable_cents,
            COALESCE(SUM(raw_cost), 0)::text AS raw_cost_total
          FROM usage_events
          WHERE tenant_id = $1::uuid
        `,
        [context.tenantId],
      );
      const ledgerTotalsResult = await client.query<{
        refund_cents: string;
        reserve_cents: string;
        settle_cents: string;
      }>(
        `
          SELECT
            COALESCE(SUM(CASE WHEN entry_type = 'reserve' THEN amount_cents ELSE 0 END), 0)::text AS reserve_cents,
            COALESCE(SUM(CASE WHEN entry_type = 'settle' THEN amount_cents ELSE 0 END), 0)::text AS settle_cents,
            COALESCE(SUM(CASE WHEN entry_type = 'refund' THEN amount_cents ELSE 0 END), 0)::text AS refund_cents
          FROM billing_ledger
          WHERE tenant_id = $1::uuid
        `,
        [context.tenantId],
      );
      const creditGrantTotalsResult = await client.query<{
        available_credits: string;
        expiring_soon_credits: string;
        lifetime_credits: string;
        reserved_credits: string;
      }>(
        `
          SELECT
            COALESCE(SUM(GREATEST(remaining_credits - reserved_credits, 0))
              FILTER (WHERE status = 'active' AND (expires_at IS NULL OR expires_at > now())), 0)::text AS available_credits,
            COALESCE(SUM(reserved_credits)
              FILTER (WHERE status = 'active' AND (expires_at IS NULL OR expires_at > now())), 0)::text AS reserved_credits,
            COALESCE(SUM(GREATEST(remaining_credits - reserved_credits, 0))
              FILTER (WHERE status = 'active' AND expires_at > now() AND expires_at <= now() + interval '30 days'), 0)::text AS expiring_soon_credits,
            COALESCE(SUM(GREATEST(remaining_credits - reserved_credits, 0))
              FILTER (WHERE status = 'active' AND expires_at IS NULL), 0)::text AS lifetime_credits
          FROM billing_credit_grants
          WHERE tenant_id = $1::uuid
        `,
        [context.tenantId],
      );

      const usageTotals = usageTotalsResult.rows[0];
      const ledgerTotals = ledgerTotalsResult.rows[0];
      const creditGrantTotals = creditGrantTotalsResult.rows[0];
      const membership = resolveMembershipDiscount(account.membershipTier);

      return {
        account,
        creditGrants: {
          availableCredits: parseNumericString(creditGrantTotals?.available_credits ?? "0"),
          expiringSoonCredits: parseNumericString(creditGrantTotals?.expiring_soon_credits ?? "0"),
          lifetimeCredits: parseNumericString(creditGrantTotals?.lifetime_credits ?? "0"),
          reservedCredits: parseNumericString(creditGrantTotals?.reserved_credits ?? "0"),
        },
        ledgerTotals: {
          refundCents: parseNumericString(ledgerTotals?.refund_cents ?? "0"),
          reserveCents: parseNumericString(ledgerTotals?.reserve_cents ?? "0"),
          settleCents: parseNumericString(ledgerTotals?.settle_cents ?? "0"),
        },
        membership: {
          discountMultiplier: membership.multiplier,
          tier: membership.tier,
        },
        usageTotals: {
          eventCount: usageTotals?.event_count ?? 0,
          pendingCount: usageTotals?.pending_count ?? 0,
          rawCostTotal: usageTotals?.raw_cost_total ?? "0",
          settledCount: usageTotals?.settled_count ?? 0,
          totalBillableCents: parseNumericString(usageTotals?.total_billable_cents ?? "0"),
        },
      };
    }, this.pool);
  }

  async redeemCode(
    context: TenantDbContext,
    input: RedeemCodeInput,
  ): Promise<BillingRedeemResultView> {
    return withTenantTransaction(context, async (client) => {
      const normalizedCode = input.code.trim().toUpperCase();
      if (!normalizedCode) {
        throw new BillingServiceError(400, "REDEEM_CODE_REQUIRED", "Redeem code is required");
      }

      const codeHash = hashBillingRedeemCode(normalizedCode);
      const idempotencyKey = input.idempotencyKey ?? `redeem:${context.tenantId}:${codeHash}`;
      const existingRedemption = await client.query<{
        billing_ledger_id: string;
        credits: string;
        id: string;
      }>(
        `
          SELECT
            billing_redeem_code_redemptions.id::text AS id,
            billing_redeem_code_redemptions.billing_ledger_id::text AS billing_ledger_id,
            billing_redeem_codes.credits::text AS credits
          FROM billing_redeem_code_redemptions
          JOIN billing_redeem_codes
            ON billing_redeem_codes.id = billing_redeem_code_redemptions.redeem_code_id
          WHERE billing_redeem_code_redemptions.tenant_id = $1::uuid
            AND billing_redeem_code_redemptions.idempotency_key = $2
          LIMIT 1
        `,
        [context.tenantId, idempotencyKey],
      );

      if (existingRedemption.rows[0]) {
        const ledgerEntry = await this.getLedgerEntryOrThrow(client, existingRedemption.rows[0].billing_ledger_id);
        const account = await this.getOrCreateBillingAccountInTransaction(client, context.tenantId);
        return {
          account,
          credits: parseNumericString(existingRedemption.rows[0].credits),
          ledgerEntry,
          redemptionId: existingRedemption.rows[0].id,
        };
      }

      const codeResult = await client.query<{
        credits: string;
        expires_at: string | null;
        id: string;
        max_redemptions: number;
        redeemed_count: number;
        status: string;
        tenant_id: string | null;
      }>(
        `
          SELECT
            id::text AS id,
            tenant_id::text AS tenant_id,
            credits::text AS credits,
            status,
            max_redemptions,
            redeemed_count,
            expires_at::text AS expires_at
          FROM billing_redeem_codes
          WHERE code_hash = $1
            AND (tenant_id IS NULL OR tenant_id = $2::uuid)
          FOR UPDATE
          LIMIT 1
        `,
        [codeHash, context.tenantId],
      );
      const redeemCode = codeResult.rows[0];
      if (!redeemCode) {
        throw new BillingServiceError(404, "REDEEM_CODE_NOT_FOUND", "Redeem code not found");
      }
      if (redeemCode.status !== "active") {
        throw new BillingServiceError(409, "REDEEM_CODE_INACTIVE", "Redeem code is not active");
      }
      if (redeemCode.expires_at && new Date(redeemCode.expires_at).getTime() < Date.now()) {
        throw new BillingServiceError(409, "REDEEM_CODE_EXPIRED", "Redeem code has expired");
      }
      if (redeemCode.redeemed_count >= redeemCode.max_redemptions) {
        throw new BillingServiceError(409, "REDEEM_CODE_EXHAUSTED", "Redeem code has already been fully redeemed");
      }
      if (context.userId) {
        const priorRedemption = await client.query<{ id: string }>(
          `
            SELECT id::text AS id
            FROM billing_redeem_code_redemptions
            WHERE tenant_id = $1::uuid
              AND redeem_code_id = $2::uuid
              AND user_id = $3::uuid
            LIMIT 1
          `,
          [context.tenantId, redeemCode.id, context.userId],
        );
        if (priorRedemption.rows[0]) {
          throw new BillingServiceError(409, "REDEEM_CODE_ALREADY_REDEEMED", "Redeem code has already been redeemed by this user");
        }
      }

      const credits = parseNumericString(redeemCode.credits);
      const ledgerEntry = await this.creditAccountWithClient(client, context.tenantId, {
        amountCents: credits,
        description: "Redeem code credit",
        entryType: "redeem",
        idempotencyKey,
        metadata: {
          ...(input.metadata ?? {}),
          codeHash,
          redeemCodeId: redeemCode.id,
        },
      });

      const redemption = await client.query<{ id: string }>(
        `
          INSERT INTO billing_redeem_code_redemptions (
            redeem_code_id,
            tenant_id,
            user_id,
            billing_ledger_id,
            idempotency_key
          )
          VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5)
          RETURNING id::text AS id
        `,
        [
          redeemCode.id,
          context.tenantId,
          context.userId,
          ledgerEntry.id,
          idempotencyKey,
        ],
      );

      await client.query(
        `
          UPDATE billing_redeem_codes
          SET redeemed_count = redeemed_count + 1
          WHERE id = $1::uuid
        `,
        [redeemCode.id],
      );

      const account = await this.getOrCreateBillingAccountInTransaction(client, context.tenantId);
      return {
        account,
        credits,
        ledgerEntry,
        redemptionId: redemption.rows[0].id,
      };
    }, this.pool);
  }

  async creditAccount(
    context: TenantDbContext,
    input: CreditAccountInput,
  ): Promise<BillingLedgerView> {
    return withTenantTransaction(context, async (client) => {
      return this.creditAccountWithClient(client, context.tenantId, input);
    }, this.pool);
  }

  async debitAccount(
    context: TenantDbContext,
    input: DebitAccountInput,
  ): Promise<BillingLedgerView> {
    return withTenantTransaction(context, async (client) => {
      return this.debitAccountWithClient(client, context.tenantId, input);
    }, this.pool);
  }

  async createPayment(
    context: TenantDbContext,
    input: CreatePaymentInput,
  ): Promise<BillingPaymentView> {
    return withTenantTransaction(context, async (client) => {
      const inserted = await client.query<BillingPaymentRecord>(
        `
          INSERT INTO billing_payments (
            tenant_id,
            user_id,
            provider,
            provider_payment_id,
            amount_cents,
            credits,
            currency,
            status,
            idempotency_key,
            metadata,
            updated_at
          )
          VALUES (
            $1::uuid,
            $2::uuid,
            $3,
            $4,
            $5::numeric,
            $6::numeric,
            COALESCE($7, 'USD'),
            COALESCE($8, 'pending'),
            $9,
            $10::jsonb,
            now()
          )
          ON CONFLICT (tenant_id, idempotency_key) DO UPDATE
          SET updated_at = billing_payments.updated_at
          RETURNING
            id::text AS id,
            tenant_id::text AS tenant_id,
            user_id::text AS user_id,
            provider,
            provider_payment_id,
            amount_cents::text AS amount_cents,
            credits::text AS credits,
            currency,
            status,
            billing_ledger_id::text AS billing_ledger_id,
            idempotency_key,
            metadata,
            created_at::text AS created_at,
            updated_at::text AS updated_at
        `,
        [
          context.tenantId,
          context.userId,
          input.provider,
          input.providerPaymentId ?? null,
          input.amountCents,
          input.credits,
          input.currency ?? null,
          input.status ?? "pending",
          input.idempotencyKey,
          JSON.stringify(input.metadata ?? {}),
        ],
      );

      const payment = mapPayment(inserted.rows[0]);
      assertPaymentConflictSafe(payment, input);
      return payment;
    }, this.pool);
  }

  async listModelPricing(context: TenantDbContext): Promise<ModelPricingView[]> {
    return withTenantTransaction(context, async (client) => {
      const result = await client.query(
        `
          SELECT
            id::text AS id,
            provider,
            model,
            route,
            unit,
            unit_credits::text AS unit_credits,
            min_charge_credits::text AS min_charge_credits,
            metadata,
            active,
            created_at::text AS created_at
          FROM model_pricing
          WHERE active = true
          ORDER BY provider ASC, model ASC, route ASC, unit ASC
        `,
      );

      return result.rows.map(mapPricing);
    }, this.pool);
  }

  async listUsageEvents(
    context: TenantDbContext,
    options?: BillingListOptions,
  ): Promise<{
    items: UsageEventView[];
    page: number;
    pageSize: number;
  }> {
    return withTenantTransaction(context, async (client) => {
      const pageSize = Math.max(1, Math.min(options?.limit ?? 20, 100));
      const page = Math.max(1, options?.page ?? 1);
      const offset = (page - 1) * pageSize;
      const result = await client.query<UsageEventRecord>(
        `
          SELECT
            id::text AS id,
            tenant_id::text AS tenant_id,
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
          WHERE tenant_id = $3::uuid
          ORDER BY created_at DESC, id DESC
          LIMIT $1::int
          OFFSET $2::int
        `,
        [pageSize, offset, context.tenantId],
      );

      return {
        items: result.rows.map(mapUsageEvent),
        page,
        pageSize,
      };
    }, this.pool);
  }

  async listLedgerEntries(
    context: TenantDbContext,
    options?: BillingListOptions,
  ): Promise<{
    items: BillingLedgerView[];
    page: number;
    pageSize: number;
  }> {
    return withTenantTransaction(context, async (client) => {
      const pageSize = Math.max(1, Math.min(options?.limit ?? 20, 100));
      const page = Math.max(1, options?.page ?? 1);
      const offset = (page - 1) * pageSize;
      const result = await client.query<BillingLedgerRecord>(
        `
          SELECT
            id::text AS id,
            tenant_id::text AS tenant_id,
            billing_account_id::text AS billing_account_id,
            usage_event_id::text AS usage_event_id,
            entry_type,
            amount_cents::text AS amount_cents,
            currency,
            idempotency_key,
            description,
            metadata,
            created_at::text AS created_at
          FROM billing_ledger
          WHERE tenant_id = $3::uuid
          ORDER BY created_at DESC, id DESC
          LIMIT $1::int
          OFFSET $2::int
        `,
        [pageSize, offset, context.tenantId],
      );

      return {
        items: result.rows.map(mapLedgerEntry),
        page,
        pageSize,
      };
    }, this.pool);
  }

  private async getOrCreateBillingAccountInTransaction(
    client: PoolClient,
    tenantId: string,
  ): Promise<BillingAccountView> {
    const inserted = await client.query<BillingAccountRecord>(
      `
        INSERT INTO billing_accounts (tenant_id, updated_at)
        VALUES ($1::uuid, now())
        ON CONFLICT (tenant_id) DO NOTHING
        RETURNING
          id::text AS id,
          tenant_id::text AS tenant_id,
          currency,
          balance_cents::text AS balance_cents,
          reserved_cents::text AS reserved_cents,
          membership_tier,
          membership_tier_source,
          membership_tier_expires_at::text AS membership_tier_expires_at,
          status,
          metadata,
          created_at::text AS created_at,
          updated_at::text AS updated_at
      `,
      [tenantId],
    );

    if (inserted.rows[0]) {
      return mapBillingAccount(inserted.rows[0]);
    }

    const existing = await client.query<BillingAccountRecord>(
      `
        SELECT
          id::text AS id,
          tenant_id::text AS tenant_id,
          currency,
          balance_cents::text AS balance_cents,
          reserved_cents::text AS reserved_cents,
          membership_tier,
          membership_tier_source,
          membership_tier_expires_at::text AS membership_tier_expires_at,
          status,
          metadata,
          created_at::text AS created_at,
          updated_at::text AS updated_at
        FROM billing_accounts
        WHERE tenant_id = $1::uuid
        LIMIT 1
      `,
      [tenantId],
    );

    const row = existing.rows[0];
    if (!row) {
      throw new BillingServiceError(500, "BILLING_ACCOUNT_CREATE_FAILED", "Unable to load billing account");
    }

    return mapBillingAccount(row);
  }

  private async getOrCreateBillingAccountForUpdateInTransaction(
    client: PoolClient,
    tenantId: string,
  ): Promise<BillingAccountView> {
    await this.getOrCreateBillingAccountInTransaction(client, tenantId);
    const locked = await client.query<BillingAccountRecord>(
      `
        SELECT
          id::text AS id,
          tenant_id::text AS tenant_id,
          currency,
          balance_cents::text AS balance_cents,
          reserved_cents::text AS reserved_cents,
          membership_tier,
          membership_tier_source,
          membership_tier_expires_at::text AS membership_tier_expires_at,
          status,
          metadata,
          created_at::text AS created_at,
          updated_at::text AS updated_at
        FROM billing_accounts
        WHERE tenant_id = $1::uuid
        LIMIT 1
        FOR UPDATE
      `,
      [tenantId],
    );

    if (!locked.rows[0]) {
      throw new BillingServiceError(500, "BILLING_ACCOUNT_CREATE_FAILED", "Unable to lock billing account");
    }

    return mapBillingAccount(locked.rows[0]);
  }

  private assertAvailableBalance(account: BillingAccountView, amountCents: number): void {
    const available = account.balanceCents - account.reservedCents;
    if (amountCents > available) {
      throw new BillingServiceError(
        402,
        "INSUFFICIENT_BALANCE",
        "Insufficient billing balance for this operation",
      );
    }
  }

  private async allocateCreditGrantsForReserve(
    client: PoolClient,
    tenantId: string,
    amountCredits: number,
  ): Promise<CreditGrantAllocation[]> {
    if (amountCredits <= 0) {
      return [];
    }

    const grants = await client.query<{
      id: string;
      remaining_credits: string;
      reserved_credits: string;
    }>(
      `
        SELECT
          id::text AS id,
          remaining_credits::text AS remaining_credits,
          reserved_credits::text AS reserved_credits
        FROM billing_credit_grants
        WHERE tenant_id = $1::uuid
          AND status = 'active'
          AND (expires_at IS NULL OR expires_at > now())
          AND remaining_credits > reserved_credits
        ORDER BY expires_at ASC NULLS LAST, created_at ASC, id ASC
        FOR UPDATE
      `,
      [tenantId],
    );

    let remaining = amountCredits;
    const allocations: CreditGrantAllocation[] = [];
    for (const grant of grants.rows) {
      if (remaining <= 0) break;
      const available = Math.max(
        parseNumericString(grant.remaining_credits) - parseNumericString(grant.reserved_credits),
        0,
      );
      if (available <= 0) continue;
      const amount = Math.min(available, remaining);
      allocations.push({
        amountCredits: Math.round(amount * 10_000) / 10_000,
        grantId: grant.id,
      });
      remaining = Math.round((remaining - amount) * 10_000) / 10_000;
    }

    if (remaining > 0) {
      throw new BillingServiceError(
        402,
        "INSUFFICIENT_BALANCE",
        "Insufficient unexpired billing balance for this operation",
      );
    }

    for (const allocation of allocations) {
      await client.query(
        `
          UPDATE billing_credit_grants
          SET
            reserved_credits = reserved_credits + $2::numeric,
            updated_at = now()
          WHERE id = $1::uuid
        `,
        [allocation.grantId, allocation.amountCredits],
      );
    }

    return allocations;
  }

  private async createCreditReservationsForLedger(
    client: PoolClient,
    input: {
      allocations: CreditGrantAllocation[];
      ledgerId: string;
      tenantId: string;
    },
  ): Promise<void> {
    for (const allocation of input.allocations) {
      await client.query(
        `
          INSERT INTO billing_credit_reservations (
            tenant_id,
            billing_ledger_id,
            credit_grant_id,
            amount_credits,
            status,
            metadata,
            updated_at
          )
          VALUES ($1::uuid, $2::uuid, $3::uuid, $4::numeric, 'reserved', '{}'::jsonb, now())
        `,
        [input.tenantId, input.ledgerId, allocation.grantId, allocation.amountCredits],
      );
    }
  }

  private resolveCreditGrantSourceType(entryType: string): "admin_grant" | "migration" | "payment" | "redeem" {
    if (entryType === "redeem") return "redeem";
    if (entryType === "payment") return "payment";
    if (entryType === "migration") return "migration";
    return "admin_grant";
  }

  private resolveCreditGrantExpiresAt(metadata: Record<string, unknown> | undefined): string | null {
    const expiresAt = metadata?.creditExpiresAt ?? metadata?.expiresAt;
    return typeof expiresAt === "string" && expiresAt.trim() ? expiresAt.trim() : null;
  }

  private resolveReserveLedgerId(metadata: Record<string, unknown> | undefined): string | null {
    const reserveLedgerId = metadata?.reserveLedgerId;
    return typeof reserveLedgerId === "string" && reserveLedgerId.trim() ? reserveLedgerId.trim() : null;
  }

  private async settleCreditReservations(
    client: PoolClient,
    tenantId: string,
    input: {
      reserveLedgerId: string | null;
      usageEventId: string;
    },
  ): Promise<void> {
    if (!input.reserveLedgerId) return;
    const reservations = await client.query<{
      amount_credits: string;
      credit_grant_id: string;
      id: string;
    }>(
      `
        SELECT
          id::text AS id,
          credit_grant_id::text AS credit_grant_id,
          amount_credits::text AS amount_credits
        FROM billing_credit_reservations
        WHERE tenant_id = $1::uuid
          AND billing_ledger_id = $2::uuid
          AND status = 'reserved'
        FOR UPDATE
      `,
      [tenantId, input.reserveLedgerId],
    );

    for (const reservation of reservations.rows) {
      const amount = parseNumericString(reservation.amount_credits);
      await client.query(
        `
          UPDATE billing_credit_grants
          SET
            remaining_credits = GREATEST(remaining_credits - $2::numeric, 0),
            reserved_credits = GREATEST(reserved_credits - $2::numeric, 0),
            status = CASE
              WHEN GREATEST(remaining_credits - $2::numeric, 0) <= 0 THEN 'exhausted'
              ELSE status
            END,
            updated_at = now()
          WHERE id = $1::uuid
        `,
        [reservation.credit_grant_id, amount],
      );
      await client.query(
        `
          UPDATE billing_credit_reservations
          SET
            status = 'settled',
            usage_event_id = $3::uuid,
            updated_at = now()
          WHERE tenant_id = $1::uuid
            AND id = $2::uuid
        `,
        [tenantId, reservation.id, input.usageEventId],
      );
    }
  }

  private async refundCreditReservations(
    client: PoolClient,
    tenantId: string,
    input: {
      reserveLedgerId: string | null;
    },
  ): Promise<void> {
    if (!input.reserveLedgerId) return;
    const reservations = await client.query<{
      amount_credits: string;
      credit_grant_id: string;
      id: string;
    }>(
      `
        SELECT
          id::text AS id,
          credit_grant_id::text AS credit_grant_id,
          amount_credits::text AS amount_credits
        FROM billing_credit_reservations
        WHERE tenant_id = $1::uuid
          AND billing_ledger_id = $2::uuid
          AND status = 'reserved'
        FOR UPDATE
      `,
      [tenantId, input.reserveLedgerId],
    );

    for (const reservation of reservations.rows) {
      const amount = parseNumericString(reservation.amount_credits);
      await client.query(
        `
          UPDATE billing_credit_grants
          SET
            reserved_credits = GREATEST(reserved_credits - $2::numeric, 0),
            updated_at = now()
          WHERE id = $1::uuid
        `,
        [reservation.credit_grant_id, amount],
      );
      await client.query(
        `
          UPDATE billing_credit_reservations
          SET
            status = 'refunded',
            updated_at = now()
          WHERE tenant_id = $1::uuid
            AND id = $2::uuid
        `,
        [tenantId, reservation.id],
      );
    }
  }

  private async creditAccountWithClient(
    client: PoolClient,
    tenantId: string,
    input: CreditAccountInput,
  ): Promise<BillingLedgerView> {
    const account = await this.getOrCreateBillingAccountForUpdateInTransaction(client, tenantId);
    return this.createLedgerEntryInTransaction(client, {
      amountCents: input.amountCents,
      applyAccountMutation: async () => {
        await client.query(
          `
            UPDATE billing_accounts
            SET
              balance_cents = balance_cents + $2::numeric,
              updated_at = now()
            WHERE id = $1::uuid
          `,
          [account.id, input.amountCents],
        );
        await client.query(
          `
            INSERT INTO billing_credit_grants (
              tenant_id,
              billing_account_id,
              source_type,
              source_id,
              original_credits,
              remaining_credits,
              reserved_credits,
              expires_at,
              status,
              metadata,
              created_at,
              updated_at
            )
            VALUES (
              $1::uuid,
              $2::uuid,
              $3,
              $4,
              $5::numeric,
              $5::numeric,
              0,
              $6::timestamptz,
              CASE WHEN $5::numeric <= 0 THEN 'exhausted' ELSE 'active' END,
              $7::jsonb,
              now(),
              now()
            )
          `,
          [
            tenantId,
            account.id,
            this.resolveCreditGrantSourceType(input.entryType),
            input.idempotencyKey,
            input.amountCents,
            this.resolveCreditGrantExpiresAt(input.metadata),
            JSON.stringify({
              ...input.metadata,
              ledgerEntryType: input.entryType,
            }),
          ],
        );
      },
      billingAccountId: account.id,
      currency: account.currency,
      description: input.description ?? null,
      entryType: input.entryType,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata ?? {},
      tenantId,
      usageEventId: null,
    });
  }

  private async debitAccountWithClient(
    client: PoolClient,
    tenantId: string,
    input: DebitAccountInput,
  ): Promise<BillingLedgerView> {
    const account = await this.getOrCreateBillingAccountForUpdateInTransaction(client, tenantId);
    this.assertAvailableBalance(account, input.amountCents);
    return this.createLedgerEntryInTransaction(client, {
      amountCents: input.amountCents,
      applyAccountMutation: async () => {
        await client.query(
          `
            UPDATE billing_accounts
            SET
              balance_cents = balance_cents - $2::numeric,
              updated_at = now()
            WHERE id = $1::uuid
          `,
          [account.id, input.amountCents],
        );
      },
      billingAccountId: account.id,
      currency: account.currency,
      description: input.description ?? null,
      entryType: input.entryType,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata ?? {},
      tenantId,
      usageEventId: null,
    });
  }

  private async recordUsageEventInTransaction(
    client: PoolClient,
    tenantId: string,
    input: UsageEventInput,
  ): Promise<UsageEventView> {
    const inserted = await client.query<UsageEventRecord>(
      `
        INSERT INTO usage_events (
          tenant_id,
          workflow_run_id,
          node_run_id,
          provider_id,
          model_id,
          route_id,
          event_type,
          modality,
          status,
          idempotency_key,
          input_tokens,
          output_tokens,
          total_tokens,
          units,
          unit_type,
          raw_cost,
          billable_cents,
          metadata,
          occurred_at
        )
        VALUES (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::uuid,
          $5::uuid,
          $6::uuid,
          $7,
          $8,
          $9,
          $10,
          $11::int,
          $12::int,
          $13::int,
          $14::numeric(18, 6),
          $15,
          $16::numeric(18, 8),
          $17::numeric,
          $18::jsonb,
          COALESCE($19::timestamptz, now())
        )
        ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
        RETURNING
          id::text AS id,
          tenant_id::text AS tenant_id,
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
      `,
      [
        tenantId,
        input.workflowRunId ?? null,
        input.nodeRunId ?? null,
        input.providerId ?? null,
        input.modelId ?? null,
        input.routeId ?? null,
        input.eventType,
        input.modality,
        input.status ?? "pending",
        input.idempotencyKey,
        input.inputTokens ?? null,
        input.outputTokens ?? null,
        input.totalTokens ?? null,
        normalizeDecimalValue(input.units),
        input.unitType ?? null,
        normalizeDecimalValue(input.rawCost),
        input.billableCents ?? 0,
        JSON.stringify(input.metadata ?? {}),
        input.occurredAt ?? null,
      ],
    );

    if (inserted.rows[0]) {
      return mapUsageEvent(inserted.rows[0]);
    }

    const existing = await this.getUsageEventByIdempotencyKey(client, tenantId, input.idempotencyKey);
    if (!existing) {
      throw new BillingServiceError(500, "USAGE_EVENT_CREATE_FAILED", "Unable to load usage event");
    }

    assertUsageEventConflictSafe(existing, input);
    return existing;
  }

  private async createLedgerEntryInTransaction(
    client: PoolClient,
    input: {
      amountCents: number;
      applyAccountMutation: (ledgerEntry: BillingLedgerView) => Promise<void>;
      billingAccountId: string;
      currency: string;
      description: string | null;
      entryType: string;
      idempotencyKey: string;
      metadata: Record<string, unknown>;
      tenantId: string;
      usageEventId: string | null;
    },
  ): Promise<BillingLedgerView> {
    const inserted = await client.query<BillingLedgerRecord>(
      `
        INSERT INTO billing_ledger (
          tenant_id,
          billing_account_id,
          usage_event_id,
          entry_type,
          amount_cents,
          currency,
          idempotency_key,
          description,
          metadata
        )
        VALUES (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4,
          $5::numeric,
          $6,
          $7,
          $8,
          $9::jsonb
        )
        ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
        RETURNING
          id::text AS id,
          tenant_id::text AS tenant_id,
          billing_account_id::text AS billing_account_id,
          usage_event_id::text AS usage_event_id,
          entry_type,
          amount_cents::text AS amount_cents,
          currency,
          idempotency_key,
          description,
          metadata,
          created_at::text AS created_at
      `,
      [
        input.tenantId,
        input.billingAccountId,
        input.usageEventId,
        input.entryType,
        input.amountCents,
        input.currency,
        input.idempotencyKey,
        input.description,
        JSON.stringify(input.metadata),
      ],
    );

    if (!inserted.rows[0]) {
      const existing = await this.getLedgerEntryByIdempotencyKey(client, input.tenantId, input.idempotencyKey);
      if (!existing) {
        throw new BillingServiceError(500, "BILLING_LEDGER_CREATE_FAILED", "Unable to load ledger entry");
      }

      assertLedgerConflictSafe(existing, {
        amountCents: input.amountCents,
        entryType: input.entryType,
        usageEventId: input.usageEventId,
      });
      return existing;
    }

    const ledgerEntry = mapLedgerEntry(inserted.rows[0]);
    await input.applyAccountMutation(ledgerEntry);
    return ledgerEntry;
  }

  private async getUsageEventOrThrow(
    client: PoolClient,
    usageEventId: string,
  ): Promise<UsageEventView> {
    const result = await client.query<UsageEventRecord>(
      `
        SELECT
          id::text AS id,
          tenant_id::text AS tenant_id,
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
        WHERE id = $1::uuid
        LIMIT 1
      `,
      [usageEventId],
    );

    const row = result.rows[0];
    if (!row) {
      throw new BillingServiceError(404, "USAGE_EVENT_NOT_FOUND", "Usage event not found");
    }

    return mapUsageEvent(row);
  }

  private async getLedgerEntryOrThrow(
    client: PoolClient,
    ledgerEntryId: string,
  ): Promise<BillingLedgerView> {
    const result = await client.query<BillingLedgerRecord>(
      `
        SELECT
          id::text AS id,
          tenant_id::text AS tenant_id,
          billing_account_id::text AS billing_account_id,
          usage_event_id::text AS usage_event_id,
          entry_type,
          amount_cents::text AS amount_cents,
          currency,
          idempotency_key,
          description,
          metadata,
          created_at::text AS created_at
        FROM billing_ledger
        WHERE id = $1::uuid
        LIMIT 1
      `,
      [ledgerEntryId],
    );

    if (!result.rows[0]) {
      throw new BillingServiceError(404, "BILLING_LEDGER_NOT_FOUND", "Billing ledger entry not found");
    }

    return mapLedgerEntry(result.rows[0]);
  }

  private async getUsageEventByIdempotencyKey(
    client: PoolClient,
    tenantId: string,
    idempotencyKey: string,
  ): Promise<UsageEventView | null> {
    const result = await client.query<UsageEventRecord>(
      `
        SELECT
          id::text AS id,
          tenant_id::text AS tenant_id,
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
        WHERE tenant_id = $1::uuid
          AND idempotency_key = $2
        LIMIT 1
      `,
      [tenantId, idempotencyKey],
    );

    return result.rows[0] ? mapUsageEvent(result.rows[0]) : null;
  }

  private async getLedgerEntryByIdempotencyKey(
    client: PoolClient,
    tenantId: string,
    idempotencyKey: string,
  ): Promise<BillingLedgerView | null> {
    const result = await client.query<BillingLedgerRecord>(
      `
        SELECT
          id::text AS id,
          tenant_id::text AS tenant_id,
          billing_account_id::text AS billing_account_id,
          usage_event_id::text AS usage_event_id,
          entry_type,
          amount_cents::text AS amount_cents,
          currency,
          idempotency_key,
          description,
          metadata,
          created_at::text AS created_at
        FROM billing_ledger
        WHERE tenant_id = $1::uuid
          AND idempotency_key = $2
        LIMIT 1
      `,
      [tenantId, idempotencyKey],
    );

    return result.rows[0] ? mapLedgerEntry(result.rows[0]) : null;
  }
}
