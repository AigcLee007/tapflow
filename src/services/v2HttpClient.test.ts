import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  apiGet,
  clearStoredAuth,
  getStoredAccessToken,
  getStoredRefreshToken,
  refreshAccessToken,
  setStoredTokens,
  V2HttpError,
} from "./v2HttpClient";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
    },
    ...init,
  });
}

function accessTokenWithExp(exp: number) {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(
    JSON.stringify({
      exp,
      iat: exp - 900,
      session_id: "session-1",
      sub: "user-1",
      type: "access",
    }),
  );
  return `${header}.${payload}.signature`;
}

describe("v2HttpClient auth refresh", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setStoredTokens({
      accessToken: "expired-access-token",
      refreshToken: "refresh-token-1",
    });
  });

  afterEach(() => {
    clearStoredAuth();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test("aborts a request when its configured timeout elapses", async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    const fetchMock = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      requestSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const pending = apiGet("/ai/model-catalog?modality=video", { timeoutMs: 8_000 });
    const rejection = expect(pending).rejects.toMatchObject({
      name: "V2RequestTimeoutError",
      timeoutMs: 8_000,
    });
    await vi.advanceTimersByTimeAsync(8_000);

    expect(requestSignal?.aborted).toBe(true);
    await rejection;
  });

  test("coalesces concurrent refreshes behind one refresh request", async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url) === "/api/v2/auth/refresh") {
        return jsonResponse(
          {
            accessToken: "fresh-access-token",
            refreshToken: "refresh-token-2",
          },
          { status: 200 },
        );
      }

      return jsonResponse({ ok: true }, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const firstRefresh = refreshAccessToken();
    const secondRefresh = refreshAccessToken();

    await expect(Promise.all([firstRefresh, secondRefresh])).resolves.toEqual([
      {
        accessToken: "fresh-access-token",
        refreshToken: "refresh-token-2",
      },
      {
        accessToken: "fresh-access-token",
        refreshToken: "refresh-token-2",
      },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v2/auth/refresh",
      expect.objectContaining({
        body: JSON.stringify({ refreshToken: "refresh-token-1" }),
        method: "POST",
      }),
    );
  });

  test("retries concurrent unauthorized requests after a single token refresh", async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url) === "/api/v2/auth/refresh") {
        return jsonResponse(
          {
            accessToken: "fresh-access-token",
            refreshToken: "refresh-token-2",
          },
          { status: 200 },
        );
      }

      if (init?.headers && (init.headers as Record<string, string>).Authorization === "Bearer fresh-access-token") {
        return jsonResponse({ ok: true }, { status: 200 });
      }

      return jsonResponse(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Unauthorized",
          },
        },
        { status: 401 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(Promise.all([apiGet("/projects"), apiGet("/assets")])).resolves.toEqual([
      { ok: true },
      { ok: true },
    ]);

    const refreshCalls = fetchMock.mock.calls.filter(
      ([url]) => String(url) === "/api/v2/auth/refresh",
    );
    expect(refreshCalls).toHaveLength(1);
    expect(getStoredAccessToken()).toBe("fresh-access-token");
    expect(getStoredRefreshToken()).toBe("refresh-token-2");
  });

  test("refreshes proactively before sending an authenticated request with a nearly expired token", async () => {
    const now = Math.floor(Date.now() / 1000);
    setStoredTokens({
      accessToken: accessTokenWithExp(now + 30),
      refreshToken: "refresh-token-1",
    });
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url) === "/api/v2/auth/refresh") {
        return jsonResponse(
          {
            accessToken: "fresh-access-token",
            refreshToken: "refresh-token-2",
          },
          { status: 200 },
        );
      }

      return jsonResponse(
        {
          authHeader: (init?.headers as Record<string, string>).Authorization,
          ok: true,
        },
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiGet("/projects")).resolves.toEqual({
      authHeader: "Bearer fresh-access-token",
      ok: true,
    });

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "/api/v2/auth/refresh",
      "/api/v2/projects",
    ]);
  });

  test("continues the authenticated request with the existing token when proactive refresh has a transient failure", async () => {
    const now = Math.floor(Date.now() / 1000);
    const nearlyExpiredToken = accessTokenWithExp(now + 30);
    setStoredTokens({
      accessToken: nearlyExpiredToken,
      refreshToken: "refresh-token-1",
    });
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url) === "/api/v2/auth/refresh") {
        return jsonResponse(
          {
            error: {
              code: "INTERNAL_ERROR",
              message: "Server unavailable",
            },
          },
          { status: 500 },
        );
      }

      return jsonResponse(
        {
          authHeader: (init?.headers as Record<string, string>).Authorization,
          ok: true,
        },
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiGet("/projects")).resolves.toEqual({
      authHeader: `Bearer ${nearlyExpiredToken}`,
      ok: true,
    });

    expect(getStoredAccessToken()).toBe(nearlyExpiredToken);
    expect(getStoredRefreshToken()).toBe("refresh-token-1");
  });

  test("keeps stored tokens when refresh fails because of a transient server error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          {
            error: {
              code: "INTERNAL_ERROR",
              message: "Server unavailable",
            },
          },
          { status: 500 },
        ),
      ),
    );

    await expect(refreshAccessToken()).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      status: 500,
    } satisfies Partial<V2HttpError>);

    expect(getStoredAccessToken()).toBe("expired-access-token");
    expect(getStoredRefreshToken()).toBe("refresh-token-1");
  });

  test("clears stored tokens when refresh token is truly invalid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          {
            error: {
              code: "INVALID_REFRESH_TOKEN",
              message: "Login expired",
            },
          },
          { status: 401 },
        ),
      ),
    );

    await expect(refreshAccessToken()).rejects.toMatchObject({
      code: "INVALID_REFRESH_TOKEN",
      status: 401,
    } satisfies Partial<V2HttpError>);

    expect(getStoredAccessToken()).toBeNull();
    expect(getStoredRefreshToken()).toBeNull();
  });
});
