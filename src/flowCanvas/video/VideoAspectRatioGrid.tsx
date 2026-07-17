import type { VideoAspectRatio } from "./videoTypes";
import { Check } from "lucide-react";
import { VIDEO_UI_COPY } from "./videoUiCopy";
import { VIDEO_VISUAL_CONTROL_CLASS, VIDEO_VISUAL_TOKENS } from "./videoVisualTokens";

export type VideoAspectRatioGridProps = {
  allowedRatios?: readonly VideoAspectRatio[];
  onChange: (value: VideoAspectRatio) => void;
  value: VideoAspectRatio;
};

const RATIO_OPTIONS: ReadonlyArray<{ shape: "auto" | "landscape" | "portrait" | "square"; value: VideoAspectRatio }> = [
  { shape: "auto", value: "auto" },
  { shape: "landscape", value: "16:9" },
  { shape: "landscape", value: "4:3" },
  { shape: "square", value: "1:1" },
  { shape: "portrait", value: "3:4" },
  { shape: "portrait", value: "9:16" },
  { shape: "landscape", value: "21:9" },
];

function ratioLabel(value: VideoAspectRatio) {
  return value === "auto" ? VIDEO_UI_COPY.auto : value;
}

function shapeClass(shape: "auto" | "landscape" | "portrait" | "square") {
  if (shape === "portrait") return "h-8 w-[18px]";
  if (shape === "square") return "h-6 w-6";
  if (shape === "auto") return "h-4 w-6";
  return "h-[14px] w-8";
}

export function VideoAspectRatioGrid({ allowedRatios, onChange, value }: VideoAspectRatioGridProps) {
  return (
    <div aria-label={VIDEO_UI_COPY.aspectRatio} className="grid grid-cols-5 gap-2" role="radiogroup">
      {RATIO_OPTIONS.map((option) => {
        const disabled = Boolean(allowedRatios && !allowedRatios.includes(option.value));
        const selected = option.value === value;
        const label = ratioLabel(option.value);
        const reason = `${VIDEO_UI_COPY.unsupportedByCurrentModel} ${label}`;

        return (
          <button
            aria-checked={selected}
            aria-disabled={disabled}
            className={`${VIDEO_VISUAL_CONTROL_CLASS} ${VIDEO_VISUAL_TOKENS.panelSurface} relative flex h-[94px] min-w-0 flex-col items-center justify-center gap-2 px-2 ${disabled
              ? VIDEO_VISUAL_TOKENS.disabled
              : selected ? VIDEO_VISUAL_TOKENS.selected : VIDEO_VISUAL_TOKENS.unselected}`}
            data-ratio-shape={option.shape}
            key={option.value}
            onClick={() => {
              if (!disabled) onChange(option.value);
            }}
            role="radio"
            title={disabled ? reason : undefined}
            type="button"
          >
            <span aria-hidden="true" className={`${shapeClass(option.shape)} rounded-sm border border-current`} />
            <span>{label}</span>
            {selected ? <Check aria-hidden="true" className="absolute right-2 top-2" size={14} strokeWidth={2.5} /> : null}
          </button>
        );
      })}
    </div>
  );
}
