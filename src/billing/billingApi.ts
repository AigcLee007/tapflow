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
  availableCredits: number;
  balanceCredits: number;
  expiringSoonCredits: number;
  nearestExpiryAt: string | null;
  reservedCredits: number;
  walletId: string;
};

export type RechargePlan = { id: string; key: string; name: string; amountCents: number; credits: number; currency: string; validityDays: number; sortOrder: number };
export type PaymentStatus = "pending" | "checkout_created" | "paid" | "create_failed" | "cancelled" | "refund_pending" | "refunded" | "refund_failed";
export type WalletPayment = { id: string; planKey: string; amountCents: number; credits: number; status: PaymentStatus; checkoutUrl: string | null; qrCodeUrl: string | null; expiresAtSnapshot: string | null };

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
  amountCredits: number;
  createdAt: string;
  entryType: string;
  id: string;
  idempotencyKey: string;
  metadata: Record<string, unknown>;
  tenantId: string | null;
  usageEventId: string | null;
  userId: string;
  walletId: string;
};

export type BillingUsageEvent = {
  billableCents: number;
  createdAt: string;
  eventType: string;
  id: string;
  idempotencyKey: string;
  metadata: Record<string, unknown>;
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
  credits: number;
  ledgerEntry: { id: string; amountCredits: number; entryType: string; createdAt: string };
  redemptionId: string;
};

export type PaymentCheckoutResponse = WalletPayment;

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

export const listRechargePlans = () => apiGet<RechargePlan[]>("/billing/recharge-plans");
export const createPaymentCheckout = (input: { planKey: string; idempotencyKey: string }) => apiPost<PaymentCheckoutResponse>("/billing/payment/create-checkout", input);
export const getPayment = (paymentId: string) => apiGet<WalletPayment>(`/billing/payments/${encodeURIComponent(paymentId)}`);
