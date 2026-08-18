import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "../auth/useAuth";
import { buildBillingActivityRows, getEmptyBillingDisplayCatalog, loadBillingDisplayCatalog, type BillingDisplayCatalog } from "./billingActivity";
import { BillingActivityTable } from "./BillingActivityTable";
import { BillingSummaryCards } from "./BillingSummaryCards";
import { PaymentStatusPanel } from "./PaymentStatusPanel";
import { RechargePanel } from "./RechargePanel";
import { RechargeProvider, useRecharge, useRechargeContext } from "./RechargeContext";
import { RedeemCodeBox } from "./RedeemCodeBox";
import { listBillingLedger, listBillingUsageEvents, type BillingLedgerEntry, type BillingUsageEvent } from "./billingApi";
import { useBillingSummarySnapshot } from "./useBillingSummarySnapshot";

function BillingCenterPageContent() {
  const { authenticated, sessionId, user } = useAuth();
  const billingSnapshot = useBillingSummarySnapshot(Boolean(authenticated && user));
  const recharge = useRecharge();
  const [ledger, setLedger] = useState<BillingLedgerEntry[]>([]);
  const [usage, setUsage] = useState<BillingUsageEvent[]>([]);
  const [catalog, setCatalog] = useState<BillingDisplayCatalog>(() => getEmptyBillingDisplayCatalog());
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const { loadPlans, plansStatus } = recharge;
  const identityKey = useMemo(() => authenticated && user ? `${user.id}:${sessionId ?? "none"}` : "anonymous", [authenticated, sessionId, user]);

  const refreshData = useCallback(async () => {
    if (!authenticated || !user) return;
    const id = ++requestRef.current;
    try {
      const [nextUsage, nextLedger] = await Promise.all([listBillingUsageEvents(), listBillingLedger()]);
      if (id !== requestRef.current) return;
      setUsage(nextUsage.items); setLedger(nextLedger.items);
    } catch { if (id === requestRef.current) setError("钱包加载失败，请稍后重试。"); }
  }, [authenticated, user]);

  useEffect(() => { void refreshData(); }, [identityKey, refreshData]);
  useEffect(() => { if (plansStatus === "idle") void loadPlans(); }, [loadPlans, plansStatus]);
  useEffect(() => { void loadBillingDisplayCatalog().then(setCatalog).catch(() => undefined); }, []);
  const activityRows = useMemo(() => buildBillingActivityRows(usage, ledger, catalog), [catalog, ledger, usage]);

  return <div className="-mx-6 -my-9 min-h-[calc(100vh-80px)] bg-[#0b0b0d] px-6 py-8 sm:px-8">
    <main className="mx-auto max-w-[1440px]">
      <header><h1 className="text-2xl font-semibold text-white">个人钱包</h1><p className="mt-2 text-sm text-slate-400">积分属于个人账户，可在您加入的所有工作区中使用。</p></header>
      {error || billingSnapshot.status === "error" ? <p className="mt-4 rounded border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{error ?? "钱包加载失败，请稍后重试。"}</p> : null}
      <div className="mt-6"><BillingSummaryCards summary={billingSnapshot.summary} /></div>
      <section className="mt-6" data-testid="billing-recharge-section">
        <RechargePanel busyPlanKey={recharge.busyPlanKey} onRetry={() => void recharge.loadPlans()} onSelect={(plan) => void recharge.beginCheckout(plan)} plans={recharge.plans} status={recharge.plansStatus} />
        {recharge.error ? <p className="mt-3 text-sm text-rose-200">{recharge.error}</p> : null}
        {!recharge.dialogOpen ? <div className="mt-4"><PaymentStatusPanel payment={recharge.payment} /></div> : null}
      </section>
      <section className="mt-6" data-testid="billing-activity-section">
        <BillingActivityTable items={activityRows} />
        <div className="mt-4"><RedeemCodeBox onRedeemed={refreshData} /></div>
      </section>
    </main>
  </div>;
}

export function BillingCenterPage() {
  const context = useRechargeContext();
  if (!context) return <RechargeProvider><BillingCenterPageContent /></RechargeProvider>;
  return <BillingCenterPageContent />;
}
