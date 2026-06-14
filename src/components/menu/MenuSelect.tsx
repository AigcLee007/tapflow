import React from "react";
import { ChevronDown } from "lucide-react";

import { MenuSurface } from "./MenuSurface";
import { MENU_ITEM_CLASS, MENU_ITEM_PRIMARY_CLASS } from "./menuStyles";
import { useDismissibleLayer } from "./useDismissibleLayer";

type MenuSelectOption = {
  label: string;
  value: string;
};

type MenuSelectProps = {
  disabled?: boolean;
  fullWidth?: boolean;
  label: string;
  onChange: (value: string) => void;
  options: MenuSelectOption[];
  size?: "default" | "compact";
  value: string;
};

export function MenuSelect({
  disabled = false,
  fullWidth = false,
  label,
  onChange,
  options,
  size = "default",
  value,
}: MenuSelectProps) {
  const layer = useDismissibleLayer(`select-${label}`);
  const current = options.find((option) => option.value === value) ?? options[0];
  const triggerClassName =
    size === "compact"
      ? "inline-flex h-[38px] items-center justify-between gap-[7px] rounded-[10px] border border-white/10 bg-black/25 px-2 text-xs font-bold text-white outline-none transition focus:border-sky-300/50 disabled:cursor-not-allowed disabled:opacity-50"
      : "inline-flex h-[38px] items-center justify-between gap-[7px] rounded-[10px] border border-white/10 bg-[#17171b] px-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className={fullWidth ? "relative w-full" : "relative"}>
      <button
        ref={layer.triggerRef as React.RefObject<HTMLButtonElement>}
        aria-expanded={layer.open}
        aria-haspopup="menu"
        aria-label={`${label} ${current?.label ?? ""}`.trim()}
        className={`${triggerClassName} ${fullWidth ? "w-full" : ""}`.trim()}
        disabled={disabled}
        onClick={layer.toggle}
        type="button"
      >
        <span className={size === "compact" ? "truncate" : undefined}>{current?.label}</span>
        <ChevronDown
          size={size === "compact" ? 16 : 18}
          className={`shrink-0 transition ${layer.open ? "rotate-180" : ""}`.trim()}
        />
      </button>
      {layer.open ? (
        <MenuSurface
          ref={layer.ref as React.RefObject<HTMLDivElement>}
          className={`${fullWidth ? "w-full" : "min-w-[180px]"} absolute left-0 top-[calc(100%+12px)] z-[1200] p-2`.trim()}
          role="menu"
        >
          {options.map((option) => (
            <button
              key={option.value}
              className={`${MENU_ITEM_CLASS} h-[38px]`.trim()}
              onClick={() => {
                onChange(option.value);
                layer.closeLayer();
              }}
              role="menuitem"
              type="button"
            >
              <span className={MENU_ITEM_PRIMARY_CLASS}>{option.label}</span>
            </button>
          ))}
        </MenuSurface>
      ) : null}
    </div>
  );
}
