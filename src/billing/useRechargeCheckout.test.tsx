import React from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { type RechargePlan } from "./billingApi";
import { PAYMENT_POLL_INTERVAL_MS, MAX_PAYMENT_POLLS, useRechargeCheckout } from "./useRechargeCheckout";

const listRechargePlansMock = vi.fn();
const createPaymentCheckoutMock = vi.fn();
const getPaymentMock = vi.fn();
const invalidateBillingSummaryMock = vi.fn();

vi.mock("./billingApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./billingApi")>()),
  createPaymentCheckout: (input: unknown) => createPaymentCheckoutMock(input),
  getPayment: (paymentId: string) => getPaymentMock(paymentId),
  listRechargePlans: () => listRechargePlansMock(),
}));

vi.mock("./useBillingSummarySnapshot", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./useBillingSummarySnapshot")>()),
  invalidateBillingSummary: () => invalidateBillingSummaryMock(),
}));

function makePlan(overrides: Partial<RechargePlan>): RechargePlan {
  return {
    id: overrides.id ?? "plan-1",
    key: overrides.key ?? "credits_100",
    name: overrides.name ?? "100 AI credits",
    amountCents: overrides.amountCents ?? 990,
    credits: overrides.credits ?? 100,
    currency: overrides.currency ?? "CNY",
    validityDays: overrides.validityDays ?? 365,
    sortOrder: overrides.sortOrder ?? 10,
  };
}

function makePayment(overrides: {
  checkoutUrl?: string | null;
  id?: string;
  qrCodeUrl?: string | null;
  status: "pending" | "checkout_created" | "paid" | "create_failed" | "cancelled" | "refund_pending" | "refunded" | "refund_failed";
}): ReturnType<typeof getPaymentMock> extends Promise<infer T> ? T : never {
  return {
    id: overrides.id ?? "payment-1",
    planKey: "credits_100",
    amountCents: 990,
    credits: 100,
    checkoutUrl: overrides.checkoutUrl ?? "https://pay.example.test/order",
    qrCodeUrl: overrides.qrCodeUrl ?? "https://pay.example.test/qr.png",
    status: overrides.status,
    expiresAtSnapshot: "2027-01-01T00:00:00.000Z",
  };
}

