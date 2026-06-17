import React from "react";
import { Download, Send, X } from "lucide-react";

import type { WorkbenchResult } from "./workbenchTypes";

type Props = {
  onClose: () => void;
  onSendToProject: (result: WorkbenchResult) => void;
  result: WorkbenchResult | null;
};

export function WorkbenchResultSheet({ onClose, onSendToProject, result }: Props) {
  if (!result) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button aria-label="关闭结果详情" className="absolute inset-0 bg-black/55" onClick={onClose} type="button" />
      <section className="absolute bottom-0 left-0 right-0 rounded-t-[26px] border border-white/10 bg-[#101014] p-4 text-white shadow-[0_-22px_70px_rgba(0,0,0,0.6)] md:left-auto md:right-8 md:top-24 md:w-[380px] md:rounded-[22px]">
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold">结果详情</div>
          <button className="grid h-9 w-9 place-items-center rounded-full bg-white/[0.08]" onClick={onClose} type="button" aria-label="关闭">
            <X size={16} />
          </button>
        </div>
        <div className="mt-4 overflow-hidden rounded-2xl bg-black/30">
          {result.previewUrl ? (
            <img
              alt={result.originalFilename || "Workbench result"}
              className="aspect-square w-full object-cover"
              src={result.previewUrl}
            />
          ) : (
            <div className="grid aspect-square place-items-center text-sm text-slate-500">暂无预览</div>
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <a
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white/[0.08] text-sm font-bold"
            href={result.downloadUrl || result.previewUrl || "#"}
            rel="noreferrer"
            target="_blank"
          >
            <Download size={16} />
            下载
          </a>
          <button className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white text-sm font-black text-black" onClick={() => onSendToProject(result)} type="button">
            <Send size={16} />
            发送到画布
          </button>
        </div>
      </section>
    </div>
  );
}
