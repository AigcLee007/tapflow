import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, Expand, LoaderCircle, Plus, Star, X } from "lucide-react";

import {
  favoritePrompt,
  getPrompt,
  getPromptMediaBlob,
  recordPromptInteraction,
  type PromptEntry,
} from "../services/v2PromptsApi";
import { PromptProjectPicker } from "./PromptProjectPicker";
import { copyPromptText, createPromptInsertRequestId, navigate } from "./promptUi";

export function PromptDetailModal({ onClose, promptId }: { onClose: () => void; promptId: string }) {
  const [prompt, setPrompt] = useState<PromptEntry | null>(null);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [failedMediaIds, setFailedMediaIds] = useState<string[]>([]);
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPrompt(null);
    setImageUrls({});
    setFailedMediaIds([]);
    setSelectedMediaId(null);
    setZoomOpen(false);
    void getPrompt(promptId)
      .then((entry) => {
        if (!cancelled) setPrompt(entry);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "提示词加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [promptId]);

  useEffect(() => {
    if (!prompt) return undefined;
    setSelectedMediaId(prompt.media[0]?.id ?? null);
    if (prompt.media.length === 0) {
      setMediaLoading(false);
      return undefined;
    }

    let active = true;
    const createdUrls: string[] = [];
    setMediaLoading(true);
    void Promise.all(prompt.media.map(async (media) => {
      try {
        const blob = await getPromptMediaBlob(media.id);
        const url = URL.createObjectURL(blob);
        if (!active) {
          URL.revokeObjectURL(url);
          return { failed: false, id: media.id, url: null };
        }
        createdUrls.push(url);
        return { failed: false, id: media.id, url };
      } catch {
        return { failed: true, id: media.id, url: null };
      }
    })).then((results) => {
      if (!active) return;
      setImageUrls(Object.fromEntries(results.flatMap((item) => item.url ? [[item.id, item.url]] : [])));
      setFailedMediaIds(results.filter((item) => item.failed).map((item) => item.id));
      setMediaLoading(false);
    });

    return () => {
      active = false;
      createdUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [prompt]);

  useEffect(() => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (zoomOpen) {
        setZoomOpen(false);
        return;
      }
      if (!projectPickerOpen) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, projectPickerOpen, zoomOpen]);

  const trapFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const container = dialogRef.current;
    if (!container) return;
    const focusable = Array.from(container.querySelectorAll<HTMLElement>(
      "button:not([disabled]), summary, input:not([disabled]), [tabindex]:not([tabindex='-1'])",
    ));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleCopy = async () => {
    if (!prompt) return;
    try {
      await copyPromptText(prompt);
      setFeedback("已复制提示词");
      void recordPromptInteraction(prompt.id, { eventType: "copy" }).catch(() => undefined);
    } catch (reason) {
      setFeedback(reason instanceof Error ? `${reason.message}，请手动复制。` : "复制失败，请手动复制。");
    }
  };

  const toggleFavorite = () => {
    if (!prompt) return;
    const next = !prompt.isFavorite;
    setPrompt({ ...prompt, isFavorite: next });
    void favoritePrompt(prompt.id, next).catch((reason) => {
      setPrompt((current) => current ? { ...current, isFavorite: !next } : current);
      setFeedback(reason instanceof Error ? reason.message : "收藏更新失败");
    });
  };

  const handleProjectSelect = (projectId: string) => {
    if (!prompt) return;
    void recordPromptInteraction(prompt.id, { eventType: "reference", projectId }).catch(() => undefined);
    const params = new URLSearchParams({
      insertPromptId: prompt.id,
      promptInsertRequestId: createPromptInsertRequestId(),
    });
    navigate(`/projects/${encodeURIComponent(projectId)}?${params.toString()}`);
  };

  const selectedMedia = prompt?.media.find((item) => item.id === selectedMediaId) ?? prompt?.media[0] ?? null;
  const selectedUrl = selectedMedia ? imageUrls[selectedMedia.id] : null;
  const selectedFailed = selectedMedia ? failedMediaIds.includes(selectedMedia.id) : false;

  const modal = (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-0 backdrop-blur-sm sm:p-5"
      data-testid="prompt-detail-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-modal="true"
        className="relative flex h-full max-h-full w-full max-w-[1280px] flex-col overflow-hidden rounded-none border border-white/10 bg-[#101319] shadow-[0_24px_80px_rgba(0,0,0,0.65)] sm:h-auto sm:max-h-[92vh] sm:rounded-lg"
        onKeyDown={trapFocus}
        role="dialog"
      >
        <header className="z-10 flex shrink-0 items-start justify-between gap-4 border-b border-white/10 bg-[#11151c]/95 px-4 py-3 backdrop-blur sm:px-5 sm:py-4">
          <div className="min-w-0">
            <h1 className="break-words text-base font-bold text-white sm:text-xl" id={titleId}>
              {prompt?.title ?? "提示词详情"}
            </h1>
            {prompt ? (
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-semibold text-slate-400 sm:text-[11px]">
                <span className="text-cyan-100">官方精选 · {prompt.category}</span>
                {prompt.tags.map((tag) => <span className="rounded bg-white/[0.07] px-1.5 py-0.5 text-slate-300" key={tag}>{tag}</span>)}
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {prompt ? (
              <button
                aria-label="收藏"
                className="grid h-9 w-9 place-items-center rounded border border-white/10 text-slate-300 hover:bg-amber-300/10 hover:text-amber-200"
                onClick={toggleFavorite}
                title={prompt.isFavorite ? "取消收藏" : "收藏"}
                type="button"
              >
                <Star fill={prompt.isFavorite ? "currentColor" : "none"} size={17} />
              </button>
            ) : null}
            <button
              ref={closeButtonRef}
              aria-label="关闭提示词详情"
              className="grid h-9 w-9 place-items-center rounded text-slate-300 hover:bg-white/[0.08] hover:text-white"
              onClick={onClose}
              title="关闭"
              type="button"
            >
              <X size={19} />
            </button>
          </div>
        </header>

        {loading ? (
          <div className="grid min-h-80 flex-1 place-items-center text-slate-400">
            <LoaderCircle className="animate-spin" size={24} />
          </div>
        ) : error || !prompt ? (
          <div className="grid min-h-80 flex-1 place-items-center p-6">
            <div className="max-w-md rounded border border-rose-400/25 bg-rose-400/10 p-4 text-center text-sm text-rose-100">
              <p>{error || "未找到提示词"}</p>
              <button className="mt-4 h-9 rounded border border-rose-200/20 px-3 text-xs font-bold" onClick={onClose} type="button">关闭</button>
            </div>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[72px] lg:grid-cols-[minmax(0,1.62fr)_minmax(340px,1fr)] lg:pb-0">
            <section className="min-w-0 bg-[#0b0e13] p-3 sm:p-5" aria-label="效果图">
              {!selectedMedia ? (
                <div className="grid min-h-72 place-items-center rounded border border-dashed border-white/10 bg-[#151922] text-sm text-slate-500">暂无效果图</div>
              ) : mediaLoading && !selectedUrl ? (
                <div className="grid min-h-72 place-items-center rounded border border-white/10 bg-[#151922] text-sm text-slate-500">正在加载效果图...</div>
              ) : selectedFailed || !selectedUrl ? (
                <div className="grid min-h-72 place-items-center rounded border border-white/10 bg-[#151922] text-sm text-slate-500">图片加载失败</div>
              ) : (
                <button
                  aria-label="放大效果图"
                  className="group relative block w-full overflow-hidden rounded border border-white/10 bg-black/30 text-left"
                  onClick={() => setZoomOpen(true)}
                  title="放大效果图"
                  type="button"
                >
                  <img
                    alt={selectedMedia.altText || ""}
                    className="block h-auto w-full"
                    data-testid="prompt-detail-main-image"
                    src={selectedUrl}
                  />
                  <span className="pointer-events-none absolute right-3 top-3 grid h-8 w-8 place-items-center rounded bg-black/65 text-white opacity-80 transition group-hover:opacity-100"><Expand size={16} /></span>
                </button>
              )}

              {prompt.media.length > 1 ? (
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1" data-testid="prompt-detail-thumbnails">
                  {prompt.media.map((item, index) => {
                    const url = imageUrls[item.id];
                    const failed = failedMediaIds.includes(item.id);
                    const selected = item.id === selectedMedia?.id;
                    return (
                      <button
                        aria-label={`查看效果图 ${index + 1}`}
                        className={`grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded border bg-[#151922] ${selected ? "border-cyan-300 ring-1 ring-cyan-300/50" : "border-white/10"}`}
                        key={item.id}
                        onClick={() => setSelectedMediaId(item.id)}
                        type="button"
                      >
                        {url ? <img alt="" className="h-full w-full object-contain" src={url} /> : <span className="px-1 text-[9px] text-slate-500">{failed ? "加载失败" : "加载中"}</span>}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </section>

            <aside className="flex min-h-0 flex-col border-t border-white/10 bg-[#141821] lg:sticky lg:top-0 lg:max-h-[calc(92vh-73px)] lg:border-l lg:border-t-0">
              <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
                {prompt.description ? <p className="text-sm leading-6 text-slate-400">{prompt.description}</p> : null}
                <div className="mt-5 text-[11px] font-bold text-slate-400">主提示词</div>
                <pre className="mt-2 max-h-[42vh] overflow-y-auto whitespace-pre-wrap rounded border border-white/8 bg-[#0e1117] p-3 text-[12px] leading-5 text-slate-100">{prompt.promptText}</pre>
                {prompt.negativePrompt ? (
                  <details className="mt-3 text-sm text-slate-400">
                    <summary className="cursor-pointer">参考负面提示词</summary>
                    <pre className="mt-2 whitespace-pre-wrap rounded border border-white/8 bg-[#0e1117] p-3 text-[11px] leading-5">{prompt.negativePrompt}</pre>
                  </details>
                ) : null}
                {feedback ? <div className="mt-3 rounded border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs text-cyan-50" role="status">{feedback}</div> : null}
              </div>
              <footer className="fixed inset-x-0 bottom-0 z-20 grid shrink-0 grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-2 border-t border-white/10 bg-[#141821]/95 p-3 backdrop-blur sm:p-4 lg:sticky lg:inset-x-auto">
                <button className="inline-flex h-10 min-w-0 items-center justify-center gap-1 rounded border border-white/10 px-2 text-[12px] font-bold text-slate-200 hover:bg-white/[0.07]" onClick={() => void handleCopy()} type="button"><Copy size={15} /> 复制提示词</button>
                <button className="inline-flex h-10 min-w-0 items-center justify-center gap-1 rounded bg-cyan-400 px-2 text-[12px] font-bold text-slate-950 hover:bg-cyan-200" onClick={() => setProjectPickerOpen(true)} type="button"><Plus size={16} /> 引用到画布</button>
              </footer>
            </aside>
          </div>
        )}
      </div>

      {zoomOpen && selectedUrl ? (
        <div
          aria-label="效果图放大预览"
          aria-modal="true"
          className="fixed inset-0 z-[130] grid place-items-center overflow-auto bg-black/90 p-4"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setZoomOpen(false);
          }}
          role="dialog"
        >
          <button aria-label="关闭效果图预览" className="fixed right-4 top-4 grid h-10 w-10 place-items-center rounded bg-black/70 text-white hover:bg-black" onClick={() => setZoomOpen(false)} title="关闭" type="button"><X size={20} /></button>
          <img alt={selectedMedia?.altText || ""} className="h-auto max-w-full" src={selectedUrl} />
        </div>
      ) : null}

      {projectPickerOpen ? <PromptProjectPicker onClose={() => setProjectPickerOpen(false)} onSelect={(project) => handleProjectSelect(project.id)} /> : null}
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : modal;
}
