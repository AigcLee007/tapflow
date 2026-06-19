import React, { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

import {
  APP_VERSION_CHECK_INTERVAL_MS,
  buildVersionManifestUrl,
  hasVersionChanged,
  normalizeVersionManifest,
} from "./versionReminder";

declare global {
  interface Window {
    __TAPFLOW_BUILD_VERSION__?: string;
  }
}

async function fetchLatestVersionManifest() {
  const response = await fetch(buildVersionManifestUrl(), {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) return null;
  return normalizeVersionManifest(await response.json());
}

function getBootVersion() {
  return typeof window.__TAPFLOW_BUILD_VERSION__ === "string" ? window.__TAPFLOW_BUILD_VERSION__ : "";
}

export function AppVersionReminder({ onReload = () => window.location.reload() }: { onReload?: () => void }) {
  const bootVersionRef = useRef(getBootVersion());
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const checkVersion = async () => {
      if (!bootVersionRef.current) return;

      try {
        const latestManifest = await fetchLatestVersionManifest();
        if (!cancelled && hasVersionChanged(bootVersionRef.current, latestManifest)) {
          setUpdateAvailable(true);
        }
      } catch (_error) {
        // Version checks should never interrupt the creator workflow.
      }
    };

    void checkVersion();
    const intervalId = window.setInterval(checkVersion, APP_VERSION_CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  if (!updateAvailable) return null;

  return (
    <div
      className="fixed bottom-5 left-1/2 z-[1000] flex w-[min(92vw,460px)] -translate-x-1/2 items-center justify-between gap-3 rounded-2xl border border-cyan-300/30 bg-[#111827]/95 px-4 py-3 text-white shadow-2xl shadow-black/40 backdrop-blur"
      role="status"
    >
      <div className="min-w-0">
        <div className="text-sm font-semibold">发现新版本</div>
        <div className="mt-0.5 text-xs text-slate-300">刷新页面后即可使用最新功能。</div>
      </div>
      <button
        className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full bg-cyan-300 px-3 text-xs font-semibold text-slate-950 transition hover:bg-cyan-200"
        onClick={onReload}
        type="button"
      >
        <RefreshCw size={14} />
        立即刷新
      </button>
    </div>
  );
}
