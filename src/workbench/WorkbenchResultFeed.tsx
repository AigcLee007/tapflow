import React from "react";

import { getAssetVariantUrl } from "../assets/assetApi";
import type { WorkbenchGeneration, WorkbenchResult } from "./workbenchTypes";

type Props = {
  generations: WorkbenchGeneration[];
  onReuseParams: (generation: WorkbenchGeneration) => void;
  onRetry: (generationId: string) => void;
  onSelectResult: (result: WorkbenchResult) => void;
};

const TEXT = {
  again: "\u518d\u6b21\u751f\u6210",
  completed: "\u5df2\u5b8c\u6210",
  empty: "\u8fd8\u6ca1\u6709\u751f\u6210\u8bb0\u5f55",
  emptyHint: "\u4ece\u5de6\u4fa7\u53c2\u6570\u533a\u5f00\u59cb\u4e00\u6b21\u65b0\u7684\u56fe\u7247\u751f\u6210\u3002",
  failed: "\u5931\u8d25",
  failedHint: "\u672c\u6b21\u751f\u6210\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5\u3002",
  generating: "\u751f\u6210\u4e2d",
  imageCount: "\u5f20",
  points: "\u79ef\u5206",
  previewLoading: "\u9884\u89c8\u52a0\u8f7d\u4e2d",
  queued: "\u6392\u961f\u4e2d",
  reuse: "\u590d\u7528\u53c2\u6570",
  waitingResult: "\u6b63\u5728\u7b49\u5f85\u56fe\u7247\u7ed3\u679c...",
};

function statusLabel(status: string) {
  if (status === "succeeded") return TEXT.completed;
  if (status === "failed") return TEXT.failed;
  if (status === "running" || status === "waiting_provider") return TEXT.generating;
  if (status === "queued" || status === "pending") return TEXT.queued;
  return status;
}

function ResultImageButton({
  onSelect,
  result,
}: {
  onSelect: (result: WorkbenchResult) => void;
  result: WorkbenchResult;
}) {
  const [fallbackUrl, setFallbackUrl] = React.useState<string | null>(null);
  const imageUrl = result.previewUrl || fallbackUrl || result.downloadUrl;

  React.useEffect(() => {
    if (result.previewUrl || fallbackUrl || !result.assetId) return;
    let active = true;
    void getAssetVariantUrl(result.assetId, "preview")
      .catch(() => getAssetVariantUrl(result.assetId))
      .then((signed) => {
        if (!active) return;
        setFallbackUrl(signed.url);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [fallbackUrl, result.assetId, result.previewUrl]);

  return (
    <button
      className="overflow-hidden rounded-[18px] border border-white/8 bg-black/30 text-left"
      data-asset-id={result.assetId}
      onClick={() => onSelect(result)}
      type="button"
    >
      {imageUrl ? (
        <img
          alt={result.originalFilename || "Workbench result"}
          className="aspect-square w-full object-cover"
          src={imageUrl}
        />
      ) : (
        <div className="grid aspect-square place-items-center text-xs text-slate-500">{TEXT.previewLoading}</div>
      )}
    </button>
  );
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
            <div className="text-sm font-bold text-slate-200">{TEXT.empty}</div>
            <div className="mt-2 text-sm text-slate-500">{TEXT.emptyHint}</div>
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
                <span>{generation.requestedCount} {TEXT.imageCount}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs font-bold text-slate-400">{TEXT.points}</div>
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
                <ResultImageButton
                  key={result.id}
                  onSelect={onSelectResult}
                  result={result}
                />
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-[18px] border border-dashed border-white/10 px-4 py-6 text-sm text-slate-500">
              {generation.status === "failed"
                ? (generation.errorJson?.message as string) || TEXT.failedHint
                : TEXT.waitingResult}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              aria-label={TEXT.again}
              className="h-10 rounded-full border border-white/10 bg-white/[0.06] px-4 text-sm font-bold text-white"
              onClick={() => onRetry(generation.id)}
              type="button"
            >
              {TEXT.again}
            </button>
            <button
              aria-label={TEXT.reuse}
              className="h-10 rounded-full border border-white/10 bg-white/[0.03] px-4 text-sm font-bold text-slate-300"
              onClick={() => onReuseParams(generation)}
              type="button"
            >
              {TEXT.reuse}
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}
