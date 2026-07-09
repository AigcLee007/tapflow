import React, { useState } from "react";
import { Globe2, X } from "lucide-react";

import { MenuSurface } from "../../components/menu/MenuSurface";
import { PANORAMA_SUPPORTED_ASPECT_RATIOS, type PanoramaAspectRatio } from "./panoramaTypes";

export type PanoramaGeneratePopoverProps = {
  creditLabel: string;
  onClose: () => void;
  onSubmit: (input: { aspectRatio: PanoramaAspectRatio }) => void;
  sourceNodeTitle: string;
  sourcePromptAvailable: boolean;
};

export function PanoramaGeneratePopover({
  creditLabel,
  onClose,
  onSubmit,
  sourceNodeTitle,
  sourcePromptAvailable,
}: PanoramaGeneratePopoverProps) {
  const [aspectRatio, setAspectRatio] = useState<PanoramaAspectRatio>("2:1");

  return (
    <MenuSurface aria-label="360 全景生成" className="w-[300px] p-3" role="dialog">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-bold text-white">
              <Globe2 size={14} />
              <span>360 全景生成</span>
            </div>
            <div className="mt-1 truncate text-[11px] text-white/55">{sourceNodeTitle}</div>
          </div>
          <button
            aria-label="关闭全景生成"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/8 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white"
            onClick={onClose}
            type="button"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <div className="text-[11px] font-semibold text-white/72">全景比例</div>
          <div className="grid grid-cols-2 gap-2">
            {PANORAMA_SUPPORTED_ASPECT_RATIOS.map((ratio) => {
              const active = ratio === aspectRatio;
              return (
                <button
                  aria-pressed={active}
                  className={`h-10 rounded-xl border text-xs font-bold transition ${
                    active
                      ? "border-sky-400/60 bg-sky-400/16 text-sky-100"
                      : "border-white/10 bg-white/5 text-white/78 hover:bg-white/8"
                  }`}
                  key={ratio}
                  onClick={() => setAspectRatio(ratio)}
                  type="button"
                >
                  {ratio}
                </button>
              );
            })}
          </div>
        </div>

        {!sourcePromptAvailable ? (
          <div className="rounded-xl border border-amber-300/20 bg-amber-400/8 px-3 py-2 text-[11px] text-amber-200">
            缺少生成提示词
          </div>
        ) : null}

        <div className="rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2 text-[11px] text-white/68">
          {creditLabel}
        </div>

        <div className="flex justify-end gap-2">
          <button
            className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-bold text-white/80 transition hover:bg-white/8"
            onClick={onClose}
            type="button"
          >
            取消
          </button>
          <button
            className="h-10 rounded-xl bg-white px-3 text-xs font-bold text-black transition disabled:cursor-not-allowed disabled:bg-white/16 disabled:text-white/42"
            disabled={!sourcePromptAvailable}
            onClick={() => onSubmit({ aspectRatio })}
            type="button"
          >
            生成全景
          </button>
        </div>
      </div>
    </MenuSurface>
  );
}
