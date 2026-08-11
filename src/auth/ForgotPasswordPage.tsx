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
      if (!/^\d{6}$/.test(code)) throw new Error("请输入 6 位验证码。");
      if (password !== confirm) throw new Error("两次输入的密码不一致。");
      await confirmPasswordReset({ challengeToken: challenge.challengeToken, code, newPassword: password });
      if (requestGuard.isCurrent(request)) navigate("/login?passwordReset=success");
    } catch (caught) {
      if (requestGuard.isCurrent(request)) setError(caught instanceof Error ? caught.message : "重置密码失败，请稍后重试。");
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
      if (requestGuard.isCurrent(request)) setError(caught instanceof Error ? caught.message : "验证码发送失败，请稍后重试。");
    } finally {
      if (requestGuard.isCurrent(request)) setPending(false);
    }
  };

  return <form onSubmit={submit}>
    <AuthErrorMessage message={error} />
    {!challenge ? <AuthField autoComplete="email" label="邮箱" onChange={setEmail} required type="email" value={email} /> : <>
      <AuthField autoComplete="one-time-code" inputMode="numeric" label="6 位验证码" maxLength={6} onChange={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))} required value={code} />
      <AuthField autoComplete="new-password" label="新密码" minLength={8} onChange={setPassword} required type="password" value={password} />
      <AuthField autoComplete="new-password" label="确认新密码" minLength={8} onChange={setConfirm} required type="password" value={confirm} />
    </>}
    <AuthPrimaryButton disabled={pending}>{pending ? "请稍候..." : challenge ? "重置密码" : "发送验证码"}</AuthPrimaryButton>
    {challenge ? <AuthSecondaryButton disabled={pending || resendSeconds > 0} onClick={() => void resend()}>{resendSeconds > 0 ? `${resendSeconds} 秒后重新发送` : "重新发送验证码"}</AuthSecondaryButton> : <AuthSecondaryButton onClick={() => onModeChange ? onModeChange("login") : navigateAuthMode("login")}>返回登录</AuthSecondaryButton>}
  </form>;
}

export function ForgotPasswordPage() {
  return <main className="grid min-h-screen place-items-center bg-neutral-100 p-5"><section className="w-full max-w-md rounded-xl bg-white p-7 shadow-xl"><h1 className="mb-2 text-2xl font-semibold text-neutral-950">重置密码</h1><p className="mb-6 text-sm text-neutral-600">我们会向你的邮箱发送验证码。</p><ForgotPasswordPanel /></section></main>;
}
