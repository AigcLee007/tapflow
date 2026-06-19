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
  const sortedGenerations = React.useMemo(() =>
    generations
      .slice()
      .sort((left, right) =>
        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
      ),
    [generations],
  );

  return (
    <section className="grid gap-5" data-testid="workbench-mobile-result-feed">
      {generations.length === 0 ? (
        <div className="grid min-h-[56vh] place-items-center rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] px-6 text-center">
          <div>
            <div className="text-[16px] font-bold text-white">开始你的第一张作品</div>
            <div className="mt-2 text-[13px] leading-6 text-slate-400">
              设置提示词、模型和参数后，生成结果会优先出现在这里。
            </div>
          </div>
        </div>
      ) : null}

      {sortedGenerations.map((generation) => (
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
    </section>
  );
}
