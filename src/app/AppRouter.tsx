import React, { useEffect, useState } from "react";

import { AuthGate } from "../auth/AuthGate";
import { LoginPage } from "../auth/LoginPage";
import { RegisterPage } from "../auth/RegisterPage";
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

function PlaceholderPage({
  description,
  eyebrow,
  title,
}: {
  description: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <section className="rounded border border-white/10 bg-white/[0.04] p-6">
      <div className="text-xs uppercase tracking-[0.24em] text-sky-300">{eyebrow}</div>
      <h1 className="mt-3 text-2xl font-semibold text-white">{title}</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">{description}</p>
    </section>
  );
}

function AssetsPage() {
  return (
    <PlaceholderPage
      description="The cloud asset library remains a follow-up. This route is now protected by v2 auth and no longer exposes the old local IndexedDB library from App.tsx."
      eyebrow="Assets"
      title="Asset Library"
    />
  );
}

function BillingPage() {
  return (
    <PlaceholderPage
      description="Billing UI will be rebuilt on /api/v2/billing in a later sprint. This placeholder avoids wiring the legacy billing center into the new root shell."
      eyebrow="Billing"
      title="Billing Center"
    />
  );
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
    return <AssetsPage />;
  }

  if (pathname === BILLING_ROUTE || pathname.startsWith(`${BILLING_ROUTE}/`)) {
    return <BillingPage />;
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
