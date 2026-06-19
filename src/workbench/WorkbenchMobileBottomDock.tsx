import React from "react";
import { ChevronRight } from "lucide-react";

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
  onOpenSheet,
}: Props) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] md:hidden"
      data-testid="workbench-mobile-bottom-dock"
    >
      <button
        aria-label="打开移动创作面板"
        className="pointer-events-auto flex h-11 w-[min(240px,calc(100vw-32px))] items-center rounded-[14px] border border-white/8 bg-[#151b25]/95 px-3 text-left shadow-[0_10px_26px_rgba(0,0,0,0.32)] backdrop-blur-xl transition hover:bg-[#1a2230]"
        data-testid="workbench-mobile-create-bar"
        onClick={onOpenSheet}
        type="button"
      >
        <span className="shrink-0 text-[12px] font-black leading-none text-cyan-200">图片生成</span>
        <ChevronRight className="mx-1.5 shrink-0 text-slate-500" size={12} />
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium leading-none text-slate-400">
          {draft.prompt.trim() || "请描述画面内容"}
        </span>
      </button>
    </div>
  );
}
