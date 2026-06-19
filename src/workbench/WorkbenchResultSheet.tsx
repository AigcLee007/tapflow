import React from "react";
import { ChevronLeft, ChevronRight, Download, ImagePlus, RotateCcw, X } from "lucide-react";

import { getAssetVariantUrl } from "../assets/assetApi";
import type { WorkbenchResult } from "./workbenchTypes";

type Props = {
  batchResults?: WorkbenchResult[];
  onClose: () => void;
  onDownloadOriginal: (result: WorkbenchResult) => void;
  onRegenerate: () => void;
  onUseAsReference: (result: WorkbenchResult) => void;
  result: WorkbenchResult | null;
  selectedResultId?: string | null;
};

export function WorkbenchResultSheet({
  batchResults = [],
  onClose,
  onDownloadOriginal,
  onRegenerate,
  onUseAsReference,
  result,
  selectedResultId = null,
}: Props) {
  const availableBatchResults = React.useMemo(
    () => batchResults.filter((item) => item.assetId || item.downloadUrl || item.previewUrl),
    [batchResults],
  );
  const [activeResultId, setActiveResultId] = React.useState<string | null>(selectedResultId ?? result?.id ?? null);
  const [originalUrl, setOriginalUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!result) {
      setActiveResultId(null);
      return;
    }
    setActiveResultId(selectedResultId ?? result.id);
  }, [result, selectedResultId]);

  const activeIndex = React.useMemo(() => {
    if (!availableBatchResults.length) return -1;
    if (!activeResultId) return 0;
    return availableBatchResults.findIndex((item) => item.id === activeResultId);
  }, [activeResultId, availableBatchResults]);
  const activeResult = availableBatchResults[activeIndex] ?? result;

  React.useEffect(() => {
    setOriginalUrl(null);
    if (!activeResult || !activeResult.assetId) return;
    let active = true;
    void getAssetVariantUrl(activeResult.assetId)
      .then((signed) => {
        if (!active) return;
        setOriginalUrl(signed.url);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [activeResult]);

  if (!activeResult) return null;

  const imageUrl = originalUrl || activeResult.downloadUrl || activeResult.previewUrl;
  const canNavigateBatch = availableBatchResults.length > 1;

  const goPrev = () => {
    if (!availableBatchResults.length) return;
    const nextIndex =
      activeIndex >= 0
        ? (activeIndex - 1 + availableBatchResults.length) % availableBatchResults.length
        : availableBatchResults.length - 1;
    setActiveResultId(availableBatchResults[nextIndex]?.id ?? null);
  };

  const goNext = () => {
    if (!availableBatchResults.length) return;
    const nextIndex = activeIndex >= 0 ? (activeIndex + 1) % availableBatchResults.length : 0;
    setActiveResultId(availableBatchResults[nextIndex]?.id ?? null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black text-white" data-testid="workbench-result-fullscreen">
      <button
        aria-label="Close result preview"
        className="absolute inset-0 cursor-zoom-out"
        onClick={onClose}
        type="button"
      />

      <section className="relative z-10 flex h-full w-full flex-col overflow-hidden px-4 py-3 md:px-6 md:py-4">
        <div className="flex h-14 shrink-0 items-center justify-between gap-3">
          <div>
            <div className="text-base font-black">结果预览</div>
            {canNavigateBatch ? (
              <div className="mt-1 text-[12px] text-slate-400" data-testid="workbench-result-fullscreen-counter">
                {activeIndex + 1} / {availableBatchResults.length}
              </div>
            ) : null}
          </div>
          <button
            aria-label="Close"
            className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/[0.10] text-white transition hover:bg-white/[0.18]"
            onClick={onClose}
            type="button"
          >
            <X size={16} />
          </button>
        </div>

        <div
          className="relative z-10 grid min-h-0 flex-1 place-items-center overflow-hidden px-0 py-2 md:px-6"
          data-testid="workbench-result-fullscreen-stage"
        >
          {imageUrl ? (
            <div className="relative flex h-[calc(100dvh-240px)] w-[calc(100vw-48px)] items-center justify-center md:h-[calc(100vh-220px)] md:w-[calc(100vw-160px)]">
              {canNavigateBatch ? (
                <button
                  aria-label="Previous image"
                  className="absolute left-0 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-black/46 text-white transition hover:bg-black/70 md:left-4"
                  data-testid="workbench-result-fullscreen-prev"
                  onClick={goPrev}
                  type="button"
                >
                  <ChevronLeft size={18} />
                </button>
              ) : null}

              <img
                alt={activeResult.originalFilename || "Workbench result"}
                className="block h-full w-full rounded-[18px] object-contain shadow-[0_28px_90px_rgba(0,0,0,0.55)]"
                data-testid="workbench-result-fullscreen-image"
                src={imageUrl}
              />

              {canNavigateBatch ? (
                <button
                  aria-label="Next image"
                  className="absolute right-0 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-black/46 text-white transition hover:bg-black/70 md:right-4"
                  data-testid="workbench-result-fullscreen-next"
                  onClick={goNext}
                  type="button"
                >
                  <ChevronRight size={18} />
                </button>
              ) : null}
            </div>
          ) : (
            <div className="grid h-full min-h-[360px] w-full place-items-center rounded-[22px] border border-dashed border-white/10 bg-white/[0.04] text-sm text-slate-400">
              Preview unavailable
            </div>
          )}
        </div>

        <div
          className="relative z-10 mx-auto flex w-full max-w-[620px] shrink-0 flex-col gap-3 rounded-t-[28px] bg-black/88 pb-[calc(env(safe-area-inset-bottom,0px)+88px)] pt-3 backdrop-blur-xl md:pb-safe"
          data-testid="workbench-result-fullscreen-actions"
        >
          {canNavigateBatch ? (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {availableBatchResults.map((item, index) => {
                const thumbUrl = item.previewUrl || item.downloadUrl || (item.id === activeResult.id ? imageUrl : null);
                const selected = item.id === activeResult.id;
                return (
                  <button
                    aria-label={`Preview image ${index + 1}`}
                    className={`relative shrink-0 overflow-hidden rounded-[14px] border transition ${
                      selected
                        ? "border-cyan-300/70 shadow-[0_0_0_1px_rgba(103,232,249,0.28)]"
                        : "border-white/10 opacity-80 hover:opacity-100"
                    }`}
                    key={item.id}
                    onClick={() => setActiveResultId(item.id)}
                    type="button"
                  >
                    {thumbUrl ? (
                      <img
                        alt={item.originalFilename || `Batch image ${index + 1}`}
                        className="h-[60px] w-[60px] object-cover"
                        src={thumbUrl}
                      />
                    ) : (
                      <div className="grid h-[60px] w-[60px] place-items-center bg-white/[0.04] text-[11px] text-slate-400">
                        {index + 1}
                      </div>
                    )}
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2 pb-1 pt-4 text-left text-[10px] font-black text-white">
                      {index + 1}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="grid h-14 w-full grid-cols-3 items-center gap-2 px-1">
            <button
              className="inline-flex h-12 items-center justify-center gap-1.5 rounded-full bg-white/[0.10] px-2 text-[12px] font-bold text-white transition hover:bg-white/[0.16]"
              onClick={() => onDownloadOriginal(activeResult)}
              type="button"
            >
              <Download size={16} />
              下载原图
            </button>
            <button
              className="inline-flex h-12 items-center justify-center gap-1.5 rounded-full bg-white/[0.10] px-2 text-[12px] font-bold text-white transition hover:bg-white/[0.16]"
              onClick={() => onUseAsReference(activeResult)}
              type="button"
            >
              <ImagePlus size={16} />
              引用参考
            </button>
            <button
              className="inline-flex h-12 items-center justify-center gap-1.5 rounded-full bg-white px-2 text-[12px] font-black text-black transition hover:bg-slate-100"
              onClick={onRegenerate}
              type="button"
            >
              <RotateCcw size={16} />
              重新生成
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
