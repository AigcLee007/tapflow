import React from "react";
import { ChevronLeft, Coins } from "lucide-react";

import { BrandMark } from "../app/brand/BrandMark";
import { HOME_ROUTE } from "../app/routes";
import type { ImageModelConfig } from "../config/imageModels";
import { WorkbenchMobileBottomDock } from "./WorkbenchMobileBottomDock";
import { WorkbenchMobileParameterSheet } from "./WorkbenchMobileParameterSheet";
import { WorkbenchMobileResultFeed } from "./WorkbenchMobileResultFeed";
import type { WorkbenchDraft, WorkbenchGeneration, WorkbenchResult } from "./workbenchTypes";

function navigate(path: string) {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

type Props = {
  availableCredits: number;
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
  onDeleteGeneration: (generationId: string) => void;
  onDownloadOriginal: (result: WorkbenchResult) => void;
  onGenerate: () => void;
  onOpenResult: (result: WorkbenchResult) => void;
  onUseAsReference: (result: WorkbenchResult) => void;
  routeLabel: string;
};

export function WorkbenchMobileShell({
  availableCredits,
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
  const [selectedResultIds, setSelectedResultIds] = React.useState<Record<string, string | null>>({});
  const featuredGeneration = getFeaturedGeneration(generations);
  const featuredResult = featuredGeneration ? getPrimaryResult(featuredGeneration) : null;
  const featuredDisplayResults = React.useMemo(
    () => (featuredGeneration ? getDisplayResults(featuredGeneration) : []),
    [featuredGeneration, getDisplayResults],
  );
  const featuredSelectedResult = React.useMemo(() => {
    if (!featuredGeneration) return featuredResult;
    const selectedId = selectedResultIds[featuredGeneration.id];
    return featuredDisplayResults.find((result) => result.id === selectedId) ?? featuredResult;
  }, [featuredDisplayResults, featuredGeneration, featuredResult, selectedResultIds]);
  const featuredPreviewUrlResolved = featuredSelectedResult?.previewUrl || featuredPreviewUrl;
  const modelLabel = models.find((model) => model.id === draft.modelId)?.label || draft.modelId;

  const handleSelectPreview = React.useCallback((generationId: string, result: WorkbenchResult) => {
    setSelectedResultIds((current) => ({
      ...current,
      [generationId]: result.id,
    }));
  }, []);

  return (
    <div
      className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#07090e] md:hidden"
      data-testid="workbench-mobile-shell"
    >
      <header
        className="flex h-[74px] shrink-0 items-center justify-between gap-3 px-4 pt-3"
        data-testid="workbench-mobile-header"
      >
        <div className="flex min-w-0 items-center gap-3">
          <button
            aria-label="返回首页"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-slate-200 transition hover:bg-white/[0.12]"
            onClick={() => navigate(HOME_ROUTE)}
            type="button"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark showCaption={false} size="compact" />
            <div className="min-w-0">
              <div className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-300">Workbench</div>
              <div className="truncate text-[26px] font-black leading-none text-white">创作工作台</div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="flex h-10 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3 text-[12px] font-black text-[#ffe35a]">
            <Coins size={13} />
            <span data-testid="workbench-mobile-credit-balance">{availableCredits.toLocaleString()}</span>
          </div>
        </div>
      </header>

      <div
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain px-4 pb-[126px] pt-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        data-testid="workbench-mobile-scroll-area"
      >
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
              {draft.quantity} 张
            </div>
          </div>
          <div className="p-4">
            {loading ? (
              <div className="grid h-[280px] place-items-center rounded-[20px] border border-white/8 bg-black/20 text-sm text-slate-400">
                正在加载工作台内容...
              </div>
            ) : featuredSelectedResult && featuredPreviewUrlResolved ? (
              <button
                className="block w-full overflow-hidden rounded-[20px] border border-white/10 bg-black/30 text-left"
                onClick={() => featuredSelectedResult && onOpenResult(featuredSelectedResult)}
                type="button"
              >
                <img
                  alt={featuredSelectedResult.originalFilename || "Workbench result"}
                  className="max-h-[320px] w-full object-contain"
                  src={featuredPreviewUrlResolved}
                />
                <div className="px-4 pb-4 pt-3">
                  <div className="line-clamp-2 text-[15px] font-bold text-white">{featuredGeneration?.prompt}</div>
                  <div className="mt-2 text-[12px] text-slate-400">
                    {modelLabel} · {routeLabel}
                  </div>
                </div>
              </button>
            ) : (
              <div className="grid h-[280px] place-items-center rounded-[20px] border border-dashed border-white/10 bg-black/20 px-6 text-center">
                <div>
                  <div className="mt-4 text-[16px] font-bold text-white">从提示词开始创作</div>
                  <div className="mt-2 text-[13px] leading-6 text-slate-400">
                    结果会优先显示在这里，下方保留最近任务和已完成作品。
                  </div>
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
          onSelectPreview={handleSelectPreview}
          onSelectResult={onOpenResult}
          onUseAsReference={onUseAsReference}
          selectedResultIds={selectedResultIds}
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
    </div>
  );
}
