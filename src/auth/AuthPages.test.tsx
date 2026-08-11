import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { AuthAttemptResult, VerificationRequired } from "../services/v2AuthClient";
import { ForgotPasswordPanel } from "./ForgotPasswordPage";
import { LoginPanel } from "./LoginPage";
import { RegisterPanel } from "./RegisterPage";
import { AuthContext, type AuthState } from "./useAuth";
import { AuthExperiencePage } from "./AuthExperiencePage";

vi.mock("./landing/FilmStage", () => ({
  FilmStage: ({ onEnterWorkspace, onOpenAuth }: { onEnterWorkspace: () => void; onOpenAuth: () => void }) => (
    <main data-testid="film-stage">
      <button onClick={onOpenAuth} type="button">Open sign in</button>
      <button onClick={onEnterWorkspace} type="button">Enter workspace</button>
    </main>
  ),
}));

const { requestPasswordReset, resendPasswordReset, confirmPasswordReset } = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(),
  resendPasswordReset: vi.fn(),
  confirmPasswordReset: vi.fn(),
}));
vi.mock("../services/v2AuthClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/v2AuthClient")>()),
  requestPasswordReset,
  resendPasswordReset,
  confirmPasswordReset,
}));

const session: AuthAttemptResult = { status: "authenticated", session: { currentTenant: null, permissions: [], roles: [], sessionId: null, user: { displayName: "Creator", email: "creator@example.com", id: "user-1", status: "active" } } };
const challenge: VerificationRequired = { challengeToken: "challenge-token", emailMasked: "c***@example.com", expiresInSeconds: 600, reason: "email_unverified", resendAvailableInSeconds: 0, status: "verification_required" };

function authState(overrides: Partial<AuthState> = {}): AuthState {
  return { authenticated: false, error: null, loading: false, login: vi.fn(async () => session), logout: vi.fn(async () => undefined), permissions: [], refreshMe: vi.fn(async () => undefined), register: vi.fn(async () => session), resendEmailVerification: vi.fn(async () => challenge), roles: [], sessionId: null, tenant: null, user: null, verifyEmail: vi.fn(async () => undefined), ...overrides };
}
function renderAuth(ui: React.ReactElement, state = authState()) { return render(<AuthContext.Provider value={state}>{ui}</AuthContext.Provider>); }
function AuthExperienceRouteHarness() {
  const [, rerender] = React.useState(0);
  React.useEffect(() => {
    const handleRouteChange = () => rerender((version) => version + 1);
    window.addEventListener("popstate", handleRouteChange);
    return () => window.removeEventListener("popstate", handleRouteChange);
  }, []);
  return <AuthExperiencePage />;
}

