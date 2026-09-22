import React, { useEffect, useState } from "react";

import { AuthGate } from "../auth/AuthGate";
import { AuthExperiencePage } from "../auth/AuthExperiencePage";
import { LegalDocumentPage } from "../legal/LegalDocumentPage";
import { AssetLibraryPage } from "../assets/AssetLibraryPage";
import { AccountPage } from "../account/AccountPage";
import { InspectionDashboardPage } from "../account/InspectionDashboardPage";
import { AiSettingsPage } from "../account/ai-settings/AiSettingsPage";
import { TemplateLibraryPage } from "../account/TemplateLibraryPage";
import { AdminPage } from "../admin/AdminPage";
import { AdminAccessDenied, AdminConsoleShell } from "../admin/AdminConsoleShell";
import { getAdminPage, getAdminRedirect } from "../admin/adminNavigation";
import { TemplateAdminEditorPage } from "../admin/templates/TemplateAdminEditorPage";
import { TemplateAdminListPage } from "../admin/templates/TemplateAdminListPage";
import { getTemplateIdFromAdminPath } from "../admin/templates/templateAdminNavigation";
import { ProviderSettingsPage } from "../account/ProviderSettingsPage";
import { BillingCenterPage } from "../billing/BillingCenterPage";
import { RechargeProvider } from "../billing/RechargeContext";
import { FlowProjectPage } from "../flowCanvas/FlowProjectPage";
import { WorkbenchPage } from "../workbench/WorkbenchPage";
import { PromptPlazaPage } from "../prompts/PromptPlazaPage";
import { HomePage } from "../workspace/HomePage";
import { WorkspacePage } from "../workspace/WorkspacePage";
import { AppVersionReminder } from "./version/AppVersionReminder";
import { WorkspaceShell } from "./WorkspaceShell";
import { ConsoleRecordsPage } from "../console/ConsoleRecordsPage";
import { ConsoleOverviewPage } from "../console/ConsoleOverviewPage";
import { PersonalConsoleShell } from "../console/PersonalConsoleShell";
import { ConsoleUserPage } from "../console/ConsoleUserPage";
import { PaymentManagementPanel } from "../admin/PaymentManagementPanel";
import { PlatformAuditPage } from "../admin/PlatformAuditPage";
import { hasPlatformCapability } from "../auth/productRoles";
import { useAuth } from "../auth/useAuth";
import {
  ACCOUNT_ROUTE,
  ADMIN_ROUTE,
  ADMIN_TEMPLATES_ROUTE,
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
  LEGAL_PRIVACY_ROUTE,
  LEGAL_TERMS_ROUTE,
  ROOT_ROUTE,
  WORKSPACE_ROUTE,
} from "./routes";

