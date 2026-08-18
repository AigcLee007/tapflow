import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { BILLING_ROUTE } from "../app/routes";
import { getAvailableCredits } from "./billingDisplay";
import { PaymentStatusPanel } from "./PaymentStatusPanel";
import { RechargePanel } from "./RechargePanel";
import { useBillingSummarySnapshot } from "./useBillingSummarySnapshot";
import { useRecharge } from "./RechargeContext";

function navigate(path: string) {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function RechargeDialog() {
  const recharge = useRecharge();
  const billingSnapshot = useBillingSummarySnapshot(true);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!recharge.dialogOpen) return;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") recharge.closeRecharge(); };
    document.addEventListener("keydown", handleKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", handleKeyDown); };
  }, [recharge.dialogOpen, recharge.closeRecharge]);

  if (!recharge.dialogOpen || typeof document === "undefined") return null;
  const title = "充值积分";
  return createPortal(
    <div className="fixed inset-0 z-[2600] flex items-center justify-center bg-black/70 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) recharge.closeRecharge(); }}>
      <div aria-labelledby="recharge-dialog-title" aria-modal="true" className="flex max-h-[calc(100dvh-32px)] w-full max-w-[1120px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0d0f14] shadow-2xl" role="dialog">
        <div className="flex shrink-0 items-center justify-between border-b border-white/8 px-5 py-4">
          <div><h2 className="text-lg font-semibold text-white" id="recharge-dialog-title">{title}</h2><p className="mt-1 text-xs text-slate-400">当前可用 {getAvailableCredits(billingSnapshot.summary)?.toLocaleString() ?? "--"} 积分，一次购买，不自动续费</p></div>
          <button aria-label="关闭充值" className="grid h-9 w-9 place-items-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white" onClick={recharge.closeRecharge} ref={closeRef} type="button"><X size={18} /></button>
        </div>
        <div className="min-h-0 overflow-y-auto p-5">
          {recharge.payment ? <PaymentStatusPanel
            onBackToPlans={recharge.resetPayment}
            onContinue={recharge.closeRecharge}
            onRetry={async () => { const plan = recharge.plans.find((item) => item.key === recharge.payment?.planKey); if (plan) await recharge.beginCheckout(plan); }}
            onViewBilling={() => { recharge.closeRecharge(); navigate(BILLING_ROUTE); }}
            payment={recharge.payment}
          /> : <RechargePanel busyPlanKey={recharge.busyPlanKey} onRetry={() => void recharge.loadPlans()} onSelect={(plan) => void recharge.beginCheckout(plan)} plans={recharge.plans} status={recharge.plansStatus} />}
          {recharge.error ? <p className="mt-3 text-sm text-rose-200">{recharge.error}</p> : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
