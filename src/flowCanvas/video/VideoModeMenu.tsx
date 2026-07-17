import { Video } from "lucide-react";

import { MenuSurface } from "../../components/menu/MenuSurface";
import {
  MENU_ITEM_CLASS,
  MENU_ITEM_PRIMARY_CLASS,
  MENU_ITEM_SECONDARY_CLASS,
} from "../../components/menu/menuStyles";
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

export function VideoModeMenu({ capabilities, onChange, value }: VideoModeMenuProps) {
  const layer = useDismissibleLayer("video-mode-menu");
  const safeCapabilities = capabilities ?? createSafeDefaultVideoCapabilities();
  const selected = MODE_OPTIONS.find((option) => option.value === value) ?? MODE_OPTIONS[0];

  return (
    <div className="relative">
      <button
        ref={layer.triggerRef as React.RefObject<HTMLButtonElement>}
        aria-expanded={layer.open}
        aria-haspopup="menu"
        aria-label={VIDEO_UI_COPY.mode}
        className="inline-flex h-[38px] items-center gap-[7px] rounded-[10px] border border-white/10 bg-[#17171b] px-2 text-xs font-bold text-white outline-none transition focus:border-sky-300/50"
        onClick={layer.toggle}
        type="button"
      >
        <Video aria-hidden="true" size={16} />
        <span>{selected.label}</span>
      </button>
      {layer.open ? (
        <MenuSurface
          ref={layer.ref as React.RefObject<HTMLDivElement>}
          aria-label={VIDEO_UI_COPY.modeOptions}
          className="absolute left-0 top-[calc(100%+12px)] z-[1200] w-[238px] p-2"
          role="menu"
        >
          {MODE_OPTIONS.map((option) => {
            const supported = safeCapabilities.supportedModes.includes(option.value);
            const selectedOption = option.value === value;
            return (
              <button
                key={option.value}
                aria-checked={selectedOption}
                className={`${MENU_ITEM_CLASS} h-[38px] ${selectedOption ? "bg-white/[0.088]" : ""} disabled:cursor-not-allowed disabled:opacity-45`.trim()}
                disabled={!supported}
                onClick={() => {
                  onChange(option.value);
                  layer.closeLayer();
                }}
                role="menuitemradio"
                type="button"
              >
                <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-white/8">
                  <Video aria-hidden="true" size={15} />
                </span>
                <span className="min-w-0">
                  <span className={`${MENU_ITEM_PRIMARY_CLASS} block`}>{option.label}</span>
                  <span className={`${MENU_ITEM_SECONDARY_CLASS} block truncate`}>
                    {supported ? option.description : VIDEO_UI_COPY.unsupportedByModel}
                  </span>
                </span>
              </button>
            );
          })}
        </MenuSurface>
      ) : null}
    </div>
  );
}
