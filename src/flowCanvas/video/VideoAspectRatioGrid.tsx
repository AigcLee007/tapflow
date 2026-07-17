import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { VideoAspectRatio } from "./videoTypes";
import { Check } from "lucide-react";
import { VIDEO_UI_COPY } from "./videoUiCopy";
import { VIDEO_VISUAL_CONTROL_CLASS, VIDEO_VISUAL_TOKENS } from "./videoVisualTokens";

export type VideoAspectRatioGridProps = {
  allowedRatios?: readonly VideoAspectRatio[];
  onChange: (value: VideoAspectRatio) => void;
  value: VideoAspectRatio;
};

const RATIO_OPTIONS: ReadonlyArray<{ aspectRatio: string; value: VideoAspectRatio }> = [
  { aspectRatio: "4 / 3", value: "auto" },
  { aspectRatio: "16 / 9", value: "16:9" },
  { aspectRatio: "4 / 3", value: "4:3" },
  { aspectRatio: "1 / 1", value: "1:1" },
  { aspectRatio: "3 / 4", value: "3:4" },
  { aspectRatio: "9 / 16", value: "9:16" },
  { aspectRatio: "21 / 9", value: "21:9" },
];

function ratioLabel(value: VideoAspectRatio) {
  return value === "auto" ? VIDEO_UI_COPY.auto : value;
}

function nextEnabledRatio(
  current: VideoAspectRatio,
  key: string,
  enabledOptions: readonly VideoAspectRatio[],
): VideoAspectRatio | null {
  if (enabledOptions.length === 0) return null;
  if (key === "Home") return enabledOptions[0];
  if (key === "End") return enabledOptions[enabledOptions.length - 1];

  const direction = key === "ArrowRight" || key === "ArrowDown" ? 1
    : key === "ArrowLeft" || key === "ArrowUp" ? -1
      : 0;
  if (direction === 0) return null;

  const currentIndex = Math.max(enabledOptions.indexOf(current), 0);
  return enabledOptions[(currentIndex + direction + enabledOptions.length) % enabledOptions.length];
}

export function VideoAspectRatioGrid({ allowedRatios, onChange, value }: VideoAspectRatioGridProps) {
  const notePrefix = useId();
  const buttonRefs = useRef<Partial<Record<VideoAspectRatio, HTMLButtonElement>>>({});
  const [activeDisabledReason, setActiveDisabledReason] = useState<string | null>(null);
  const enabledOptions = RATIO_OPTIONS
    .filter((option) => !allowedRatios || allowedRatios.includes(option.value))
    .map((option) => option.value);
  const [rovingValue, setRovingValue] = useState<VideoAspectRatio>(() => enabledOptions.includes(value) ? value : enabledOptions[0]);

  useEffect(() => {
    setRovingValue(enabledOptions.includes(value) ? value : enabledOptions[0]);
  }, [value, allowedRatios]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, current: VideoAspectRatio) => {
    const next = nextEnabledRatio(current, event.key, enabledOptions);
    if (!next) return;

    event.preventDefault();
    setRovingValue(next);
    buttonRefs.current[next]?.focus();
    onChange(next);
  };

  return (
    <div>
      <div aria-label={VIDEO_UI_COPY.aspectRatio} className="grid grid-cols-5 gap-2" role="radiogroup">
        {RATIO_OPTIONS.map((option) => {
          const disabled = Boolean(allowedRatios && !allowedRatios.includes(option.value));
          const selected = option.value === value;
          const label = ratioLabel(option.value);
          const reason = `${VIDEO_UI_COPY.unsupportedByCurrentModel} ${label}`;
          const reasonId = `${notePrefix}-${option.value.replace(":", "-")}`;

          return (
            <button
              aria-checked={selected}
              aria-describedby={disabled ? reasonId : undefined}
              aria-disabled={disabled}
              className={`${VIDEO_VISUAL_CONTROL_CLASS} ${VIDEO_VISUAL_TOKENS.panelSurface} relative flex h-[94px] min-w-0 flex-col items-center justify-center gap-2 px-2 ${disabled
                ? VIDEO_VISUAL_TOKENS.disabled
                : selected ? VIDEO_VISUAL_TOKENS.selected : VIDEO_VISUAL_TOKENS.unselected}`}
              data-ratio={option.value}
              key={option.value}
              onBlur={() => setActiveDisabledReason(null)}
              onClick={() => {
                if (!disabled) {
                  setRovingValue(option.value);
                  onChange(option.value);
                }
              }}
              onFocus={() => setActiveDisabledReason(disabled ? reason : null)}
              onKeyDown={(event) => onKeyDown(event, option.value)}
              onMouseEnter={() => setActiveDisabledReason(disabled ? reason : null)}
              onMouseLeave={() => setActiveDisabledReason(null)}
              ref={(element) => {
                buttonRefs.current[option.value] = element ?? undefined;
              }}
              role="radio"
              tabIndex={!disabled && option.value === rovingValue ? 0 : -1}
              title={disabled ? reason : undefined}
              type="button"
            >
              <span
                aria-hidden="true"
                className="h-7 max-w-full rounded-sm border border-current"
                data-ratio-marker
                style={{ aspectRatio: option.aspectRatio }}
              />
              <span>{label}</span>
              {disabled ? <span className="sr-only" id={reasonId}>{reason}</span> : null}
              {selected ? <Check aria-hidden="true" className="absolute right-2 top-2" size={14} strokeWidth={2.5} /> : null}
            </button>
          );
        })}
      </div>
      {activeDisabledReason ? (
        <p className="mt-2 text-xs text-white/55" role="note">{activeDisabledReason}</p>
      ) : null}
    </div>
  );
}
