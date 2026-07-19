import { ChevronDown, ChevronUp, Film, Image, Images, Type, Video, type LucideIcon } from "lucide-react";

import { MenuSurface } from "../../components/menu/MenuSurface";
import { useDismissibleLayer } from "../../components/menu/useDismissibleLayer";
import { createSafeDefaultVideoCapabilities } from "./videoGenerationCapabilities";
import type { VideoGenerationCapabilities, VideoGenerationMode } from "./videoTypes";
import { VIDEO_UI_COPY, VIDEO_UI_MODE_COPY } from "./videoUiCopy";

type VideoModeMenuProps = {
  capabilities?: VideoGenerationCapabilities | null;
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

export function VideoModeMenu({ capabilities, onChange, value }: VideoModeMenuProps) {
  const layer = useDismissibleLayer("video-mode-menu");
  const safeCapabilities = capabilities ?? createSafeDefaultVideoCapabilities();
  const selected = MODE_OPTIONS.find((option) => option.value === value) ?? MODE_OPTIONS[0];

  return (
    <div className="relative min-w-0">
      <button
        ref={layer.triggerRef as React.RefObject<HTMLButtonElement>}
        aria-expanded={layer.open}
        aria-haspopup="menu"
        aria-label={VIDEO_UI_COPY.mode}
        className="inline-flex h-[38px] max-w-full items-center gap-2 rounded-[10px] border border-white/10 bg-[#303036] px-3 text-xs font-bold text-white/90 outline-none transition hover:border-white/25 hover:bg-[#383840] focus:border-sky-300/50"
        onClick={layer.toggle}
        type="button"
      >
        <Video aria-hidden="true" className="shrink-0" size={16} />
        <span className="truncate">{selected.label}</span>
        {layer.open ? <ChevronUp aria-hidden="true" className="shrink-0 text-white/55" size={15} /> : <ChevronDown aria-hidden="true" className="shrink-0 text-white/55" size={15} />}
      </button>
      {layer.open ? (
        <MenuSurface
          ref={layer.ref as React.RefObject<HTMLDivElement>}
          aria-label={VIDEO_UI_COPY.modeOptions}
          className="absolute bottom-[calc(100%+8px)] left-0 z-[1200] w-[250px] rounded-[18px] bg-[#272729] p-2"
          role="menu"
        >
          <h3 className="flex h-10 items-center px-2 text-sm font-bold text-white/70">视频生成模式</h3>
          {MODE_OPTIONS.map((option) => {
            const supported = safeCapabilities.supportedModes.includes(option.value);
            const selectedOption = option.value === value;
            const ModeIcon = MODE_ICONS[option.value];
            return (
              <button
                key={option.value}
                aria-checked={selectedOption}
                className={`flex h-[48px] w-full items-center gap-3 rounded-[12px] px-3 text-left text-sm font-bold text-white transition hover:bg-white/[0.09] ${selectedOption ? "bg-white/[0.14]" : ""} disabled:cursor-not-allowed disabled:opacity-35`.trim()}
                disabled={!supported}
                onClick={() => {
                  onChange(option.value);
                  layer.closeLayer();
                }}
                role="menuitemradio"
                title={supported ? undefined : VIDEO_UI_COPY.unsupportedByModel}
                type="button"
              >
                <ModeIcon aria-hidden="true" className="shrink-0 text-white/70" size={19} />
                <span className="min-w-0 truncate">{option.label}</span>
              </button>
            );
          })}
        </MenuSurface>
      ) : null}
    </div>
  );
}