function getCurrentLocation() {
  if (typeof window === "undefined") return { hash: "", pathname: ROOT_ROUTE, search: "" };
  return { hash: window.location.hash, pathname: window.location.pathname, search: window.location.search };
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

function useCurrentLocation() {
  const [location, setLocation] = useState(getCurrentLocation);

  useEffect(() => {
    const handleChange = () => setLocation(getCurrentLocation());
    window.addEventListener("popstate", handleChange);
    window.addEventListener("hashchange", handleChange);
    handleChange();
    return () => {
      window.removeEventListener("popstate", handleChange);
      window.removeEventListener("hashchange", handleChange);
    };
  }, []);

  return location;
}

function Redirect({ to }: { to: string }) {
  useEffect(() => {
    navigate(to, true);
  }, [to]);

  return null;
}

function ProtectedRoutes({ pathname }: { pathname: string }) {
  const { permissions, roles } = useAuth();
  const access = { permissions, roles };
  const adminRedirect = getAdminRedirect(getCurrentLocation());
  if (adminRedirect) return <Redirect to={adminRedirect} />;

  if (pathname === ROOT_ROUTE || isCompatibilityRoute(pathname) || isNonUserFacingRoute(pathname)) {
    return <Redirect to={HOME_ROUTE} />;
  }

  if (pathname === ADMIN_ROUTE || pathname.startsWith(`${ADMIN_ROUTE}/`)) {
    const page = getAdminPage(pathname);
    if (!hasPlatformCapability(access, "platform:console:access") || (page && !hasPlatformCapability(access, page.capability))) {
      return <AdminAccessDenied />;
    }
    if (!page) return <section><h1 className="text-lg font-semibold">未找到管理页面</h1><a href="/admin/overview">返回概览</a></section>;
    if (pathname === "/admin/overview") return <ConsoleOverviewPage scope="platform"/>;
    if (pathname === "/admin/audit") return <PlatformAuditPage/>;
    if (pathname === "/admin/payments" || pathname === "/admin/plans") return <section className="space-y-5"><h1 className="text-2xl font-semibold text-white">{pathname === "/admin/plans" ? "充值套餐" : "支付订单"}</h1><PaymentManagementPanel mode={pathname === "/admin/plans" ? "plans" : "payments"} canManage={hasPlatformCapability(access,"platform:billing:manage")}/></section>;
    if (page.path === "/admin/users" && pathname !== page.path) {
      try { return <ConsoleUserPage userId={decodeURIComponent(pathname.slice(page.path.length+1))}/>; }
      catch { return <p role="alert">用户编号无效。</p>; }
    }
    const consoleResource = page.path.slice("/admin/".length);
    if (consoleResource === "usage" || consoleResource === "tasks" || consoleResource === "calls") {
      let detailId: string | null = null;
      try { detailId = pathname === page.path ? null : decodeURIComponent(pathname.slice(page.path.length+1)); }
      catch { return <p role="alert">记录编号无效。</p>; }
      return <ConsoleRecordsPage scope="platform" resource={consoleResource} detailId={detailId}/>;
    }
    if (pathname === "/admin/models") return <AiSettingsPage />;
    if (pathname === "/admin/connections") return <ProviderSettingsPage />;
    if (pathname === "/admin/integrations") return <TemplateLibraryPage />;
    if (pathname === "/admin/inspection") return <InspectionDashboardPage />;
    if (pathname === ADMIN_TEMPLATES_ROUTE) {
      return <TemplateAdminListPage />;
    }
    const templateId = getTemplateIdFromAdminPath(pathname)
      ?? (page.path === ADMIN_TEMPLATES_ROUTE ? decodeURIComponent(pathname.split("/")[3]) : null);
    if (templateId) {
      return <TemplateAdminEditorPage templateId={templateId} />;
    }
    return <AdminPage key={page.path} section={page.section} />;
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

  if (pathname === ACCOUNT_ROUTE || pathname.startsWith(`${ACCOUNT_ROUTE}/`)) {
    if (pathname === "/account/overview") return <ConsoleOverviewPage scope="self"/>;
    const match = /^\/account\/(usage|tasks)(?:\/([^/]+))?$/.exec(pathname);
    if (match) {
      let detailId: string | null = null;
      try { detailId = match[2] ? decodeURIComponent(match[2]) : null; }
      catch { return <p role="alert">记录编号无效。</p>; }
      return <ConsoleRecordsPage scope="self" resource={match[1] as "usage" | "tasks"} detailId={detailId}/>;
    }
    return <AccountPage />;
  }

  return <Redirect to={HOME_ROUTE} />;
}

export function AppRouter() {
  const { pathname } = useCurrentLocation();

  if (pathname === LEGAL_TERMS_ROUTE) {
    return <LegalDocumentPage type="terms" />;
  }

  if (pathname === LEGAL_PRIVACY_ROUTE) {
    return <LegalDocumentPage type="privacy" />;
  }

  if (pathname.startsWith("/legal/")) {
    return <Redirect to={LEGAL_TERMS_ROUTE} />;
  }

  if (pathname === LOGIN_ROUTE || pathname === REGISTER_ROUTE || pathname === FORGOT_PASSWORD_ROUTE) {
    return (
      <>
        <AuthExperiencePage />
        <AppVersionReminder />
      </>
    );
  }

  return (
    <>
      <AuthGate>
        <RechargeProvider>
          {isProjectRoute(pathname) ? (
            getProjectMode(pathname) === "workbench" ? <Redirect to={WORKBENCH_ROUTE} /> : <FlowProjectPage />
          ) : pathname === WORKBENCH_ROUTE || pathname.startsWith(`${WORKBENCH_ROUTE}/`) ? (
            <WorkbenchPage />
          ) : pathname === ADMIN_ROUTE || pathname.startsWith(`${ADMIN_ROUTE}/`) ? (
            <AdminConsoleShell pathname={pathname}>
              <ProtectedRoutes pathname={pathname} />
            </AdminConsoleShell>
          ) : pathname === ACCOUNT_ROUTE || pathname.startsWith(`${ACCOUNT_ROUTE}/`) || pathname === BILLING_ROUTE ? (
            <PersonalConsoleShell pathname={pathname}><ProtectedRoutes pathname={pathname}/></PersonalConsoleShell>
          ) : (
            <WorkspaceShell>
              <div className="app-route-transition" key={getAppRouteTransitionKey(pathname)}>
                <ProtectedRoutes pathname={pathname} />
              </div>
            </WorkspaceShell>
          )}
        </RechargeProvider>
      </AuthGate>
      <AppVersionReminder />
    </>
  );
}
