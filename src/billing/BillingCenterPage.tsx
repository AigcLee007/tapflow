import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "../auth/useAuth";
import { buildBillingActivityRows, getEmptyBillingDisplayCatalog, loadBillingDisplayCatalog, type BillingDisplayCatalog } from "./billingActivity";
import { BillingActivityTable } from "./BillingActivityTable";
import { BillingSummaryCards } from "./BillingSummaryCards";
import { PaymentStatusPanel } from "./PaymentStatusPanel";
import { RechargePanel } from "./RechargePanel";
import { RedeemCodeBox } from "./RedeemCodeBox";
import { getPayment, listBillingLedger, listBillingUsageEvents, listRechargePlans, type BillingLedgerEntry, type BillingUsageEvent, type RechargePlan, type WalletPayment } from "./billingApi";
import { invalidateBillingSummary, useBillingSummarySnapshot } from "./useBillingSummarySnapshot";

const MAX_PAYMENT_POLLS = 120;
const TERMINAL_PAYMENT_STATES = new Set(["paid", "create_failed", "cancelled", "refunded", "refund_failed"]);

export function BillingCenterPage() {
  const { authenticated, sessionId, user } = useAuth();
  const billingSnapshot = useBillingSummarySnapshot(Boolean(authenticated && user));
  const [ledger, setLedger] = useState<BillingLedgerEntry[]>([]);
  const [usage, setUsage] = useState<BillingUsageEvent[]>([]);
  const [plans, setPlans] = useState<RechargePlan[]>([]);
  const [payment, setPayment] = useState<WalletPayment | null>(null);
  const [catalog, setCatalog] = useState<BillingDisplayCatalog>(() => getEmptyBillingDisplayCatalog());
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const [activePaymentId, setActivePaymentId] = useState<string | null>(() => new URLSearchParams(window.location.search).get("paymentId"));
  const identityKey = useMemo(() => authenticated && user ? `${user.id}:${sessionId ?? "none"}` : "anonymous", [authenticated, sessionId, user]);

  const refreshData = useCallback(async () => {
    if (!authenticated || !user) return;
    const id = ++requestRef.current;
    try {
      const [nextUsage, nextLedger, nextPlans] = await Promise.all([listBillingUsageEvents(), listBillingLedger(), listRechargePlans()]);
      if (id !== requestRef.current) return;
      setUsage(nextUsage.items); setLedger(nextLedger.items); setPlans(nextPlans);
    } catch { if (id === requestRef.current) setError("钱包加载失败，请稍后重试。"); }
  }, [authenticated, user]);

  useEffect(() => { void refreshData(); }, [identityKey, refreshData]);
  useEffect(() => { void loadBillingDisplayCatalog().then(setCatalog).catch(() => undefined); }, []);
  useEffect(() => {
    if (!activePaymentId || !authenticated) return;
    let cancelled = false;
    let attempts = 0;
    let inFlight = false;
    let timeoutId: number | null = null;
    const poll = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      attempts += 1;
      try {
        const next = await getPayment(activePaymentId);
        if (cancelled) return;
        setPayment(next);
        if (next.status === "paid") {
          invalidateBillingSummary();
          await Promise.all([refreshData(), billingSnapshot.refresh()]);
          return;
        }
        if (TERMINAL_PAYMENT_STATES.has(next.status) || attempts >= MAX_PAYMENT_POLLS) return;
        timeoutId = window.setTimeout(() => void poll(), 3_000);
      } catch { if (!cancelled && attempts < MAX_PAYMENT_POLLS) timeoutId = window.setTimeout(() => void poll(), 3_000); }
      finally { inFlight = false; }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible" || cancelled) return;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      timeoutId = null;
      void poll();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    void poll();
    return () => {
      cancelled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [activePaymentId, authenticated, billingSnapshot.refresh, refreshData]);

  const onCreated = useCallback(async (next: WalletPayment) => { setPayment(next); const url = new URL(window.location.href); url.searchParams.set("paymentId", next.id); window.history.replaceState({}, "", url); setActivePaymentId(next.id); }, []);
  const activityRows = useMemo(() => buildBillingActivityRows(usage, ledger, catalog), [catalog, ledger, usage]);

  return <div className="-mx-6 -my-9 min-h-[calc(100vh-80px)] bg-[#0b0b0d] px-6 py-8 sm:px-8">
    <main className="mx-auto max-w-[1440px]">
      <header><h1 className="text-2xl font-semibold text-white">个人钱包</h1><p className="mt-2 text-sm text-slate-400">积分属于个人账户，可在您加入的所有工作区中使用。</p></header>
      {error || billingSnapshot.status === "error" ? <p className="mt-4 rounded border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{error ?? "钱包加载失败，请稍后重试。"}</p> : null}
      <div className="mt-6"><BillingSummaryCards summary={billingSnapshot.summary} /></div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_360px]"><BillingActivityTable items={activityRows} /><aside className="space-y-4"><RechargePanel onCreated={onCreated} plans={plans} /><PaymentStatusPanel payment={payment} /><RedeemCodeBox onRedeemed={refreshData} /></aside></div>
    </main>
  </div>;
}
