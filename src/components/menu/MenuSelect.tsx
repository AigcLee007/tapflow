import React from "react";
import { ChevronDown } from "lucide-react";

import { MenuSurface } from "./MenuSurface";
import {
  MENU_ITEM_CLASS,
  MENU_ITEM_PRIMARY_CLASS,
} from "./menuStyles";
import { useDismissibleLayer } from "./useDismissibleLayer";

export function MenuSelect({
  label,
  options,
  onChange,
  value,
}: {
  label: string;
  options: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
  value: string;
}) {
  const layer = useDismissibleLayer(`select-${label}`);
  const current = options.find((option) => option.value === value) ?? options[0];

  return (
    <div className="relative">
      <button
        ref={layer.triggerRef as React.RefObject<HTMLButtonElement>}
        aria-expanded={layer.open}
        aria-haspopup="menu"
        aria-label={`${label} ${current?.label ?? ""}`.trim()}
        className="inline-flex h-16 items-center gap-3 rounded-[26px] border border-white/10 bg-[#17171b] px-7 text-[15px] font-semibold text-white"
        onClick={layer.toggle}
        type="button"
      >
        <span>{current?.label}</span>
        <ChevronDown
          size={18}
          className={layer.open ? "rotate-180 transition" : "transition"}
        />
      </button>
      {layer.open ? (
        <MenuSurface
          ref={layer.ref as React.RefObject<HTMLDivElement>}
          className="absolute left-0 top-[calc(100%+12px)] min-w-[180px] p-2"
          role="menu"
        >
          {options.map((option) => (
            <button
              key={option.value}
              className={`${MENU_ITEM_CLASS} h-12`}
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
