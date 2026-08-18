import React from "react";
import { ArrowLeft, ExternalLink, RefreshCw } from "lucide-react";

import type { WalletPayment } from "./billingApi";

const PAYMENT_STATUS_LABELS: Record<WalletPayment["status"], string> = {
  pending: "等待支付",
  checkout_created: "支付确认中",
  paid: "已支付",
  create_failed: "创建支付失败",
  cancelled: "已取消",
  refund_pending: "退款处理中",
  refunded: "已退款",
  refund_failed: "退款失败",
};

export type PaymentStatusPanelProps = {
  onBackToPlans?: () => void;
  onContinue?: () => void;
  onRetry?: () => void;
  onViewBilling?: () => void;
  payment: WalletPayment | null;
};

export function PaymentStatusPanel({ onBackToPlans, onContinue, onRetry, onViewBilling, payment }: PaymentStatusPanelProps) {
  if (!payment) return null;
  const isMobile = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 767px)").matches;
  const completed = payment.status === "paid";
  const terminalFailure = ["create_failed", "cancelled", "refunded", "refund_failed"].includes(payment.status);
  const statusClass = `mt-2 text-sm ${completed ? "text-emerald-300" : terminalFailure ? "text-red-300" : "text-amber-200"}`;
  return (
    <section className="rounded border border-white/10 bg-white/[0.04] p-4">
      <div className="text-sm font-semibold text-white">支付状态</div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div><span className="block text-xs text-slate-500">订单金额</span><span className="font-semibold text-white">￥{(payment.amountCents / 100).toFixed(2)}</span></div>
        <div><span className="block text-xs text-slate-500">到账积分</span><span className="font-semibold text-white">{payment.credits.toLocaleString()} 积分</span></div>
      </div>
      <p className={statusClass}>{PAYMENT_STATUS_LABELS[payment.status]}</p>
      {completed ? <p className="mt-2 text-sm font-semibold text-emerald-200">充值成功，{payment.credits.toLocaleString()} 积分已到账</p> : null}
      {payment.status === "refund_pending" ? <p className="mt-2 text-xs text-slate-400">退款完成后，账单状态会自动更新。</p> : null}
      {!isMobile && !completed && !terminalFailure && payment.qrCodeUrl ? <img alt="支付二维码" className="mt-3 h-44 w-44 bg-white p-2" src={payment.qrCodeUrl} /> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {completed ? <>
          {onContinue ? <button className="inline-flex items-center gap-2 rounded-lg bg-cyan-300 px-3 py-2 text-xs font-semibold text-slate-950" onClick={onContinue} type="button">继续创作</button> : null}
          {onViewBilling ? <button className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white" onClick={onViewBilling} type="button"><ExternalLink size={14} />查看账单</button> : null}
        </> : null}
        {terminalFailure ? <>
          {onRetry ? <button className="inline-flex items-center gap-2 rounded-lg bg-cyan-300 px-3 py-2 text-xs font-semibold text-slate-950" onClick={onRetry} type="button"><RefreshCw size={14} />重新支付</button> : null}
          {onBackToPlans ? <button className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white" onClick={onBackToPlans} type="button"><ArrowLeft size={14} />返回套餐</button> : null}
        </> : null}
      </div>
    </section>
  );
}
