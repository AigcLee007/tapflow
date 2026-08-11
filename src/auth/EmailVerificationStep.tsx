import React, { useEffect, useRef, useState } from "react";
import type { VerificationRequired } from "../services/v2AuthClient";
import { AuthPrimaryButton, AuthSecondaryButton } from "./AuthFormControls";

export type EmailVerificationStepProps = { challenge: VerificationRequired; error: string | null; onBack: () => void; onResend: () => Promise<void>; onVerify: (code: string) => Promise<void>; submitting: boolean };

export function EmailVerificationStep({ challenge, error, onBack, onResend, onVerify, submitting }: EmailVerificationStepProps) {
  const [code, setCode] = useState(""); const [seconds, setSeconds] = useState(challenge.resendAvailableInSeconds); const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => setSeconds(challenge.resendAvailableInSeconds), [challenge]);
  useEffect(() => { if (seconds <= 0) return; const timer = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000); return () => window.clearInterval(timer); }, [seconds]);
  useEffect(() => { if (error) { setCode(""); inputRef.current?.focus(); } }, [error]);
  return <div><p className="mb-4 text-sm text-neutral-600">请输入发送至 <strong className="text-neutral-950">{challenge.emailMasked}</strong> 的验证码。</p><label className="mb-4 block text-sm font-medium text-neutral-700" htmlFor="verification-code">6 位验证码</label><input autoComplete="one-time-code" autoFocus className="mb-4 h-12 w-full rounded-lg border border-neutral-300 bg-white px-3 text-center text-[16px] tracking-[0.25em] text-neutral-950 outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10" id="verification-code" inputMode="numeric" maxLength={6} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} ref={inputRef} value={code} /><AuthPrimaryButton disabled={submitting || !/^\d{6}$/.test(code)} onClick={() => void onVerify(code)} type="button">{submitting ? "验证中..." : "验证"}</AuthPrimaryButton><AuthSecondaryButton disabled={submitting || seconds > 0} onClick={() => void onResend()}>{seconds > 0 ? `${seconds} 秒后重新发送` : "重新发送验证码"}</AuthSecondaryButton><button className="mt-3 w-full text-sm font-semibold text-neutral-600 underline underline-offset-4 disabled:cursor-not-allowed disabled:opacity-55" disabled={submitting} onClick={onBack} type="button">返回</button></div>;
}
