import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Copy, LoaderCircle, Plus, Star } from "lucide-react";

import { favoritePrompt, getPrompt, getPromptMediaBlob, recordPromptInteraction, type PromptEntry } from "../services/v2PromptsApi";
import { PromptProjectPicker } from "./PromptProjectPicker";
import { copyPromptText, createPromptInsertRequestId, navigate } from "./promptUi";

export function PromptDetailPage({ promptId }: { promptId: string }) {
  const [prompt, setPrompt] = useState<PromptEntry | null>(null);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const returnUrl = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const query = new URLSearchParams();
    if (params.get("q")) query.set("q", params.get("q")!);
    if (params.get("category")) query.set("category", params.get("category")!);
    if (params.get("view")) query.set("view", params.get("view")!);
    return `/prompts${query.toString() ? `?${query.toString()}` : ""}`;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
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
    if (!prompt) return;
    let cancelled = false;
    void Promise.all(prompt.media.map(async (media) => {
      try {
        const result = await getPromptMediaBlob(media.id);
        return [media.id, URL.createObjectURL(result)] as const;
      } catch {
        return null;
      }
    })).then((resolved) => {
      if (!cancelled) setImageUrls(Object.fromEntries(resolved.filter((item): item is readonly [string, string] => item !== null)));
    });
    return () => {
      cancelled = true;
    };
  }, [prompt]);

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
    const params = new URLSearchParams({ insertPromptId: prompt.id, promptInsertRequestId: createPromptInsertRequestId() });
    navigate(`/projects/${encodeURIComponent(projectId)}?${params.toString()}`);
  };

  if (loading) return <div className="grid min-h-[calc(100vh-92px)] place-items-center bg-[#0b0d12] text-slate-400"><LoaderCircle className="animate-spin" size={24} /></div>;
  if (error || !prompt) return <div className="m-6 rounded border border-rose-400/25 bg-rose-400/10 p-4 text-rose-100">{error || "未找到提示词"}</div>;

  return (
    <section className="min-h-[calc(100vh-92px)] bg-[#0b0d12] px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-[1500px]">
        <button className="inline-flex h-9 items-center gap-2 rounded px-2 text-sm font-bold text-slate-300 hover:bg-white/[0.07] hover:text-white" onClick={() => navigate(returnUrl)} type="button"><ArrowLeft size={16} /> 返回提示词广场</button>
        <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_380px]">
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((index) => {
              const media = prompt.media[index];
              const src = media ? imageUrls[media.id] : null;
              return <div className="aspect-square overflow-hidden rounded border border-white/10 bg-[#151922]" key={media?.id ?? `placeholder-${index}`}>
                {src ? <img alt={media?.altText || ""} className="h-full w-full object-cover" src={src} /> : <div className="grid h-full place-items-center text-xs text-slate-600">{media ? "效果图加载失败" : "暂无效果图"}</div>}
              </div>;
            })}
          </div>
          <aside className="h-fit rounded border border-white/10 bg-[#141821] p-4 xl:sticky xl:top-28">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><h1 className="text-xl font-bold text-white">{prompt.title}</h1><div className="mt-1 text-[11px] font-semibold text-cyan-100">官方精选 · {prompt.category}</div></div>
              <button aria-label="收藏" className="grid h-9 w-9 place-items-center rounded border border-white/10 text-slate-300 hover:bg-amber-300/10 hover:text-amber-200" onClick={toggleFavorite} title={prompt.isFavorite ? "取消收藏" : "收藏"} type="button"><Star fill={prompt.isFavorite ? "currentColor" : "none"} size={17} /></button>
            </div>
            <div className="mt-3 flex flex-wrap gap-1">{prompt.tags.map((tag) => <span className="rounded bg-white/[0.07] px-2 py-1 text-[10px] font-bold text-slate-300" key={tag}>{tag}</span>)}</div>
            {prompt.description ? <p className="mt-4 text-sm leading-6 text-slate-400">{prompt.description}</p> : null}
            <div className="mt-5 text-[11px] font-bold text-slate-400">主提示词</div>
            <pre className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap rounded border border-white/8 bg-[#0e1117] p-3 text-[12px] leading-5 text-slate-100">{prompt.promptText}</pre>
            {prompt.negativePrompt ? <details className="mt-3 text-sm text-slate-400"><summary className="cursor-pointer">参考负面提示词</summary><pre className="mt-2 whitespace-pre-wrap rounded border border-white/8 bg-[#0e1117] p-3 text-[11px] leading-5">{prompt.negativePrompt}</pre></details> : null}
            {feedback ? <div className="mt-3 rounded border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs text-cyan-50">{feedback}</div> : null}
            <div className="mt-5 grid grid-cols-[110px_1fr] gap-2">
              <button className="inline-flex h-10 items-center justify-center gap-1 rounded border border-white/10 text-[12px] font-bold text-slate-200 hover:bg-white/[0.07]" onClick={() => void handleCopy()} type="button"><Copy size={15} /> 复制提示词</button>
              <button className="inline-flex h-10 items-center justify-center gap-1 rounded bg-cyan-400 text-[12px] font-bold text-slate-950 hover:bg-cyan-200" onClick={() => setProjectPickerOpen(true)} type="button"><Plus size={16} /> 引用到画布</button>
            </div>
          </aside>
        </div>
      </div>
      {projectPickerOpen ? <PromptProjectPicker onClose={() => setProjectPickerOpen(false)} onSelect={(project) => handleProjectSelect(project.id)} /> : null}
    </section>
  );
}
