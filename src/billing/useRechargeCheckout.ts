import { useCallback, useEffect, useRef, useState } from "react";

import { createPaymentCheckout, getPayment, listRechargePlans, type RechargePlan, type WalletPayment } from "./billingApi";
import { invalidateBillingSummary } from "./useBillingSummarySnapshot";

const PAYMENT_POLL_INTERVAL_MS = 3_000;
const MAX_PAYMENT_POLLS = 120;
const TERMINAL_PAYMENT_STATES = new Set<WalletPayment["status"]>([
  "paid",
  "create_failed",
  "cancelled",
  "refunded",
  "refund_failed",
]);

export type RechargeCheckoutState = {
  busyPlanKey: string | null;
  error: string | null;
  loadPlans: () => Promise<void>;
  payment: WalletPayment | null;
  plans: RechargePlan[];
  plansStatus: "idle" | "loading" | "ready" | "error";
  resetPayment: () => void;
  startCheckout: (plan: RechargePlan) => Promise<WalletPayment | null>;
};

function isMobileViewport(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 767px)").matches;
}

export function useRechargeCheckout(initialPaymentId: string | null = null): RechargeCheckoutState {
  const [plans, setPlans] = useState<RechargePlan[]>([]);
  const [plansStatus, setPlansStatus] = useState<RechargeCheckoutState["plansStatus"]>("idle");
  const [busyPlanKey, setBusyPlanKey] = useState<string | null>(null);
  const [payment, setPayment] = useState<WalletPayment | null>(null);
  const [activePaymentId, setActivePaymentId] = useState<string | null>(initialPaymentId);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const paidRef = useRef(new Set<string>());

  const loadPlans = useCallback(async () => {
    const requestId = ++requestRef.current;
    setPlansStatus("loading");
    setError(null);
    try {
      const nextPlans = await listRechargePlans();
      if (requestId !== requestRef.current) return;
      setPlans(nextPlans);
      setPlansStatus("ready");
    } catch {
      if (requestId !== requestRef.current) return;
      setPlansStatus("error");
      setError("套餐加载失败，请稍后重试。");
    }
  }, []);

  const startCheckout = useCallback(async (plan: RechargePlan) => {
    setBusyPlanKey(plan.key);
    setError(null);
    try {
      const next = await createPaymentCheckout({
        planKey: plan.key,
        idempotencyKey: `payment-ui:${crypto.randomUUID()}`,
      });
      setPayment(next);
      setActivePaymentId(next.id);
      if (isMobileViewport() && next.checkoutUrl) window.location.assign(next.checkoutUrl);
      return next;
    } catch {
      setError("创建支付订单失败，请稍后重试。");
      return null;
    } finally {
      setBusyPlanKey(null);
    }
  }, []);

  const resetPayment = useCallback(() => {
    setPayment(null);
    setActivePaymentId(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (!activePaymentId) return;
    let cancelled = false;
    let attempts = 0;
    let timeoutId: number | null = null;
    let inFlight = false;

    const poll = async () => {
      if (cancelled || inFlight || attempts >= MAX_PAYMENT_POLLS) return;
      inFlight = true;
      attempts += 1;
      try {
        const next = await getPayment(activePaymentId);
        if (cancelled) return;
        setPayment(next);
        if (next.status === "paid" && !paidRef.current.has(next.id)) {
          paidRef.current.add(next.id);
          invalidateBillingSummary();
        }
        if (!TERMINAL_PAYMENT_STATES.has(next.status) && attempts < MAX_PAYMENT_POLLS) {
          timeoutId = window.setTimeout(() => void poll(), PAYMENT_POLL_INTERVAL_MS);
        }
      } catch {
        if (!cancelled && attempts < MAX_PAYMENT_POLLS) timeoutId = window.setTimeout(() => void poll(), PAYMENT_POLL_INTERVAL_MS);
      } finally {
        inFlight = false;
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState !== "visible" || cancelled) return;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      timeoutId = null;
      void poll();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    void poll();
    return () => {
      cancelled = true;
      requestRef.current += 1;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [activePaymentId]);

  return { busyPlanKey, error, loadPlans, payment, plans, plansStatus, resetPayment, startCheckout };
}

export { MAX_PAYMENT_POLLS, PAYMENT_POLL_INTERVAL_MS };
