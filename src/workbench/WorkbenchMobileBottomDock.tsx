import React from "react";
import { ChevronUp, Sparkles } from "lucide-react";

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
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] md:hidden"
      data-testid="workbench-mobile-bottom-dock"
    >
      <div className="pointer-events-auto rounded-[24px] border border-white/10 bg-[#0f1219]/95 p-2 shadow-[0_-18px_50px_rgba(0,0,0,0.42)] backdrop-blur-xl">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <button
            aria-label="打开移动端工作台参数面板"
            className="flex min-w-0 items-center justify-between gap-3 rounded-[18px] border border-white/8 bg-white/[0.04] px-3 py-3 text-left transition hover:bg-white/[0.07]"
            data-testid="workbench-mobile-open-sheet"
            onClick={onOpenSheet}
            type="button"
          >
            <div className="min-w-0">
              <div className="truncate text-[13px] font-bold text-white">{modelLabel}</div>
              <div className="truncate text-[11px] text-slate-400">{routeLabel}</div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[12px] font-bold text-slate-200">
                {draft.aspectRatio} · {formatSize(draft.size)} · {draft.quantity}张
              </div>
              <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-cyan-200">
                参数面板
                <ChevronUp size={13} />
              </div>
            </div>
          </button>

          <button
            className="inline-flex h-full min-h-[68px] items-center justify-center gap-2 rounded-[18px] bg-white px-4 text-[13px] font-black text-black transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-300"
            data-testid="workbench-mobile-generate-button"
            disabled={isGenerating}
            onClick={onGenerate}
            type="button"
          >
            <Sparkles size={15} />
            {isGenerating ? "生成中..." : "立即开始创作"}
          </button>
        </div>
      </div>
    </div>
  );
}
