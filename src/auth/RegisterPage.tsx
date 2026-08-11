import React, { FormEvent, useEffect, useState } from "react";

import type { VerificationRequired } from "../services/v2AuthClient";
import { AuthErrorMessage, AuthField, AuthPrimaryButton, AuthSecondaryButton } from "./AuthFormControls";
import { getSafeReturnTo, navigate, navigateAuthMode } from "./authNavigation";
import { EmailVerificationStep } from "./EmailVerificationStep";
import { type AuthPanelProps } from "./LoginPage";
import { useAuthRequestGuard } from "./useAuthRequestGuard";
import { useAuth } from "./useAuth";

export function RegisterPanel({ onModeChange, onPendingChange }: AuthPanelProps) {
  const { authenticated, register, resendEmailVerification, verifyEmail } = useAuth();
  const [displayName, setDisplayName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false); const [error, setError] = useState<string | null>(null); const [challenge, setChallenge] = useState<VerificationRequired | null>(null);
  const requestGuard = useAuthRequestGuard();
  useEffect(() => { onPendingChange?.(pending); }, [onPendingChange, pending]);
  useEffect(() => { if (authenticated) navigate(getSafeReturnTo()); }, [authenticated]);
  const mode = (next: "login" | "forgot-password" | "register") => onModeChange ? onModeChange(next) : navigateAuthMode(next);
  const submit = async (event: FormEvent) => { event.preventDefault(); const request = requestGuard.begin(); setPending(true); setError(null); try { const result = await register({ displayName: displayName.trim() || undefined, email, password }); if (!requestGuard.isCurrent(request)) return; if (result.status === "verification_required") { setChallenge(result); return; } navigate(getSafeReturnTo()); } catch (caught) { if (requestGuard.isCurrent(request)) setError(caught instanceof Error ? caught.message : "创建账号失败，请稍后重试。"); } finally { if (requestGuard.isCurrent(request)) setPending(false); } };
  const verify = async (code: string) => { if (!challenge) return; const request = requestGuard.begin(); setPending(true); setError(null); try { await verifyEmail({ challengeToken: challenge.challengeToken, code }); if (requestGuard.isCurrent(request)) navigate(getSafeReturnTo()); } catch (caught) { if (requestGuard.isCurrent(request)) setError(caught instanceof Error ? caught.message : "验证码校验失败。"); } finally { if (requestGuard.isCurrent(request)) setPending(false); } };
  const resend = async () => { if (!challenge) return; const request = requestGuard.begin(); setPending(true); setError(null); try { const nextChallenge = await resendEmailVerification({ challengeToken: challenge.challengeToken }); if (requestGuard.isCurrent(request)) setChallenge(nextChallenge); } catch (caught) { if (requestGuard.isCurrent(request)) setError(caught instanceof Error ? caught.message : "验证码发送失败。"); } finally { if (requestGuard.isCurrent(request)) setPending(false); } };
  return <form onSubmit={submit}>{challenge ? <><AuthErrorMessage message={error} /><EmailVerificationStep challenge={challenge} error={error} onBack={() => { requestGuard.cancel(); setChallenge(null); setError(null); setPending(false); }} onResend={resend} onVerify={verify} submitting={pending} /></> : <><AuthErrorMessage message={error} /><AuthField autoComplete="name" label="昵称" onChange={setDisplayName} value={displayName} /><AuthField autoComplete="email" label="邮箱" onChange={setEmail} required type="email" value={email} /><AuthField autoComplete="new-password" label="密码" minLength={8} onChange={setPassword} required type="password" value={password} /><AuthPrimaryButton disabled={pending}>{pending ? "创建中..." : "创建账号"}</AuthPrimaryButton><AuthSecondaryButton onClick={() => mode("login")}>返回登录</AuthSecondaryButton></>}</form>;
}

export function RegisterPage() { return <main className="grid min-h-screen place-items-center bg-neutral-100 p-5"><section className="w-full max-w-md rounded-xl bg-white p-7 shadow-xl"><h1 className="mb-6 text-2xl font-semibold text-neutral-950">创建账号</h1><RegisterPanel /></section></main>; }
