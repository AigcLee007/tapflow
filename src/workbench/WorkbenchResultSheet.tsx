import React from "react";
import { Download, Send, X } from "lucide-react";

import { getAssetVariantUrl } from "../assets/assetApi";
import type { WorkbenchResult } from "./workbenchTypes";

type Props = {
  onClose: () => void;
  onSendToProject: (result: WorkbenchResult) => void;
  result: WorkbenchResult | null;
};

export function WorkbenchResultSheet({ onClose, onSendToProject, result }: Props) {
  const [originalUrl, setOriginalUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    setOriginalUrl(null);
    if (!result || !result.assetId) return;
    let active = true;
    void getAssetVariantUrl(result.assetId)
      .then((signed) => {
        if (!active) return;
        setOriginalUrl(signed.url);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [result]);

  if (!result) return null;

  const imageUrl = originalUrl || result.downloadUrl || result.previewUrl;

  return (
    <div className="fixed inset-0 z-50 bg-black/92 text-white" data-testid="workbench-result-fullscreen">
      <button aria-label="关闭结果详情" className="absolute inset-0 cursor-zoom-out" onClick={onClose} type="button" />
      <section className="relative z-10 flex h-full w-full flex-col overflow-hidden px-4 py-3 md:px-6 md:py-4">
        <div className="flex h-14 shrink-0 items-center justify-between gap-3">
          <div className="text-base font-black">结果详情</div>
          <button
            aria-label="关闭"
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
            <img
              alt={result.originalFilename || "Workbench result"}
              className="block h-auto max-h-[calc(100vh-168px)] w-auto max-w-[calc(100vw-48px)] rounded-[18px] object-contain shadow-[0_28px_90px_rgba(0,0,0,0.55)]"
              data-testid="workbench-result-fullscreen-image"
              src={imageUrl}
            />
          ) : (
            <div className="grid h-full min-h-[360px] w-full place-items-center rounded-[22px] border border-dashed border-white/10 bg-white/[0.04] text-sm text-slate-400">
              暂无预览
            </div>
          )}
        </div>

        <div className="relative z-10 mx-auto grid h-16 w-full max-w-[520px] shrink-0 grid-cols-2 items-center gap-3">
          <a
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white/[0.10] text-sm font-bold text-white transition hover:bg-white/[0.16]"
            href={result.downloadUrl || imageUrl || "#"}
            rel="noreferrer"
            target="_blank"
          >
            <Download size={16} />
            下载
          </a>
          <button
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white text-sm font-black text-black transition hover:bg-slate-100"
            onClick={() => onSendToProject(result)}
            type="button"
          >
            <Send size={16} />
            发送到画布
          </button>
        </div>
      </section>
    </div>
  );
}
