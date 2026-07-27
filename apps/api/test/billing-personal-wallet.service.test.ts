import { describe, expect, test, vi } from "vitest";

import { BillingApiService } from "../src/modules/billing/billing.service.js";

const userId = "00000000-0000-4000-8000-000000000001";

function createQueryPool(rows: unknown[] = []) {
  const query = vi.fn(async (sql: string, parameters?: unknown[]) => {
    if (sql.includes("FROM usage_events")) {
      return { rows };
    }
    return { rows: [] };
  });
  return {
    connect: vi.fn(async () => ({
      query,
      release: vi.fn(),
    })),
    query,
  };
}

describe("BillingApiService personal wallet reads", () => {
  test("reads the personal wallet summary without using tenant billing", async () => {
    const legacyBilling = {
      getBillingSummary: vi.fn(async () => {
        throw new Error("legacy tenant billing must not be used");
      }),
    };
    const personalWallet = {
      getSummary: vi.fn(async () => ({
        walletId: "wallet-1",
        balanceCredits: 250,
        reservedCredits: 20,
        availableCredits: 230,
        expiringSoonCredits: 40,
        nearestExpiryAt: "2027-07-27T00:00:00.000Z",
      })),
    };
    const service = new BillingApiService({
      billingService: legacyBilling as never,
      personalWalletService: personalWallet as never,
      pool: createQueryPool() as never,
    } as never);

    await expect(service.getBillingSummary({ tenantId: "ignored", userId })).resolves.toEqual({
      availableCredits: 230,
      balanceCredits: 250,
      expiringSoonCredits: 40,
      nearestExpiryAt: "2027-07-27T00:00:00.000Z",
      reservedCredits: 20,
      walletId: "wallet-1",
    });
    expect(legacyBilling.getBillingSummary).not.toHaveBeenCalled();
    expect(personalWallet.getSummary).toHaveBeenCalledWith({ userId });
  });

  test("reads personal wallet ledger without using tenant billing", async () => {
    const legacyBilling = {
      listLedgerEntries: vi.fn(async () => {
        throw new Error("legacy tenant billing must not be used");
      }),
    };
    const personalWallet = {
      listLedger: vi.fn(async () => ({ items: [{ id: "wallet-ledger-1" }], page: 2, pageSize: 10 })),
    };
    const service = new BillingApiService({
      billingService: legacyBilling as never,
      personalWalletService: personalWallet as never,
      pool: createQueryPool() as never,
    } as never);

    await expect(service.listLedgerEntries({ tenantId: "ignored", userId }, { limit: 10, page: 2 })).resolves.toEqual({
      items: [{ id: "wallet-ledger-1" }],
      page: 2,
      pageSize: 10,
    });
    expect(legacyBilling.listLedgerEntries).not.toHaveBeenCalled();
    expect(personalWallet.listLedger).toHaveBeenCalledWith({ userId }, { limit: 10, page: 2 });
  });

  test("redeems into the personal wallet instead of the legacy tenant ledger", async () => {
    const legacyBilling = { redeemCode: vi.fn(async () => { throw new Error("legacy redeem must not be used"); }) };
    const personalWallet = { redeemCode: vi.fn(async () => ({ credits: 100, ledgerEntry: { id: "wallet-ledger-1" }, redemptionId: "redemption-1" })) };
    const service = new BillingApiService({ billingService: legacyBilling as never, personalWalletService: personalWallet as never, pool: createQueryPool() as never } as never);

    await expect(service.redeemCode({ tenantId: "00000000-0000-4000-8000-000000000099", userId }, { code: "WELCOME", idempotencyKey: "redeem-1" })).resolves.toMatchObject({ credits: 100, redemptionId: "redemption-1" });
    expect(personalWallet.redeemCode).toHaveBeenCalledWith({ tenantId: "00000000-0000-4000-8000-000000000099", userId }, { code: "WELCOME", idempotencyKey: "redeem-1" });
    expect(legacyBilling.redeemCode).not.toHaveBeenCalled();
  });

  test("filters usage history by immutable billed user id", async () => {
    const pool = createQueryPool([{
      billable_cents: "9",
      created_at: "2026-07-27T00:00:00.000Z",
      event_type: "ai.text.generate",
      id: "usage-1",
      idempotency_key: "usage:1",
      input_tokens: null,
      metadata: {},
      modality: "text",
      model_id: null,
      node_run_id: null,
      occurred_at: "2026-07-27T00:00:00.000Z",
      output_tokens: null,
      provider_id: null,
      raw_cost: "0.01",
      route_id: null,
      status: "settled",
      tenant_id: "00000000-0000-4000-8000-000000000099",
      total_tokens: null,
      unit_type: null,
      units: null,
      workflow_run_id: null,
    }]);
    const service = new BillingApiService({
      billingService: { listUsageEvents: vi.fn() } as never,
      pool: pool as never,
    });

    const result = await service.listUsageEvents({ userId }, { limit: 10, page: 1 });

    expect(result.items).toHaveLength(1);
    const usageQuery = pool.query.mock.calls.find(([sql]) => String(sql).includes("FROM usage_events"));
    expect(usageQuery?.[0]).toContain("billed_user_id = $3::uuid");
    expect(usageQuery?.[1]).toEqual([10, 0, userId]);
  });
});
