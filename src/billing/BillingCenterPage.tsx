import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "../auth/useAuth";
import { buildBillingActivityRows, getEmptyBillingDisplayCatalog, loadBillingDisplayCatalog, type BillingDisplayCatalog } from "./billingActivity";
import { BillingActivityTable } from "./BillingActivityTable";
import { BillingSummaryCards } from "./BillingSummaryCards";
import { PaymentStatusPanel } from "./PaymentStatusPanel";
import { RechargePanel } from "./RechargePanel";
import { RedeemCodeBox } from "./RedeemCodeBox";
import { getBillingSummary, getPayment, listBillingLedger, listBillingUsageEvents, listRechargePlans, type BillingLedgerEntry, type BillingSummary, type BillingUsageEvent, type RechargePlan, type WalletPayment } from "./billingApi";

const MAX_PAYMENT_POLLS = 20;
const TERMINAL_PAYMENT_STATES = new Set(["paid", "create_failed", "cancelled", "refunded", "refund_failed"]);

export function BillingCenterPage() {
  const { authenticated, sessionId, user } = useAuth();
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [ledger, setLedger] = useState<BillingLedgerEntry[]>([]);
  const [usage, setUsage] = useState<BillingUsageEvent[]>([]);
  const [plans, setPlans] = useState<RechargePlan[]>([]);
  const [payment, setPayment] = useState<WalletPayment | null>(null);
  const [catalog, setCatalog] = useState<BillingDisplayCatalog>(() => getEmptyBillingDisplayCatalog());
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const paymentId = useMemo(() => new URLSearchParams(window.location.search).get("paymentId"), []);
  const identityKey = useMemo(() => authenticated && user ? `${user.id}:${sessionId ?? "none"}` : "anonymous", [authenticated, sessionId, user]);

  const refresh = useCallback(async () => {
    if (!authenticated || !user) return;
    const id = ++requestRef.current;
    try {
      const [nextSummary, nextUsage, nextLedger, nextPlans] = await Promise.all([getBillingSummary(), listBillingUsageEvents(), listBillingLedger(), listRechargePlans()]);
      if (id !== requestRef.current) return;
      setSummary(nextSummary); setUsage(nextUsage.items); setLedger(nextLedger.items); setPlans(nextPlans);
    } catch { if (id === requestRef.current) setError("钱包加载失败，请稍后重试。"); }
  }, [authenticated, user]);

  useEffect(() => { void refresh(); }, [identityKey, refresh]);
  useEffect(() => { void loadBillingDisplayCatalog().then(setCatalog).catch(() => undefined); }, []);
  useEffect(() => {
    if (!paymentId || !authenticated) return;
    let cancelled = false;
    let attempts = 0;
    const poll = async () => {
      attempts += 1;
      try {
        const next = await getPayment(paymentId);
        if (cancelled) return;
        setPayment(next);
        if (next.status === "paid") { await refresh(); return; }
        if (TERMINAL_PAYMENT_STATES.has(next.status) || attempts >= MAX_PAYMENT_POLLS) return;
        window.setTimeout(() => void poll(), 3_000);
      } catch { if (!cancelled && attempts < MAX_PAYMENT_POLLS) window.setTimeout(() => void poll(), 3_000); }
    };
    void poll();
    return () => { cancelled = true; };
  }, [authenticated, paymentId, refresh]);

  const onCreated = useCallback(async (next: WalletPayment) => { setPayment(next); const url = new URL(window.location.href); url.searchParams.set("paymentId", next.id); window.history.replaceState({}, "", url); }, []);
  const activityRows = useMemo(() => buildBillingActivityRows(usage, ledger, catalog), [catalog, ledger, usage]);

  return <div className="-mx-6 -my-9 min-h-[calc(100vh-80px)] bg-[#0b0b0d] px-6 py-8 sm:px-8">
    <main className="mx-auto max-w-[1440px]">
      <header><h1 className="text-2xl font-semibold text-white">个人钱包</h1><p className="mt-2 text-sm text-slate-400">积分属于个人账户，可在您加入的所有工作区中使用。</p></header>
      {error ? <p className="mt-4 rounded border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{error}</p> : null}
      <div className="mt-6"><BillingSummaryCards summary={summary} /></div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_360px]"><BillingActivityTable items={activityRows} /><aside className="space-y-4"><RechargePanel onCreated={onCreated} plans={plans} /><PaymentStatusPanel payment={payment} /><RedeemCodeBox onRedeemed={refresh} /></aside></div>
    </main>
  </div>;
}
