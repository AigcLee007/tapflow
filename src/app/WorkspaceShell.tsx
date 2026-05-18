import React from "react";
import {
  Box,
  CreditCard,
  FolderKanban,
  LogOut,
  UserRound,
  Workflow,
} from "lucide-react";

import {
  ACCOUNT_ROUTE,
  ASSETS_ROUTE,
  BILLING_ROUTE,
  WORKSPACE_ROUTE,
} from "./routes";
import { useAuth } from "../auth/useAuth";

function navigate(path: string) {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

const navItems = [
  { icon: FolderKanban, label: "Workspace", path: WORKSPACE_ROUTE },
  { icon: Box, label: "Assets", path: ASSETS_ROUTE },
  { icon: CreditCard, label: "Billing", path: BILLING_ROUTE },
  { icon: UserRound, label: "Account", path: ACCOUNT_ROUTE },
];

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const { logout, tenant, user } = useAuth();
  const currentPath = typeof window === "undefined" ? WORKSPACE_ROUTE : window.location.pathname;

  return (
    <div className="min-h-screen bg-[#0a0b10] text-slate-100">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0a0b10]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4">
          <button
            className="flex min-w-0 items-center gap-3 text-left"
            onClick={() => navigate(WORKSPACE_ROUTE)}
            type="button"
          >
            <span className="grid h-9 w-9 place-items-center rounded bg-sky-400 text-slate-950">
              <Workflow size={20} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">AI Flow</span>
              <span className="block truncate text-xs text-slate-500">
                {tenant?.name || "Workspace"}
              </span>
            </span>
          </button>

          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => {
              const active = currentPath === item.path || currentPath.startsWith(`${item.path}/`);
              const Icon = item.icon;
              return (
                <button
                  className={`inline-flex h-10 items-center gap-2 rounded px-3 text-sm transition ${
                    active ? "bg-white/12 text-white" : "text-slate-400 hover:bg-white/8 hover:text-white"
                  }`}
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  type="button"
                >
                  <Icon size={16} />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="flex min-w-0 items-center gap-3">
            <div className="hidden min-w-0 text-right sm:block">
              <div className="truncate text-sm font-medium">{user?.displayName || user?.email}</div>
              <div className="truncate text-xs text-slate-500">{user?.email}</div>
            </div>
            <button
              aria-label="Log out"
              className="grid h-10 w-10 place-items-center rounded border border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/10 hover:text-white"
              onClick={() => {
                void logout().finally(() => navigate("/login"));
              }}
              title="Log out"
              type="button"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>

        <nav className="grid grid-cols-4 border-t border-white/8 md:hidden">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className="flex h-12 flex-col items-center justify-center gap-1 text-[11px] text-slate-400"
                key={item.path}
                onClick={() => navigate(item.path)}
                type="button"
              >
                <Icon size={15} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
