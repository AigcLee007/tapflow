import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AuthProvider } from "./AuthProvider";
import { AuthGate } from "./AuthGate";
import { useAuth } from "./useAuth";
import {
  clearStoredAuth,
  setStoredTokens,
  V2_AUTH_CHANGE_EVENT,
  V2HttpError,
} from "../services/v2HttpClient";
import * as v2AuthClient from "../services/v2AuthClient";

vi.mock("../services/v2AuthClient", async () => {
  const actual = await vi.importActual<typeof import("../services/v2AuthClient")>(
    "../services/v2AuthClient",
  );
  return {
    ...actual,
    getMe: vi.fn(),
    refresh: vi.fn(),
  };
});

function AuthProbe() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(auth.loading)}</span>
      <span data-testid="authenticated">{String(auth.authenticated)}</span>
      <span data-testid="error">{auth.error ?? ""}</span>
    </div>
  );
}

describe("AuthProvider session loading", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearStoredAuth();
  });

  afterEach(() => {
    clearStoredAuth();
  });

  test("keeps stored tokens when loading the current session fails with a transient server error", async () => {
    setStoredTokens({
      accessToken: "existing-access-token",
      refreshToken: "existing-refresh-token",
    });
    vi.mocked(v2AuthClient.getMe).mockRejectedValue(
      new V2HttpError({
        code: "INTERNAL_ERROR",
        message: "Server unavailable",
        status: 500,
      }),
    );

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });

    expect(window.localStorage.getItem("v2-access-token")).toBe("existing-access-token");
    expect(window.localStorage.getItem("v2-refresh-token")).toBe("existing-refresh-token");
    expect(screen.getByTestId("authenticated").textContent).toBe("false");
    expect(screen.getByTestId("error").textContent).toBe("Server unavailable");
  });

  test("keeps authenticated children mounted during a silent auth-change session refresh", async () => {
    setStoredTokens({
      accessToken: "existing-access-token",
      refreshToken: "existing-refresh-token",
    });

    let resolveReload: ((session: v2AuthClient.AuthSession) => void) | null = null;
    vi.mocked(v2AuthClient.getMe)
      .mockResolvedValueOnce({
        tenant: { id: "tenant-1", name: "Tenant" },
        user: { displayName: "Creator", email: "creator@example.com", id: "user-1" },
      })
      .mockImplementationOnce(
        () =>
          new Promise<v2AuthClient.AuthSession>((resolve) => {
            resolveReload = resolve;
          }),
      );

    render(
      <AuthProvider>
        <AuthGate>
          <div data-testid="canvas">canvas mounted</div>
        </AuthGate>
      </AuthProvider>,
    );

    await screen.findByTestId("canvas");

    act(() => {
      window.dispatchEvent(new Event(V2_AUTH_CHANGE_EVENT));
    });

    expect(screen.getByTestId("canvas").textContent).toBe("canvas mounted");
    expect(screen.queryByText(/loading/i)).toBeNull();

    await act(async () => {
      resolveReload?.({
        tenant: { id: "tenant-1", name: "Tenant" },
        user: { displayName: "Creator", email: "creator@example.com", id: "user-1" },
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("canvas").textContent).toBe("canvas mounted");
    });
    expect(v2AuthClient.getMe).toHaveBeenCalled();
  });

  test("keeps the existing authenticated session when a silent refresh hits a transient server error", async () => {
    setStoredTokens({
      accessToken: "existing-access-token",
      refreshToken: "existing-refresh-token",
    });

    vi.mocked(v2AuthClient.getMe)
      .mockResolvedValueOnce({
        tenant: { id: "tenant-1", name: "Tenant" },
        user: { displayName: "Creator", email: "creator@example.com", id: "user-1" },
      })
      .mockRejectedValueOnce(
        new V2HttpError({
          code: "INTERNAL_ERROR",
          message: "Server unavailable",
          status: 500,
        }),
      );

    render(
      <AuthProvider>
        <AuthGate>
          <div data-testid="canvas">canvas mounted</div>
        </AuthGate>
      </AuthProvider>,
    );

    await screen.findByTestId("canvas");

    await act(async () => {
      window.dispatchEvent(new Event(V2_AUTH_CHANGE_EVENT));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId("canvas").textContent).toBe("canvas mounted");
    expect(window.localStorage.getItem("v2-access-token")).toBe("existing-access-token");
  });
});
