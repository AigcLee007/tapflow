import { useEffect, useState } from "react";

import { getBillingSummary, type BillingSummary } from "./billingApi";

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
