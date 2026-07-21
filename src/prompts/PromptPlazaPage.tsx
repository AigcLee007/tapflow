import React, { useEffect, useMemo, useState } from "react";
import { LoaderCircle, Search, Sparkles } from "lucide-react";

import { getPromptMediaBlob } from "../services/v2PromptsApi";
import {
  favoritePrompt,
  listPrompts,
  recordPromptInteraction,
  type PromptEntry,
} from "../services/v2PromptsApi";
import { PromptCard } from "./PromptCard";
import { PromptProjectPicker } from "./PromptProjectPicker";
import { copyPromptText, createPromptInsertRequestId, navigate } from "./promptUi";

const CATEGORIES = [
  ["", "全部"],
  ["portrait", "人像"],
  ["product", "产品"],
  ["ecommerce", "电商"],
  ["scene", "场景空间"],
  ["illustration", "插画动漫"],
  ["poster", "海报设计"],
  ["3d", "3D 材质"],
] as const;

type PromptView = "featured" | "favorites" | "latest";

function pageUrl(prompt: PromptEntry, state: { category: string; query: string; view: PromptView }) {
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  if (state.category) params.set("category", state.category);
  if (state.view !== "featured") params.set("view", state.view);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return `/prompts/${encodeURIComponent(prompt.id)}${suffix}`;
}

export function PromptPlazaPage() {
  const initial = useMemo(() => new URLSearchParams(window.location.search), []);
  const [query, setQuery] = useState(initial.get("q") ?? "");
  const [category, setCategory] = useState(initial.get("category") ?? "");
  const [view, setView] = useState<PromptView>((initial.get("view") as PromptView) || "featured");
  const [items, setItems] = useState<PromptEntry[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [selectedPrompt, setSelectedPrompt] = useState<PromptEntry | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void listPrompts({ category: category || undefined, query: query || undefined, view })
        .then((result) => setItems(result.items))
        .catch((reason) => setError(reason instanceof Error ? reason.message : "提示词加载失败"))
        .finally(() => setLoading(false));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [category, query, view]);

  useEffect(() => {
    const mediaIds = Array.from(new Set(items.flatMap((prompt) => prompt.media.slice(0, 1).map((media) => media.id))));
    let cancelled = false;
    void Promise.all(mediaIds.map(async (mediaId) => {
      try {
        const result = await getPromptMediaBlob(mediaId);
        return [mediaId, URL.createObjectURL(result)] as const;
      } catch {
        return null;
      }
    })).then((resolved) => {
      if (cancelled) return;
      setImageUrls((current) => ({
        ...current,
        ...Object.fromEntries(resolved.filter((item): item is readonly [string, string] => item !== null)),
      }));
    });
    return () => {
      cancelled = true;
      Object.values(imageUrls).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [items]);

  const handleCopy = async (prompt: PromptEntry) => {
    try {
      await copyPromptText(prompt);
      setFeedback("已复制提示词");
      void recordPromptInteraction(prompt.id, { eventType: "copy" }).catch(() => undefined);
    } catch (reason) {
      setFeedback(reason instanceof Error ? `${reason.message}，请手动复制。` : "复制失败，请手动复制。");
    }
  };

  const handleFavorite = (prompt: PromptEntry) => {
    const nextFavorite = !prompt.isFavorite;
    setItems((current) => current
      .map((item) => (item.id === prompt.id ? { ...item, isFavorite: nextFavorite } : item))
      .filter((item) => !(view === "favorites" && item.id === prompt.id && !nextFavorite)));
    void favoritePrompt(prompt.id, nextFavorite).catch((reason) => {
      setItems((current) => current.map((item) => (item.id === prompt.id ? { ...item, isFavorite: !nextFavorite } : item)));
      setFeedback(reason instanceof Error ? reason.message : "收藏更新失败");
    });
  };

  const handleProjectSelect = (projectId: string) => {
    if (!selectedPrompt) return;
    const params = new URLSearchParams({
      insertPromptId: selectedPrompt.id,
      promptInsertRequestId: createPromptInsertRequestId(),
    });
    void recordPromptInteraction(selectedPrompt.id, { eventType: "reference", projectId }).catch(() => undefined);
    navigate(`/projects/${encodeURIComponent(projectId)}?${params.toString()}`);
  };

  return (
    <section className="min-h-[calc(100vh-92px)] bg-[#0b0d12] px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-[1600px]">
        <div className="flex flex-col gap-4 border-b border-white/8 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-white"><Sparkles className="text-cyan-200" size={20} /><h1 className="text-xl font-bold">提示词广场</h1></div>
            <p className="mt-1 text-sm text-slate-400">浏览官方精选提示词与实际生成效果。</p>
          </div>
          <label className="flex h-10 w-full max-w-xl items-center gap-2 rounded border border-white/10 bg-white/[0.04] px-3 text-slate-400 focus-within:border-cyan-300/70 lg:w-[460px]">
            <Search size={16} />
            <input aria-label="搜索提示词" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500" onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、提示词或标签..." value={query} />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {([ ["featured", "精选"], ["latest", "最新"], ["favorites", "我的收藏"] ] as const).map(([key, label]) => (
            <button className={`h-8 rounded px-3 text-[12px] font-bold ${view === key ? "bg-cyan-300 text-slate-950" : "bg-white/[0.05] text-slate-300 hover:bg-white/[0.1]"}`} key={key} onClick={() => setView(key)} type="button">{label}</button>
          ))}
          <span className="mx-1 hidden h-5 w-px bg-white/10 sm:block" />
          {CATEGORIES.map(([key, label]) => (
            <button className={`h-8 rounded px-2.5 text-[11px] font-bold ${category === key ? "bg-white/15 text-white" : "text-slate-400 hover:bg-white/[0.06] hover:text-white"}`} key={key || "all"} onClick={() => setCategory(key)} type="button">{label}</button>
          ))}
        </div>
        {feedback ? <div className="mt-4 rounded border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-sm text-cyan-50">{feedback}</div> : null}
        {loading ? <div className="grid min-h-80 place-items-center text-slate-400"><LoaderCircle className="animate-spin" size={24} /></div> : null}
        {error ? <div className="mt-6 rounded border border-rose-400/25 bg-rose-400/10 p-4 text-rose-100">{error}</div> : null}
        {!loading && !error && items.length === 0 ? <div className="mt-8 rounded border border-dashed border-white/12 p-10 text-center text-sm text-slate-400">当前筛选下还没有提示词。</div> : null}
        {!loading && !error && items.length > 0 ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {items.map((prompt) => (
              <PromptCard
                imageUrl={prompt.media[0] ? imageUrls[prompt.media[0].id] : null}
                key={prompt.id}
                onCopy={(value) => void handleCopy(value)}
                onFavorite={handleFavorite}
                onOpen={(value) => navigate(pageUrl(value, { category, query, view }))}
                onReference={setSelectedPrompt}
                prompt={prompt}
              />
            ))}
          </div>
        ) : null}
      </div>
      {selectedPrompt ? <PromptProjectPicker onClose={() => setSelectedPrompt(null)} onSelect={(project) => handleProjectSelect(project.id)} /> : null}
    </section>
  );
}
