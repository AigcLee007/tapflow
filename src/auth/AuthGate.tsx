import React, { useEffect } from "react";

import { BrandTransition } from "../app/brand/BrandTransition";
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
    return <BrandTransition label="正在加载工作区..." variant="auth" />;
  }

  if (!authenticated) {
    return null;
  }

  return <>{children}</>;
}
