import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { RechargePlan, WalletPayment } from "./billingApi";
import { useRechargeCheckout } from "./useRechargeCheckout";

const listRechargePlansMock = vi.fn();
const createPaymentCheckoutMock = vi.fn();
const getPaymentMock = vi.fn();

vi.mock("./billingApi", () => ({
  createPaymentCheckout: (input: unknown) => createPaymentCheckoutMock(input),
  getPayment: (id: string) => getPaymentMock(id),
  listRechargePlans: () => listRechargePlansMock(),
}));

const plan: RechargePlan = { id: "p1", key: "credits_100", name: "入门创作", amountCents: 990, credits: 100, currency: "CNY", validityDays: 365, sortOrder: 1 };
const payment: WalletPayment = { id: "pay-1", planKey: plan.key, amountCents: 990, credits: 100, status: "checkout_created", checkoutUrl: "https://pay.example.test", qrCodeUrl: "https://pay.example.test/qr", expiresAtSnapshot: null };

beforeEach(() => {
  vi.useFakeTimers();
  listRechargePlansMock.mockReset();
  createPaymentCheckoutMock.mockReset();
  getPaymentMock.mockReset();
});

afterEach(() => vi.useRealTimers());

describe("useRechargeCheckout", () => {
  test("loads plans and creates a payment with the UI idempotency prefix", async () => {
    listRechargePlansMock.mockResolvedValue([plan]);
    createPaymentCheckoutMock.mockResolvedValue(payment);
    getPaymentMock.mockResolvedValue(payment);
    const { result } = renderHook(() => useRechargeCheckout());

    await act(async () => { await result.current.loadPlans(); });
    expect(result.current.plans).toEqual([plan]);
    expect(result.current.plansStatus).toBe("ready");
    await act(async () => { await result.current.startCheckout(plan); });
    expect(createPaymentCheckoutMock).toHaveBeenCalledWith(expect.objectContaining({ planKey: plan.key, idempotencyKey: expect.stringMatching(/^payment-ui:/) }));
    expect(result.current.payment).toEqual(payment);
  });

  test("recovers an initial payment and stops after paid", async () => {
    vi.useRealTimers();
    const paid = { ...payment, status: "paid" as const };
    getPaymentMock.mockResolvedValueOnce(paid);
    const { result } = renderHook(() => useRechargeCheckout(payment.id));
    await waitFor(() => expect(getPaymentMock).toHaveBeenCalledWith(payment.id));
    await waitFor(() => expect(result.current.payment?.status).toBe("paid"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(getPaymentMock).toHaveBeenCalledTimes(1);
  });
});
