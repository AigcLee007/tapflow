import React from "react";
import { Loader2, LogOut, RefreshCw } from "lucide-react";

import { useAuth } from "../auth/useAuth";

function InfoCard({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={`rounded border border-white/10 bg-black/20 p-4 ${wide ? "md:col-span-2" : ""}`}>
      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 break-words text-sm font-medium text-slate-100">{value}</div>
    </div>
  );
}

export function AccountPage() {
  const { loading, logout, permissions, refreshMe, roles, tenant, user } = useAuth();

  if (loading && !user) {
    return (
      <section className="flex min-h-[320px] items-center justify-center rounded border border-white/10 bg-white/[0.04]">
        <div className="inline-flex items-center gap-3 text-sm text-slate-300">
          <Loader2 className="animate-spin" size={16} />
          Loading account data...
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-sky-300">Account</div>
          <h1 className="mt-2 text-2xl font-semibold text-white">Account Center</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            This page is backed by `GET /api/v2/auth/me` and shows the current identity, tenant,
            roles, permissions, and sign-out controls for the unified workspace product.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex h-10 items-center gap-2 rounded border border-white/10 bg-white/10 px-4 text-sm text-white hover:bg-white/15"
            onClick={() => void refreshMe()}
            type="button"
          >
            <RefreshCw size={15} />
            Refresh
          </button>
          <button
            className="inline-flex h-10 items-center gap-2 rounded border border-red-400/20 bg-red-500/10 px-4 text-sm text-red-100 hover:bg-red-500/15"
            onClick={() => {
              void logout().finally(() => {
                window.location.assign("/login");
              });
            }}
            type="button"
          >
            <LogOut size={15} />
            Log out
          </button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="rounded border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-lg font-semibold text-white">Current Identity</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <InfoCard label="Email" value={user?.email || "-"} />
            <InfoCard label="Display name" value={user?.displayName || "-"} />
            <InfoCard label="User ID" value={user?.id || "-"} />
            <InfoCard label="Status" value={user?.status || "-"} />
            <InfoCard label="Roles" value={roles.join(", ") || "-"} wide />
            <InfoCard label="Permissions" value={permissions.join(", ") || "-"} wide />
          </div>
        </div>

        <div className="rounded border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-lg font-semibold text-white">Workspace Context</h2>
          <div className="mt-4 grid gap-3">
            <InfoCard label="Tenant / workspace" value={tenant?.name || "-"} />
            <InfoCard label="Tenant ID" value={tenant?.id || "-"} />
            <InfoCard label="Slug" value={tenant?.slug || "-"} />
            <InfoCard label="Plan" value={tenant?.plan || "-"} />
            <InfoCard label="Status" value={tenant?.status || "-"} />
          </div>
        </div>
      </div>
    </section>
  );
}
