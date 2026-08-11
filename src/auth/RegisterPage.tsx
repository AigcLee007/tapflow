import React, { FormEvent, useEffect, useState } from "react";

import type { VerificationRequired } from "../services/v2AuthClient";
import { AuthErrorMessage, AuthField, AuthPrimaryButton, AuthSecondaryButton } from "./AuthFormControls";
import { getSafeReturnTo, navigate, navigateAuthMode } from "./authNavigation";
import { EmailVerificationStep } from "./EmailVerificationStep";
import { type AuthPanelProps } from "./LoginPage";
import { useAuth } from "./useAuth";

export function RegisterPanel({ onModeChange, onPendingChange }: AuthPanelProps) {
  const { authenticated, register, resendEmailVerification, verifyEmail } = useAuth();
  const [displayName, setDisplayName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false); const [error, setError] = useState<string | null>(null); const [challenge, setChallenge] = useState<VerificationRequired | null>(null);
  useEffect(() => { onPendingChange?.(pending); }, [onPendingChange, pending]);
  useEffect(() => { if (authenticated) navigate(getSafeReturnTo()); }, [authenticated]);
  const mode = (next: "login" | "forgot-password" | "register") => onModeChange ? onModeChange(next) : navigateAuthMode(next);
  const submit = async (event: FormEvent) => { event.preventDefault(); setPending(true); setError(null); try { const result = await register({ displayName: displayName.trim() || undefined, email, password }); if (result.status === "verification_required") { setChallenge(result); return; } navigate(getSafeReturnTo()); } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to create your account."); } finally { setPending(false); } };
  const verify = async (code: string) => { if (!challenge) return; setPending(true); setError(null); try { await verifyEmail({ challengeToken: challenge.challengeToken, code }); navigate(getSafeReturnTo()); } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to verify the code."); } finally { setPending(false); } };
  const resend = async () => { if (!challenge) return; setPending(true); setError(null); try { setChallenge(await resendEmailVerification({ challengeToken: challenge.challengeToken })); } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to resend the code."); } finally { setPending(false); } };
  return <form onSubmit={submit}>{challenge ? <><AuthErrorMessage message={error} /><EmailVerificationStep challenge={challenge} error={error} onBack={() => { setChallenge(null); setError(null); }} onResend={resend} onVerify={verify} submitting={pending} /></> : <><AuthErrorMessage message={error} /><AuthField autoComplete="name" label="Display name" onChange={setDisplayName} value={displayName} /><AuthField autoComplete="email" label="Email" onChange={setEmail} required type="email" value={email} /><AuthField autoComplete="new-password" label="Password" minLength={8} onChange={setPassword} required type="password" value={password} /><AuthPrimaryButton disabled={pending}>{pending ? "Creating account..." : "Create account"}</AuthPrimaryButton><AuthSecondaryButton onClick={() => mode("login")}>Back to sign in</AuthSecondaryButton></>}</form>;
}

export function RegisterPage() { return <main className="grid min-h-screen place-items-center bg-neutral-100 p-5"><section className="w-full max-w-md rounded-xl bg-white p-7 shadow-xl"><h1 className="mb-6 text-2xl font-semibold text-neutral-950">Create account</h1><RegisterPanel /></section></main>; }
