import React from "react";
import { Download, ImagePlus, MoreHorizontal, Trash2 } from "lucide-react";

import type { ImageModelConfig } from "../config/imageModels";
import type { WorkbenchGeneration, WorkbenchResult } from "./workbenchTypes";

type Props = {
  generation: WorkbenchGeneration;
  models: ImageModelConfig[];
  onDelete: (generationId: string) => void;
  onDownloadOriginal: (result: WorkbenchResult) => void;
  onSelectPreview: (generationId: string, result: WorkbenchResult) => void;
  onSelectResult: (result: WorkbenchResult) => void;
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

function getStatusLabel(status: string) {
  switch (status) {
    case "succeeded":
      return "已完成";
    case "failed":
      return "失败";
    case "running":
      return "生成中";
    case "waiting_provider":
      return "等待上游";
    case "queued":
      return "排队中";
    case "pending":
      return "准备中";
    case "canceled":
      return "已取消";
    default:
      return status;
  }
}

function getSummaryChips(generation: WorkbenchGeneration, models: ImageModelConfig[]) {
  const size = String(generation.params.size || generation.params.imageSize || "1k").toUpperCase();
  const aspectRatio = String(generation.params.aspect_ratio || generation.params.aspectRatio || "1:1");
  return [
    `模型 ${getModelLabel(generation.modelId, models)}`,
    `线路 ${getRouteLabel(generation.routeKey)}`,
    `比例 ${aspectRatio}`,
    `尺寸 ${size}`,
    `数量 ${generation.requestedCount}`,
  ];
}

export function WorkbenchMobileResultCard({
  generation,
  models,
  onDelete,
  onDownloadOriginal,
  onSelectPreview,
  onSelectResult,
  onUseAsReference,
  results,
  selectedResultId,
}: Props) {
  const selected = results.find((item) => item.id === selectedResultId) ?? results[0] ?? null;
  const [menuOpen, setMenuOpen] = React.useState(false);
  const isDone = generation.status === "succeeded";
  const summaryChips = getSummaryChips(generation, models);

  return (
    <article
      className={`overflow-hidden rounded-[24px] border backdrop-blur-sm ${
        isDone
          ? "border-white/10 bg-[linear-gradient(180deg,rgba(20,24,34,0.94),rgba(11,14,21,0.98))]"
          : "border-cyan-300/18 bg-[linear-gradient(180deg,rgba(15,25,36,0.94),rgba(10,15,23,0.98))] shadow-[0_0_0_1px_rgba(34,211,238,0.06)]"
      }`}
    >
      <button
        className="flex w-full items-center justify-center bg-[#0b0d12] px-3 pt-3"
        onClick={() => selected && onSelectResult(selected)}
        type="button"
      >
        {selected?.previewUrl ? (
          <img
            alt={selected.originalFilename || "Workbench result"}
            className="max-h-[300px] w-full rounded-[18px] object-contain"
            data-testid={`workbench-mobile-stage-image-${generation.id}`}
            src={selected.previewUrl}
          />
        ) : (
          <div className="grid h-[240px] w-full place-items-center rounded-[18px] border border-dashed border-white/10 text-sm text-slate-500">
            暂无预览
          </div>
        )}
      </button>

      <div className="px-4 pb-4 pt-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-1 text-[10px] font-black tracking-[0.08em] ${
                  isDone ? "bg-emerald-400/12 text-emerald-200" : "bg-cyan-300/12 text-cyan-200"
                }`}
              >
                {getStatusLabel(generation.status)}
              </span>
              {results.length > 1 ? (
                <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[10px] font-black text-slate-300">
                  同批{results.length}张
                </span>
              ) : null}
            </div>
            <div className="mt-2 line-clamp-2 text-[14px] font-bold leading-5 text-white">{generation.prompt}</div>
          </div>

          <div className="relative shrink-0">
            <button
              aria-label={`打开结果菜单-${generation.id}`}
              className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-slate-200 transition hover:bg-white/[0.10]"
              onClick={() => setMenuOpen((value) => !value)}
              type="button"
            >
              <MoreHorizontal size={16} />
            </button>

            {menuOpen ? (
              <div className="absolute right-0 top-[calc(100%+8px)] z-20 grid min-w-[168px] gap-1 rounded-[16px] border border-white/10 bg-[#11151d] p-2 shadow-[0_20px_40px_rgba(0,0,0,0.45)]">
                {selected ? (
                  <>
                    <button
                      className="flex h-10 items-center gap-2 rounded-[12px] px-3 text-left text-[12px] font-bold text-white hover:bg-white/[0.06]"
                      onClick={() => {
                        onDownloadOriginal(selected);
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

        <div className="mt-3 flex flex-wrap gap-2">
          {summaryChips.map((chip) => (
            <span
              className="rounded-full border border-white/8 bg-white/[0.04] px-2.5 py-1 text-[11px] font-bold text-slate-300"
              key={chip}
            >
              {chip}
            </span>
          ))}
        </div>

        {results.length > 1 ? (
          <div className="mt-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[11px] font-black tracking-[0.08em] text-slate-400">批次缩略图</div>
              <div className="text-[11px] text-slate-500">点按切换上方选中图</div>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {results.map((result, index) => (
                <button
                  className={`relative shrink-0 overflow-hidden rounded-[16px] border bg-[#0b0d12] ${
                    result.id === selected?.id
                      ? "border-cyan-300/70 shadow-[0_0_0_1px_rgba(103,232,249,0.28)]"
                      : "border-white/8"
                  }`}
                  data-testid={`workbench-mobile-thumb-${generation.id}-${result.id}`}
                  key={result.id}
                  onClick={() => onSelectPreview(generation.id, result)}
                  type="button"
                >
                  <span className="absolute left-2 top-2 z-10 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] font-black text-white">
                    {index + 1}
                  </span>
                  {result.previewUrl ? (
                    <img
                      alt={result.originalFilename || "Workbench result"}
                      className="h-[86px] w-[86px] object-cover"
                      src={result.previewUrl}
                    />
                  ) : (
                    <div className="grid h-[86px] w-[86px] place-items-center text-[10px] text-slate-500">等待中</div>
                  )}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}
