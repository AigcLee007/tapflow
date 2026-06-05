import React, { useEffect, useState } from "react";

import { AuthGate } from "../auth/AuthGate";
import { LoginPage } from "../auth/LoginPage";
import { RegisterPage } from "../auth/RegisterPage";
import { AssetLibraryPage } from "../assets/AssetLibraryPage";
import { AccountPage } from "../account/AccountPage";
import { AdminPage } from "../admin/AdminPage";
import { ProviderSettingsPage } from "../account/ProviderSettingsPage";
import { BillingCenterPage } from "../billing/BillingCenterPage";
import { FlowProjectPage } from "../flowCanvas/FlowProjectPage";
import { WorkspacePage } from "../workspace/WorkspacePage";
import { WorkspaceShell } from "./WorkspaceShell";
import {
  ACCOUNT_ROUTE,
  ACCOUNT_PROVIDER_SETTINGS_ROUTE,
  ADMIN_ROUTE,
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

function ProtectedRoutes({ pathname }: { pathname: string }) {
  if (pathname === ROOT_ROUTE || isCompatibilityRoute(pathname) || isNonUserFacingRoute(pathname)) {
    return <Redirect to={WORKSPACE_ROUTE} />;
  }

  if (pathname === ADMIN_ROUTE || pathname.startsWith(`${ADMIN_ROUTE}/`)) {
    return <AdminPage />;
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

  if (
    pathname === ACCOUNT_PROVIDER_SETTINGS_ROUTE ||
    pathname.startsWith(`${ACCOUNT_PROVIDER_SETTINGS_ROUTE}/`)
  ) {
    return <ProviderSettingsPage />;
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
      {isProjectRoute(pathname) ? (
        <FlowProjectPage />
      ) : (
        <WorkspaceShell>
          <ProtectedRoutes pathname={pathname} />
        </WorkspaceShell>
      )}
    </AuthGate>
  );
}
