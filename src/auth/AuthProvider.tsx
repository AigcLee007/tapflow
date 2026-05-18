import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  clearStoredAuth,
  getStoredAccessToken,
  getStoredRefreshToken,
  V2_AUTH_CHANGE_EVENT,
  V2HttpError,
} from "../services/v2HttpClient";
import * as v2AuthClient from "../services/v2AuthClient";
import type { AuthSession } from "../services/v2AuthClient";
import { AuthContext, sessionToAuthState } from "./useAuth";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCurrentSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!getStoredAccessToken() && getStoredRefreshToken()) {
        await v2AuthClient.refresh();
      }

      if (!getStoredAccessToken()) {
        setSession(null);
        return;
      }

      setSession(await v2AuthClient.getMe());
    } catch (loadError) {
      clearStoredAuth();
      setSession(null);
      if (!(loadError instanceof V2HttpError && loadError.status === 401)) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load session");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCurrentSession();
  }, [loadCurrentSession]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleAuthChange = () => {
      void loadCurrentSession();
    };
    window.addEventListener(V2_AUTH_CHANGE_EVENT, handleAuthChange);
    window.addEventListener("storage", handleAuthChange);
    return () => {
      window.removeEventListener(V2_AUTH_CHANGE_EVENT, handleAuthChange);
      window.removeEventListener("storage", handleAuthChange);
    };
  }, [loadCurrentSession]);

  const value = useMemo(
    () => ({
      authenticated: Boolean(session?.user),
      error,
      loading,
      ...sessionToAuthState(session),
      refreshMe: loadCurrentSession,
      register: async (input: {
        displayName?: string;
        email: string;
        password: string;
        tenantName?: string;
      }) => {
        setError(null);
        setLoading(true);
        try {
          setSession(await v2AuthClient.register(input));
          await loadCurrentSession();
        } catch (registerError) {
          setError(registerError instanceof Error ? registerError.message : "Registration failed");
          throw registerError;
        } finally {
          setLoading(false);
        }
      },
      login: async (input: {
        email: string;
        password: string;
        tenantId?: string;
      }) => {
        setError(null);
        setLoading(true);
        try {
          setSession(await v2AuthClient.login(input));
          await loadCurrentSession();
        } catch (loginError) {
          setError(loginError instanceof Error ? loginError.message : "Login failed");
          throw loginError;
        } finally {
          setLoading(false);
        }
      },
      logout: async () => {
        setError(null);
        await v2AuthClient.logout();
        setSession(null);
      },
    }),
    [error, loadCurrentSession, loading, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
