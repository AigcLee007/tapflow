import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Flame, Zap } from "lucide-react";

import { useAuth } from "../auth/useAuth";
import {
  buildBillingActivityRows,
  getEmptyBillingDisplayCatalog,
  loadBillingDisplayCatalog,
  type BillingDisplayCatalog,
} from "./billingActivity";
import { BillingActivityTable } from "./BillingActivityTable";
import { BillingSummaryCards } from "./BillingSummaryCards";
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
    description: "适合初次探索 AI 创作",
    features: ["1,000 积分/月", "基础生成队列", "个人项目创作"],
    name: "Basic",
    price: "¥0",
    tag: "",
    tone: "border-white/12 bg-[#171719] hover:border-white/20",
    value: "基础额度",
  },
  {
    description: "适合高频创作与持续产出",
    featured: true,
    features: ["12,000 积分/月", "高优先级队列", "商用项目流水追踪"],
    name: "Pro",
    price: "¥99",
    tag: "最受欢迎",
    tone:
      "border-cyan-200/35 bg-[radial-gradient(circle_at_88%_0%,rgba(125,211,252,0.24),transparent_30%),linear-gradient(145deg,#172126,#121416)] shadow-[0_24px_80px_rgba(8,145,178,0.16)]",
    value: "高频创作",
  },
  {
    description: "适合大批量稳定产出与交付",
    features: ["60,000 积分/月", "团队协作额度", "专属交付支持"],
    name: "Ultimate",
    price: "¥399",
    tag: "",
    tone: "border-white/12 bg-[#171719] hover:border-white/20",
    value: "规模化生产",
  },
];

export function BillingCenterPage() {
  const { authenticated, sessionId, tenant, user } = useAuth();
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [ledger, setLedger] = useState<BillingLedgerEntry[]>([]);
  const [usage, setUsage] = useState<BillingUsageEvent[]>([]);
  const [displayCatalog, setDisplayCatalog] = useState<BillingDisplayCatalog>(() => getEmptyBillingDisplayCatalog());
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

  useEffect(() => {
    let active = true;
    void loadBillingDisplayCatalog()
      .then((catalog) => {
        if (!active) return;
        setDisplayCatalog(catalog);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const showLocalQaHint =
    import.meta.env.DEV &&
    !loading &&
    !error &&
    summary &&
    summary.account.balanceCents === 0 &&
    summary.account.reservedCents === 0 &&
    usage.length === 0 &&
    ledger.length === 0;
  const activityRows = useMemo(
    () => buildBillingActivityRows(usage, ledger, displayCatalog),
    [displayCatalog, ledger, usage],
  );

  return (
    <div className="relative -mx-6 -my-9 min-h-[calc(100vh-80px)] overflow-hidden px-6 py-6 sm:px-8 lg:py-8">
      <div className="absolute inset-0 bg-[#0b0b0d]" />
      <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(rgba(148,163,184,0.28)_1.2px,transparent_1.2px)] [background-size:38px_38px]" />
      <div className="absolute right-[-120px] top-[-180px] h-[520px] w-[680px] bg-[radial-gradient(circle_at_50%_50%,rgba(45,212,191,0.13),transparent_62%)]" />

      <section className="relative mx-auto max-w-[1760px]">
        <div className="inline-flex max-w-full flex-wrap rounded-[24px] border border-white/12 bg-[#19191b] p-2 text-base font-semibold text-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:text-lg">
          <button className="h-14 rounded-[18px] px-6 text-slate-300 hover:text-white sm:px-8" type="button">
            连续包月 15% OFF
          </button>
          <button
            aria-pressed="true"
            className="h-14 rounded-[18px] bg-white px-6 text-slate-950 shadow-[0_12px_30px_rgba(255,255,255,0.08)] sm:px-8"
            type="button"
          >
            连续包年 40% OFF
          </button>
          <button className="h-14 rounded-[18px] px-6 text-slate-300 hover:text-white sm:px-8" type="button">
            企业版
          </button>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3 xl:gap-10">
          {plans.map((plan) => (
            <section
              className={`min-h-[392px] rounded-[26px] border p-7 transition-colors sm:p-8 ${plan.tone}`}
              key={plan.name}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-3xl font-semibold uppercase tracking-tight text-white">{plan.name}</div>
                {plan.tag ? (
                  <span className="inline-flex items-center gap-2 rounded-full bg-cyan-200 px-4 py-2 text-sm font-bold text-slate-950">
                    <Flame size={16} />
                    {plan.tag}
                  </span>
                ) : null}
              </div>
              <div className="mt-10 flex items-end gap-2">
                <span className="text-5xl font-semibold text-white">{plan.price}</span>
                <span className="pb-2 text-xl text-slate-500">/ 月</span>
              </div>
              <p className="mt-4 text-lg leading-7 text-slate-400 sm:text-xl">{plan.description}</p>
              <div className="mt-8 flex items-center gap-3 border-t border-white/10 pt-7 text-lg text-slate-200 sm:text-xl">
                <Zap className={plan.featured ? "text-sky-200" : "text-slate-400"} size={16} />
                {plan.value}
              </div>
              <div className="mt-7 space-y-4 text-base text-slate-400 sm:text-lg">
                {plan.features.map((feature) => (
                  <div className="flex items-center gap-3" key={feature}>
                    <Check className="text-emerald-300" size={18} />
                    {feature}
                  </div>
                ))}
              </div>
              <button
                className={`mt-9 h-12 w-full rounded-[14px] text-sm font-semibold transition-colors ${
                  plan.featured ? "bg-white text-slate-950 hover:bg-cyan-50" : "bg-white/[0.08] text-white hover:bg-white/12"
                }`}
                type="button"
              >
                选择套餐
              </button>
            </section>
          ))}
        </div>
      </section>

      {error && (
        <div className="relative mx-auto mt-6 max-w-[1760px] rounded border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {showLocalQaHint && (
        <div className="relative mx-auto mt-6 max-w-[1760px] rounded border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          当前工作区还没有计费记录。如需本地联调，可运行
          <code className="mx-1 rounded bg-black/30 px-1 py-0.5">npm run dev:seed-billing -- --email your-user@example.com</code>
          生成测试数据后再刷新此页面。
        </div>
      )}

      <div className="relative mx-auto mt-10 max-w-[1760px]">
        <BillingSummaryCards summary={summary} />
      </div>

      <div className="relative mx-auto mt-4 grid max-w-[1760px] gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <BillingActivityTable items={activityRows} />
        </div>
        <div className="space-y-4">
          <RedeemCodeBox onRedeemed={refresh} />
          <RechargePanel onCreated={refresh} />
        </div>
      </div>
    </div>
  );
}
