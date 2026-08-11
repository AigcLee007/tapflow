import React, { ReactNode, useId, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const FOCUSABLE = "button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
let scrollLockCount = 0;
let previousBodyOverflow = "";

export function AuthDialog({ children, onClose, open, pending, title }: { children: ReactNode; onClose: () => void; open: boolean; pending: boolean; title: string }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const invokerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useLayoutEffect(() => {
    if (!open) return;
    invokerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (scrollLockCount === 0) previousBodyOverflow = document.body.style.overflow;
    scrollLockCount += 1;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => {
      scrollLockCount = Math.max(0, scrollLockCount - 1);
      if (scrollLockCount === 0) document.body.style.overflow = previousBodyOverflow;
      invokerRef.current?.focus();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;
  const dismiss = () => { if (!pending) onClose(); };
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") { event.preventDefault(); dismiss(); return; }
    if (event.key !== "Tab") return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (!focusable.length) return;
    const first = focusable[0]; const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  return createPortal(<div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6" data-testid="auth-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) dismiss(); }}><div aria-labelledby={titleId} aria-modal="true" className="grid w-full max-w-[960px] overflow-hidden rounded-t-xl bg-neutral-100 shadow-2xl sm:grid-cols-[38fr_62fr] sm:rounded-xl" onKeyDown={onKeyDown} ref={dialogRef} role="dialog"><aside className="hidden bg-neutral-950 p-9 text-white sm:block"><p className="text-xs font-bold uppercase tracking-[0.12em] text-neutral-400">TapFlow</p><h2 className="mt-4 text-3xl font-semibold">Make the next frame matter.</h2></aside><section className="relative min-h-[420px] bg-neutral-100 p-6 sm:p-9"><button aria-label="Close dialog" className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-md text-neutral-600 hover:bg-neutral-200 disabled:opacity-45" disabled={pending} onClick={dismiss} title="Close dialog" type="button"><X aria-hidden="true" size={18} /></button><h1 className="mb-6 pr-10 text-2xl font-semibold text-neutral-950" id={titleId}>{title}</h1>{children}</section></div></div>, document.body);
}
