import React, { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";

import { createPaymentCheckout } from "./billingApi";

export function RechargePanel({ onCreated }: { onCreated: () => Promise<void> | void }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const createPendingPayment = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const result = await createPaymentCheckout({
        amountCents: 1000,
        credits: 1000,
        idempotencyKey: `payment-ui:${Date.now()}`,
      });
      setMessage(`充值记录已创建，当前状态：${result.payment.status}。`);
      await onCreated();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "创建充值记录失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        <CreditCard size={16} />
        充值
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-400">
        当前版本会先创建一条可审计的待支付记录，实际支付接入仍由服务端流程控制。
      </p>
      <button
        className="mt-3 inline-flex h-10 items-center gap-2 rounded border border-white/10 bg-white/10 px-4 text-sm text-white hover:bg-white/15 disabled:opacity-60"
        disabled={loading}
        onClick={() => void createPendingPayment()}
        type="button"
      >
        {loading ? <Loader2 className="animate-spin" size={15} /> : <CreditCard size={15} />}
        创建待支付记录
      </button>
      {message && <div className="mt-2 text-xs text-slate-400">{message}</div>}
    </section>
  );
}
