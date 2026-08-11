import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AuthContext, type AuthState } from "../auth/useAuth";
import { AppRouter } from "./AppRouter";

vi.mock("../auth/landing/FilmStage", () => ({
  FilmStage: ({ onOpenAuth }: { onOpenAuth: () => void }) => <button onClick={onOpenAuth} type="button">Open sign in</button>,
}));

function authState(): AuthState {
  return {
    authenticated: false,
    error: null,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    permissions: [],
    refreshMe: vi.fn(),
    register: vi.fn(),
    resendEmailVerification: vi.fn(),
    roles: [],
    sessionId: null,
    tenant: null,
    user: null,
    verifyEmail: vi.fn(),
  };
}

function renderRouter() {
  return render(<AuthContext.Provider value={authState()}><AppRouter /></AuthContext.Provider>);
}

describe("AppRouter public auth location updates", () => {
  beforeEach(() => window.history.replaceState(null, "", "/login"));

  test("reflects same-path password reset query changes and closes the dialog after navigation", () => {
    renderRouter();
    expect(screen.queryByRole("dialog")).toBeNull();

    act(() => {
      window.history.replaceState(null, "", "/login?passwordReset=success");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.getByRole("dialog", { name: "Welcome back" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(window.location.pathname + window.location.search).toBe("/login");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
