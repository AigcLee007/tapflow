import React from "react";

export function LegalConsentControl({ checked, error, onChange }: {
  checked: boolean;
  error?: string | null;
  onChange: (checked: boolean) => void;
}) {
  return <div className="mb-4">
    <label className="flex cursor-pointer items-start gap-2 text-sm leading-5 text-neutral-700">
      <input aria-describedby={error ? "legal-consent-error" : undefined} checked={checked} className="mt-1 h-4 w-4 accent-neutral-950" onChange={(event) => onChange(event.target.checked)} type="checkbox" />
      <span>我已阅读并同意<a className="mx-1 font-semibold underline underline-offset-4" href="/legal/terms" rel="noopener noreferrer" target="_blank">《Aittco 用户协议》</a>和<a className="ml-1 font-semibold underline underline-offset-4" href="/legal/privacy" rel="noopener noreferrer" target="_blank">《Aittco 隐私政策》</a></span>
    </label>
    {error ? <p className="mt-2 text-sm text-red-700" id="legal-consent-error" role="alert">{error}</p> : null}
  </div>;
}
