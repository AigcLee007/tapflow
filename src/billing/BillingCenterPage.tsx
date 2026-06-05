import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

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
    !loading &&
    !error &&
    summary &&
    summary.account.balanceCents === 0 &&
    summary.account.reservedCents === 0 &&
    usage.length === 0 &&
    ledger.length === 0;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-sky-300">计费</div>
          <h1 className="mt-2 text-2xl font-semibold text-white">计费中心</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            点数会在任务开始前由后端预占，任务成功后结算，失败时自动退回。
          </p>
        </div>
        <button
          className="inline-flex h-10 items-center gap-2 rounded border border-white/10 bg-white/10 px-4 text-sm text-white hover:bg-white/15 disabled:opacity-60"
          disabled={loading}
          onClick={() => void refresh()}
          type="button"
        >
          {loading ? <Loader2 className="animate-spin" size={15} /> : <RefreshCw size={15} />}
          刷新
        </button>
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
