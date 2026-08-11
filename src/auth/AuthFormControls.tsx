import React, { ReactNode, useId } from "react";

export function AuthField({
  autoComplete,
  inputMode,
  label,
  maxLength,
  minLength,
  onChange,
  placeholder,
  required,
  type = "text",
  value,
}: {
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  label: string;
  maxLength?: number;
  minLength?: number;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
  value: string;
}) {
  const id = useId();
  return <div className="mb-4"><label className="mb-1.5 block text-sm font-medium text-neutral-700" htmlFor={id}>{label}</label><input autoComplete={autoComplete} className="h-12 w-full rounded-lg border border-neutral-300 bg-white px-3 text-[16px] text-neutral-950 outline-none transition focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10" id={id} inputMode={inputMode} maxLength={maxLength} minLength={minLength} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} type={type} value={value} /></div>;
}

export function AuthErrorMessage({ message }: { message: string | null }) {
  return message ? <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{message}</p> : null;
}

export function AuthPrimaryButton({ children, disabled, onClick, type = "submit" }: { children: ReactNode; disabled: boolean; onClick?: () => void; type?: "button" | "submit" }) {
  return <button className="h-12 w-full rounded-lg bg-white px-4 text-sm font-bold text-neutral-950 shadow-sm ring-1 ring-neutral-300 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-55" disabled={disabled} onClick={onClick} type={type}>{children}</button>;
}

export function AuthSecondaryButton({ children, disabled = false, onClick }: { children: ReactNode; disabled?: boolean; onClick: () => void }) {
  return <button className="mt-3 w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-55" disabled={disabled} onClick={onClick} type="button">{children}</button>;
}