describe("useRechargeCheckout", () => {
  beforeEach(() => {
    listRechargePlansMock.mockReset();
    createPaymentCheckoutMock.mockReset();
    getPaymentMock.mockReset();
    invalidateBillingSummaryMock.mockReset();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("uuid-1234");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test("loads recharge plans lazily and keeps stale responses from overwriting newer results", async () => {
    let resolveFirst!: (value: RechargePlan[]) => void;
    const firstPlansPromise = new Promise<RechargePlan[]>((resolve) => {
      resolveFirst = resolve;
    });
    const firstPlans = [makePlan({ id: "plan-old", key: "credits_100" })];
    const secondPlans = [makePlan({ id: "plan-new", key: "credits_700", credits: 700, amountCents: 5000, sortOrder: 20 })];

    listRechargePlansMock
      .mockReturnValueOnce(firstPlansPromise)
      .mockResolvedValueOnce(secondPlans);

    const { result } = renderHook(() => useRechargeCheckout());

    expect(result.current.plansStatus).toBe("idle");
    expect(result.current.plans).toEqual([]);
    expect(listRechargePlansMock).not.toHaveBeenCalled();

    let firstLoad!: Promise<void>;
    await act(async () => {
      firstLoad = result.current.loadPlans();
    });
    expect(result.current.plansStatus).toBe("loading");
    expect(listRechargePlansMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.loadPlans();
    });
    expect(listRechargePlansMock).toHaveBeenCalledTimes(2);
    expect(result.current.plansStatus).toBe("ready");
    expect(result.current.plans).toEqual(secondPlans);

    await act(async () => {
      resolveFirst(firstPlans);
      await firstPlansPromise;
      await firstLoad;
    });

    expect(result.current.plans).toEqual(secondPlans);
  });

  test("shows Chinese plan and checkout errors without exposing server messages", async () => {
    listRechargePlansMock.mockRejectedValueOnce(new Error("load plans failed"));
    createPaymentCheckoutMock.mockRejectedValueOnce(new Error("create checkout failed"));
    const { result } = renderHook(() => useRechargeCheckout());

    await act(async () => {
      await result.current.loadPlans();
    });
    expect(result.current.plansStatus).toBe("error");
    expect(result.current.error).toBe("套餐加载失败，请稍后重试。");

    await act(async () => {
      await result.current.startCheckout(makePlan({ key: "credits_100" }));
    });
    expect(result.current.error).toBe("创建支付订单失败，请稍后重试。");
  });

  test("creates checkout with a payment-ui idempotency key and follows mobile checkoutUrl after creation", async () => {
    const redirectSpy = vi.fn();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));

    let resolveCheckout!: (value: ReturnType<typeof makePayment>) => void;
    createPaymentCheckoutMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCheckout = resolve;
        }),
    );

    const { result } = renderHook(() => useRechargeCheckout({ onMobileCheckoutUrl: redirectSpy }));
    const plan = makePlan({ key: "credits_700", id: "plan-2", amountCents: 5000, credits: 700, sortOrder: 20 });
    const payment = makePayment({ id: "payment-mobile", status: "checkout_created" });
    getPaymentMock.mockResolvedValue(payment);

    let checkoutPromise!: Promise<ReturnType<typeof makePayment> | null>;
    await act(async () => {
      checkoutPromise = result.current.startCheckout(plan);
    });

    expect(result.current.busyPlanKey).toBe("credits_700");
    expect(createPaymentCheckoutMock).toHaveBeenCalledWith({
      idempotencyKey: "payment-ui:uuid-1234",
      planKey: "credits_700",
    });
    expect(redirectSpy).not.toHaveBeenCalled();

    await act(async () => {
      resolveCheckout(payment);
      await checkoutPromise;
    });

    expect(result.current.busyPlanKey).toBeNull();
    expect(result.current.payment).toEqual(payment);
    expect(redirectSpy).toHaveBeenCalledTimes(1);
    expect(redirectSpy).toHaveBeenCalledWith("https://pay.example.test/order");
  });

  test("polls an initial payment every three seconds and invalidates billing once when it becomes paid", async () => {
    vi.useFakeTimers();
    const paymentId = "payment-recovery";
    getPaymentMock
      .mockResolvedValueOnce(makePayment({ id: paymentId, status: "checkout_created" }))
      .mockResolvedValueOnce(makePayment({ id: paymentId, status: "paid", checkoutUrl: null, qrCodeUrl: null }));

    const { result } = renderHook(() => useRechargeCheckout({ initialPaymentId: paymentId }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(getPaymentMock).toHaveBeenCalledWith(paymentId);
    expect(result.current.payment?.status).toBe("checkout_created");
    expect(invalidateBillingSummaryMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PAYMENT_POLL_INTERVAL_MS);
    });

    expect(getPaymentMock).toHaveBeenCalledTimes(2);
    expect(result.current.payment?.status).toBe("paid");
    expect(invalidateBillingSummaryMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PAYMENT_POLL_INTERVAL_MS * 2);
    });

    expect(getPaymentMock).toHaveBeenCalledTimes(2);
    expect(invalidateBillingSummaryMock).toHaveBeenCalledTimes(1);
  });

  test("rechecks the active payment on visibility changes and stops after 120 attempts", async () => {
    vi.useFakeTimers();
    const paymentId = "payment-visibility";
    const visibilityState = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    getPaymentMock.mockResolvedValue(makePayment({ id: paymentId, status: "checkout_created" }));

    renderHook(() => useRechargeCheckout({ initialPaymentId: paymentId }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(getPaymentMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    expect(getPaymentMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PAYMENT_POLL_INTERVAL_MS * (MAX_PAYMENT_POLLS - 1));
    });

    expect(getPaymentMock).toHaveBeenCalledTimes(MAX_PAYMENT_POLLS);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PAYMENT_POLL_INTERVAL_MS);
    });

    expect(getPaymentMock).toHaveBeenCalledTimes(MAX_PAYMENT_POLLS);
    visibilityState.mockRestore();
  });

  test("resetPayment clears the active payment and stops scheduled polling", async () => {
    vi.useFakeTimers();
    const paymentId = "payment-reset";
    getPaymentMock.mockResolvedValue(makePayment({ id: paymentId, status: "checkout_created" }));

    const { result } = renderHook(() => useRechargeCheckout({ initialPaymentId: paymentId }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(getPaymentMock).toHaveBeenCalledTimes(1);
    act(() => {
      result.current.resetPayment();
    });

    expect(result.current.payment).toBeNull();
    expect(result.current.busyPlanKey).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PAYMENT_POLL_INTERVAL_MS * 2);
    });

    expect(getPaymentMock).toHaveBeenCalledTimes(1);
  });
});
