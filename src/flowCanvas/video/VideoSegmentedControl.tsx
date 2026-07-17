import { useId, useState } from "react";
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

export function VideoSegmentedControl<T extends string | number>({
  ariaLabel,
  className = "",
  disabledReason,
  onChange,
  options,
  value,
}: VideoSegmentedControlProps<T>) {
  const noteId = useId();
  const [activeDisabledReason, setActiveDisabledReason] = useState<string | null>(null);
  const selectedOption = options.find((option) => option.value === value);
  const visibleReason = activeDisabledReason ?? (selectedOption?.disabled ? selectedOption.disabledReason ?? disabledReason : null);

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

          return (
            <button
              aria-checked={isSelected}
              aria-describedby={isDisabled && visibleReason === reason ? noteId : undefined}
              aria-disabled={isDisabled}
              className={`${VIDEO_VISUAL_CONTROL_CLASS} min-w-0 px-2 ${isDisabled
                ? VIDEO_VISUAL_TOKENS.disabled
                : isSelected ? VIDEO_VISUAL_TOKENS.selected : VIDEO_VISUAL_TOKENS.unselected}`}
              key={String(option.value)}
              onBlur={() => setActiveDisabledReason(null)}
              onClick={() => {
                if (!isDisabled) onChange(option.value);
              }}
              onFocus={() => setActiveDisabledReason(isDisabled ? reason ?? null : null)}
              onMouseEnter={() => setActiveDisabledReason(isDisabled ? reason ?? null : null)}
              onMouseLeave={() => setActiveDisabledReason(null)}
              role="radio"
              title={isDisabled ? reason : undefined}
              type="button"
            >
              <span className="truncate">{option.label}</span>
              {isSelected ? <Check aria-hidden="true" className="ml-1 shrink-0" size={14} strokeWidth={2.5} /> : null}
            </button>
          );
        })}
      </div>
      {visibleReason ? (
        <p className="mt-2 text-xs text-white/55" id={noteId} role="note">{visibleReason}</p>
      ) : null}
    </div>
  );
}
