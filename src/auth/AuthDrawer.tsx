import React, { ReactNode, useId, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const FOCUSABLE = "button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
let scrollLockCount = 0;
let previousBodyOverflow = "";

type AuthDrawerProps = {
  children: ReactNode;
  focusKey?: string;
  onClose: () => void;
  open: boolean;
  pending: boolean;
  title: string;
};

export function AuthDrawer({ children, focusKey, onClose, open, pending, title }: AuthDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const invokerRef = useRef<HTMLElement | null>(null);
  const previousFocusKeyRef = useRef(focusKey);
  const titleId = useId();

  useLayoutEffect(() => {
    if (!open) return;
    invokerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (scrollLockCount === 0) previousBodyOverflow = document.body.style.overflow;
    scrollLockCount += 1;
    document.body.style.overflow = "hidden";
    drawerRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => {
      scrollLockCount = Math.max(0, scrollLockCount - 1);
      if (scrollLockCount === 0) document.body.style.overflow = previousBodyOverflow;
      invokerRef.current?.focus();
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      previousFocusKeyRef.current = focusKey;
      return;
    }
    if (previousFocusKeyRef.current !== focusKey) contentRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    previousFocusKeyRef.current = focusKey;
  }, [focusKey, open]);

  if (!open || typeof document === "undefined") return null;
  const dismiss = () => { if (!pending) onClose(); };
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      dismiss();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div className="auth-drawer-backdrop" data-testid="auth-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) dismiss(); }}>
      <div aria-labelledby={titleId} aria-modal="true" className="auth-drawer" data-placement="right" onKeyDown={onKeyDown} ref={drawerRef} role="dialog">
        <header className="auth-drawer__header">
          <div>
            <p className="auth-drawer__product">TapFlow</p>
            <h1 id={titleId}>{title}</h1>
            <p className="auth-drawer__support">在 Aittco 安全地继续你的创作工作流。</p>
          </div>
          <button aria-label="关闭登录面板" className="auth-drawer__close" disabled={pending} onClick={dismiss} title="关闭登录面板" type="button"><X aria-hidden="true" size={18} /></button>
        </header>
        <div className="auth-drawer__body" ref={contentRef}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
