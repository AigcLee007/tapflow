import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AuthContext, type AuthState } from "../auth/useAuth";
import { BillingCenterPage } from "./BillingCenterPage";

const getBillingSummaryMock = vi.fn();
const getPaymentMock = vi.fn();
const createPaymentCheckoutMock = vi.fn();
const listBillingLedgerMock = vi.fn();
const listBillingUsageEventsMock = vi.fn();
const listRechargePlansMock = vi.fn();

vi.mock("./billingApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./billingApi")>()),
  createPaymentCheckout: (input: unknown) => createPaymentCheckoutMock(input),
  getBillingSummary: () => getBillingSummaryMock(),
  getPayment: (id: string) => getPaymentMock(id),
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
    window.localStorage.setItem("v2-access-token", "access-token");
    window.history.replaceState({}, "", "/billing");
    getBillingSummaryMock.mockResolvedValue({ availableCredits: 100, balanceCredits: 100, expiringSoonCredits: 0, nearestExpiryAt: null, reservedCredits: 0, walletId: "wallet-1" });
    listBillingUsageEventsMock.mockResolvedValue({ items: [], page: 1, pageSize: 20 });
    listBillingLedgerMock.mockResolvedValue({ items: [], page: 1, pageSize: 20 });
    listRechargePlansMock.mockResolvedValue([
      { id: "1", key: "credits_100", name: "100 AI credits", amountCents: 990, credits: 100, currency: "CNY", validityDays: 365, sortOrder: 10 },
      { id: "2", key: "credits_700", name: "700 AI credits", amountCents: 5000, credits: 700, currency: "CNY", validityDays: 365, sortOrder: 20 },
      { id: "3", key: "credits_1500", name: "1,500 AI credits", amountCents: 10000, credits: 1500, currency: "CNY", validityDays: 365, sortOrder: 30 },
      { id: "4", key: "credits_3300", name: "3,300 AI credits", amountCents: 20000, credits: 3300, currency: "CNY", validityDays: 365, sortOrder: 40 },
    ]);
    createPaymentCheckoutMock.mockReset();
    getPaymentMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test("renders only server-owned fixed recharge plans", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "个人钱包" })).toBeTruthy();
    expect(screen.getByText("积分属于个人账户，可在您加入的所有工作区中使用。")).toBeTruthy();
    expect(screen.getByText("可用积分")).toBeTruthy();
    expect(screen.getByText("预留积分")).toBeTruthy();
    expect(screen.getByText("即将到期")).toBeTruthy();
    expect(screen.getByText("最近到期")).toBeTruthy();
    expect(screen.getByText("充值积分")).toBeTruthy();
    expect(screen.getByText("￥9.90")).toBeTruthy();
    expect(screen.getByText("100 积分，有效期 365 天")).toBeTruthy();
    expect(screen.getByText("￥50.00")).toBeTruthy();
    expect(screen.getByText("￥100.00")).toBeTruthy();
    expect(screen.getByText("￥200.00")).toBeTruthy();
    expect(screen.queryByText("Personal wallet")).toBeNull();
    expect(screen.queryByText("Recharge credits")).toBeNull();
    expect(screen.queryByText("Basic")).toBeNull();
    expect(screen.queryByText("Pro")).toBeNull();
  });

  test("shows a Chinese wallet loading error without exposing the server error", async () => {
    getBillingSummaryMock.mockRejectedValueOnce(new Error("Unable to load wallet"));
    renderPage();

    expect(await screen.findByText("钱包加载失败，请稍后重试。")).toBeTruthy();
    expect(screen.queryByText("Unable to load wallet")).toBeNull();
  });

  test("shows a Chinese checkout creation error without exposing the server error", async () => {
    createPaymentCheckoutMock.mockRejectedValueOnce(new Error("Unable to create payment checkout"));
    renderPage();

    await screen.findByText("￥9.90");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /￥9\.90/ }));
    });

    expect(await screen.findByText("创建支付订单失败，请稍后重试。")).toBeTruthy();
    expect(screen.queryByText("Unable to create payment checkout")).toBeNull();
  });

  test("shows checkout-created payment QR inside the recharge dialog", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    const paymentId = "payment-created-without-reload";
    createPaymentCheckoutMock.mockResolvedValueOnce({
      id: paymentId,
      planKey: "credits_100",
      amountCents: 990,
      credits: 100,
      status: "checkout_created",
      checkoutUrl: "https://pay.example.test/order",
      qrCodeUrl: "https://pay.example.test/qr",
      expiresAtSnapshot: null,
    });
    getPaymentMock.mockResolvedValueOnce({
      id: paymentId,
      planKey: "credits_100",
      amountCents: 990,
      credits: 100,
      status: "checkout_created",
      checkoutUrl: "https://pay.example.test/order",
      qrCodeUrl: "https://pay.example.test/qr",
      expiresAtSnapshot: null,
    });
    renderPage();

    await screen.findByText("￥9.90");
    fireEvent.click(screen.getByRole("button", { name: /￥9\.90/ }));

    await waitFor(() => expect(getPaymentMock).toHaveBeenCalledWith(paymentId));
    const dialog = await screen.findByRole("dialog", { name: "充值积分" });
    expect(within(dialog).getByRole("img", { name: "支付二维码" }).getAttribute("src")).toBe("https://pay.example.test/qr");
    expect(screen.queryByTestId("billing-inline-payment-status")).toBeNull();
  });

  test("confirms return state only after the owned payment API reports paid", async () => {
    window.history.replaceState({}, "", "/billing?paymentId=00000000-0000-4000-8000-000000000123");
    getPaymentMock.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000123", planKey: "credits_100", amountCents: 990, credits: 100, status: "paid", checkoutUrl: null, qrCodeUrl: null, expiresAtSnapshot: "2027-01-01T00:00:00.000Z" });
    renderPage();
    await waitFor(() => expect(getPaymentMock).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000123"));
    expect(await screen.findByText("已支付")).toBeTruthy();
  });

  test("rechecks an owned payment when the billing tab becomes visible", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    const paymentId = "payment-visible-again";
    createPaymentCheckoutMock.mockResolvedValueOnce({ id: paymentId, planKey: "credits_100", amountCents: 990, credits: 100, status: "checkout_created", checkoutUrl: "https://pay.example.test/order", qrCodeUrl: "https://pay.example.test/qr", expiresAtSnapshot: null });
    getPaymentMock
      .mockResolvedValueOnce({ id: paymentId, planKey: "credits_100", amountCents: 990, credits: 100, status: "checkout_created", checkoutUrl: "https://pay.example.test/order", qrCodeUrl: "https://pay.example.test/qr", expiresAtSnapshot: null })
      .mockResolvedValueOnce({ id: paymentId, planKey: "credits_100", amountCents: 990, credits: 100, status: "paid", checkoutUrl: null, qrCodeUrl: null, expiresAtSnapshot: null });
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("button")).toHaveLength(5));
    fireEvent.click(screen.getAllByRole("button")[0]);
    await waitFor(() => expect(getPaymentMock).toHaveBeenCalledTimes(1));
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    await waitFor(() => expect(getPaymentMock).toHaveBeenCalledTimes(2));
    expect(getPaymentMock).toHaveBeenCalledTimes(2);
  });

  test("stops polling an unconfirmed owned payment after 120 attempts", async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, "", "/billing?paymentId=00000000-0000-4000-8000-000000000123");
    getPaymentMock.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000123", planKey: "credits_100", amountCents: 990, credits: 100, status: "checkout_created", checkoutUrl: "https://pay.example.test/order", qrCodeUrl: null, expiresAtSnapshot: null });
    renderPage();

    await act(async () => { await vi.advanceTimersByTimeAsync(360_000); });

    expect(getPaymentMock).toHaveBeenCalledTimes(120);
  });
});
