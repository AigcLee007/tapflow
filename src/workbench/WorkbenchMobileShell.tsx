import React from "react";
import { Coins, History, Sparkles } from "lucide-react";

import { BrandMark } from "../app/brand/BrandMark";
import type { ImageModelConfig } from "../config/imageModels";
import { WorkbenchMobileBottomDock } from "./WorkbenchMobileBottomDock";
import { WorkbenchMobileParameterSheet } from "./WorkbenchMobileParameterSheet";
import { WorkbenchMobileResultFeed } from "./WorkbenchMobileResultFeed";
import type { WorkbenchDraft, WorkbenchGeneration, WorkbenchResult } from "./workbenchTypes";

type Props = {
  draft: WorkbenchDraft;
  error: string | null;
  featuredPreviewUrl: string | null;
  generations: WorkbenchGeneration[];
  getDisplayResults: (generation: WorkbenchGeneration) => WorkbenchResult[];
  getFeaturedGeneration: (generations: WorkbenchGeneration[]) => WorkbenchGeneration | null;
  getPrimaryResult: (generation: WorkbenchGeneration) => WorkbenchResult | null;
  isGenerating: boolean;
  loading: boolean;
  models: ImageModelConfig[];
  onChangeDraft: (patch: Partial<WorkbenchDraft>) => void;
  onDownloadOriginal: (result: WorkbenchResult) => void;
  onGenerate: () => void;
  onOpenResult: (result: WorkbenchResult) => void;
  onUseAsReference: (result: WorkbenchResult) => void;
  onDeleteGeneration: (generationId: string) => void;
  routeLabel: string;
};

export function WorkbenchMobileShell({
  draft,
  error,
  featuredPreviewUrl,
  generations,
  getDisplayResults,
  getFeaturedGeneration,
  getPrimaryResult,
  isGenerating,
  loading,
  models,
  onChangeDraft,
  onDeleteGeneration,
  onDownloadOriginal,
  onGenerate,
  onOpenResult,
  onUseAsReference,
  routeLabel,
}: Props) {
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const featuredGeneration = getFeaturedGeneration(generations);
  const featuredResult = featuredGeneration ? getPrimaryResult(featuredGeneration) : null;
  const modelLabel = models.find((model) => model.id === draft.modelId)?.label || draft.modelId;

  return (
    <>
      <div className="md:hidden">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark showCaption={false} size="compact" />
            <div className="min-w-0">
              <div className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-300">Workbench</div>
              <div className="truncate text-[22px] font-black leading-none text-white">创作工作台</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex h-9 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3 text-[12px] font-black text-[#ffe35a]">
              <Coins size={13} />
              19071
            </div>
            <button className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-slate-200" type="button">
              <History size={15} />
            </button>
          </div>
        </div>

        {error ? (
          <div className="mb-4 rounded-[18px] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        <section className="mb-4 overflow-hidden rounded-[26px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(96,164,255,0.18),transparent_34%),linear-gradient(180deg,rgba(18,24,38,0.96),rgba(8,10,17,0.98))] shadow-[0_26px_70px_rgba(0,0,0,0.3)]">
          <div className="flex items-center justify-between border-b border-white/8 px-4 py-4">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-300">Current</div>
              <div className="mt-1 text-[15px] font-bold text-white">
                {featuredGeneration ? "最近结果 / 当前任务" : "准备开始创作"}
              </div>
            </div>
            <div className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[11px] font-bold text-slate-300">
              {draft.quantity}张
            </div>
          </div>
          <div className="p-4">
            {loading ? (
              <div className="grid h-[280px] place-items-center rounded-[20px] border border-white/8 bg-black/20 text-sm text-slate-400">
                正在加载工作台内容...
              </div>
            ) : featuredResult && featuredPreviewUrl ? (
              <button
                className="block w-full overflow-hidden rounded-[20px] border border-white/10 bg-black/30 text-left"
                onClick={() => onOpenResult(featuredResult)}
                type="button"
              >
                <img
                  alt={featuredResult.originalFilename || "Workbench result"}
                  className="max-h-[320px] w-full object-contain"
                  src={featuredPreviewUrl}
                />
                <div className="px-4 pb-4 pt-3">
                  <div className="line-clamp-2 text-[15px] font-bold text-white">{featuredGeneration?.prompt}</div>
                  <div className="mt-2 text-[12px] text-slate-400">{modelLabel} · {routeLabel}</div>
                </div>
              </button>
            ) : (
              <div className="grid h-[280px] place-items-center rounded-[20px] border border-dashed border-white/10 bg-black/20 px-6 text-center">
                <div>
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white text-black">
                    <Sparkles size={20} />
                  </div>
                  <div className="mt-4 text-[16px] font-bold text-white">从提示词开始创作</div>
                  <div className="mt-2 text-[13px] leading-6 text-slate-400">结果会优先显示在这里，下面保留最近任务和已完成作品。</div>
                </div>
              </div>
            )}
          </div>
        </section>

        <WorkbenchMobileResultFeed
          generations={generations}
          getDisplayResults={getDisplayResults}
          models={models}
          onDeleteGeneration={onDeleteGeneration}
          onDownloadOriginal={onDownloadOriginal}
          onSelectResult={onOpenResult}
          onUseAsReference={onUseAsReference}
          selectedResultId={featuredResult?.id ?? null}
        />
      </div>

      <WorkbenchMobileBottomDock
        draft={draft}
        isGenerating={isGenerating}
        modelLabel={modelLabel}
        onGenerate={onGenerate}
        onOpenSheet={() => setSheetOpen(true)}
        routeLabel={routeLabel}
      />

      <WorkbenchMobileParameterSheet
        draft={draft}
        isGenerating={isGenerating}
        models={models}
        onChangeDraft={onChangeDraft}
        onClose={() => setSheetOpen(false)}
        onGenerate={onGenerate}
        open={sheetOpen}
      />
    </>
  );
}
