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

export class V2RequestTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = "V2RequestTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export type RequestOptions = {
  auth?: boolean;
  retryOnUnauthorized?: boolean;
  timeoutMs?: number;
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

const ACCESS_TOKEN_REFRESH_SKEW_SECONDS = 120;

let refreshPromise: Promise<RefreshResponse> | null = null;

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
  } else if (tokens.accessToken !== undefined) {
    window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  }
  if (tokens.refreshToken) {
    window.localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, tokens.refreshToken);
  } else if (tokens.refreshToken !== undefined) {
    window.localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  }
  emitAuthChange();
}

export function clearStoredAuth() {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  emitAuthChange();
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function shouldRefreshAccessTokenSoon(token: string | null): boolean {
  if (!token) {
    return false;
  }

  const payload = decodeJwtPayload(token);
  const exp = typeof payload?.exp === "number" ? payload.exp : null;
  if (!exp) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  return exp - now <= ACCESS_TOKEN_REFRESH_SKEW_SECONDS;
}

function shouldClearAuthAfterRefreshFailure(error: unknown): boolean {
  return (
    error instanceof V2HttpError &&
    error.status === 401 &&
    (error.code === "INVALID_REFRESH_TOKEN" ||
      error.code === "MISSING_REFRESH_TOKEN" ||
      error.code === "UNAUTHORIZED")
  );
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

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs?: number,
): Promise<Response> {
  const boundedTimeoutMs = typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : null;
  if (!boundedTimeoutMs) return fetch(url, init);

  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), boundedTimeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new V2RequestTimeoutError(boundedTimeoutMs);
    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

async function performRefreshAccessToken(): Promise<RefreshResponse> {
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
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const result = await parseResponse<RefreshResponse>(response);
    setStoredTokens(result);
    return result;
  } catch (error) {
    if (shouldClearAuthAfterRefreshFailure(error)) {
      clearStoredAuth();
    }
    throw error;
  }
}

export async function refreshAccessToken(): Promise<RefreshResponse> {
  if (!refreshPromise) {
    refreshPromise = performRefreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const useAuth = options.auth !== false;
  const headers: Record<string, string> = {};
  let token = getStoredAccessToken();

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (
    useAuth &&
    options.retryOnUnauthorized !== false &&
    getStoredRefreshToken() &&
    shouldRefreshAccessTokenSoon(token)
  ) {
    try {
      token = (await refreshAccessToken()).accessToken;
    } catch (error) {
      if (shouldClearAuthAfterRefreshFailure(error)) {
        clearStoredAuth();
        throw error;
      }
    }
  }

  if (useAuth && token) {
    headers.Authorization = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
  }

  const requestUrl = `${API_BASE_URL}${cleanPath(path)}`;
  const requestInit: RequestInit = {
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    headers,
    method,
  };
  const response = await fetchWithTimeout(requestUrl, requestInit, options.timeoutMs);

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
      const retryResponse = await fetchWithTimeout(requestUrl, {
        ...requestInit,
        headers: retryHeaders,
      }, options.timeoutMs);
      return parseResponse<T>(retryResponse);
    } catch (error) {
      if (shouldClearAuthAfterRefreshFailure(error)) {
        clearStoredAuth();
      }
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
