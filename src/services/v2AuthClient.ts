import {
  apiGet,
  apiPost,
  clearStoredAuth,
  getStoredRefreshToken,
  refreshAccessToken,
  setStoredTokens,
} from "./v2HttpClient";

export type V2User = {
  displayName: string | null;
  email: string;
  id: string;
  status: string;
};

export type V2Tenant = {
  id: string;
  name: string;
  plan: string;
  slug: string;
  status: string;
};

export type AuthSession = {
  currentTenant: V2Tenant | null;
  permissions: string[];
  roles: string[];
  sessionId: string | null;
  user: V2User;
};

export type AuthTokensResponse = {
  accessToken: string;
  currentTenant: V2Tenant;
  permissions?: string[];
  refreshToken: string;
  user: V2User;
};

export async function register(input: {
  displayName?: string;
  email: string;
  password: string;
  tenantName?: string;
}): Promise<AuthSession> {
  const response = await apiPost<AuthTokensResponse>("/auth/register", input, {
    auth: false,
    retryOnUnauthorized: false,
  });
  setStoredTokens(response);

  return {
    currentTenant: response.currentTenant,
    permissions: response.permissions ?? [],
    roles: [],
    sessionId: null,
    user: response.user,
  };
}

export async function login(input: {
  email: string;
  password: string;
  tenantId?: string;
}): Promise<AuthSession> {
  const response = await apiPost<AuthTokensResponse>("/auth/login", input, {
    auth: false,
    retryOnUnauthorized: false,
  });
  setStoredTokens(response);

  return getMe().catch(() => ({
    currentTenant: response.currentTenant,
    permissions: response.permissions ?? [],
    roles: [],
    sessionId: null,
    user: response.user,
  }));
}

export async function refresh() {
  return refreshAccessToken();
}

export async function logout(): Promise<{ ok: true }> {
  const refreshToken = getStoredRefreshToken();
  try {
    if (refreshToken) {
      await apiPost<{ ok: true }>(
        "/auth/logout",
        { refreshToken },
        {
          auth: true,
          retryOnUnauthorized: false,
        },
      );
    }
  } finally {
    clearStoredAuth();
  }

  return { ok: true };
}

export async function getMe(): Promise<AuthSession> {
  const response = await apiGet<{
    currentTenant: V2Tenant | null;
    permissions?: string[];
    roles?: string[];
    sessionId?: string;
    user: V2User;
  }>("/auth/me");

  return {
    currentTenant: response.currentTenant,
    permissions: response.permissions ?? [],
    roles: response.roles ?? [],
    sessionId: response.sessionId ?? null,
    user: response.user,
  };
}
