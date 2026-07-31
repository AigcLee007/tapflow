import React, { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";

import { createPaymentCheckout, type RechargePlan, type WalletPayment } from "./billingApi";

export function RechargePanel({ onCreated, plans }: { onCreated: (payment: WalletPayment) => Promise<void> | void; plans: RechargePlan[] }) {
  const [creatingPlanKey, setCreatingPlanKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const startCheckout = async (plan: RechargePlan) => {
    setCreatingPlanKey(plan.key);
    setMessage(null);
    try {
      const payment = await createPaymentCheckout({ planKey: plan.key, idempotencyKey: `payment-ui:${crypto.randomUUID()}` });
      if (window.matchMedia("(max-width: 767px)").matches && payment.checkoutUrl) {
        window.location.assign(payment.checkoutUrl);
      }
      await onCreated(payment);
    } catch {
      setMessage("创建支付订单失败，请稍后重试。");
    } finally { setCreatingPlanKey(null); }
  };

  return (
    <section className="rounded border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-white"><CreditCard size={16} />充值积分</div>
      <div className="mt-3 grid gap-2">
        {plans.map((plan) => (
          <button className="flex min-h-14 items-center justify-between rounded border border-white/10 bg-black/20 px-3 text-left text-sm text-white hover:bg-white/10 disabled:opacity-60" disabled={creatingPlanKey !== null} key={plan.id} onClick={() => void startCheckout(plan)} type="button">
            <span><span className="block font-semibold">￥{(plan.amountCents / 100).toFixed(2)}</span><span className="text-xs text-slate-400">{plan.credits.toLocaleString()} 积分，有效期 {plan.validityDays} 天</span></span>
            {creatingPlanKey === plan.key ? <Loader2 className="animate-spin" size={16} /> : <CreditCard size={16} />}
          </button>
        ))}
      </div>
      {message ? <p className="mt-2 text-xs text-red-300">{message}</p> : null}
    </section>
  );
}
