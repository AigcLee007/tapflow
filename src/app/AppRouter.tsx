import React, { useEffect, useState } from "react";

import { AuthGate } from "../auth/AuthGate";
import { LoginPage } from "../auth/LoginPage";
import { RegisterPage } from "../auth/RegisterPage";
import { ForgotPasswordPage } from "../auth/ForgotPasswordPage";
import { AssetLibraryPage } from "../assets/AssetLibraryPage";
import { AccountPage } from "../account/AccountPage";
import { InspectionDashboardPage } from "../account/InspectionDashboardPage";
import { AiSettingsPage } from "../account/ai-settings/AiSettingsPage";
import { TemplateLibraryPage } from "../account/TemplateLibraryPage";
import { AdminPage } from "../admin/AdminPage";
import { ProviderSettingsPage } from "../account/ProviderSettingsPage";
import { BillingCenterPage } from "../billing/BillingCenterPage";
import { FlowProjectPage } from "../flowCanvas/FlowProjectPage";
import { WorkbenchPage } from "../workbench/WorkbenchPage";
import { PromptPlazaPage } from "../prompts/PromptPlazaPage";
import { HomePage } from "../workspace/HomePage";
import { WorkspacePage } from "../workspace/WorkspacePage";
import { AppVersionReminder } from "./version/AppVersionReminder";
import { WorkspaceShell } from "./WorkspaceShell";
import { canAccessOperationsConsole, canAccessProviderOperations, resolveProductRole } from "../auth/productRoles";
import { useAuth } from "../auth/useAuth";
import {
  ACCOUNT_ROUTE,
  ACCOUNT_AI_SETTINGS_ROUTE,
  ACCOUNT_INSPECTION_ROUTE,
  ACCOUNT_PROVIDER_SETTINGS_ROUTE,
  ACCOUNT_TEMPLATE_LIBRARY_ROUTE,
  ADMIN_ROUTE,
  ASSETS_ROUTE,
  BILLING_ROUTE,
  HOME_ROUTE,
  WORKBENCH_ROUTE,
  PROMPTS_ROUTE,
  getAppRouteTransitionKey,
  getPromptId,
  isCompatibilityRoute,
  isNonUserFacingRoute,
  getProjectMode,
  isProjectRoute,
  LOGIN_ROUTE,
  REGISTER_ROUTE,
  FORGOT_PASSWORD_ROUTE,
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
  const { permissions, roles } = useAuth();
  const productRole = resolveProductRole({ permissions, roles });

  if (pathname === ROOT_ROUTE || isCompatibilityRoute(pathname) || isNonUserFacingRoute(pathname)) {
    return <Redirect to={HOME_ROUTE} />;
  }

  if (pathname === ADMIN_ROUTE || pathname.startsWith(`${ADMIN_ROUTE}/`)) {
    if (!canAccessOperationsConsole(productRole)) {
      return <Redirect to={ACCOUNT_ROUTE} />;
    }
    return <AdminPage />;
  }

  if (pathname === HOME_ROUTE || pathname.startsWith(`${HOME_ROUTE}/`)) {
    return <HomePage />;
  }

  if (pathname === WORKSPACE_ROUTE || pathname.startsWith(`${WORKSPACE_ROUTE}/`)) {
    return <WorkspacePage />;
  }

  if (pathname === WORKBENCH_ROUTE || pathname.startsWith(`${WORKBENCH_ROUTE}/`)) {
    return <WorkbenchPage />;
  }

  if (pathname === PROMPTS_ROUTE || pathname.startsWith(`${PROMPTS_ROUTE}/`)) {
    return <PromptPlazaPage promptId={getPromptId(pathname)} />;
  }

  if (isProjectRoute(pathname)) {
    return getProjectMode(pathname) === "workbench" ? <Redirect to={WORKBENCH_ROUTE} /> : <FlowProjectPage />;
  }

  if (pathname === ASSETS_ROUTE || pathname.startsWith(`${ASSETS_ROUTE}/`)) {
    return <AssetLibraryPage />;
  }

  if (pathname === BILLING_ROUTE || pathname.startsWith(`${BILLING_ROUTE}/`)) {
    return <BillingCenterPage />;
  }

  if (
    pathname === ACCOUNT_AI_SETTINGS_ROUTE ||
    pathname.startsWith(`${ACCOUNT_AI_SETTINGS_ROUTE}/`)
  ) {
    if (!canAccessProviderOperations(productRole)) {
      return <Redirect to={ACCOUNT_ROUTE} />;
    }
    return <AiSettingsPage />;
  }

  if (
    pathname === ACCOUNT_INSPECTION_ROUTE ||
    pathname.startsWith(`${ACCOUNT_INSPECTION_ROUTE}/`)
  ) {
    if (!canAccessOperationsConsole(productRole)) {
      return <Redirect to={ACCOUNT_ROUTE} />;
    }
    return <InspectionDashboardPage />;
  }

  if (
    pathname === ACCOUNT_TEMPLATE_LIBRARY_ROUTE ||
    pathname.startsWith(`${ACCOUNT_TEMPLATE_LIBRARY_ROUTE}/`)
  ) {
    if (!canAccessProviderOperations(productRole)) {
      return <Redirect to={ACCOUNT_ROUTE} />;
    }
    return <TemplateLibraryPage />;
  }

  if (
    pathname === ACCOUNT_PROVIDER_SETTINGS_ROUTE ||
    pathname.startsWith(`${ACCOUNT_PROVIDER_SETTINGS_ROUTE}/`)
  ) {
    if (!canAccessProviderOperations(productRole)) {
      return <Redirect to={ACCOUNT_ROUTE} />;
    }
    return <ProviderSettingsPage />;
  }

  if (pathname === ACCOUNT_ROUTE || pathname.startsWith(`${ACCOUNT_ROUTE}/`)) {
    return <AccountPage />;
  }

  return <Redirect to={HOME_ROUTE} />;
}

export function AppRouter() {
  const pathname = usePathname();

  if (pathname === LOGIN_ROUTE) {
    return (
      <>
        <LoginPage />
        <AppVersionReminder />
      </>
    );
  }

  if (pathname === REGISTER_ROUTE) {
    return (
      <>
        <RegisterPage />
        <AppVersionReminder />
      </>
    );
  }
  if (pathname === FORGOT_PASSWORD_ROUTE) return <ForgotPasswordPage />;

  return (
    <>
      <AuthGate>
        {isProjectRoute(pathname) ? (
          getProjectMode(pathname) === "workbench" ? <Redirect to={WORKBENCH_ROUTE} /> : <FlowProjectPage />
        ) : pathname === WORKBENCH_ROUTE || pathname.startsWith(`${WORKBENCH_ROUTE}/`) ? (
          <WorkbenchPage />
        ) : (
          <WorkspaceShell>
            <div className="app-route-transition" key={getAppRouteTransitionKey(pathname)}>
              <ProtectedRoutes pathname={pathname} />
            </div>
          </WorkspaceShell>
        )}
      </AuthGate>
      <AppVersionReminder />
    </>
  );
}
