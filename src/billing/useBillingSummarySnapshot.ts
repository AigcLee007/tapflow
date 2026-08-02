import { useCallback, useEffect, useRef, useState } from "react";

import { getStoredAccessToken, V2_AUTH_CHANGE_EVENT } from "../services/v2HttpClient";
import { getBillingSummary, type BillingSummary } from "./billingApi";

export const BILLING_SUMMARY_INVALIDATE_EVENT = "v2-billing-summary-invalidate";

export function invalidateBillingSummary(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(BILLING_SUMMARY_INVALIDATE_EVENT));
  }
}

export type BillingSummarySnapshot = {
  refresh: () => Promise<void>;
  status: "disabled" | "loading" | "ready" | "error";
  summary: BillingSummary | null;
};

export function useBillingSummarySnapshot(enabled: boolean): BillingSummarySnapshot {
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [status, setStatus] = useState<BillingSummarySnapshot["status"]>("disabled");
  const requestCounter = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestCounter.current;
    if (!enabled || !getStoredAccessToken()) {
      setSummary(null);
      setStatus("disabled");
      return;
    }

    setSummary(null);
    setStatus("loading");
    try {
      const nextSummary = await getBillingSummary();
      if (requestId !== requestCounter.current) return;
      setSummary(nextSummary);
      setStatus("ready");
    } catch {
      if (requestId !== requestCounter.current) return;
      setSummary(null);
      setStatus("error");
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();

    const handleRefresh = () => void refresh();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener(V2_AUTH_CHANGE_EVENT, handleRefresh);
    window.addEventListener(BILLING_SUMMARY_INVALIDATE_EVENT, handleRefresh);
    window.addEventListener("storage", handleRefresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      requestCounter.current += 1;
      window.removeEventListener(V2_AUTH_CHANGE_EVENT, handleRefresh);
      window.removeEventListener(BILLING_SUMMARY_INVALIDATE_EVENT, handleRefresh);
      window.removeEventListener("storage", handleRefresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refresh]);

  return { refresh, status, summary };
}
