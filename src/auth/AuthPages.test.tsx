import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { AuthAttemptResult, VerificationRequired } from "../services/v2AuthClient";
import { ForgotPasswordPanel } from "./ForgotPasswordPage";
import { LoginPanel } from "./LoginPage";
import { RegisterPanel } from "./RegisterPage";
import { AuthContext, type AuthState } from "./useAuth";

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
});
