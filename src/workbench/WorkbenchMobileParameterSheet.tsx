import React from "react";
import { X } from "lucide-react";

import type { ImageModelConfig } from "../config/imageModels";
import { WorkbenchComposer } from "./WorkbenchComposer";
import type { WorkbenchDraft } from "./workbenchTypes";

type Props = {
  draft: WorkbenchDraft;
  isGenerating: boolean;
  models: ImageModelConfig[];
  onChangeDraft: (patch: Partial<WorkbenchDraft>) => void;
  onClose: () => void;
  onGenerate: () => void;
  open: boolean;
};

export function WorkbenchMobileParameterSheet({
  draft,
  isGenerating,
  models,
  onChangeDraft,
  onClose,
  onGenerate,
  open,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden" data-testid="workbench-mobile-parameter-sheet">
      <button
        aria-label="关闭移动端工作台参数面板"
        className="absolute inset-0 bg-black/62"
        onClick={onClose}
        type="button"
      />
      <section className="absolute inset-x-0 bottom-0 max-h-[92vh] overflow-hidden rounded-t-[28px] border border-white/10 bg-[#101014] shadow-[0_-24px_70px_rgba(0,0,0,0.6)]">
        <div className="flex items-center justify-between border-b border-white/8 px-4 pb-3 pt-4">
          <div>
            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-300">Create</div>
            <div className="mt-1 text-[18px] font-black text-white">移动创作面板</div>
          </div>
          <button
            aria-label="关闭移动端工作台参数面板"
            className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-slate-100"
            onClick={onClose}
            type="button"
          >
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[calc(92vh-73px)] overflow-y-auto">
          <WorkbenchComposer
            compact
            draft={draft}
            isGenerating={isGenerating}
            models={models}
            onAfterGenerate={onClose}
            onChangeDraft={onChangeDraft}
            onGenerate={onGenerate}
          />
        </div>
      </section>
    </div>
  );
}
