import { useId, useRef, useState } from "react";
import { AlertCircle, Check, Circle } from "lucide-react";

import { MenuSurface } from "../../components/menu/MenuSurface";
import {
  MENU_ITEM_CLASS,
  MENU_ITEM_PRIMARY_CLASS,
  MENU_ITEM_SECONDARY_CLASS,
} from "../../components/menu/menuStyles";
import type { VideoGenerationBlocker, VideoModelOption } from "./videoTypes";

type VideoModelMenuProps = {
  error: string | null;
  loading: boolean;
  onChange: (modelId: string) => void;
  onClose?: () => void;
  onRetry: () => void;
  options: VideoModelOption[];
  value: string | null;
};

const BLOCKER_MESSAGES: Record<Exclude<VideoGenerationBlocker, "CATALOG_LOADING">, string> = {
  HUMAN_REVIEW_REQUIRED: "Human verification is required",
  NO_VIDEO_GENERATION_ROUTE: "Video generation is not configured",
  PRICING_NOT_FOUND: "Pricing is not configured",
  UNSUPPORTED_ASPECT_RATIO: "The selected settings are not supported",
  UNSUPPORTED_AUDIO: "Audio generation is not supported",
  UNSUPPORTED_COUNT: "The selected settings are not supported",
  UNSUPPORTED_MODE: "The selected settings are not supported",
  UNSUPPORTED_RESOLUTION: "The selected settings are not supported",
};

export function VideoModelMenu({
  error,
  loading,
  onChange,
  onClose,
  onRetry,
  options,
  value,
}: VideoModelMenuProps) {
  const menuId = useId();
  const listboxRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = options.findIndex((option) => option.id === value);
  const [activeIndex, setActiveIndex] = useState(() => selectedIndex >= 0 ? selectedIndex : 0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  const focusOption = (index: number) => {
    if (options.length === 0) return;
    const nextIndex = Math.max(0, Math.min(index, options.length - 1));
    setActiveIndex(nextIndex);
    optionRefs.current[nextIndex]?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement | HTMLButtonElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusOption(activeIndex + 1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusOption(activeIndex - 1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      focusOption(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      focusOption(options.length - 1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const option = options[activeIndex];
      if (option && !option.blocker) {
        onChange(option.id);
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onClose?.();
      listboxRef.current?.blur();
    }
  };

  if (loading) {
    return (
      <MenuSurface aria-label="Loading video models" className="w-[288px] p-2" role="status">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="flex h-[38px] items-center gap-[7px] rounded-[10px] px-1.5"
            data-testid="video-model-skeleton"
          >
            <span className="h-[30px] w-[30px] shrink-0 animate-pulse rounded-[9px] bg-white/10" />
            <span className="grid min-w-0 flex-1 gap-1">
              <span className="h-2.5 w-2/3 animate-pulse rounded bg-white/10" />
              <span className="h-2 w-1/3 animate-pulse rounded bg-white/[0.07]" />
            </span>
          </div>
        ))}
      </MenuSurface>
    );
  }

  if (error) {
    return (
      <MenuSurface aria-label="Video model catalog error" className="w-[288px] p-2" role="alert">
        <div className="grid gap-2 px-1.5 py-1">
          <span className="text-xs font-bold leading-[1.1] text-white">{error}</span>
          <button
            className="h-[38px] rounded-[10px] border border-white/10 bg-white/[0.08] px-2 text-xs font-bold text-white outline-none transition hover:bg-white/[0.13] focus:border-sky-300/60"
            onClick={onRetry}
            type="button"
          >
            Retry
          </button>
        </div>
      </MenuSurface>
    );
  }

  return (
    <MenuSurface
      ref={listboxRef}
      aria-activedescendant={options[activeIndex] ? `${menuId}-${activeIndex}` : undefined}
      aria-label="Video models"
      className="w-[288px] p-2"
      onKeyDown={handleKeyDown}
      role="listbox"
      tabIndex={0}
    >
      {options.map((option, index) => {
        const selected = option.id === value;
        const active = selected || hoveredIndex === index || focusedIndex === index;
        const disabled = option.blocker !== null;
        const descriptionId = `${menuId}-${index}-description`;
        const blockerId = `${menuId}-${index}-blocker`;
        const blockerMessage = option.blocker ? BLOCKER_MESSAGES[option.blocker] : null;
        const description = option.description ?? "";

        return (
          <button
            key={option.id}
            ref={(element) => { optionRefs.current[index] = element; }}
            aria-describedby={[description && descriptionId, blockerMessage && blockerId].filter(Boolean).join(" ") || undefined}
            aria-disabled={disabled || undefined}
            aria-label={`${option.label}${option.estimatedDurationLabel ? `, ${option.estimatedDurationLabel}` : ""}${blockerMessage ? `, ${blockerMessage}` : ""}`}
            aria-selected={selected}
            className={`${MENU_ITEM_CLASS} relative h-[38px] ${active ? "bg-white/[0.088]" : ""} ${disabled ? "cursor-not-allowed text-white/45" : "focus:bg-white/[0.088] focus:outline-none"}`.trim()}
            id={`${menuId}-${index}`}
            onBlur={() => setFocusedIndex((current) => current === index ? null : current)}
            onClick={() => {
              if (!disabled) onChange(option.id);
            }}
            onFocus={() => {
              setActiveIndex(index);
              setFocusedIndex(index);
            }}
            onKeyDown={handleKeyDown}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex((current) => current === index ? null : current)}
            role="option"
            tabIndex={-1}
            type="button"
          >
            <span className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] ${selected ? "bg-sky-300/20 text-sky-100" : disabled ? "bg-white/[0.06] text-white/45" : "bg-white/8 text-white/70"}`}>
              {selected ? <Check aria-hidden="true" size={15} /> : disabled ? <AlertCircle aria-hidden="true" size={15} /> : <Circle aria-hidden="true" size={13} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`${MENU_ITEM_PRIMARY_CLASS} block truncate`}>{option.label}</span>
              {option.estimatedDurationLabel ? (
                <span className={`${MENU_ITEM_SECONDARY_CLASS} block truncate`}>{option.estimatedDurationLabel}</span>
              ) : null}
              {description ? (
                <span
                  className={active
                    ? `${MENU_ITEM_SECONDARY_CLASS} absolute left-[calc(100%+8px)] top-0 z-10 w-[220px] rounded-[10px] border border-white/10 bg-[#1c1c20] px-2 py-1.5 shadow-[0_8px_20px_rgba(0,0,0,0.35)] line-clamp-2`
                    : "sr-only"}
                  id={descriptionId}
                >
                  {description}
                </span>
              ) : null}
              {blockerMessage ? (
                <span className={`${MENU_ITEM_SECONDARY_CLASS} block truncate`} id={blockerId}>{blockerMessage}</span>
              ) : null}
            </span>
          </button>
        );
      })}
    </MenuSurface>
  );
}
