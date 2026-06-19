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
  generations: WorkbenchGeneration[];
  getDisplayResults: (generation: WorkbenchGeneration) => WorkbenchResult[];
  isGenerating: boolean;
  models: ImageModelConfig[];
  onChangeDraft: (patch: Partial<WorkbenchDraft>) => void;
  onDeleteGeneration: (generationId: string) => void;
  onDownloadOriginal: (result: WorkbenchResult, generation: WorkbenchGeneration) => void;
  onGenerate: () => void;
  onOpenResult: (result: WorkbenchResult) => void;
  onRegenerate: (generation: WorkbenchGeneration) => void;
  onUseAsReference: (result: WorkbenchResult) => void;
  openParameterSheetRequest: number;
  routeLabel: string;
};

const MOBILE_FEED_PAGE_SIZE = 8;

export function WorkbenchMobileShell({
  availableCredits,
  draft,
  error,
  generations,
  getDisplayResults,
  isGenerating,
  models,
  onChangeDraft,
  onDeleteGeneration,
  onDownloadOriginal,
  onGenerate,
  onOpenResult,
  onRegenerate,
  onUseAsReference,
  openParameterSheetRequest,
  routeLabel,
}: Props) {
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [visibleCount, setVisibleCount] = React.useState(MOBILE_FEED_PAGE_SIZE);
  const [selectedResultIds, setSelectedResultIds] = React.useState<Record<string, string | null>>({});
  const scrollAreaRef = React.useRef<HTMLDivElement | null>(null);
  const previousGenerationCountRef = React.useRef(0);
  const modelLabel = models.find((model) => model.id === draft.modelId)?.label || draft.modelId;
  const visibleGenerations = React.useMemo(
    () =>
      generations
        .slice()
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
        .slice(0, Math.min(generations.length, visibleCount)),
    [generations, visibleCount],
  );

  const handleSelectPreview = React.useCallback((generationId: string, result: WorkbenchResult) => {
    setSelectedResultIds((current) => ({
      ...current,
      [generationId]: result.id,
    }));
  }, []);

  React.useEffect(() => {
    if (openParameterSheetRequest <= 0) return;
    setSheetOpen(true);
  }, [openParameterSheetRequest]);

  React.useEffect(() => {
    setVisibleCount((current) => Math.min(Math.max(current, MOBILE_FEED_PAGE_SIZE), Math.max(generations.length, MOBILE_FEED_PAGE_SIZE)));
  }, [generations.length]);

  React.useEffect(() => {
    if (generations.length === 0) {
      previousGenerationCountRef.current = 0;
      return;
    }
    if (generations.length !== previousGenerationCountRef.current) {
      previousGenerationCountRef.current = generations.length;
      window.setTimeout(() => {
        const element = scrollAreaRef.current;
        if (!element) return;
        if (typeof element.scrollTo === "function") {
          element.scrollTo({ top: element.scrollHeight, behavior: "auto" });
        } else {
          element.scrollTop = element.scrollHeight;
        }
      }, 0);
    }
  }, [generations.length, visibleGenerations.length]);

  const handleScroll = React.useCallback((event: React.UIEvent<HTMLDivElement>) => {
    if (event.currentTarget.scrollTop > 24) return;
    setVisibleCount((current) => Math.min(generations.length, current + MOBILE_FEED_PAGE_SIZE));
  }, [generations.length]);

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
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain px-4 pb-[132px] pt-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        data-testid="workbench-mobile-scroll-area"
        onScroll={handleScroll}
        ref={scrollAreaRef}
      >
        {error ? (
          <div className="mb-4 rounded-[18px] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        <WorkbenchMobileResultFeed
          generations={visibleGenerations}
          getDisplayResults={getDisplayResults}
          models={models}
          onDeleteGeneration={onDeleteGeneration}
          onDownloadOriginal={onDownloadOriginal}
          onRegenerate={(generation) => {
            onRegenerate(generation);
            setSheetOpen(true);
          }}
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
