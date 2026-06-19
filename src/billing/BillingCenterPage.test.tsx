import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AuthContext, type AuthState } from "../auth/useAuth";
import { BillingCenterPage } from "./BillingCenterPage";

const getBillingSummaryMock = vi.fn();
const listBillingLedgerMock = vi.fn();
const listBillingUsageEventsMock = vi.fn();
const listAiModelCatalogMock = vi.fn();
const listAiModelRoutesMock = vi.fn();

vi.mock("./billingApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./billingApi")>();
  return {
    ...actual,
    getBillingSummary: () => getBillingSummaryMock(),
    listBillingLedger: () => listBillingLedgerMock(),
    listBillingUsageEvents: () => listBillingUsageEventsMock(),
  };
});

vi.mock("../services/v2AiModelCatalogApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/v2AiModelCatalogApi")>();
  return {
    ...actual,
    listAiModelCatalog: (...args: unknown[]) => listAiModelCatalogMock(...args),
    listAiModelRoutes: (...args: unknown[]) => listAiModelRoutesMock(...args),
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
    tenant: { id: "tenant-1", name: "Test Workspace", plan: "free", slug: "test", status: "active" },
    user: { displayName: "Test User", email: "user@example.com", id: "user-1", status: "active" },
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
    listAiModelCatalogMock.mockImplementation(async (modality?: string) => {
      if (modality !== "image") return [];
      return [
        {
          capabilities: {},
          defaultRouteKey: "image.pixellelabs.nano-banana-pro",
          displayName: "Nano Banana Pro",
          id: "catalog-model-1",
          modality: "image",
          modelFamily: "pixellelabs.nano-banana-pro",
          modelId: "1911c771-74a1-4ca1-af77-df9383dd8304",
          modelKey: "pixellelabs.nano-banana-pro",
          sortOrder: 1,
          status: "active",
          uiSchema: {},
        },
      ];
    });
    listAiModelRoutesMock.mockResolvedValue([
      {
        estimatedCredits: 3.2,
        minChargeCredits: 3.2,
        modality: "image",
        modelFamily: "pixellelabs.nano-banana-pro",
        modelKey: "pixellelabs.nano-banana-pro",
        pricingUnit: "image_generation",
        providerKey: "pixellelabs",
        providerName: "PixelleLabs",
        routeId: "route-1",
        routeKey: "image.pixellelabs.nano-banana-pro",
        routeLabel: "线路一",
      },
    ]);
  });

  test("renders price-plan-first billing page", async () => {
    render(
      <AuthContext.Provider value={createAuthState()}>
        <BillingCenterPage />
      </AuthContext.Provider>,
    );

    expect(await screen.findByText("Basic")).toBeTruthy();
    expect(screen.getByText("Pro")).toBeTruthy();
    expect(screen.getByText("Ultimate")).toBeTruthy();

    await waitFor(() => {
      expect(getBillingSummaryMock).toHaveBeenCalled();
    });
    expect(screen.getByRole("button", { name: "刷新" })).toBeTruthy();
    expect(screen.getByText("账单明细")).toBeTruthy();
  });

  test("renders a single creator-facing billing activity table without technical identifiers", async () => {
    listBillingUsageEventsMock.mockResolvedValue({
      items: [
        {
          billableCents: 12.8,
          createdAt: "2026-06-19T02:28:08.000Z",
          eventType: "workbench.image.generate",
          id: "usage-1",
          idempotencyKey: "workbench:usage:tenant:generation",
          metadata: {},
          modality: "image",
          modelId: "1911c771-74a1-4ca1-af77-df9383dd8304",
          nodeRunId: null,
          rawCost: null,
          routeId: "route-1",
          status: "settled",
          unitType: "image_generation",
          units: "4",
          workflowRunId: "workflow-run-technical-id",
        },
      ],
      page: 1,
      pageSize: 20,
    });
    listBillingLedgerMock.mockResolvedValue({
      items: [
        {
          amountCents: 12.8,
          createdAt: "2026-06-19T02:24:32.000Z",
          currency: "credits",
          description: "image.generate reserved",
          entryType: "reserve",
          id: "ledger-reserve-1",
          idempotencyKey: "reserve:tenant:run:node",
          metadata: {},
          usageEventId: null,
        },
        {
          amountCents: 12.8,
          createdAt: "2026-06-19T02:28:08.000Z",
          currency: "credits",
          description: "image.generate settled",
          entryType: "settle",
          id: "ledger-settle-1",
          idempotencyKey: "settle:tenant:run:node",
          metadata: {},
          usageEventId: "usage-1",
        },
      ],
      page: 1,
      pageSize: 20,
    });

    render(
      <AuthContext.Provider value={createAuthState()}>
        <BillingCenterPage />
      </AuthContext.Provider>,
    );

    expect(await screen.findByText("账单明细")).toBeTruthy();
    expect(screen.queryByText("用量记录")).toBeNull();
    expect(screen.queryByText("账单流水")).toBeNull();
    expect(screen.getByText("图片生成")).toBeTruthy();
    expect(screen.getByText("Nano Banana Pro 线路一")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText("-12.8")).toBeTruthy();
    expect(screen.getByText("已结算")).toBeTruthy();
    expect(screen.queryByText("workflow-run-technical-id")).toBeNull();
    expect(screen.queryByText("workbench:usage:tenant:generation")).toBeNull();
    expect(screen.queryByText("1911c771-74a1-4ca1-af77-df9383dd8304")).toBeNull();
    expect(screen.queryByText("reserve:tenant:run:node")).toBeNull();
  });
});
