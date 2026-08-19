import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AuthContext, type AuthState } from "../auth/useAuth";
import { BillingCenterPage } from "./BillingCenterPage";

const getBillingSummaryMock = vi.fn();
const listBillingLedgerMock = vi.fn();
const listBillingUsageEventsMock = vi.fn();
const listRechargePlansMock = vi.fn();

vi.mock("./billingApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./billingApi")>()),
  getBillingSummary: () => getBillingSummaryMock(),
  listBillingLedger: () => listBillingLedgerMock(),
  listBillingUsageEvents: () => listBillingUsageEventsMock(),
  listRechargePlans: () => listRechargePlansMock(),
}));

vi.mock("../services/v2AiModelCatalogApi", () => ({ listAiModelCatalog: vi.fn(async () => []), listAiModelRoutes: vi.fn(async () => []) }));

function auth(): AuthState {
  return { authenticated: true, error: null, loading: false, permissions: [], refreshMe: vi.fn(), register: vi.fn(), login: vi.fn(), logout: vi.fn(), roles: ["tenant_owner"], sessionId: "session-1", tenant: { id: "tenant-1", name: "Workspace", plan: "free", slug: "workspace", status: "active" }, user: { displayName: "User", email: "user@example.com", id: "user-1", status: "active" } };
}

function renderPage() { return render(<AuthContext.Provider value={auth()}><BillingCenterPage /></AuthContext.Provider>); }

describe("BillingCenterPage", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/billing");
    getBillingSummaryMock.mockResolvedValue({ availableCredits: 100, balanceCredits: 100, expiringSoonCredits: 0, nearestExpiryAt: null, reservedCredits: 0, walletId: "wallet-1" });
    listBillingUsageEventsMock.mockResolvedValue({ items: [], page: 1, pageSize: 20 });
    listBillingLedgerMock.mockResolvedValue({ items: [], page: 1, pageSize: 20 });
    listRechargePlansMock.mockResolvedValue([
      { id: "1", key: "credits_100", name: "100 AI credits", amountCents: 990, credits: 100, currency: "CNY", validityDays: 365, sortOrder: 10 },
      { id: "2", key: "credits_700", name: "700 AI credits", amountCents: 5000, credits: 700, currency: "CNY", validityDays: 365, sortOrder: 20 },
    ]);
  });

  test("keeps billing focused on wallet history and puts redeem code below one recharge entry", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "个人钱包" })).toBeTruthy();
    expect(screen.getByTestId("billing-recharge-section")).toBeTruthy();
    expect(screen.getByTestId("billing-recharge-entry")).toBeTruthy();
    expect(screen.getByText("兑换码")).toBeTruthy();
    expect(screen.queryByTestId("recharge-plan-grid")).toBeNull();
    expect(screen.getByTestId("billing-recharge-section").compareDocumentPosition(screen.getByTestId("billing-activity-section")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test("opens the shared centered recharge dialog from the billing entry", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "个人钱包" });
    fireEvent.click(screen.getByTestId("billing-recharge-entry"));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("dialog").querySelector("#recharge-dialog-title")?.textContent).toBe("充值积分");
    await waitFor(() => expect(screen.getByTestId("recharge-plan-grid")).toBeTruthy());
  });

  test("keeps keyboard focus inside the recharge dialog and restores the trigger on close", async () => {
    renderPage();
    const trigger = await screen.findByTestId("billing-recharge-entry");
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog");
    const close = screen.getByRole("button", { name: "关闭充值" });
    await waitFor(() => expect(within(dialog).getAllByRole("button", { name: "立即充值" })).toHaveLength(2));
    const lastAction = within(dialog).getAllByRole("button", { name: "立即充值" }).at(-1)!;

    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(lastAction);
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(close);

    fireEvent.click(close);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

});
