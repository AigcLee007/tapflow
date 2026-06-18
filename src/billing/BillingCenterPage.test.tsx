import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AuthContext, type AuthState } from "../auth/useAuth";
import { BillingCenterPage } from "./BillingCenterPage";

const getBillingSummaryMock = vi.fn();
const listBillingLedgerMock = vi.fn();
const listBillingUsageEventsMock = vi.fn();

vi.mock("./billingApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./billingApi")>();
  return {
    ...actual,
    getBillingSummary: () => getBillingSummaryMock(),
    listBillingLedger: () => listBillingLedgerMock(),
    listBillingUsageEvents: () => listBillingUsageEventsMock(),
  };
});

function createAuthState(): AuthState {
  return {
    authenticated: true,
    error: null,
    loading: false,
    permissions: [],
    refreshMe: vi.fn(async () => undefined),
    register: vi.fn(async () => undefined),
    login: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    roles: ["tenant_owner"],
    sessionId: "session-1",
    tenant: { id: "tenant-1", name: "测试 的工作区", plan: "free", slug: "test", status: "active" },
    user: { displayName: "测试", email: "user@example.com", id: "user-1", status: "active" },
  };
}

describe("BillingCenterPage", () => {
  beforeEach(() => {
    getBillingSummaryMock.mockResolvedValue({
      account: {
        balanceCents: 0,
        createdAt: "2026-06-12T00:00:00.000Z",
        currency: "credits",
        id: "billing-1",
        reservedCents: 0,
        status: "active",
        tenantId: "tenant-1",
        updatedAt: "2026-06-12T00:00:00.000Z",
      },
      creditGrants: {
        availableCredits: 120,
        expiringSoonCredits: 20,
        lifetimeCredits: 100,
        reservedCredits: 5,
      },
      ledgerTotals: { refundCents: 0, reserveCents: 0, settleCents: 0 },
      membership: { discountMultiplier: 0.9, tier: "gold" },
      usageTotals: {
        eventCount: 0,
        pendingCount: 0,
        rawCostTotal: "0",
        settledCount: 0,
        totalBillableCents: 0,
      },
    });
    listBillingUsageEventsMock.mockResolvedValue({ items: [], page: 1, pageSize: 20 });
    listBillingLedgerMock.mockResolvedValue({ items: [], page: 1, pageSize: 20 });
  });

  test("renders price-plan-first billing page", async () => {
    render(
      <AuthContext.Provider value={createAuthState()}>
        <BillingCenterPage />
      </AuthContext.Provider>,
    );

    expect(await screen.findByRole("heading", { name: "选择你的套餐" })).toBeTruthy();
    expect(screen.getByText("不止额度，更是灵感落地的速度。")).toBeTruthy();
    expect(screen.getByText("Basic")).toBeTruthy();
    expect(screen.getByText("Pro")).toBeTruthy();
    expect(screen.getByText("Ultimate")).toBeTruthy();
    expect(screen.getByText("积分永不过期。")).toBeTruthy();
    expect(screen.getByRole("button", { name: "连续包月 15% OFF" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "连续包年 40% OFF" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("12,000 积分/月")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "选择套餐" })).toHaveLength(3);
    expect(screen.getByText("最受欢迎")).toBeTruthy();

    await waitFor(() => {
      expect(getBillingSummaryMock).toHaveBeenCalled();
    });
    expect(screen.getByText(/黄金会员|Gold/i)).toBeTruthy();
    expect(screen.getByText(/9 折|0.9/i)).toBeTruthy();
    expect(screen.getByText("20 点")).toBeTruthy();
    expect(screen.getByText("100 点")).toBeTruthy();
  });
});
