import React, { FormEvent, useEffect, useState } from "react";

import {
  confirmPasswordReset,
  type PasswordResetChallenge,
  requestPasswordReset,
  resendPasswordReset,
} from "../services/v2AuthClient";
import { AuthErrorMessage, AuthField, AuthPrimaryButton, AuthSecondaryButton } from "./AuthFormControls";
import { navigate, navigateAuthMode } from "./authNavigation";
import { type AuthPanelProps } from "./LoginPage";
import { useAuthRequestGuard } from "./useAuthRequestGuard";

export function ForgotPasswordPanel({ onModeChange, onPendingChange }: AuthPanelProps) {
  const [email, setEmail] = useState("");
  const [challenge, setChallenge] = useState<PasswordResetChallenge | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const requestGuard = useAuthRequestGuard();

  useEffect(() => { onPendingChange?.(pending); }, [onPendingChange, pending]);
  useEffect(() => { setResendSeconds(challenge?.resendAvailableInSeconds ?? 0); }, [challenge]);
  useEffect(() => {
    if (resendSeconds <= 0) return undefined;
    const timer = window.setInterval(() => setResendSeconds((seconds) => Math.max(0, seconds - 1)), 1_000);
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const request = requestGuard.begin();
    setPending(true);
    setError(null);
    try {
      if (!challenge) {
        const nextChallenge = await requestPasswordReset({ email });
        if (requestGuard.isCurrent(request)) setChallenge(nextChallenge);
        return;
      }
      if (!/^\d{6}$/.test(code)) throw new Error("Enter the 6 digit verification code.");
      if (password !== confirm) throw new Error("Passwords do not match.");
      await confirmPasswordReset({ challengeToken: challenge.challengeToken, code, newPassword: password });
      if (requestGuard.isCurrent(request)) navigate("/login?passwordReset=success");
    } catch (caught) {
      if (requestGuard.isCurrent(request)) setError(caught instanceof Error ? caught.message : "Unable to reset your password.");
    } finally {
      if (requestGuard.isCurrent(request)) setPending(false);
    }
  };

  const resend = async () => {
    if (!challenge || resendSeconds > 0) return;
    const request = requestGuard.begin();
    setPending(true);
    setError(null);
    try {
      const nextChallenge = await resendPasswordReset({ challengeToken: challenge.challengeToken });
      if (requestGuard.isCurrent(request)) setChallenge(nextChallenge);
    } catch (caught) {
      if (requestGuard.isCurrent(request)) setError(caught instanceof Error ? caught.message : "Unable to resend the code.");
    } finally {
      if (requestGuard.isCurrent(request)) setPending(false);
    }
  };

  return <form onSubmit={submit}>
    <AuthErrorMessage message={error} />
    {!challenge ? <AuthField autoComplete="email" label="Email" onChange={setEmail} required type="email" value={email} /> : <>
      <AuthField autoComplete="one-time-code" inputMode="numeric" label="6 digit verification code" maxLength={6} onChange={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))} required value={code} />
      <AuthField autoComplete="new-password" label="New password" minLength={8} onChange={setPassword} required type="password" value={password} />
      <AuthField autoComplete="new-password" label="Confirm new password" minLength={8} onChange={setConfirm} required type="password" value={confirm} />
    </>}
    <AuthPrimaryButton disabled={pending}>{pending ? "Please wait..." : challenge ? "Reset password" : "Send verification code"}</AuthPrimaryButton>
    {challenge ? <AuthSecondaryButton disabled={pending || resendSeconds > 0} onClick={() => void resend()}>{resendSeconds > 0 ? `Resend code (${resendSeconds}s)` : "Resend code"}</AuthSecondaryButton> : <AuthSecondaryButton onClick={() => onModeChange ? onModeChange("login") : navigateAuthMode("login")}>Back to sign in</AuthSecondaryButton>}
  </form>;
}

export function ForgotPasswordPage() {
  return <main className="grid min-h-screen place-items-center bg-neutral-100 p-5"><section className="w-full max-w-md rounded-xl bg-white p-7 shadow-xl"><h1 className="mb-2 text-2xl font-semibold text-neutral-950">Reset password</h1><p className="mb-6 text-sm text-neutral-600">We will send a verification code to your email.</p><ForgotPasswordPanel /></section></main>;
}
