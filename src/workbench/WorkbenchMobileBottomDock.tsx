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

export function WorkbenchMobileBottomDock({
  draft,
  isGenerating,
  onGenerate,
  onOpenSheet,
}: Props) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+10px)] md:hidden"
      data-testid="workbench-mobile-bottom-dock"
    >
      <div className="pointer-events-auto flex items-center gap-2 rounded-[24px] border border-white/10 bg-[#0d1118]/94 p-2 shadow-[0_-10px_28px_rgba(0,0,0,0.30)] backdrop-blur-xl">
        <button
          aria-label="打开参考图"
          className="grid h-[50px] w-[50px] shrink-0 place-items-center rounded-[18px] border border-white/8 bg-white/[0.05] text-slate-100 transition hover:bg-white/[0.08]"
          onClick={onOpenSheet}
          type="button"
        >
          <ImagePlus size={18} />
        </button>

        <button
          aria-label="打开移动创作面板"
          className="flex h-[50px] min-w-0 flex-1 items-center rounded-[18px] border border-white/8 bg-white/[0.04] px-3 text-left transition hover:bg-white/[0.07]"
          data-testid="workbench-mobile-create-bar"
          onClick={onOpenSheet}
          type="button"
        >
          <span className="shrink-0 text-[13px] font-black leading-none text-cyan-200">图片生成</span>
          <ChevronRight className="mx-1.5 shrink-0 text-slate-500" size={13} />
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium leading-none text-slate-400">
            {draft.prompt.trim() || "请描述画面内容"}
          </span>
        </button>

        <button
          className="inline-flex h-[50px] shrink-0 items-center justify-center gap-1.5 rounded-[18px] bg-white px-4 text-[13px] font-black text-black transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-300"
          data-testid="workbench-mobile-generate-button"
          disabled={isGenerating}
          onClick={onGenerate}
          type="button"
        >
          <Sparkles size={14} />
          {isGenerating ? "生成中" : "开始"}
        </button>
      </div>
    </div>
  );
}
