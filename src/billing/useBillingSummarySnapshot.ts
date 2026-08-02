import { useEffect, useState } from "react";

import { getBillingSummary, type BillingSummary } from "./billingApi";

export const BILLING_SUMMARY_INVALIDATE_EVENT = "v2-billing-summary-invalidate";

export function invalidateBillingSummary(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(BILLING_SUMMARY_INVALIDATE_EVENT));
  }
}

export function useBillingSummarySnapshot(enabled: boolean) {
  const [summary, setSummary] = useState<BillingSummary | null>(null);

  useEffect(() => {
    if (!enabled) {
      setSummary(null);
      return;
    }

    let cancelled = false;
    void getBillingSummary()
      .then((nextSummary) => {
        if (!cancelled) setSummary(nextSummary);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return summary;
}
