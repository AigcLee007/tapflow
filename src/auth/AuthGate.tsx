import React, { useEffect } from "react";

import { LOGIN_ROUTE } from "../app/routes";
import { useAuth } from "./useAuth";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { authenticated, loading } = useAuth();

  useEffect(() => {
    if (loading || authenticated || typeof window === "undefined") return;
    const returnTo = `${window.location.pathname}${window.location.search}`;
    const target = `${LOGIN_ROUTE}?returnTo=${encodeURIComponent(returnTo)}`;
    window.history.replaceState(null, "", target);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, [authenticated, loading]);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#09090f] text-sm text-slate-200">
        正在加载工作区...
      </div>
    );
  }

  if (!authenticated) {
    return null;
  }

  return <>{children}</>;
}
