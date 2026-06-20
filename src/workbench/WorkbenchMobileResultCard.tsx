import React from "react";
import { Clock3, Download, ImagePlus, MoreHorizontal, RotateCcw, Trash2 } from "lucide-react";

import type { ImageModelConfig } from "../config/imageModels";
import type { WorkbenchGeneration, WorkbenchResult } from "./workbenchTypes";
import {
  buildWorkbenchFeedSlots,
  getSortedWorkbenchResults,
  getWorkbenchMosaicLayout,
} from "./workbenchResultLayouts";
import type { WorkbenchPerformanceTracker } from "./useWorkbenchPerformance";

type Props = {
  generation: WorkbenchGeneration;
  models: ImageModelConfig[];
  onDelete: (generationId: string) => void;
  onDownloadOriginal: (result: WorkbenchResult, generation: WorkbenchGeneration) => void;
  onRegenerate: (generation: WorkbenchGeneration) => void;
  onSelectPreview: (generationId: string, result: WorkbenchResult) => void;
  onSelectResult: (result: WorkbenchResult) => void;
  performanceTracker?: WorkbenchPerformanceTracker | null;
  onUseAsReference: (result: WorkbenchResult) => void;
  results: WorkbenchResult[];
  selectedResultId?: string | null;
};

function getModelLabel(modelId: string, models: ImageModelConfig[]) {
  return models.find((model) => model.id === modelId)?.label || modelId;
}

function getRouteLabel(routeKey: string) {
  const normalized = routeKey.toLowerCase();
  if (normalized.includes(".t3") || normalized.includes("line-2") || normalized.includes("route-2")) return "线路二";
  if (normalized.includes("line-3") || normalized.includes("route-3")) return "线路三";
  if (normalized.includes("line-4") || normalized.includes("route-4")) return "线路四";
  return "线路一";
}

function getSlotCount(generation: WorkbenchGeneration, results: WorkbenchResult[]) {
  return Math.max(
    1,
    Number(generation.requestedCount || 0),
    Number(generation.batch?.totalCount || 0),
    results.length,
  );
}

function getStatusLine(generation: WorkbenchGeneration, results: WorkbenchResult[]) {
  if (generation.status === "failed") return "生成失败";
  if (generation.status === "canceled") return "已取消";

  const total = getSlotCount(generation, results);
  const completed = generation.batch?.completedCount ?? results.length;
  const running = generation.batch?.runningCount ?? (generation.status === "running" || generation.status === "waiting_provider" ? 1 : 0);

  if (generation.status === "succeeded") return `共${total}张，已完成`;
  if (completed > 0 && completed < total) return `共${total}张，已完成${completed}张，正在生成${Math.max(1, total - completed)}张...`;
  if (running > 0 || generation.status === "queued" || generation.status === "pending") return `共${total}张，正在生成第${Math.min(completed + 1, total)}张...`;
  return `共${total}张，处理中...`;
}

function getParameterLine(generation: WorkbenchGeneration, models: ImageModelConfig[]) {
  const size = String(generation.params.size || generation.params.imageSize || "1k").toUpperCase();
  const aspectRatio = String(generation.params.aspect_ratio || generation.params.aspectRatio || "1:1");
  const createdTime = formatGenerationTime(generation.createdAt);
  return [
    getModelLabel(generation.modelId, models),
    getRouteLabel(generation.routeKey),
    aspectRatio,
    size,
    createdTime,
  ].filter(Boolean).join(" · ");
}

function formatGenerationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function WorkbenchMobileResultCard({
  generation,
  models,
  onDelete,
  onDownloadOriginal,
  onRegenerate,
  onSelectPreview,
  onSelectResult,
  performanceTracker,
  onUseAsReference,
  results,
  selectedResultId,
}: Props) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const sortedResults = React.useMemo(() => getSortedWorkbenchResults(results), [results]);
  const selected = sortedResults.find((item) => item.id === selectedResultId) ?? sortedResults[0] ?? null;
  const slots = React.useMemo(() => buildWorkbenchFeedSlots(generation, sortedResults), [generation, sortedResults]);
  const mosaicLayout = React.useMemo(
    () => getWorkbenchMosaicLayout(generation, sortedResults, slots.length),
    [generation, sortedResults, slots.length],
  );
  const statusLine = getStatusLine(generation, sortedResults);
  const parameterLine = getParameterLine(generation, models);
  const prompt = generation.prompt.trim() || "未命名创作";

  return (
    <article
      className="relative overflow-visible rounded-[22px] border border-white/8 bg-transparent"
      data-testid="workbench-mobile-creation-feed-card"
    >
      <div className="mb-2 flex items-start justify-between gap-3 px-1">
        <div className="min-w-0">
          <div className="text-[12px] font-bold leading-none text-slate-500">图片生成</div>
          <div className="mt-2 line-clamp-2 text-[15px] font-bold leading-5 text-white">{prompt}</div>
          <div className="mt-1 flex max-w-full items-center gap-1.5 overflow-hidden text-[11px] font-bold leading-none text-slate-500">
            <span className="truncate">{parameterLine}</span>
          </div>
        </div>

        <div className="relative shrink-0">
          <button
            aria-label={`打开结果菜单-${generation.id}`}
            className="grid h-9 w-9 place-items-center rounded-full border border-white/8 bg-white/[0.04] text-slate-300 transition hover:bg-white/[0.10]"
            onClick={() => setMenuOpen((value) => !value)}
            type="button"
          >
            <MoreHorizontal size={15} />
          </button>

          {menuOpen ? (
            <div className="absolute right-0 top-[calc(100%+8px)] z-20 grid min-w-[168px] gap-1 rounded-[16px] border border-white/10 bg-[#11151d] p-2 shadow-[0_20px_40px_rgba(0,0,0,0.45)]">
              {selected ? (
                <>
                  <button
                    className="flex h-10 items-center gap-2 rounded-[12px] px-3 text-left text-[12px] font-bold text-white hover:bg-white/[0.06]"
                    onClick={() => {
                      onDownloadOriginal(selected, generation);
                      setMenuOpen(false);
                    }}
                    type="button"
                  >
                    <Download size={14} />
                    下载原图
                  </button>
                  <button
                    className="flex h-10 items-center gap-2 rounded-[12px] px-3 text-left text-[12px] font-bold text-white hover:bg-white/[0.06]"
                    onClick={() => {
                      onUseAsReference(selected);
                      setMenuOpen(false);
                    }}
                    type="button"
                  >
                    <ImagePlus size={14} />
                    引用参考
                  </button>
                </>
              ) : null}
              <button
                className="flex h-10 items-center gap-2 rounded-[12px] px-3 text-left text-[12px] font-bold text-white hover:bg-white/[0.06]"
                onClick={() => {
                  onRegenerate(generation);
                  setMenuOpen(false);
                }}
                type="button"
              >
                <RotateCcw size={14} />
                重新生成
              </button>
              <button
                className="flex h-10 items-center gap-2 rounded-[12px] px-3 text-left text-[12px] font-bold text-red-100 hover:bg-red-500/14"
                onClick={() => {
                  onDelete(generation.id);
                  setMenuOpen(false);
                }}
                type="button"
              >
                <Trash2 size={14} />
                删除记录
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div
        className={mosaicLayout.containerClassName}
        data-testid={`workbench-mobile-mosaic-${generation.id}`}
      >
        {slots.map((slot) => (
          <div
            className={`relative min-w-0 overflow-hidden bg-[#0d1118] ${mosaicLayout.slotClassNames[slot.index] || mosaicLayout.slotClassNames[0]}`}
            data-testid={`workbench-mobile-feed-slot-${generation.id}`}
            data-slot-index={slot.index}
            id={`workbench-mobile-feed-slot-${generation.id}-${slot.index}`}
            key={`${generation.id}-${slot.index}`}
          >
            {slot.kind === "result" ? (
              <button
                className="block h-full w-full"
                data-testid={`workbench-mobile-thumb-${generation.id}-${slot.result.id}`}
                onClick={() => {
                  onSelectPreview(generation.id, slot.result);
                  onSelectResult(slot.result);
                }}
                type="button"
              >
                {slot.result.previewUrl ? (
                  <img
                    alt={slot.result.originalFilename || "Workbench result"}
                    className={`h-full w-full ${mosaicLayout.imageClassName}`}
                    data-testid={`workbench-mobile-feed-image-${generation.id}-${slot.result.id}`}
                    loading="lazy"
                    onLoad={() => {
                      performanceTracker?.markFirstImageLoadStart(generation.id, slot.result.id, slot.result.assetId);
                      performanceTracker?.markFirstImageLoadEnd(generation.id, slot.result.id, slot.result.assetId);
                      window.requestAnimationFrame(() => {
                        performanceTracker?.markFirstImageVisible(generation.id, slot.result.id, slot.result.assetId);
                      });
                    }}
                    src={slot.result.previewUrl}
                  />
                ) : (
                  <div className="h-full w-full bg-[linear-gradient(135deg,rgba(42,49,68,0.92),rgba(12,14,20,0.98))]" />
                )}
              </button>
            ) : (
              <div
                className={`h-full w-full ${
                  slot.kind === "failed"
                    ? "bg-[linear-gradient(135deg,rgba(95,32,42,0.86),rgba(18,12,16,0.98))]"
                    : "animate-pulse bg-[radial-gradient(circle_at_24%_20%,rgba(255,255,255,0.16),transparent_18%),linear-gradient(135deg,rgba(47,55,78,0.92),rgba(96,73,92,0.58),rgba(18,21,30,0.98))]"
                }`}
                data-testid={
                  slot.kind === "failed"
                    ? `workbench-mobile-feed-failed-slot-${generation.id}`
                    : `workbench-mobile-feed-pending-slot-${generation.id}`
                }
              />
            )}
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-1.5 px-1 text-[11px] font-medium text-slate-500">
        <Clock3 size={12} />
        <span>{statusLine}</span>
      </div>
    </article>
  );
}
