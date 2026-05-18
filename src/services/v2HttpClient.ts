const API_BASE_URL = "/api/v2";
const ACCESS_TOKEN_STORAGE_KEY = "v2-access-token";
const REFRESH_TOKEN_STORAGE_KEY = "v2-refresh-token";

export const V2_AUTH_CHANGE_EVENT = "v2-auth-change";

export type ApiError = {
  code?: string;
  details?: unknown;
  message: string;
  requestId?: string;
  status: number;
};

export class V2HttpError extends Error {
  readonly code?: string;
  readonly details?: unknown;
  readonly requestId?: string;
  readonly status: number;

  constructor(error: ApiError) {
    super(error.message);
    this.name = "V2HttpError";
    this.code = error.code;
    this.details = error.details;
    this.requestId = error.requestId;
    this.status = error.status;
  }
}

type RequestOptions = {
  auth?: boolean;
  retryOnUnauthorized?: boolean;
};

type ErrorEnvelope = {
  error?: {
    code?: string;
    details?: unknown;
    message?: string;
    requestId?: string;
  };
};

type RefreshResponse = {
  accessToken: string;
  refreshToken: string;
};

const canUseStorage = () =>
  typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const emitAuthChange = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(V2_AUTH_CHANGE_EVENT));
};

const cleanPath = (path: string) => (path.startsWith("/") ? path : `/${path}`);

export function getStoredAccessToken(): string | null {
  if (!canUseStorage()) return null;
  const value = window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
  return value?.trim() || null;
}

export function getStoredRefreshToken(): string | null {
  if (!canUseStorage()) return null;
  const value = window.localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
  return value?.trim() || null;
}

export function setStoredTokens(tokens: {
  accessToken?: string | null;
  refreshToken?: string | null;
}) {
  if (!canUseStorage()) return;
  if (tokens.accessToken) {
    window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, tokens.accessToken);
  }
  if (tokens.refreshToken) {
    window.localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, tokens.refreshToken);
  }
  emitAuthChange();
}

export function clearStoredAuth() {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  emitAuthChange();
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & ErrorEnvelope;
  if (!response.ok) {
    throw new V2HttpError({
      code: payload.error?.code,
      details: payload.error?.details,
      message: payload.error?.message || `Request failed with status ${response.status}`,
      requestId: payload.error?.requestId,
      status: response.status,
    });
  }

  return payload as T;
}

export async function refreshAccessToken(): Promise<RefreshResponse> {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) {
    clearStoredAuth();
    throw new V2HttpError({
      code: "MISSING_REFRESH_TOKEN",
      message: "Missing refresh token",
      status: 401,
    });
  }

  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      body: JSON.stringify({ refreshToken }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const result = await parseResponse<RefreshResponse>(response);
    setStoredTokens(result);
    return result;
  } catch (error) {
    clearStoredAuth();
    throw error;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const useAuth = options.auth !== false;
  const headers: Record<string, string> = {};
  const token = getStoredAccessToken();

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (useAuth && token) {
    headers.Authorization = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${cleanPath(path)}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers,
    method,
  });

  if (
    useAuth &&
    response.status === 401 &&
    options.retryOnUnauthorized !== false &&
    getStoredRefreshToken()
  ) {
    try {
      const refreshed = await refreshAccessToken();
      const retryHeaders = {
        ...headers,
        Authorization: `Bearer ${refreshed.accessToken}`,
      };
      const retryResponse = await fetch(`${API_BASE_URL}${cleanPath(path)}`, {
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: retryHeaders,
        method,
      });
      return parseResponse<T>(retryResponse);
    } catch (error) {
      clearStoredAuth();
      throw error;
    }
  }

  if (useAuth && response.status === 401) {
    clearStoredAuth();
  }

  return parseResponse<T>(response);
}

export async function apiGet<T>(path: string, options?: RequestOptions): Promise<T> {
  return request<T>("GET", path, undefined, options);
}

export async function apiPost<T>(
  path: string,
  body?: unknown,
  options?: RequestOptions,
): Promise<T> {
  return request<T>("POST", path, body, options);
}

export async function apiPatch<T>(
  path: string,
  body?: unknown,
  options?: RequestOptions,
): Promise<T> {
  return request<T>("PATCH", path, body, options);
}

export async function apiPut<T>(
  path: string,
  body?: unknown,
  options?: RequestOptions,
): Promise<T> {
  return request<T>("PUT", path, body, options);
}

export async function apiDelete<T>(path: string, options?: RequestOptions): Promise<T> {
  return request<T>("DELETE", path, undefined, options);
}
