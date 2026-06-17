import React from "react";

import type { WorkbenchGeneration, WorkbenchResult } from "./workbenchTypes";

type Props = {
  generations: WorkbenchGeneration[];
  onReuseParams: (generation: WorkbenchGeneration) => void;
  onRetry: (generationId: string) => void;
  onSelectResult: (result: WorkbenchResult) => void;
};

function statusLabel(status: string) {
  if (status === "succeeded") return "已完成";
  if (status === "failed") return "失败";
  if (status === "running") return "生成中";
  if (status === "queued" || status === "pending") return "排队中";
  return status;
}

export function WorkbenchResultFeed({
  generations,
  onReuseParams,
  onRetry,
  onSelectResult,
}: Props) {
  return (
    <section data-testid="workbench-result-feed" className="grid gap-4">
      {generations.length === 0 ? (
        <div className="grid min-h-[280px] place-items-center rounded-[24px] border border-white/8 bg-white/[0.03] text-center">
          <div>
            <div className="text-sm font-bold text-slate-200">还没有生成记录</div>
            <div className="mt-2 text-sm text-slate-500">从左侧参数区开始一次新的图片生成吧。</div>
          </div>
        </div>
      ) : null}

      {generations.map((generation) => (
        <article
          key={generation.id}
          className="overflow-hidden rounded-[24px] border border-white/8 bg-white/[0.04] p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="line-clamp-2 text-sm font-bold text-white">{generation.prompt}</div>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-400">
                <span>{generation.modelId}</span>
                <span>{generation.routeKey}</span>
                <span>{statusLabel(generation.status)}</span>
                <span>{generation.requestedCount} 张</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs font-bold text-slate-400">积分</div>
              <div className="mt-1 text-sm font-bold text-white">{generation.estimatedCredits}</div>
            </div>
          </div>

          {generation.results.length > 0 ? (
            <div
              className={`mt-4 grid gap-3 ${
                generation.displayMode === "merged"
                  ? "grid-cols-2 md:grid-cols-3 xl:grid-cols-4"
                  : "grid-cols-1 md:grid-cols-2"
              }`}
            >
              {generation.results.map((result) => (
                <button
                  key={result.id}
                  className="overflow-hidden rounded-[18px] border border-white/8 bg-black/30 text-left"
                  data-asset-id={result.assetId}
                  onClick={() => onSelectResult(result)}
                  type="button"
                >
                  {result.previewUrl ? (
                    <img
                      alt={result.originalFilename || "Workbench result"}
                      className="aspect-square w-full object-cover"
                      src={result.previewUrl}
                    />
                  ) : (
                    <div className="grid aspect-square place-items-center text-xs text-slate-500">预览生成中</div>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-[18px] border border-dashed border-white/10 px-4 py-6 text-sm text-slate-500">
              {generation.status === "failed"
                ? (generation.errorJson?.message as string) || "本次生成失败，请重试。"
                : "正在等待图片结果..."}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              aria-label="再次生成"
              className="h-10 rounded-full border border-white/10 bg-white/[0.06] px-4 text-sm font-bold text-white"
              onClick={() => onRetry(generation.id)}
              type="button"
            >
              再次生成
            </button>
            <button
              aria-label="复用参数"
              className="h-10 rounded-full border border-white/10 bg-white/[0.03] px-4 text-sm font-bold text-slate-300"
              onClick={() => onReuseParams(generation)}
              type="button"
            >
              复用参数
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}
