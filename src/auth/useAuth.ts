import { createContext, useContext } from "react";

import type { AuthSession, V2Tenant, V2User } from "../services/v2AuthClient";

export type AuthState = {
  authenticated: boolean;
  error: string | null;
  loading: boolean;
  permissions: string[];
  refreshMe: () => Promise<void>;
  register: (input: {
    displayName?: string;
    email: string;
    password: string;
    tenantName?: string;
  }) => Promise<void>;
  login: (input: {
    email: string;
    password: string;
    tenantId?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  roles: string[];
  sessionId: string | null;
  tenant: V2Tenant | null;
  user: V2User | null;
};

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}

export function sessionToAuthState(session: AuthSession | null) {
  return {
    permissions: session?.permissions ?? [],
    roles: session?.roles ?? [],
    sessionId: session?.sessionId ?? null,
    tenant: session?.currentTenant ?? null,
    user: session?.user ?? null,
  };
}