describe("embeddable auth panels", () => {
  beforeEach(() => { window.history.replaceState(null, "", "/login"); vi.clearAllMocks(); });
  afterEach(() => vi.useRealTimers());

  test("submits only v2 login fields and exposes the forgot mode", async () => {
    const login = vi.fn(async () => session);
    const onModeChange = vi.fn();
    renderAuth(<LoginPanel onModeChange={onModeChange} onPendingChange={vi.fn()} />, authState({ login }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "creator@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(login).toHaveBeenCalledWith({ email: "creator@example.com", password: "secret" }));
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    expect(onModeChange).toHaveBeenCalledWith("forgot-password");
  });

  test("register omits tenant input and tenantName from its v2 request", async () => {
    const register = vi.fn(async () => session);
    renderAuth(<RegisterPanel onModeChange={vi.fn()} onPendingChange={vi.fn()} />, authState({ register }));
    expect(screen.queryByLabelText(/tenant|workspace name/i)).toBeNull();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "creator@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "StrongPass123!" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(register).toHaveBeenCalledWith({ displayName: undefined, email: "creator@example.com", password: "StrongPass123!" }));
  });

  test("verifies six digits and refocuses a cleared invalid code", async () => {
    const verifyEmail = vi.fn(async () => { throw new Error("Invalid code"); });
    renderAuth(<LoginPanel onModeChange={vi.fn()} onPendingChange={vi.fn()} />, authState({ login: vi.fn(async () => challenge), verifyEmail }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "creator@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    const code = await screen.findByLabelText("6 digit verification code");
    fireEvent.change(code, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }));
    await waitFor(() => { expect(verifyEmail).toHaveBeenCalledWith({ challengeToken: "challenge-token", code: "123456" }); expect((code as HTMLInputElement).value).toBe(""); expect(document.activeElement).toBe(code); });
  });

  test("does not navigate after verification resolves following unmount", async () => {
    let resolveVerification: (() => void) | undefined;
    const verifyEmail = vi.fn(() => new Promise<void>((resolve) => { resolveVerification = resolve; }));
    const { unmount } = renderAuth(<LoginPanel onModeChange={vi.fn()} onPendingChange={vi.fn()} />, authState({ login: vi.fn(async () => challenge), verifyEmail }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "creator@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    const code = await screen.findByLabelText("6 digit verification code");
    fireEvent.change(code, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }));
    await waitFor(() => expect(verifyEmail).toHaveBeenCalledOnce());
    expect((screen.getByRole("button", { name: "Back" }) as HTMLButtonElement).disabled).toBe(true);
    unmount();
    await act(async () => { resolveVerification?.(); });
    expect(window.location.pathname).toBe("/login");
  });

  test("resends verification through the existing v2 auth action", async () => {
    const resendEmailVerification = vi.fn(async () => challenge);
    renderAuth(<RegisterPanel onModeChange={vi.fn()} onPendingChange={vi.fn()} />, authState({ register: vi.fn(async () => challenge), resendEmailVerification }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "creator@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "StrongPass123!" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    fireEvent.click(await screen.findByRole("button", { name: "Resend code" }));
    await waitFor(() => expect(resendEmailVerification).toHaveBeenCalledWith({ challengeToken: "challenge-token" }));
  });

  test("handles reset request and returns to login with a success state", async () => {
    requestPasswordReset.mockResolvedValue({ challengeToken: "reset-token" });
    confirmPasswordReset.mockResolvedValue({ message: "ok" });
    renderAuth(<ForgotPasswordPanel onModeChange={vi.fn()} onPendingChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "creator@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send verification code" }));
    await screen.findByLabelText("6 digit verification code");
    fireEvent.change(screen.getByLabelText("6 digit verification code"), { target: { value: "123456" } });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "StrongPass123!" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "StrongPass123!" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
    await waitFor(() => expect(window.location.pathname + window.location.search).toBe("/login?passwordReset=success"));
    renderAuth(<LoginPanel onModeChange={vi.fn()} onPendingChange={vi.fn()} />);
    expect(screen.getByText("Password reset. You can sign in now.")).toBeTruthy();
  });

  test("uses the password reset cooldown before enabling resend", async () => {
    vi.useFakeTimers();
    requestPasswordReset.mockResolvedValue({ challengeToken: "reset-token", expiresInSeconds: 600, message: "Sent", resendAvailableInSeconds: 2 });
    renderAuth(<ForgotPasswordPanel onModeChange={vi.fn()} onPendingChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "creator@example.com" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send verification code" }));
      await Promise.resolve();
    });
    const resend = screen.getByRole("button", { name: "Resend code (2s)" });
    expect((resend as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect((screen.getByRole("button", { name: "Resend code" }) as HTMLButtonElement).disabled).toBe(false);
  });

  test("disables reset resend while pending and recovers after a failure", async () => {
    requestPasswordReset.mockResolvedValue({ challengeToken: "reset-token", expiresInSeconds: 600, message: "Sent", resendAvailableInSeconds: 0 });
    let rejectResend: ((error: Error) => void) | undefined;
    resendPasswordReset.mockImplementation(() => new Promise((_resolve, reject) => { rejectResend = reject; }));
    renderAuth(<ForgotPasswordPanel onModeChange={vi.fn()} onPendingChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "creator@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send verification code" }));
    const resend = await screen.findByRole("button", { name: "Resend code" });
    fireEvent.click(resend);
    await waitFor(() => expect(resendPasswordReset).toHaveBeenCalledWith({ challengeToken: "reset-token" }));
    expect((resend as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { rejectResend?.(new Error("Resend failed")); });
    expect(await screen.findByText("Resend failed")).toBeTruthy();
    expect((resend as HTMLButtonElement).disabled).toBe(false);
  });

  test("does not update after an unmounted password reset request resolves", async () => {
    let resolveRequest: ((value: { challengeToken: string; expiresInSeconds: number; message: string; resendAvailableInSeconds: number }) => void) | undefined;
    requestPasswordReset.mockImplementation(() => new Promise((resolve) => { resolveRequest = resolve; }));
    const { unmount } = renderAuth(<ForgotPasswordPanel onModeChange={vi.fn()} onPendingChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "creator@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send verification code" }));
    unmount();
    await act(async () => { resolveRequest?.({ challengeToken: "reset-token", expiresInSeconds: 600, message: "Sent", resendAvailableInSeconds: 30 }); });
    expect(window.location.pathname).toBe("/login");
  });
});

