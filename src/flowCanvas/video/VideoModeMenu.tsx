import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
  const [tooltipAnchor, setTooltipAnchor] = useState<DOMRect | null>(null);
  const selected = MODE_OPTIONS.find((option) => option.value === value) ?? MODE_OPTIONS[0];
  const tooltipOption = tooltipMode ? MODE_OPTIONS.find((option) => option.value === tooltipMode) : null;
  const tooltipItem = tooltipOption ? availability.items.find((item) => item.mode === tooltipOption.value) : null;
  const tooltip = tooltipItem?.reason ? getVideoModeUnavailableReason(tooltipItem.reason, availability.counts) : null;
  const tooltipId = tooltipOption ? `video-mode-${tooltipOption.value}-tooltip` : undefined;

  const closeTooltip = () => {
    setTooltipMode(null);
    setTooltipAnchor(null);
  };

  const openTooltip = (mode: VideoGenerationMode, anchor: HTMLElement, content: string | null) => {
    if (!content) return;
    setTooltipMode(mode);
    setTooltipAnchor(anchor.getBoundingClientRect());
  };

  useEffect(() => {
    if (disabled) {
      closeTooltip();
      layer.closeLayer();
    }
  }, [disabled, layer.closeLayer]);

  useEffect(() => {
    if (!layer.open) closeTooltip();
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
            const optionTooltip = !optionEnabled && item?.reason
              ? getVideoModeUnavailableReason(item.reason, availability.counts)
              : null;

            return (
              <button
                key={option.value}
                aria-checked={selectedOption}
                aria-describedby={tooltipMode === option.value ? `video-mode-${option.value}-tooltip` : undefined}
                aria-disabled={disabled || !optionEnabled || undefined}
                className={`${MENU_ITEM_CLASS} relative h-[38px] ${selectedOption ? "bg-white/[0.088]" : ""} ${disabled || !optionEnabled ? "cursor-not-allowed text-white/45" : "focus:bg-white/[0.088] focus:outline-none"}`.trim()}
                onBlur={closeTooltip}
                onClick={() => {
                  if (disabled || !optionEnabled) return;
                  onChange(option.value);
                  layer.closeLayer();
                }}
                onFocus={() => {
                  openTooltip(option.value, event.currentTarget, optionTooltip);
                }}
                onMouseEnter={() => {
                  openTooltip(option.value, event.currentTarget, optionTooltip);
                }}
                onMouseLeave={closeTooltip}
                role="menuitemradio"
                type="button"
              >
                <span className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] ${selectedOption ? "bg-white/[0.08] text-white" : "bg-white/[0.055] text-white/70"}`}>
                  <ModeIcon aria-hidden="true" size={15} />
                </span>
                <span className={`${MENU_ITEM_PRIMARY_CLASS} min-w-0 truncate`}>{option.label}</span>
              </button>
            );
          })}
        </MenuSurface>
      ) : null}
      {tooltip && tooltipAnchor && typeof document !== "undefined" ? createPortal(
        <span
          className="pointer-events-none fixed w-[220px] rounded-[10px] border border-white/10 bg-[#1c1c20] px-2 py-1.5 text-[9px] font-medium leading-[1.25] text-white/75 shadow-[0_8px_20px_rgba(0,0,0,0.35)]"
          id={tooltipId}
          role="tooltip"
          style={{ left: tooltipAnchor.right + 8, top: tooltipAnchor.top, zIndex: 100001 }}
        >
          {tooltip}
        </span>,
        document.body,
      ) : null}
    </div>
  );
}
