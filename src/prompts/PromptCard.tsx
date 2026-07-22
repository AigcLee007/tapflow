import React from "react";
import { Copy, Image as ImageIcon, Plus, Star } from "lucide-react";

import type { PromptEntry } from "../services/v2PromptsApi";

export function PromptCard({
  compact = false,
  imageUrl,
  onCopy,
  onFavorite,
  onOpen,
  onReference,
  prompt,
}: {
  compact?: boolean;
  imageUrl?: string | null;
  onCopy: (prompt: PromptEntry) => void;
  onFavorite: (prompt: PromptEntry) => void;
  onOpen: (prompt: PromptEntry) => void;
  onReference: (prompt: PromptEntry) => void;
  prompt: PromptEntry;
}) {
  const tags = prompt.tags.slice(0, compact ? 1 : 3);
  const stop = (event: React.MouseEvent) => event.stopPropagation();

  return (
    <article className="group overflow-hidden rounded border border-white/10 bg-white/[0.035] text-left transition hover:border-white/20 hover:bg-white/[0.06]">
      <button
        aria-label={`查看提示词 ${prompt.title}`}
        className="block w-full text-left"
        onClick={() => onOpen(prompt)}
        type="button"
      >
        <div className={`relative overflow-hidden bg-[#151922] ${compact || !imageUrl ? "aspect-[4/3]" : ""}`}>
          {imageUrl ? (
            <img
              alt=""
              className={compact ? "h-full w-full object-cover" : "block h-auto w-full"}
              decoding="async"
              loading="lazy"
              src={imageUrl}
            />
          ) : (
            <div className="grid h-full place-items-center text-slate-600">
              <ImageIcon size={compact ? 18 : 26} />
            </div>
          )}
          <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-1 text-[10px] font-semibold text-slate-100">
            {prompt.category}
          </span>
        </div>
        <div className={compact ? "p-2" : "p-3"}>
          <div className="truncate text-[13px] font-bold text-white">{prompt.title}</div>
          {compact ? null : <div className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-400">{prompt.description || prompt.promptText}</div>}
          <div className="mt-2 flex min-h-4 flex-wrap gap-1">
            {tags.map((tag) => (
              <span className="rounded bg-white/[0.07] px-1.5 py-0.5 text-[9px] font-semibold leading-3 text-slate-300" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      </button>
      <div className={compact ? "grid grid-cols-[30px_30px_1fr] gap-1 border-t border-white/8 p-2" : "grid grid-cols-[34px_34px_1fr] gap-1 border-t border-white/8 p-2"}>
        <button
          aria-label="收藏"
          className={`grid place-items-center rounded border border-white/10 text-slate-300 transition hover:border-amber-200/50 hover:bg-amber-300/10 hover:text-amber-200 ${compact ? "h-[30px] w-[30px]" : "h-[34px] w-[34px]"}`}
          onClick={(event) => {
            stop(event);
            onFavorite(prompt);
          }}
          title={prompt.isFavorite ? "取消收藏" : "收藏"}
          type="button"
        >
          <Star fill={prompt.isFavorite ? "currentColor" : "none"} size={compact ? 14 : 16} />
        </button>
        <button
          aria-label="复制提示词"
          className={`grid place-items-center rounded border border-white/10 text-slate-300 transition hover:border-cyan-200/50 hover:bg-cyan-300/10 hover:text-cyan-100 ${compact ? "h-[30px] w-[30px]" : "h-[34px] w-[34px]"}`}
          onClick={(event) => {
            stop(event);
            onCopy(prompt);
          }}
          title="复制提示词"
          type="button"
        >
          <Copy size={compact ? 14 : 16} />
        </button>
        <button
          aria-label="引用到画布"
          className={`inline-flex items-center justify-center gap-1 rounded bg-cyan-500 px-2 text-[11px] font-bold text-slate-950 transition hover:bg-cyan-300 ${compact ? "h-[30px]" : "h-[34px]"}`}
          onClick={(event) => {
            stop(event);
            onReference(prompt);
          }}
          type="button"
        >
          <Plus size={compact ? 14 : 16} />
          引用
        </button>
      </div>
    </article>
  );
}
