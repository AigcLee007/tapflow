import { apiGet, apiPost } from "../services/v2HttpClient";

export type BillingAccount = {
  balanceCents: number;
  createdAt: string;
  currency: string;
  id: string;
  reservedCents: number;
  status: string;
  tenantId: string;
  updatedAt: string;
};

export type BillingSummary = {
  account: BillingAccount;
  availableCredits?: number;
  balanceCredits?: number;
  ledgerTotals: {
    refundCents: number;
    reserveCents: number;
    settleCents: number;
  };
  reservedCredits?: number;
  thisMonthUsageCredits?: number;
  usageTotals: {
    eventCount: number;
    pendingCount: number;
    rawCostTotal: string;
    settledCount: number;
    totalBillableCents: number;
  };
};

export type BillingPricingRow = {
  active: boolean;
  id: string;
  minChargeCredits: number;
  model: string;
  provider: string;
  route: string;
  unit: string;
  unitCredits: number;
};

export type BillingLedgerEntry = {
  amountCents: number;
  createdAt: string;
  currency: string;
  description: string | null;
  entryType: string;
  id: string;
  idempotencyKey: string;
  metadata: Record<string, unknown>;
  usageEventId: string | null;
};

export type BillingUsageEvent = {
  billableCents: number;
  createdAt: string;
  eventType: string;
  id: string;
  idempotencyKey: string;
  modality: string;
  modelId: string | null;
  nodeRunId: string | null;
  rawCost: string | null;
  routeId: string | null;
  status: string;
  unitType: string | null;
  units: string | null;
  workflowRunId: string | null;
};

export type BillingListResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
};

export type RedeemCodeResponse = {
  account: BillingAccount;
  credits: number;
  ledgerEntry: BillingLedgerEntry;
  redemptionId: string;
};

export type PaymentCheckoutResponse = {
  checkoutUrl: string | null;
  payment: {
    amountCents: number;
    credits: number;
    id: string;
    provider: string;
    status: string;
  };
};

export function getBillingSummary() {
  return apiGet<BillingSummary>("/billing/summary");
}

export function listBillingPricing() {
  return apiGet<BillingPricingRow[]>("/billing/pricing");
}

export function listBillingUsageEvents(page = 1, limit = 20) {
  return apiGet<BillingListResponse<BillingUsageEvent>>(
    `/billing/usage-events?page=${page}&limit=${limit}`,
  );
}

export function listBillingLedger(page = 1, limit = 20) {
  return apiGet<BillingListResponse<BillingLedgerEntry>>(
    `/billing/ledger?page=${page}&limit=${limit}`,
  );
}

export function redeemBillingCode(code: string) {
  return apiPost<RedeemCodeResponse>("/billing/redeem", {
    code,
    idempotencyKey: `redeem-ui:${code.trim().toUpperCase()}`,
  });
}

export function createPaymentCheckout(input: {
  amountCents: number;
  credits: number;
  idempotencyKey: string;
  provider?: string;
}) {
  return apiPost<PaymentCheckoutResponse>("/billing/payment/create-checkout", {
    ...input,
    provider: input.provider ?? "manual",
  });
}
