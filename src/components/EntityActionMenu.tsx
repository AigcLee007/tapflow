import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { MenuSurface } from "./menu/MenuSurface";
import { MENU_DIVIDER_CLASS, MENU_ITEM_CLASS } from "./menu/menuStyles";

export type EntityActionMenuItem = {
  danger?: boolean;
  disabled?: boolean;
  key: string;
  label: string;
  onSelect: () => void;
  separatorBefore?: boolean;
};

export function EntityActionMenu({
  anchorRef,
  density = "default",
  items,
  onClose,
}: {
  anchorRef?: React.RefObject<HTMLElement | null>;
  density?: "default" | "compact";
  items: EntityActionMenuItem[];
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const menuWidth = density === "compact" ? 188 : 220;
  const rowHeight = density === "compact" ? "h-9" : "h-10";
  const textSize = density === "compact" ? "text-[13px]" : "text-sm";

  useLayoutEffect(() => {
    if (!anchorRef?.current) {
      setPosition(null);
      return;
    }
    const anchorRect = anchorRef.current.getBoundingClientRect();
    const estimatedHeight = items.length * (density === "compact" ? 36 : 40) + 16;
    const padding = 12;
    const left = Math.min(
      Math.max(padding, anchorRect.right - menuWidth),
      Math.max(padding, window.innerWidth - menuWidth - padding),
    );
    const preferredTop = anchorRect.bottom + 8;
    const top =
      preferredTop + estimatedHeight > window.innerHeight - padding
        ? Math.max(padding, anchorRect.top - estimatedHeight - 8)
        : preferredTop;
    setPosition({ left, top });
  }, [anchorRef, density, items.length, menuWidth]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current) return;
      if (menuRef.current.contains(event.target as Node)) return;
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const menu = (
    <MenuSurface
      ref={menuRef}
      className={`${position ? "fixed" : "absolute right-0 top-11"} z-[1800] w-[220px] overflow-hidden p-2 ${
        density === "compact" ? "w-[188px]" : "w-[220px]"
      }`}
      role="menu"
      style={position ? { left: position.left, top: position.top } : undefined}
    >
      {items.map((item) => (
        <React.Fragment key={item.key}>
          {item.separatorBefore ? <div className={MENU_DIVIDER_CLASS} /> : null}
          <button
            className={`${MENU_ITEM_CLASS} ${rowHeight} ${textSize} ${
              item.danger
                ? "text-red-300 hover:bg-red-500/10 hover:text-red-200"
                : "text-slate-100 hover:bg-white/[0.07]"
            } disabled:cursor-not-allowed disabled:opacity-45`}
            disabled={item.disabled}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              item.onSelect();
            }}
            role="menuitem"
            type="button"
          >
            {item.label}
          </button>
        </React.Fragment>
      ))}
    </MenuSurface>
  );

  if (position && typeof document !== "undefined") {
    return createPortal(menu, document.body);
  }

  return menu;
}

export function WorkspaceActionMenu(props: {
  anchorRef?: React.RefObject<HTMLElement | null>;
  density?: "default" | "compact";
  items: EntityActionMenuItem[];
  onClose: () => void;
}) {
  return <EntityActionMenu {...props} />;
}

export function EntityRenameDialog({
  defaultValue,
  label,
  onClose,
  onSubmit,
  title,
}: {
  defaultValue: string;
  label: string;
  onClose: () => void;
  onSubmit: (value: string) => Promise<void> | void;
  title: string;
}) {
  const [value, setValue] = React.useState(defaultValue);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextValue = value.trim();
    if (!nextValue) {
      setError("名称不能为空");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(nextValue);
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "保存失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  const dialog = (
    <div className="fixed inset-0 z-[1600] grid place-items-center bg-black/60 px-4 backdrop-blur-sm">
      <form className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#1f1f20] p-5 shadow-2xl" onSubmit={submit}>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <label className="mt-4 block text-sm font-medium text-slate-300">
          {label}
          <input
            autoFocus
            className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-cyan-300/60"
            onChange={(event) => setValue(event.target.value)}
            value={value}
          />
        </label>
        {error ? <div className="mt-3 text-sm text-red-300">{error}</div> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            className="h-10 rounded-xl border border-white/10 px-4 text-sm font-semibold text-slate-200 hover:bg-white/[0.06]"
            onClick={onClose}
            type="button"
          >
            取消
          </button>
          <button
            className="h-10 rounded-xl bg-white px-4 text-sm font-semibold text-slate-950 hover:bg-cyan-100 disabled:opacity-50"
            disabled={submitting}
            type="submit"
          >
            保存
          </button>
        </div>
      </form>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(dialog, document.body) : dialog;
}

export function EntityConfirmDialog({
  body,
  confirmLabel,
  onClose,
  onConfirm,
  title,
}: {
  body: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
}) {
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const confirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : "操作失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  const dialog = (
    <div className="fixed inset-0 z-[1600] grid place-items-center bg-black/60 px-4 backdrop-blur-sm">
      <section className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#1f1f20] p-5 shadow-2xl">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-slate-400">{body}</p>
        {error ? <div className="mt-3 text-sm text-red-300">{error}</div> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            className="h-10 rounded-xl border border-white/10 px-4 text-sm font-semibold text-slate-200 hover:bg-white/[0.06]"
            onClick={onClose}
            type="button"
          >
            取消
          </button>
          <button
            className="h-10 rounded-xl bg-red-400 px-4 text-sm font-semibold text-slate-950 hover:bg-red-300 disabled:opacity-50"
            disabled={submitting}
            onClick={() => void confirm()}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(dialog, document.body) : dialog;
}
