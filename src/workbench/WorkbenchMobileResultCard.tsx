import React from "react";
import { Download, ImagePlus, MoreHorizontal, Trash2 } from "lucide-react";

import type { ImageModelConfig } from "../config/imageModels";
import type { WorkbenchGeneration, WorkbenchResult } from "./workbenchTypes";

type Props = {
  generation: WorkbenchGeneration;
  models: ImageModelConfig[];
  onDelete: (generationId: string) => void;
  onDownloadOriginal: (result: WorkbenchResult) => void;
  onSelectResult: (result: WorkbenchResult) => void;
  onUseAsReference: (result: WorkbenchResult) => void;
  results: WorkbenchResult[];
  selectedResultId?: string | null;
};

function getModelLabel(modelId: string, models: ImageModelConfig[]) {
  return models.find((model) => model.id === modelId)?.label || modelId;
}

function getCreatorSummary(generation: WorkbenchGeneration, models: ImageModelConfig[]) {
  const size = String(generation.params.size || generation.params.imageSize || "1k").toUpperCase();
  const aspectRatio = String(generation.params.aspect_ratio || generation.params.aspectRatio || "1:1");
  return `${getModelLabel(generation.modelId, models)} · ${aspectRatio} · ${size} · ${generation.requestedCount}张`;
}

export function WorkbenchMobileResultCard({
  generation,
  models,
  onDelete,
  onDownloadOriginal,
  onSelectResult,
  onUseAsReference,
  results,
  selectedResultId,
}: Props) {
  const selected = results.find((item) => item.id === selectedResultId) ?? results[0] ?? null;
  const [menuOpen, setMenuOpen] = React.useState(false);

  return (
    <article className="overflow-hidden rounded-[22px] border border-white/8 bg-white/[0.04]">
      <button
        className="flex w-full items-center justify-center bg-[#0b0d12] px-3 py-3"
        onClick={() => selected && onSelectResult(selected)}
        type="button"
      >
        {selected?.previewUrl ? (
          <img
            alt={selected.originalFilename || "Workbench result"}
            className="max-h-[248px] w-full rounded-[16px] object-contain"
            src={selected.previewUrl}
          />
        ) : (
          <div className="grid h-[220px] w-full place-items-center rounded-[16px] border border-dashed border-white/10 text-sm text-slate-500">
            暂无预览
          </div>
        )}
      </button>

      <div className="px-4 pb-4 pt-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="line-clamp-2 text-[14px] font-bold leading-5 text-white">{generation.prompt}</div>
            <div className="mt-2 text-[11px] text-slate-400">{getCreatorSummary(generation, models)}</div>
          </div>
          <div className="relative">
            <button
              aria-label={`打开结果菜单-${generation.id}`}
              className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-slate-200"
              onClick={() => setMenuOpen((value) => !value)}
              type="button"
            >
              <MoreHorizontal size={16} />
            </button>
            {menuOpen ? (
              <div className="absolute right-0 top-[calc(100%+8px)] z-20 grid min-w-[146px] gap-1 rounded-[16px] border border-white/10 bg-[#11151d] p-2 shadow-[0_20px_40px_rgba(0,0,0,0.45)]">
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

        {results.length > 1 ? (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {results.map((result, index) => (
              <button
                className={`relative shrink-0 overflow-hidden rounded-[14px] border ${
                  result.id === selected?.id ? "border-cyan-300/70" : "border-white/8"
                } bg-[#0b0d12]`}
                key={result.id}
                onClick={() => onSelectResult(result)}
                type="button"
              >
                <span className="absolute left-2 top-2 z-10 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] font-black text-white">
                  {index + 1}
                </span>
                {result.previewUrl ? (
                  <img
                    alt={result.originalFilename || "Workbench result"}
                    className="h-[76px] w-[76px] object-cover"
                    src={result.previewUrl}
                  />
                ) : (
                  <div className="grid h-[76px] w-[76px] place-items-center text-[10px] text-slate-500">等待中</div>
                )}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}
