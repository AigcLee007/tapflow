import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AuthProvider } from "./AuthProvider";
import { useAuth } from "./useAuth";
import { clearStoredAuth, setStoredTokens, V2HttpError } from "../services/v2HttpClient";
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
});
