import { useCallback, useEffect, useRef, useState } from "react";

import { createPaymentCheckout, getPayment, listRechargePlans, type RechargePlan, type WalletPayment } from "./billingApi";
import { invalidateBillingSummary } from "./useBillingSummarySnapshot";

export const MAX_PAYMENT_POLLS = 120;
export const PAYMENT_POLL_INTERVAL_MS = 3000;

const PLAN_LOAD_ERROR = "套餐加载失败，请稍后重试。";
const CHECKOUT_ERROR = "创建支付订单失败，请稍后重试。";
const TERMINAL_PAYMENT_STATES = new Set<WalletPayment["status"]>(["paid", "create_failed", "cancelled", "refunded", "refund_failed"]);

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

type UseRechargeCheckoutOptions = {
  initialPaymentId?: string | null;
  onMobileCheckoutUrl?: (checkoutUrl: string) => void;
};

function isMobileCheckout(): boolean {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(max-width: 767px)").matches;
}

function makeCheckoutIdempotencyKey(): string {
  const uuid = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `payment-ui:${uuid}`;
}

export function useRechargeCheckout({ initialPaymentId = null, onMobileCheckoutUrl }: UseRechargeCheckoutOptions = {}): RechargeCheckoutState {
  const [busyPlanKey, setBusyPlanKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payment, setPayment] = useState<WalletPayment | null>(null);
  const [plans, setPlans] = useState<RechargePlan[]>([]);
  const [plansStatus, setPlansStatus] = useState<RechargeCheckoutState["plansStatus"]>("idle");

  const mountedRef = useRef(true);
  const planRequestIdRef = useRef(0);
  const paymentGenerationRef = useRef(0);
  const activePaymentIdRef = useRef<string | null>(null);
  const pollingTimeoutRef = useRef<number | null>(null);
  const pollingInFlightRef = useRef(false);
  const pollingAttemptRef = useRef(0);
  const invalidatedPaidPaymentsRef = useRef(new Set<string>());

  const clearPollingTimer = useCallback(() => {
    if (pollingTimeoutRef.current !== null) {
      window.clearTimeout(pollingTimeoutRef.current);
      pollingTimeoutRef.current = null;
    }
  }, []);

  const stopPolling = useCallback(() => {
    clearPollingTimer();
    pollingAttemptRef.current = 0;
    pollingInFlightRef.current = false;
  }, [clearPollingTimer]);

  const activatePaymentTarget = useCallback((paymentId: string | null) => {
    paymentGenerationRef.current += 1;
    activePaymentIdRef.current = paymentId;
    stopPolling();
    return paymentGenerationRef.current;
  }, [stopPolling]);

  const schedulePoll = useCallback((paymentId: string, generation: number) => {
    if (typeof window === "undefined") return;
    clearPollingTimer();
    pollingTimeoutRef.current = window.setTimeout(() => {
      void pollPayment(paymentId, generation);
    }, PAYMENT_POLL_INTERVAL_MS);
  }, [clearPollingTimer]);

  const pollPayment = useCallback(async (paymentId: string, generation: number) => {
    if (pollingInFlightRef.current) return;
    if (generation !== paymentGenerationRef.current || activePaymentIdRef.current !== paymentId) return;

    pollingInFlightRef.current = true;
    const attempt = pollingAttemptRef.current + 1;
    pollingAttemptRef.current = attempt;

    try {
      const nextPayment = await getPayment(paymentId);
      if (!mountedRef.current || generation !== paymentGenerationRef.current || activePaymentIdRef.current !== paymentId) return;
      setPayment(nextPayment);

      if (nextPayment.status === "paid") {
        if (!invalidatedPaidPaymentsRef.current.has(paymentId)) {
          invalidatedPaidPaymentsRef.current.add(paymentId);
          invalidateBillingSummary();
        }
        stopPolling();
        return;
      }

      if (TERMINAL_PAYMENT_STATES.has(nextPayment.status) || attempt >= MAX_PAYMENT_POLLS) {
        stopPolling();
        return;
      }

      schedulePoll(paymentId, generation);
    } catch {
      if (!mountedRef.current || generation !== paymentGenerationRef.current || activePaymentIdRef.current !== paymentId) return;
      if (attempt >= MAX_PAYMENT_POLLS) {
        stopPolling();
        return;
      }
      schedulePoll(paymentId, generation);
    } finally {
      pollingInFlightRef.current = false;
    }
  }, [schedulePoll, stopPolling]);

  const loadPlans = useCallback(async () => {
    const requestId = ++planRequestIdRef.current;
    setPlansStatus("loading");
    setError(null);
    try {
      const nextPlans = await listRechargePlans();
      if (!mountedRef.current || requestId !== planRequestIdRef.current) return;
      setPlans(nextPlans);
      setPlansStatus("ready");
    } catch {
      if (!mountedRef.current || requestId !== planRequestIdRef.current) return;
      setPlansStatus("error");
      setError(PLAN_LOAD_ERROR);
    }
  }, []);

  const resetPayment = useCallback(() => {
    paymentGenerationRef.current += 1;
    activePaymentIdRef.current = null;
    stopPolling();
    setBusyPlanKey(null);
    setError(null);
    setPayment(null);
  }, [stopPolling]);

  const startCheckout = useCallback(async (plan: RechargePlan) => {
    const requestId = ++paymentGenerationRef.current;
    activePaymentIdRef.current = null;
    stopPolling();
    setBusyPlanKey(plan.key);
    setError(null);

    try {
      const nextPayment = await createPaymentCheckout({
        idempotencyKey: makeCheckoutIdempotencyKey(),
        planKey: plan.key,
      });
      if (!mountedRef.current || requestId !== paymentGenerationRef.current) return null;

      setPayment(nextPayment);
      setBusyPlanKey(null);

      const generation = activatePaymentTarget(nextPayment.id);
      void pollPayment(nextPayment.id, generation);

      if (isMobileCheckout() && nextPayment.checkoutUrl) {
        if (onMobileCheckoutUrl) {
          onMobileCheckoutUrl(nextPayment.checkoutUrl);
        } else {
          window.location.assign(nextPayment.checkoutUrl);
        }
      }

      return nextPayment;
    } catch {
      if (!mountedRef.current || requestId !== paymentGenerationRef.current) return null;
      setBusyPlanKey(null);
      setError(CHECKOUT_ERROR);
      return null;
    }
  }, [activatePaymentTarget, onMobileCheckoutUrl, pollPayment, stopPolling]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      paymentGenerationRef.current += 1;
      stopPolling();
    };
  }, [stopPolling]);

  useEffect(() => {
    if (!initialPaymentId) return undefined;
    const generation = activatePaymentTarget(initialPaymentId);
    void pollPayment(initialPaymentId, generation);
    return () => {
      paymentGenerationRef.current += 1;
      stopPolling();
    };
  }, [activatePaymentTarget, initialPaymentId, pollPayment, stopPolling]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      const paymentId = activePaymentIdRef.current;
      if (!paymentId) return;
      const generation = paymentGenerationRef.current;
      clearPollingTimer();
      void pollPayment(paymentId, generation);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [clearPollingTimer, pollPayment]);

  return {
    busyPlanKey,
    error,
    loadPlans,
    payment,
    plans,
    plansStatus,
    resetPayment,
    startCheckout,
  };
}
