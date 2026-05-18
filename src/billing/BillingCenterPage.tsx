import React, { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

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
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [ledger, setLedger] = useState<BillingLedgerEntry[]>([]);
  const [usage, setUsage] = useState<BillingUsageEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextSummary, nextUsage, nextLedger] = await Promise.all([
        getBillingSummary(),
        listBillingUsageEvents(1, 20),
        listBillingLedger(1, 20),
      ]);
      setSummary(nextSummary);
      setUsage(nextUsage.items);
      setLedger(nextLedger.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load billing data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-sky-300">Billing</div>
          <h1 className="mt-2 text-2xl font-semibold text-white">Billing Center</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Credits are reserved by the backend before workflow execution, settled on success, and refunded on failure.
          </p>
        </div>
        <button
          className="inline-flex h-10 items-center gap-2 rounded border border-white/10 bg-white/10 px-4 text-sm text-white hover:bg-white/15 disabled:opacity-60"
          disabled={loading}
          onClick={() => void refresh()}
          type="button"
        >
          {loading ? <Loader2 className="animate-spin" size={15} /> : <RefreshCw size={15} />}
          Refresh
        </button>
      </header>

      {error && (
        <div className="rounded border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          {error}
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
