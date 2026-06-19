import React from "react";
import { ImagePlus, Sparkles } from "lucide-react";

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
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+10px)] md:hidden"
      data-testid="workbench-mobile-bottom-dock"
    >
      <div className="pointer-events-auto rounded-[26px] border border-white/10 bg-[#11141c]/96 p-2 shadow-[0_-20px_46px_rgba(0,0,0,0.42)] backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <button
            aria-label="Open mobile creation panel from references"
            className="flex h-[58px] w-[58px] shrink-0 flex-col items-center justify-center rounded-[18px] border border-white/10 bg-white/[0.04] text-slate-200 transition hover:bg-white/[0.08]"
            onClick={onOpenSheet}
            type="button"
          >
            <ImagePlus size={16} />
            <span className="mt-1 text-[10px] font-bold leading-none">参考</span>
          </button>

          <button
            aria-label="Open mobile creation panel"
            className="flex min-h-[58px] min-w-0 flex-1 items-center rounded-[20px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] px-3.5 py-2 text-left transition hover:bg-white/[0.08]"
            data-testid="workbench-mobile-create-bar"
            onClick={onOpenSheet}
            type="button"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-bold text-cyan-300">图片生成</span>
                <span className="text-[13px] text-slate-400">→</span>
                <span className="truncate text-[13px] font-medium text-slate-400">
                  {draft.prompt.trim() || "请描述画面内容"}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                <span className="truncate">{modelLabel}</span>
                <span>·</span>
                <span>{routeLabel}</span>
                <span>·</span>
                <span>{draft.aspectRatio}</span>
                <span>·</span>
                <span>{formatSize(draft.size)}</span>
                <span>·</span>
                <span>{draft.quantity}张</span>
              </div>
            </div>
            <div className="ml-2 shrink-0 rounded-full bg-white/[0.06] p-2 text-cyan-200">
              <Sparkles size={14} />
            </div>
          </button>

          <button
            className="inline-flex h-[58px] shrink-0 items-center justify-center gap-2 rounded-[20px] bg-white px-4 text-[13px] font-black text-black transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-300"
            data-testid="workbench-mobile-generate-button"
            disabled={isGenerating}
            onClick={onGenerate}
            type="button"
          >
            <Sparkles size={15} />
            {isGenerating ? "生成中..." : "开始"}
          </button>
        </div>
      </div>
    </div>
  );
}
