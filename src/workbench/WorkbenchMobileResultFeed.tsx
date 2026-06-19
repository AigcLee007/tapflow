import React from "react";

import type { ImageModelConfig } from "../config/imageModels";
import type { WorkbenchGeneration, WorkbenchResult } from "./workbenchTypes";
import { WorkbenchMobileResultCard } from "./WorkbenchMobileResultCard";

type Props = {
  generations: WorkbenchGeneration[];
  getDisplayResults: (generation: WorkbenchGeneration) => WorkbenchResult[];
  models: ImageModelConfig[];
  onDeleteGeneration: (generationId: string) => void;
  onDownloadOriginal: (result: WorkbenchResult, generation: WorkbenchGeneration) => void;
  onSelectPreview: (generationId: string, result: WorkbenchResult) => void;
  onSelectResult: (result: WorkbenchResult) => void;
  onUseAsReference: (result: WorkbenchResult) => void;
  selectedResultIds: Record<string, string | null>;
};

export function WorkbenchMobileResultFeed({
  generations,
  getDisplayResults,
  models,
  onDeleteGeneration,
  onDownloadOriginal,
  onSelectPreview,
  onSelectResult,
  onUseAsReference,
  selectedResultIds,
}: Props) {
  const activeGenerations = generations.filter((generation) =>
    generation.status !== "succeeded" && generation.status !== "failed" && generation.status !== "canceled",
  );
  const completedGenerations = generations.filter((generation) =>
    generation.status === "succeeded" || generation.status === "failed" || generation.status === "canceled",
  );

  return (
    <section className="grid gap-4" data-testid="workbench-mobile-result-feed">
      {generations.length === 0 ? (
        <div className="grid min-h-[220px] place-items-center rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] px-6 text-center">
          <div>
            <div className="text-[16px] font-bold text-white">开始你的第一张作品</div>
            <div className="mt-2 text-[13px] leading-6 text-slate-400">
              设置提示词、模型和参数后，生成结果会优先出现在这里。
            </div>
          </div>
        </div>
      ) : null}

      {activeGenerations.length > 0 ? (
        <div className="grid gap-3">
          <div className="flex items-center justify-between px-1">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-cyan-300">Current Tasks</div>
              <div className="mt-1 text-[14px] font-bold text-white">正在进行或等待中的任务</div>
            </div>
            <div className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-[10px] font-black text-cyan-200">
              {activeGenerations.length}
            </div>
          </div>
          {activeGenerations.map((generation) => (
            <WorkbenchMobileResultCard
              generation={generation}
              key={generation.id}
              models={models}
              onDelete={onDeleteGeneration}
              onDownloadOriginal={onDownloadOriginal}
              onSelectPreview={onSelectPreview}
              onSelectResult={onSelectResult}
              onUseAsReference={onUseAsReference}
              results={getDisplayResults(generation)}
              selectedResultId={selectedResultIds[generation.id] ?? null}
            />
          ))}
        </div>
      ) : null}

      {completedGenerations.length > 0 ? (
        <div className="grid gap-3">
          <div className="flex items-center justify-between px-1">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Completed</div>
              <div className="mt-1 text-[14px] font-bold text-white">最近完成的结果</div>
            </div>
            <div className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[10px] font-black text-slate-300">
              {completedGenerations.length}
            </div>
          </div>
          {completedGenerations.map((generation) => (
            <WorkbenchMobileResultCard
              generation={generation}
              key={generation.id}
              models={models}
              onDelete={onDeleteGeneration}
              onDownloadOriginal={onDownloadOriginal}
              onSelectPreview={onSelectPreview}
              onSelectResult={onSelectResult}
              onUseAsReference={onUseAsReference}
              results={getDisplayResults(generation)}
              selectedResultId={selectedResultIds[generation.id] ?? null}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
