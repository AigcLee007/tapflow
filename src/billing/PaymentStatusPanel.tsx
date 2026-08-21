import React from "react";
import { ArrowLeft, CheckCircle2, ExternalLink, MessageCircle, RefreshCw } from "lucide-react";

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
  const statusClass = completed ? "text-emerald-300" : terminalFailure ? "text-red-300" : "text-amber-200";
  return (
    <section className="mx-auto w-full max-w-[520px] text-center">
      <header className="flex flex-col items-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-300">
          {completed ? <CheckCircle2 size={24} /> : <MessageCircle size={24} />}
        </div>
        <h2 className="mt-3 text-lg font-semibold text-white">微信扫码支付</h2>
        <p className="mt-1 text-xs text-slate-400">当前仅支持微信支付</p>
      </header>

      <div className="mt-5 grid grid-cols-3 gap-2 border-y border-white/10 py-3 text-left">
        <div className="min-w-0 px-2">
          <span className="block text-[11px] text-slate-500">应付金额</span>
          <span className="mt-1 block truncate text-sm font-semibold text-white">￥{(payment.amountCents / 100).toFixed(2)}</span>
        </div>
        <div className="min-w-0 border-x border-white/10 px-2">
          <span className="block text-[11px] text-slate-500">到账积分</span>
          <span className="mt-1 block truncate text-sm font-semibold text-white">{payment.credits.toLocaleString()} 积分</span>
        </div>
        <div className="min-w-0 px-2">
          <span className="block text-[11px] text-slate-500">状态</span>
          <span className={`mt-1 block truncate text-sm font-semibold ${statusClass}`}>{PAYMENT_STATUS_LABELS[payment.status]}</span>
        </div>
      </div>

      {!completed && !terminalFailure ? <>
        {!isMobile && payment.qrCodeUrl ? <>
          <p className="mt-5 text-sm font-medium text-white">请使用微信扫一扫完成支付</p>
          <img alt="支付二维码" className="mx-auto mt-3 h-56 w-56 rounded-xl bg-white p-3" src={payment.qrCodeUrl} />
          <p className="mt-3 text-xs text-slate-500">二维码有效期内请完成支付</p>
        </> : <p className="mt-5 text-sm text-slate-300">正在打开微信支付，请完成付款。</p>}
      </> : null}
      {completed ? <div className="mt-6 rounded-xl bg-emerald-500/10 px-4 py-4 text-sm font-semibold text-emerald-200">充值成功，{payment.credits.toLocaleString()} 积分已到账</div> : null}
      {payment.status === "refund_pending" ? <p className="mt-5 text-xs text-slate-400">退款完成后，账单状态会自动更新。</p> : null}
      <div className="mt-5 flex flex-wrap justify-center gap-2">
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
