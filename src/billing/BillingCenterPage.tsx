import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, RefreshCw, Sparkles, Zap } from "lucide-react";

import { useAuth } from "../auth/useAuth";
import { BillingLedgerTable } from "./BillingLedgerTable";
import { BillingSummaryCards } from "./BillingSummaryCards";
import { BillingUsageTable } from "./BillingUsageTable";
import { RechargePanel } from "./RechargePanel";
import { RedeemCodeBox } from "./RedeemCodeBox";
import {
  getBillingSummary,
  listBillingLedger,
  listBillingUsageEvents,
  type BillingLedgerEntry,
  type BillingSummary,
  type BillingUsageEvent,
} from "./billingApi";

const plans = [
  {
    description: "适合试用和轻量创作",
    name: "Basic",
    price: "¥0",
    tag: "入门",
    tone: "border-white/10 bg-white/[0.04]",
    value: "基础额度",
  },
  {
    description: "适合稳定生成和团队协作",
    featured: true,
    name: "Pro",
    price: "¥99",
    tag: "推荐",
    tone: "border-sky-300/30 bg-sky-500/10",
    value: "高频创作",
  },
  {
    description: "适合高并发、商业项目和定制路线",
    name: "Ultimate",
    price: "¥399",
    tag: "进阶",
    tone: "border-white/10 bg-white/[0.04]",
    value: "规模化生产",
  },
];

export function BillingCenterPage() {
  const { authenticated, sessionId, tenant, user } = useAuth();
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [ledger, setLedger] = useState<BillingLedgerEntry[]>([]);
  const [usage, setUsage] = useState<BillingUsageEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestSequenceRef = useRef(0);

  const identityKey = useMemo(
    () => (authenticated && tenant && user ? `${user.id}:${tenant.id}:${sessionId ?? "none"}` : "anonymous"),
    [authenticated, sessionId, tenant, user],
  );

  const refresh = useCallback(async () => {
    if (!authenticated || !tenant || !user) {
      requestSequenceRef.current += 1;
      setSummary(null);
      setUsage([]);
      setLedger([]);
      setError(null);
      setLoading(false);
      return;
    }

    const requestId = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestId;
    setLoading(true);
    setError(null);
    try {
      const [nextSummary, nextUsage, nextLedger] = await Promise.all([
        getBillingSummary(),
        listBillingUsageEvents(1, 20),
        listBillingLedger(1, 20),
      ]);
      if (requestSequenceRef.current !== requestId) return;
      setSummary(nextSummary);
      setUsage(nextUsage.items);
      setLedger(nextLedger.items);
    } catch (err) {
      if (requestSequenceRef.current !== requestId) return;
      setSummary(null);
      setUsage([]);
      setLedger([]);
      setError(err instanceof Error ? err.message : "计费数据加载失败，请稍后重试。");
    } finally {
      if (requestSequenceRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [authenticated, tenant, user]);

  useEffect(() => {
    requestSequenceRef.current += 1;
    setSummary(null);
    setUsage([]);
    setLedger([]);
    setError(null);
    setLoading(Boolean(authenticated && tenant && user));
  }, [authenticated, identityKey, tenant, user]);

  useEffect(() => {
    void refresh();
  }, [identityKey, refresh]);

  const showLocalQaHint =
    import.meta.env.DEV &&
    !loading &&
    !error &&
    summary &&
    summary.account.balanceCents === 0 &&
    summary.account.reservedCents === 0 &&
    usage.length === 0 &&
    ledger.length === 0;

  return (
    <div className="space-y-5">
      <header className="rounded border border-white/10 bg-[#0b0d14] p-5 md:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded border border-sky-300/20 bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-100">
              <Sparkles size={14} />
              Billing
            </div>
            <h1 className="mt-4 text-3xl font-semibold text-white">选择你的套餐</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">不止额度，更是灵感落地的速度。</p>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
              额度由服务端预占、结算和失败退款，适合从个人试用到团队生产的不同节奏。
            </p>
          </div>
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded border border-white/10 bg-white/10 px-4 text-sm text-white hover:bg-white/15 disabled:opacity-60"
            disabled={loading}
            onClick={() => void refresh()}
            type="button"
          >
            {loading ? <Loader2 className="animate-spin" size={15} /> : <RefreshCw size={15} />}
            刷新
          </button>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-3">
          {plans.map((plan) => (
            <section className={`rounded border p-4 ${plan.tone}`} key={plan.name}>
              <div className="flex items-center justify-between gap-3">
                <div className="text-lg font-semibold text-white">{plan.name}</div>
                <span className="rounded bg-white px-2 py-1 text-xs font-semibold text-slate-950">{plan.tag}</span>
              </div>
              <div className="mt-4 flex items-end gap-2">
                <span className="text-3xl font-semibold text-white">{plan.price}</span>
                <span className="pb-1 text-sm text-slate-500">/ 月</span>
              </div>
              <p className="mt-2 text-sm text-slate-400">{plan.description}</p>
              <div className="mt-4 flex items-center gap-2 text-sm text-slate-200">
                <Zap className={plan.featured ? "text-sky-200" : "text-slate-400"} size={16} />
                {plan.value}
              </div>
              <div className="mt-4 space-y-2 text-sm text-slate-400">
                {["额度自动结算", "失败自动退回", "支持项目流水追踪"].map((feature) => (
                  <div className="flex items-center gap-2" key={feature}>
                    <Check className="text-emerald-300" size={15} />
                    {feature}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </header>

      {error && (
        <div className="rounded border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {showLocalQaHint && (
        <div className="rounded border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          当前工作区还没有计费记录。如需本地联调，可运行
          <code className="mx-1 rounded bg-black/30 px-1 py-0.5">npm run dev:seed-billing -- --email your-user@example.com</code>
          生成测试数据后再刷新此页面。
        </div>
      )}

      <BillingSummaryCards summary={summary} />

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <BillingUsageTable items={usage} />
          <BillingLedgerTable items={ledger} />
        </div>
        <div className="space-y-4">
          <RedeemCodeBox onRedeemed={refresh} />
          <RechargePanel onCreated={refresh} />
        </div>
      </div>
    </div>
  );
}
