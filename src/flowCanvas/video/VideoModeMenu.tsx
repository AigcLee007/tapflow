import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Film, Image, Images, Type, Video, type LucideIcon } from "lucide-react";

import { MenuSurface } from "../../components/menu/MenuSurface";
import { MENU_ITEM_CLASS, MENU_ITEM_PRIMARY_CLASS } from "../../components/menu/menuStyles";
import { useDismissibleLayer } from "../../components/menu/useDismissibleLayer";
import type { VideoGenerationCapabilities, VideoGenerationMode, VideoModeAvailabilityResult } from "./videoTypes";
import { getVideoModeUnavailableReason, VIDEO_UI_COPY, VIDEO_UI_MODE_COPY } from "./videoUiCopy";
import { VIDEO_COMPOSER_CAPSULE_CLASS, videoComposerDensity } from "../utils/promptBarDensity";

type VideoModeMenuProps = {
  availability?: VideoModeAvailabilityResult;
  /** @deprecated Pass availability; retained while callers migrate. */
  capabilities?: VideoGenerationCapabilities | null;
  disabled?: boolean;
  onChange: (mode: VideoGenerationMode) => void;
  value: VideoGenerationMode;
};

const MODE_OPTIONS = (Object.entries(VIDEO_UI_MODE_COPY) as Array<[VideoGenerationMode, typeof VIDEO_UI_MODE_COPY[VideoGenerationMode]]>)
  .map(([value, copy]) => ({ value, ...copy }));

const MODE_ICONS: Record<VideoGenerationMode, LucideIcon> = {
  all_reference: Images,
  first_last_frame: Film,
  image_reference: Images,
  image_to_video: Image,
  text_to_video: Type,
};

const DEFAULT_AVAILABILITY: VideoModeAvailabilityResult = {
  counts: { audio: 0, image: 0, text: 0, total: 0, video: 0 },
  items: MODE_OPTIONS.map(({ value }) => ({ enabled: true, inputAllowed: true, mode: value, modelSupported: true, reason: null })),
  recommendedMode: "text_to_video",
};

export function VideoModeMenu({ availability = DEFAULT_AVAILABILITY, disabled = false, onChange, value }: VideoModeMenuProps) {
  const layer = useDismissibleLayer("video-mode-menu");
  const [tooltipMode, setTooltipMode] = useState<VideoGenerationMode | null>(null);
  const selected = MODE_OPTIONS.find((option) => option.value === value) ?? MODE_OPTIONS[0];

  useEffect(() => {
    if (disabled) {
      setTooltipMode(null);
      layer.closeLayer();
    }
  }, [disabled, layer.closeLayer]);

  useEffect(() => {
    if (!layer.open) setTooltipMode(null);
  }, [layer.open]);

  return (
    <div className="relative min-w-0">
      <button
        ref={layer.triggerRef as React.RefObject<HTMLButtonElement>}
        aria-expanded={layer.open}
        aria-haspopup="menu"
        aria-label={VIDEO_UI_COPY.mode}
        className={`inline-flex max-w-full items-center gap-1.5 px-[9px] ${VIDEO_COMPOSER_CAPSULE_CLASS}`}
        disabled={disabled}
        onClick={layer.toggle}
        style={{ height: videoComposerDensity.capsuleHeight, borderRadius: videoComposerDensity.capsuleRadius }}
        type="button"
      >
        <Video aria-hidden="true" className="shrink-0" size={14} />
        <span className="truncate">{selected.label}</span>
        {layer.open ? <ChevronUp aria-hidden="true" className="shrink-0 text-white/55" size={14} /> : <ChevronDown aria-hidden="true" className="shrink-0 text-white/55" size={14} />}
      </button>
      {layer.open ? (
        <MenuSurface
          ref={layer.ref as React.RefObject<HTMLDivElement>}
          aria-label={VIDEO_UI_COPY.modeOptions}
          className="absolute bottom-[calc(100%+8px)] left-0 z-[1200] w-[250px] rounded-[18px] bg-[#272729] p-2"
          role="menu"
        >
          <h3 className="flex h-[38px] items-center px-1.5 text-xs font-bold leading-[1.1] text-white/70">视频生成模式</h3>
          {MODE_OPTIONS.map((option) => {
            const item = availability.items.find((candidate) => candidate.mode === option.value);
            const optionEnabled = item?.enabled ?? false;
            const selectedOption = option.value === value;
            const ModeIcon = MODE_ICONS[option.value];
            const tooltip = !optionEnabled && item?.reason
              ? getVideoModeUnavailableReason(item.reason, availability.counts)
              : null;
            const tooltipId = tooltip ? `video-mode-${option.value}-tooltip` : undefined;

            return (
              <button
                key={option.value}
                aria-checked={selectedOption}
                aria-describedby={tooltipMode === option.value ? tooltipId : undefined}
                aria-disabled={disabled || !optionEnabled || undefined}
                className={`${MENU_ITEM_CLASS} relative h-[38px] ${selectedOption ? "bg-white/[0.088]" : ""} ${disabled || !optionEnabled ? "cursor-not-allowed text-white/45" : "focus:bg-white/[0.088] focus:outline-none"}`.trim()}
                onBlur={() => setTooltipMode((current) => current === option.value ? null : current)}
                onClick={() => {
                  if (disabled || !optionEnabled) return;
                  onChange(option.value);
                  layer.closeLayer();
                }}
                onFocus={() => {
                  if (tooltip) setTooltipMode(option.value);
                }}
                onMouseEnter={() => {
                  if (tooltip) setTooltipMode(option.value);
                }}
                onMouseLeave={() => setTooltipMode((current) => current === option.value ? null : current)}
                role="menuitemradio"
                type="button"
              >
                <span className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] ${selectedOption ? "bg-white/[0.08] text-white" : "bg-white/[0.055] text-white/70"}`}>
                  <ModeIcon aria-hidden="true" size={15} />
                </span>
                <span className={`${MENU_ITEM_PRIMARY_CLASS} min-w-0 truncate`}>{option.label}</span>
                {tooltipMode === option.value && tooltip ? (
                  <span className="absolute left-[calc(100%+8px)] top-0 z-[1201] w-[220px] rounded-[10px] border border-white/10 bg-[#1c1c20] px-2 py-1.5 text-[9px] font-medium leading-[1.25] text-white/75 shadow-[0_8px_20px_rgba(0,0,0,0.35)]" id={tooltipId} role="tooltip">
                    {tooltip}
                  </span>
                ) : null}
              </button>
            );
          })}
        </MenuSurface>
      ) : null}
    </div>
  );
}
