import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { getAvailableCredits } from "./billingDisplay";
import { RechargeDialog } from "./RechargeDialog";
import { RECHARGE_REQUEST_EVENT, type RechargeRequestDetail } from "./rechargeRequest";
import { useBillingSummarySnapshot } from "./useBillingSummarySnapshot";
import { useRechargeCheckout, type RechargeCheckoutState } from "./useRechargeCheckout";

export type RechargeContextValue = RechargeCheckoutState & {
  beginCheckout: (plan: RechargeCheckoutState["plans"][number]) => Promise<void>;
  closeRecharge: () => void;
  dialogOpen: boolean;
  openRecharge: (options: { source: RechargeRequestDetail["source"] }) => void;
};

const RechargeContext = createContext<RechargeContextValue | null>(null);

export function RechargeProvider({ children }: { children: React.ReactNode }) {
  const initialPaymentId = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("paymentId");
  const checkout = useRechargeCheckout({ initialPaymentId });
  const billingSnapshot = useBillingSummarySnapshot(true);
  const [dialogOpen, setDialogOpen] = useState(Boolean(initialPaymentId));
  const [prompt, setPrompt] = useState<RechargeRequestDetail | null>(null);

  const openRecharge = useCallback(({ source }: { source: RechargeRequestDetail["source"] }) => {
    setDialogOpen(true);
    setPrompt(null);
    if (checkout.plansStatus === "idle") void checkout.loadPlans();
    void source;
  }, [checkout]);

  const closeRecharge = useCallback(() => {
    if (checkout.busyPlanKey) return;
    setDialogOpen(false);
    setPrompt(null);
  }, [checkout.busyPlanKey]);

  const beginCheckout = useCallback(async (plan: RechargeCheckoutState["plans"][number]) => {
    const next = await checkout.startCheckout(plan);
    if (!next) return;
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("paymentId", next.id);
      window.history.replaceState({}, "", url);
    }
  }, [checkout]);

  useEffect(() => {
    const handleRequest = (event: Event) => {
      const detail = (event as CustomEvent<RechargeRequestDetail>).detail;
      if (!detail) return;
      setPrompt(detail);
    };
    window.addEventListener(RECHARGE_REQUEST_EVENT, handleRequest);
    return () => window.removeEventListener(RECHARGE_REQUEST_EVENT, handleRequest);
  }, []);

  const value = useMemo<RechargeContextValue>(() => ({
    ...checkout,
    beginCheckout,
    closeRecharge,
    dialogOpen,
    openRecharge,
  }), [beginCheckout, checkout, closeRecharge, dialogOpen, openRecharge]);

  return <RechargeContext.Provider value={value}>
    {children}
    {prompt ? <div className="fixed bottom-5 right-5 z-[2500] max-w-[360px] rounded-xl border border-cyan-300/30 bg-[#111318] p-4 shadow-2xl">
      <div className="text-sm font-semibold text-white">余额不足，充值后继续</div>
      <p className="mt-1 text-xs text-slate-400">预计消耗 {prompt.requiredCredits ?? "-"} 积分，当前可用 {prompt.availableCredits ?? getAvailableCredits(billingSnapshot.summary) ?? "-"} 积分</p>
      <button className="mt-3 rounded-lg bg-cyan-300 px-3 py-2 text-xs font-semibold text-slate-950" onClick={() => openRecharge({ source: prompt.source })} type="button">立即充值</button>
    </div> : null}
    <RechargeDialog />
  </RechargeContext.Provider>;
}

export function useRecharge(): RechargeContextValue {
  const context = useRechargeContext();
  if (context) return context;
  return {
    beginCheckout: async () => undefined,
    busyPlanKey: null,
    closeRecharge: () => undefined,
    dialogOpen: false,
    error: null,
    loadPlans: async () => undefined,
    openRecharge: () => undefined,
    payment: null,
    plans: [],
    plansStatus: "idle",
    resetPayment: () => undefined,
    startCheckout: async () => null,
  };
}

export function useRechargeContext(): RechargeContextValue | null {
  return useContext(RechargeContext);
}
