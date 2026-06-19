import React from "react";

import type { ImageModelConfig } from "../config/imageModels";
import { WorkbenchDesktopResultCard } from "./WorkbenchDesktopResultCard";
import type { WorkbenchGeneration, WorkbenchResult } from "./workbenchTypes";

type Props = {
  generations: WorkbenchGeneration[];
  getDisplayResults: (generation: WorkbenchGeneration) => WorkbenchResult[];
  models: ImageModelConfig[];
  onDeleteGeneration: (generationId: string) => void;
  onDownloadOriginal: (result: WorkbenchResult, generation: WorkbenchGeneration) => void;
  onRegenerate: (generation: WorkbenchGeneration) => void;
  onSelectPreview: (generation: WorkbenchGeneration, result: WorkbenchResult) => void;
  onUseAsReference: (result: WorkbenchResult) => void;
};

const DESKTOP_FEED_PAGE_SIZE = 4;

export function WorkbenchDesktopResultFeed({
  generations,
  getDisplayResults,
  models,
  onDeleteGeneration,
  onDownloadOriginal,
  onRegenerate,
  onSelectPreview,
  onUseAsReference,
}: Props) {
  const [visibleCount, setVisibleCount] = React.useState(DESKTOP_FEED_PAGE_SIZE);
  const scrollAreaRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    setVisibleCount((current) =>
      Math.min(Math.max(current, DESKTOP_FEED_PAGE_SIZE), Math.max(generations.length, DESKTOP_FEED_PAGE_SIZE)),
    );
  }, [generations.length]);

  const visibleGenerations = generations.slice(0, visibleCount);

  const handleScroll = React.useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    if (element.scrollTop + element.clientHeight < element.scrollHeight - 32) return;
    setVisibleCount((current) => Math.min(generations.length, current + DESKTOP_FEED_PAGE_SIZE));
  }, [generations.length]);

  return (
    <section
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,21,31,0.96),rgba(10,13,19,0.98))] shadow-[0_26px_80px_rgba(0,0,0,0.26)]"
      data-testid="workbench-desktop-result-feed"
    >
      <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">
            Results Workspace
          </div>
          <div className="mt-1 text-sm font-bold text-white">创作结果流</div>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-bold text-slate-300">
          {generations.length}
        </span>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto p-4"
        data-testid="workbench-desktop-result-scroll-area"
        onScroll={handleScroll}
        ref={scrollAreaRef}
      >
        <div className="grid gap-4">
          {visibleGenerations.length === 0 ? (
            <div className="grid min-h-[320px] place-items-center rounded-[20px] border border-dashed border-white/10 bg-black/15 text-center">
              <div className="px-5">
                <div className="text-sm font-bold text-white">还没有创作记录</div>
                <div className="mt-2 text-sm leading-6 text-slate-400">
                  开始生成后，进行中、已完成和失败的结果都会按时间顺序出现在这里。
                </div>
              </div>
            </div>
          ) : null}

          {visibleGenerations.map((generation) => (
            <WorkbenchDesktopResultCard
              generation={generation}
              getDisplayResults={getDisplayResults}
              key={generation.id}
              models={models}
              onDeleteGeneration={onDeleteGeneration}
              onDownloadOriginal={onDownloadOriginal}
              onRegenerate={onRegenerate}
              onSelectPreview={onSelectPreview}
              onUseAsReference={onUseAsReference}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
