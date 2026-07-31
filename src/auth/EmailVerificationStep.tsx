import React, { useEffect, useRef, useState } from "react";

import type { VerificationRequired } from "../services/v2AuthClient";

export type EmailVerificationStepProps = {
  challenge: VerificationRequired;
  error: string | null;
  onBack: () => void;
  onResend: () => Promise<void>;
  onVerify: (code: string) => Promise<void>;
  submitting: boolean;
};

export function EmailVerificationStep({
  challenge,
  error,
  onBack,
  onResend,
  onVerify,
  submitting,
}: EmailVerificationStepProps) {
  const [code, setCode] = useState("");
  const [seconds, setSeconds] = useState(challenge.resendAvailableInSeconds);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSeconds(challenge.resendAvailableInSeconds);
  }, [challenge]);

  useEffect(() => {
    if (seconds <= 0) return undefined;
    const timer = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [seconds]);

  useEffect(() => {
    if (!error) return;
    setCode("");
    inputRef.current?.focus();
  }, [error]);

  return (
    <div>
      <p className="mb-4 text-sm text-slate-300">
        验证码已发送至 <strong className="text-white">{challenge.emailMasked}</strong>
      </p>
      <label className="mb-4 block text-sm">
        <span className="mb-2 block font-medium text-slate-200">6 位验证码</span>
        <input
          ref={inputRef}
          autoComplete="one-time-code"
          autoFocus
          className="h-12 w-full rounded-xl border border-white/10 bg-black/25 px-4 text-center text-xl tracking-[0.35em] text-white outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
          inputMode="numeric"
          maxLength={6}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          value={code}
        />
      </label>
      <button
        className="h-11 w-full rounded-xl bg-cyan-300 font-semibold text-slate-950 disabled:opacity-60"
        disabled={submitting || !/^\d{6}$/.test(code)}
        onClick={() => void onVerify(code)}
        type="button"
      >
        {submitting ? "正在验证..." : "确认验证码"}
      </button>
      <button
        className="mt-3 w-full px-3 py-2 text-sm font-medium text-cyan-100 disabled:text-slate-500"
        disabled={submitting || seconds > 0}
        onClick={() => void onResend()}
        type="button"
      >
        {seconds > 0 ? `重新发送（${seconds} 秒）` : "重新发送"}
      </button>
      <button className="mt-1 w-full px-3 py-2 text-sm text-slate-300" onClick={onBack} type="button">
        返回
      </button>
    </div>
  );
}
