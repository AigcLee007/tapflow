import React, { useEffect, useState } from "react";

import { AuthGate } from "../auth/AuthGate";
import { LoginPage } from "../auth/LoginPage";
import { RegisterPage } from "../auth/RegisterPage";
import { AssetLibraryPage } from "../assets/AssetLibraryPage";
import { BillingCenterPage } from "../billing/BillingCenterPage";
import { useAuth } from "../auth/useAuth";
import { FlowProjectPage } from "../flowCanvas/FlowProjectPage";
import { WorkspacePage } from "../workspace/WorkspacePage";
import { WorkspaceShell } from "./WorkspaceShell";
import {
  ACCOUNT_ROUTE,
  ASSETS_ROUTE,
  BILLING_ROUTE,
  isCompatibilityRoute,
  isNonUserFacingRoute,
  isProjectRoute,
  LOGIN_ROUTE,
  REGISTER_ROUTE,
  ROOT_ROUTE,
  WORKSPACE_ROUTE,
} from "./routes";

function getCurrentPath() {
  if (typeof window === "undefined") return ROOT_ROUTE;
  return window.location.pathname;
}

function navigate(path: string, replace = false) {
  if (typeof window === "undefined") return;
  if (replace) {
    window.history.replaceState(null, "", path);
  } else {
    window.history.pushState(null, "", path);
  }
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function usePathname() {
  const [pathname, setPathname] = useState(getCurrentPath);

  useEffect(() => {
    const handleChange = () => setPathname(getCurrentPath());
    window.addEventListener("popstate", handleChange);
    return () => window.removeEventListener("popstate", handleChange);
  }, []);

  return pathname;
}

function Redirect({ to }: { to: string }) {
  useEffect(() => {
    navigate(to, true);
  }, [to]);

  return null;
}

function AccountPage() {
  const { permissions, roles, tenant, user } = useAuth();

  return (
    <section className="rounded border border-white/10 bg-white/[0.04] p-6">
      <div className="text-xs uppercase tracking-[0.24em] text-sky-300">Account</div>
      <h1 className="mt-3 text-2xl font-semibold text-white">Account Center</h1>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <Info label="Email" value={user?.email || "-"} />
        <Info label="Display name" value={user?.displayName || "-"} />
        <Info label="Tenant" value={tenant?.name || "-"} />
        <Info label="Roles" value={roles.join(", ") || "-"} />
        <Info label="Permissions" value={permissions.join(", ") || "-"} wide />
      </div>
    </section>
  );
}

function Info({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`rounded border border-white/10 bg-black/20 p-4 ${wide ? "md:col-span-2" : ""}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-2 break-words text-sm font-medium text-slate-100">{value}</div>
    </div>
  );
}

function ProtectedRoutes({ pathname }: { pathname: string }) {
  if (pathname === ROOT_ROUTE || isCompatibilityRoute(pathname) || isNonUserFacingRoute(pathname)) {
    return <Redirect to={WORKSPACE_ROUTE} />;
  }

  if (pathname === WORKSPACE_ROUTE || pathname.startsWith(`${WORKSPACE_ROUTE}/`)) {
    return <WorkspacePage />;
  }

  if (isProjectRoute(pathname)) {
    return <FlowProjectPage />;
  }

  if (pathname === ASSETS_ROUTE || pathname.startsWith(`${ASSETS_ROUTE}/`)) {
    return <AssetLibraryPage />;
  }

  if (pathname === BILLING_ROUTE || pathname.startsWith(`${BILLING_ROUTE}/`)) {
    return <BillingCenterPage />;
  }

  if (pathname === ACCOUNT_ROUTE || pathname.startsWith(`${ACCOUNT_ROUTE}/`)) {
    return <AccountPage />;
  }

  return <Redirect to={WORKSPACE_ROUTE} />;
}

export function AppRouter() {
  const pathname = usePathname();

  if (pathname === LOGIN_ROUTE) {
    return <LoginPage />;
  }

  if (pathname === REGISTER_ROUTE) {
    return <RegisterPage />;
  }

  return (
    <AuthGate>
      <WorkspaceShell>
        <ProtectedRoutes pathname={pathname} />
      </WorkspaceShell>
    </AuthGate>
  );
}