describe("AuthExperiencePage", () => {
  beforeEach(() => { window.history.replaceState(null, "", "/login"); vi.clearAllMocks(); });

  test("derives the closed and login-success dialog states from the login URL", () => {
    const { rerender } = renderAuth(<AuthExperiencePage />);
    expect(screen.getByTestId("film-stage")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();

    window.history.replaceState(null, "", "/login?passwordReset=success");
    rerender(<AuthContext.Provider value={authState()}><AuthExperiencePage /></AuthContext.Provider>);
    expect(screen.getByRole("dialog", { name: "Welcome back" })).toBeTruthy();
    expect(screen.getByText("Password reset. You can sign in now.")).toBeTruthy();
  });

  test("closes the direct register dialog back to login", () => {
    window.history.replaceState(null, "", "/register?returnTo=%2Fassets");
    renderAuth(<AuthExperienceRouteHarness />);
    expect(screen.getByRole("dialog", { name: "Create account" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(window.location.pathname + window.location.search).toBe("/login?returnTo=%2Fassets");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("closes the direct password recovery dialog back to login", () => {
    window.history.replaceState(null, "", "/forgot-password");
    renderAuth(<AuthExperienceRouteHarness />);
    expect(screen.getByRole("dialog", { name: "Reset password" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(window.location.pathname).toBe("/login");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("keeps the direct register dialog open while a submission is pending", async () => {
    let resolveRegister: ((result: AuthAttemptResult) => void) | undefined;
    const register = vi.fn(() => new Promise<AuthAttemptResult>((resolve) => { resolveRegister = resolve; }));
    window.history.replaceState(null, "", "/register");
    renderAuth(<AuthExperienceRouteHarness />, authState({ register }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "creator@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "StrongPass123!" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(register).toHaveBeenCalledOnce());

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    fireEvent.mouseDown(screen.getByTestId("auth-dialog-backdrop"));
    expect(window.location.pathname).toBe("/register");
    expect(screen.getByRole("dialog", { name: "Create account" })).toBeTruthy();

    await act(async () => { resolveRegister?.(session); });
  });

  test("moves focus to the new panel content when the dialog switches to registration", async () => {
    renderAuth(<AuthExperienceRouteHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Open sign in" }));
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    const displayName = await screen.findByLabelText("Display name");
    expect(document.activeElement).toBe(displayName);
  });

  test("uses the film CTA to open auth for anonymous users and workspace for authenticated users", () => {
    const { rerender } = renderAuth(<AuthExperiencePage />);
    fireEvent.click(screen.getByRole("button", { name: "Enter workspace" }));
    expect(screen.getByRole("dialog", { name: "Welcome back" })).toBeTruthy();
    expect(window.location.pathname).toBe("/login");

    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    rerender(<AuthContext.Provider value={authState({ authenticated: true })}><AuthExperiencePage /></AuthContext.Provider>);
    fireEvent.click(screen.getByRole("button", { name: "Enter workspace" }));
    expect(window.location.pathname).toBe("/workspace");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
