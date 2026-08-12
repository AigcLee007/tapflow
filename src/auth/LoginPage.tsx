import React, { FormEvent, useEffect, useState } from "react";

import { getLegalManifest, type LegalManifest } from "../legal/legalApi";
import type { VerificationRequired } from "../services/v2AuthClient";
import { AuthErrorMessage, AuthField, AuthPrimaryButton, AuthSecondaryButton } from "./AuthFormControls";
import { getSafeReturnTo, navigate, navigateAuthMode, type AuthMode } from "./authNavigation";
import { EmailVerificationStep } from "./EmailVerificationStep";
import { LegalConsentControl } from "./LegalConsentControl";
import { clearRememberedEmail, getRememberedEmail, setRememberedEmail } from "./rememberedEmailPreference";
import { useAuthRequestGuard } from "./useAuthRequestGuard";
import { useAuth } from "./useAuth";

export type AuthPanelProps = { onModeChange?: (mode: AuthMode) => void; onPendingChange?: (pending: boolean) => void };
const changeMode = (handler: AuthPanelProps["onModeChange"]) => (mode: AuthMode) => handler ? handler(mode) : navigateAuthMode(mode);
const consentError = "请先阅读并同意用户协议和隐私政策。";

export function LoginPanel({ onModeChange, onPendingChange }: AuthPanelProps) {
  const { authenticated, login, resendEmailVerification, verifyEmail } = useAuth();
  const [email, setEmail] = useState(() => getRememberedEmail());
  const [password, setPassword] = useState("");
  const [rememberEmail, setRememberEmail] = useState(() => Boolean(getRememberedEmail()));
  const [consented, setConsented] = useState(false);
  const [manifest, setManifest] = useState<LegalManifest | null>(null);
  const [pending, setPending] = useState(false); const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<VerificationRequired | null>(null);
  const requestGuard = useAuthRequestGuard();
  useEffect(() => { void getLegalManifest().then(setManifest).catch(() => setError("协议内容加载失败，请刷新后重试。")); }, []);
  useEffect(() => { onPendingChange?.(pending); }, [onPendingChange, pending]);
  useEffect(() => { if (authenticated) navigate(getSafeReturnTo()); }, [authenticated]);
  const switchMode = changeMode(onModeChange);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!consented) { setError(consentError); return; } if (!manifest) { setError("协议内容加载失败，请刷新后重试。"); return; } const request = requestGuard.begin(); setPending(true); setError(null); try { const result = await login({ consent: { privacyVersion: manifest.privacy.version, termsVersion: manifest.terms.version }, email, password }); if (!requestGuard.isCurrent(request)) return; if (result.status === "verification_required") { setChallenge(result); return; } if (rememberEmail) setRememberedEmail(email); else clearRememberedEmail(); navigate(getSafeReturnTo()); } catch (caught) { if (requestGuard.isCurrent(request)) setError(caught instanceof Error ? caught.message : "登录失败，请稍后重试。"); } finally { if (requestGuard.isCurrent(request)) setPending(false); } };
  const verify = async (code: string) => { if (!challenge) return; const request = requestGuard.begin(); setPending(true); setError(null); try { await verifyEmail({ challengeToken: challenge.challengeToken, code }); if (requestGuard.isCurrent(request)) navigate(getSafeReturnTo()); } catch (caught) { if (requestGuard.isCurrent(request)) setError(caught instanceof Error ? caught.message : "验证码校验失败。"); } finally { if (requestGuard.isCurrent(request)) setPending(false); } };
  const resend = async () => { if (!challenge) return; const request = requestGuard.begin(); setPending(true); setError(null); try { const nextChallenge = await resendEmailVerification({ challengeToken: challenge.challengeToken }); if (requestGuard.isCurrent(request)) setChallenge(nextChallenge); } catch (caught) { if (requestGuard.isCurrent(request)) setError(caught instanceof Error ? caught.message : "验证码发送失败。"); } finally { if (requestGuard.isCurrent(request)) setPending(false); } };
  const resetSucceeded = new URLSearchParams(window.location.search).get("passwordReset") === "success";
  return <form onSubmit={submit}>{challenge ? <><AuthErrorMessage message={error} /><EmailVerificationStep challenge={challenge} error={error} onBack={() => { requestGuard.cancel(); setChallenge(null); setError(null); setPending(false); }} onResend={resend} onVerify={verify} submitting={pending} /></> : <><AuthErrorMessage message={error} />{resetSucceeded ? <p aria-live="polite" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">密码已重置，请使用新密码登录。</p> : null}<AuthField autoComplete="email" label="邮箱" onChange={setEmail} required type="email" value={email} /><AuthField autoComplete="current-password" label="密码" minLength={1} onChange={setPassword} required type="password" value={password} /><div className="mb-4 flex items-center justify-between gap-3"><label className="flex items-center gap-2 text-sm text-neutral-700"><input checked={rememberEmail} onChange={(event) => setRememberEmail(event.target.checked)} type="checkbox" />记住账号</label><button className="text-sm font-semibold text-neutral-600 underline underline-offset-4" onClick={() => switchMode("forgot-password")} type="button">忘记密码？</button></div><LegalConsentControl checked={consented} error={error === consentError ? error : null} onChange={(value) => { setConsented(value); if (value && error === consentError) setError(null); }} /><AuthPrimaryButton disabled={pending || !manifest}>{pending ? "登录中..." : "立即登录"}</AuthPrimaryButton><AuthSecondaryButton onClick={() => switchMode("register")}>创建账号</AuthSecondaryButton></>}</form>;
}

export function LoginPage() { return <main className="grid min-h-screen place-items-center bg-neutral-100 p-5"><section className="w-full max-w-md rounded-xl bg-white p-7 shadow-xl"><h1 className="mb-6 text-2xl font-semibold text-neutral-950">欢迎回来</h1><LoginPanel /></section></main>; }
