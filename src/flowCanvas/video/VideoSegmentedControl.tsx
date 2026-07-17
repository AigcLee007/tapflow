import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check } from "lucide-react";

import { VIDEO_VISUAL_CONTROL_CLASS, VIDEO_VISUAL_TOKENS } from "./videoVisualTokens";

export type VideoSegmentedControlOption<T extends string | number> = {
  disabled?: boolean;
  disabledReason?: string;
  label: string;
  value: T;
};

export type VideoSegmentedControlProps<T extends string | number> = {
  ariaLabel: string;
  className?: string;
  disabledReason?: string;
  onChange: (value: T) => void;
  options: ReadonlyArray<VideoSegmentedControlOption<T>>;
  value: T;
};

function nextEnabledOption<T extends string | number>(
  current: T,
  key: string,
  enabledOptions: readonly VideoSegmentedControlOption<T>[],
): VideoSegmentedControlOption<T> | null {
  if (enabledOptions.length === 0) return null;
  if (key === "Home") return enabledOptions[0];
  if (key === "End") return enabledOptions[enabledOptions.length - 1];

  const direction = key === "ArrowRight" || key === "ArrowDown" ? 1
    : key === "ArrowLeft" || key === "ArrowUp" ? -1
      : 0;
  if (direction === 0) return null;

  const currentIndex = Math.max(enabledOptions.findIndex((option) => option.value === current), 0);
  return enabledOptions[(currentIndex + direction + enabledOptions.length) % enabledOptions.length];
}

export function VideoSegmentedControl<T extends string | number>({
  ariaLabel,
  className = "",
  disabledReason,
  onChange,
  options,
  value,
}: VideoSegmentedControlProps<T>) {
  const notePrefix = useId();
  const buttonRefs = useRef(new Map<T, HTMLButtonElement>());
  const [activeDisabledReason, setActiveDisabledReason] = useState<string | null>(null);
  const selectedOption = options.find((option) => option.value === value);
  const visibleReason = activeDisabledReason ?? (selectedOption?.disabled ? selectedOption.disabledReason ?? disabledReason : null);
  const enabledOptions = options.filter((option) => !option.disabled);
  const [rovingValue, setRovingValue] = useState<T | undefined>(() => enabledOptions.some((option) => option.value === value) ? value : enabledOptions[0]?.value);

  useEffect(() => {
    setRovingValue(enabledOptions.some((option) => option.value === value) ? value : enabledOptions[0]?.value);
  }, [options, value]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, current: T) => {
    const next = nextEnabledOption(current, event.key, enabledOptions);
    if (!next) return;

    event.preventDefault();
    setRovingValue(next.value);
    buttonRefs.current.get(next.value)?.focus();
    onChange(next.value);
  };

  return (
    <div className={className}>
      <div
        aria-label={ariaLabel}
        className="grid gap-2"
        role="radiogroup"
        style={{ gridTemplateColumns: `repeat(${Math.max(options.length, 1)}, minmax(0, 1fr))` }}
      >
        {options.map((option) => {
          const isSelected = option.value === value;
          const reason = option.disabledReason ?? disabledReason;
          const isDisabled = Boolean(option.disabled);
          const reasonId = `${notePrefix}-${String(option.value)}`;

          return (
            <button
              aria-checked={isSelected}
              aria-describedby={isDisabled && reason ? reasonId : undefined}
              aria-disabled={isDisabled}
              className={`${VIDEO_VISUAL_CONTROL_CLASS} min-w-0 px-2 ${isDisabled
                ? VIDEO_VISUAL_TOKENS.disabled
                : isSelected ? VIDEO_VISUAL_TOKENS.selected : VIDEO_VISUAL_TOKENS.unselected}`}
              key={String(option.value)}
              onBlur={() => setActiveDisabledReason(null)}
              onClick={() => {
                if (!isDisabled) {
                  setRovingValue(option.value);
                  onChange(option.value);
                }
              }}
              onFocus={() => setActiveDisabledReason(isDisabled ? reason ?? null : null)}
              onKeyDown={(event) => onKeyDown(event, option.value)}
              onMouseEnter={() => setActiveDisabledReason(isDisabled ? reason ?? null : null)}
              onMouseLeave={() => setActiveDisabledReason(null)}
              ref={(element) => {
                if (element) buttonRefs.current.set(option.value, element);
                else buttonRefs.current.delete(option.value);
              }}
              role="radio"
              tabIndex={!isDisabled && option.value === rovingValue ? 0 : -1}
              title={isDisabled ? reason : undefined}
              type="button"
            >
              <span className="truncate">{option.label}</span>
              {isDisabled && reason ? <span className="sr-only" id={reasonId}>{reason}</span> : null}
              {isSelected ? <Check aria-hidden="true" className="ml-1 shrink-0" size={14} strokeWidth={2.5} /> : null}
            </button>
          );
        })}
      </div>
      {visibleReason ? (
        <p className="mt-2 text-xs text-white/55" role="note">{visibleReason}</p>
      ) : null}
    </div>
  );
}
