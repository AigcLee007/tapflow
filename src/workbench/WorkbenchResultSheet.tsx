import React from "react";
import { ChevronLeft, ChevronRight, Download, Send, X } from "lucide-react";

import { getAssetVariantUrl } from "../assets/assetApi";
import type { WorkbenchResult } from "./workbenchTypes";

type Props = {
  batchResults?: WorkbenchResult[];
  onClose: () => void;
  onSendToProject: (result: WorkbenchResult) => void;
  result: WorkbenchResult | null;
};

export function WorkbenchResultSheet({ batchResults = [], onClose, onSendToProject, result }: Props) {
  const availableBatchResults = React.useMemo(
    () => batchResults.filter((item) => item.assetId || item.downloadUrl || item.previewUrl),
    [batchResults],
  );
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [originalUrl, setOriginalUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!result) {
      setActiveIndex(0);
      return;
    }
    const nextIndex = availableBatchResults.findIndex((item) => item.id === result.id);
    setActiveIndex(nextIndex >= 0 ? nextIndex : 0);
  }, [availableBatchResults, result]);

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
    setActiveIndex((current) => (current - 1 + availableBatchResults.length) % availableBatchResults.length);
  };

  const goNext = () => {
    setActiveIndex((current) => (current + 1) % availableBatchResults.length);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/92 text-white" data-testid="workbench-result-fullscreen">
      <button
        aria-label="Close result preview"
        className="absolute inset-0 cursor-zoom-out"
        onClick={onClose}
        type="button"
      />

      <section className="relative z-10 flex h-full w-full flex-col overflow-hidden px-4 py-3 md:px-6 md:py-4">
        <div className="flex h-14 shrink-0 items-center justify-between gap-3">
          <div>
            <div className="text-base font-black">Result Preview</div>
            {canNavigateBatch ? (
              <div className="mt-1 text-[12px] text-slate-400">
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
            <div className="relative flex items-center justify-center">
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
                className="block h-auto max-h-[calc(100vh-168px)] w-auto max-w-[calc(100vw-48px)] rounded-[18px] object-contain shadow-[0_28px_90px_rgba(0,0,0,0.55)]"
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

        <div className="relative z-10 mx-auto flex w-full max-w-[620px] shrink-0 flex-col gap-3 pb-safe">
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
                    onClick={() => setActiveIndex(index)}
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

          <div className="grid h-16 w-full grid-cols-2 items-center gap-3">
            <a
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white/[0.10] text-sm font-bold text-white transition hover:bg-white/[0.16]"
              href={activeResult.downloadUrl || imageUrl || "#"}
              rel="noreferrer"
              target="_blank"
            >
              <Download size={16} />
              Download
            </a>
            <button
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white text-sm font-black text-black transition hover:bg-slate-100"
              onClick={() => onSendToProject(activeResult)}
              type="button"
            >
              <Send size={16} />
              Send To Canvas
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
