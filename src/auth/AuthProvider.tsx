import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  const requestSequenceRef = useRef(0);

  const loadCurrentSession = useCallback(async () => {
    const requestId = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestId;
    setLoading(true);
    setError(null);
    try {
      if (!getStoredAccessToken() && getStoredRefreshToken()) {
        await v2AuthClient.refresh();
      }

      if (!getStoredAccessToken()) {
        if (requestSequenceRef.current === requestId) {
          setSession(null);
        }
        return;
      }

      const nextSession = await v2AuthClient.getMe();
      if (requestSequenceRef.current === requestId) {
        setSession(nextSession);
      }
    } catch (loadError) {
      clearStoredAuth();
      if (requestSequenceRef.current === requestId) {
        setSession(null);
      }
      if (
        requestSequenceRef.current === requestId &&
        !(loadError instanceof V2HttpError && loadError.status === 401)
      ) {
        setError(loadError instanceof Error ? loadError.message : "账号会话加载失败。");
      }
    } finally {
      if (requestSequenceRef.current === requestId) {
        setLoading(false);
      }
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
        requestSequenceRef.current += 1;
        setSession(null);
        try {
          setSession(await v2AuthClient.register(input));
          await loadCurrentSession();
        } catch (registerError) {
          setError(registerError instanceof Error ? registerError.message : "注册失败，请稍后重试。");
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
        requestSequenceRef.current += 1;
        setSession(null);
        try {
          setSession(await v2AuthClient.login(input));
          await loadCurrentSession();
        } catch (loginError) {
          setError(loginError instanceof Error ? loginError.message : "登录失败，请稍后重试。");
          throw loginError;
        } finally {
          setLoading(false);
        }
      },
      logout: async () => {
        setError(null);
        requestSequenceRef.current += 1;
        await v2AuthClient.logout();
        setSession(null);
        setLoading(false);
      },
    }),
    [error, loadCurrentSession, loading, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
