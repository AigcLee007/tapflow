import React from "react";
import { ChevronRight, ImagePlus, Sparkles } from "lucide-react";

import type { WorkbenchDraft } from "./workbenchTypes";

type Props = {
  draft: WorkbenchDraft;
  isGenerating: boolean;
  modelLabel: string;
  onGenerate: () => void;
  onOpenSheet: () => void;
  routeLabel: string;
};

function formatSize(value: string) {
  return value.trim().toUpperCase();
}

export function WorkbenchMobileBottomDock({
  draft,
  isGenerating,
  modelLabel,
  onGenerate,
  onOpenSheet,
  routeLabel,
}: Props) {
  const summary = `${modelLabel} · ${draft.aspectRatio} · ${formatSize(draft.size)}${draft.quantity > 1 ? ` · ${draft.quantity}张` : ""}`;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+10px)] md:hidden"
      data-testid="workbench-mobile-bottom-dock"
    >
      <div className="pointer-events-auto rounded-[24px] border border-white/10 bg-[#0d1118]/94 px-2.5 py-2 shadow-[0_-10px_30px_rgba(0,0,0,0.28)] backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <button
            aria-label="打开移动创作面板参考图"
            className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-[18px] border border-white/8 bg-white/[0.04] text-slate-100 transition hover:bg-white/[0.08]"
            onClick={onOpenSheet}
            type="button"
          >
            <ImagePlus size={18} />
          </button>

          <button
            aria-label="打开移动创作面板"
            className="flex h-[52px] min-w-0 flex-1 items-center rounded-[18px] border border-white/8 bg-white/[0.03] px-3 text-left transition hover:bg-white/[0.06]"
            data-testid="workbench-mobile-create-bar"
            onClick={onOpenSheet}
            type="button"
          >
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="shrink-0 text-[13px] font-black text-white">图片生成</span>
                <ChevronRight className="shrink-0 text-slate-500" size={13} />
                <span className="truncate text-[13px] font-medium text-slate-400">
                  {draft.prompt.trim() || "请描述画面内容"}
                </span>
              </div>
              <div className="mt-0.5 truncate text-[10px] font-medium text-slate-500">{summary}</div>
            </div>
          </button>

          <button
            className="inline-flex h-[52px] shrink-0 items-center justify-center gap-1.5 rounded-[18px] bg-white px-4 text-[13px] font-black text-black transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-300"
            data-testid="workbench-mobile-generate-button"
            disabled={isGenerating}
            onClick={onGenerate}
            type="button"
          >
            <Sparkles size={14} />
            {isGenerating ? "生成中" : "开始"}
          </button>
        </div>

        <div className="mt-1.5 flex items-center justify-between px-1 text-[10px] text-slate-500">
          <span className="truncate">线路 {routeLabel}</span>
          <span className="shrink-0">轻触打开完整创作面板</span>
        </div>
      </div>
    </div>
  );
}
