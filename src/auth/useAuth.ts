import { createContext, useContext } from "react";

import type {
  AuthAttemptResult,
  AuthSession,
  V2Tenant,
  V2User,
  VerificationRequired,
  LegalConsentInput,
} from "../services/v2AuthClient";

export type AuthState = {
  authenticated: boolean;
  error: string | null;
  loading: boolean;
  permissions: string[];
  refreshMe: () => Promise<void>;
  register: (input: {
    consent: LegalConsentInput;
    displayName?: string;
    email: string;
    password: string;
    tenantName?: string;
  }) => Promise<AuthAttemptResult>;
  login: (input: {
    consent: LegalConsentInput;
    email: string;
    password: string;
    tenantId?: string;
  }) => Promise<AuthAttemptResult>;
  verifyEmail: (input: { challengeToken: string; code: string }) => Promise<void>;
  resendEmailVerification: (input: {
    challengeToken: string;
  }) => Promise<VerificationRequired>;
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
