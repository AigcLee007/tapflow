import React from "react";
import { Bell, ChevronLeft, Clock3, Coins, Share2, Sparkles } from "lucide-react";

import { BrandMark } from "../app/brand/BrandMark";
import { HOME_ROUTE, WORKSPACE_ROUTE } from "../app/routes";
import { getAssetVariantUrl } from "../assets/assetApi";
import { useImageModelCatalog } from "../hooks/useImageModelCatalog";
import { sendWorkbenchResultToProject } from "../services/v2WorkbenchApi";
import { createDefaultWorkbenchDraft } from "./workbenchModelParams";
import { SendToProjectDialog } from "./SendToProjectDialog";
import { WorkbenchComposer } from "./WorkbenchComposer";
import { WorkbenchMobileComposer } from "./WorkbenchMobileComposer";
import { WorkbenchResultSheet } from "./WorkbenchResultSheet";
import { useWorkbenchGenerations } from "./useWorkbenchGenerations";
import type { WorkbenchGeneration, WorkbenchResult } from "./workbenchTypes";

function navigate(path: string) {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function getPrimaryResult(generation: WorkbenchGeneration): WorkbenchResult | null {
  return generation.results[0] ?? null;
}

function getFeaturedGeneration(generations: WorkbenchGeneration[]) {
  return generations.find((generation) => generation.results.length > 0) ?? generations[0] ?? null;
}

function formatStatus(status: string) {
  if (status === "succeeded") return "已完成";
  if (status === "failed") return "失败";
  if (status === "running" || status === "waiting_provider") return "生成中";
  if (status === "queued" || status === "pending") return "排队中";
  return status;
}

function useResultPreviewUrl(result: WorkbenchResult | null) {
  const [fallbackUrl, setFallbackUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    setFallbackUrl(null);
    if (!result || result.previewUrl || result.downloadUrl || !result.assetId) return;
    let active = true;
    void getAssetVariantUrl(result.assetId, "preview")
      .catch(() => getAssetVariantUrl(result.assetId))
      .then((signed) => {
        if (!active) return;
        setFallbackUrl(signed.url);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [result]);

  return result?.previewUrl || fallbackUrl || result?.downloadUrl || null;
}

function WorkbenchStage({
  generation,
  loading,
  onSelectResult,
}: {
  generation: WorkbenchGeneration | null;
  loading: boolean;
  onSelectResult: (result: WorkbenchResult) => void;
}) {
  const primaryResult = generation ? getPrimaryResult(generation) : null;
  const imageUrl = useResultPreviewUrl(primaryResult);

  return (
    <section className="flex min-h-[560px] w-full min-w-0 flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(96,164,255,0.18),transparent_34%),linear-gradient(180deg,rgba(18,24,38,0.96),rgba(8,10,17,0.98))] shadow-[0_30px_90px_rgba(0,0,0,0.34)] xl:min-h-[calc(100vh-160px)]">
      <div className="flex items-center justify-between border-b border-white/8 px-6 py-5">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-300">Current Result</div>
          <div className="mt-1 text-base font-bold text-white">
            {generation ? formatStatus(generation.status) : "准备开始"}
          </div>
        </div>
        {generation ? (
          <div className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-bold text-slate-300">
            {generation.requestedCount} 张
          </div>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-center p-6">
        {loading ? (
          <div className="grid min-h-[460px] place-items-center rounded-[26px] border border-white/8 bg-black/20 text-sm text-slate-400 xl:min-h-[680px]">
            正在加载工作台历史...
          </div>
        ) : primaryResult && imageUrl ? (
          <button
            className="group relative block min-h-[460px] overflow-hidden rounded-[26px] border border-white/10 bg-black/35 text-left xl:min-h-[680px]"
            onClick={() => onSelectResult(primaryResult)}
            type="button"
          >
            <img
              alt={primaryResult.originalFilename || "Workbench result"}
              className="h-full min-h-[460px] w-full object-cover transition duration-300 group-hover:scale-[1.01] xl:min-h-[680px]"
              src={imageUrl}
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent px-6 pb-6 pt-20">
              <div className="line-clamp-2 text-lg font-bold text-white">{generation.prompt}</div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-200/90">
                <span>{generation.modelId}</span>
                <span>{generation.routeKey}</span>
              </div>
            </div>
          </button>
        ) : generation ? (
          <div className="grid min-h-[460px] place-items-center rounded-[26px] border border-dashed border-white/10 bg-black/20 text-center xl:min-h-[680px]">
            <div className="max-w-md px-8">
              <div className="text-lg font-bold text-white">{formatStatus(generation.status)}</div>
              <div className="mt-2 text-sm leading-6 text-slate-400">
                {generation.status === "failed"
                  ? (generation.errorJson?.message as string) || "这次生成没有成功，可以直接在右侧历史区重试。"
                  : "结果会优先显示在这里，同时保留在右侧历史流里。"}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid min-h-[460px] place-items-center rounded-[26px] border border-dashed border-white/10 bg-black/20 text-center xl:min-h-[680px]">
            <div className="max-w-md px-8">
              <div className="text-lg font-bold text-white">独立生图工作台</div>
              <div className="mt-2 text-sm leading-6 text-slate-400">
                左侧参数区保持现有工作台配置方式不变。开始一次生成后，当前主结果显示在中间，历史记录在右侧连续保存。
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function WorkbenchHistoryCard({
  generation,
  onReuseParams,
  onRetry,
  onSelectResult,
  result,
}: {
  generation: WorkbenchGeneration;
  onReuseParams: (generation: WorkbenchGeneration) => void;
  onRetry: (generationId: string) => void;
  onSelectResult: (result: WorkbenchResult) => void;
  result: WorkbenchResult | null;
}) {
  const previewUrl = useResultPreviewUrl(result);

  return (
    <article className="overflow-hidden rounded-[20px] border border-white/8 bg-black/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="line-clamp-2 text-[13px] font-bold leading-5 text-white">{generation.prompt}</div>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-400">
            <span>{formatStatus(generation.status)}</span>
            <span>{generation.requestedCount} 张</span>
          </div>
        </div>
        <div className="flex h-9 min-w-[64px] items-center justify-center gap-1 rounded-[10px] border border-white/8 bg-white/[0.05] px-2 text-[12px] font-black text-[#ffe35a]">
          <Coins size={13} />
          {generation.estimatedCredits}
        </div>
      </div>

      {previewUrl ? (
        <button
          className="mt-3 block overflow-hidden rounded-[16px] border border-white/8 bg-black/20"
          onClick={() => result && onSelectResult(result)}
          type="button"
        >
          <img
            alt={result?.originalFilename || "Workbench result"}
            className="aspect-[4/5] w-full object-cover"
            src={previewUrl}
          />
        </button>
      ) : (
        <div className="mt-3 grid min-h-[170px] place-items-center rounded-[16px] border border-dashed border-white/10 bg-black/15 text-xs text-slate-500">
          {generation.status === "failed" ? "本次生成失败" : "等待图片结果..."}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button
          className="h-9 rounded-full border border-white/10 bg-white/[0.06] px-3 text-xs font-bold text-white"
          onClick={() => onRetry(generation.id)}
          type="button"
        >
          再次生成
        </button>
        <button
          className="h-9 rounded-full border border-white/10 bg-white/[0.03] px-3 text-xs font-bold text-slate-300"
          onClick={() => onReuseParams(generation)}
          type="button"
        >
          复用参数
        </button>
      </div>
    </article>
  );
}

function WorkbenchHistoryPanel({
  generations,
  onReuseParams,
  onRetry,
  onSelectResult,
}: {
  generations: WorkbenchGeneration[];
  onReuseParams: (generation: WorkbenchGeneration) => void;
  onRetry: (generationId: string) => void;
  onSelectResult: (result: WorkbenchResult) => void;
}) {
  return (
    <aside className="flex h-full min-h-[560px] w-full min-w-0 flex-col overflow-hidden rounded-[26px] border border-white/10 bg-white/[0.04] shadow-[0_24px_70px_rgba(0,0,0,0.24)] xl:min-h-[calc(100vh-160px)]">
      <div className="flex items-center justify-between border-b border-white/8 px-4 py-4">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">History</div>
          <div className="mt-1 text-sm font-bold text-white">结果流</div>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-bold text-slate-300">
          {generations.length}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="grid gap-4">
          {generations.length === 0 ? (
            <div className="grid min-h-[260px] place-items-center rounded-[20px] border border-dashed border-white/10 bg-black/15 text-center">
              <div className="px-5">
                <div className="text-sm font-bold text-white">还没有生成记录</div>
                <div className="mt-2 text-sm leading-6 text-slate-400">从左侧参数区开始一次新的图片生成。</div>
              </div>
            </div>
          ) : null}

          {generations.map((generation) => (
            <WorkbenchHistoryCard
              key={generation.id}
              generation={generation}
              onReuseParams={onReuseParams}
              onRetry={onRetry}
              onSelectResult={onSelectResult}
              result={getPrimaryResult(generation)}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}

export function WorkbenchPage() {
  const { models } = useImageModelCatalog();
  const {
    error,
    generations,
    loading,
    retry,
    submit,
    submitting,
  } = useWorkbenchGenerations();
  const [draft, setDraft] = React.useState(() => createDefaultWorkbenchDraft());
  const [selectedResult, setSelectedResult] = React.useState<WorkbenchResult | null>(null);
  const [sendDialogOpen, setSendDialogOpen] = React.useState(false);

  React.useEffect(() => {
    if (models.length === 0) return;
    setDraft((current) => {
      const hasCurrentModel = models.some((model) => model.id === current.modelId);
      return current.modelId && hasCurrentModel ? current : createDefaultWorkbenchDraft(models);
    });
  }, [models]);

  const reuseParams = React.useCallback((generation: WorkbenchGeneration) => {
    setDraft({
      aspectRatio: String(generation.params.aspect_ratio || generation.params.aspectRatio || "1:1"),
      displayMode: generation.displayMode,
      modelId: generation.modelId,
      moderation: String(generation.params.moderation || "auto") as "auto" | "low",
      outputFormat: String(generation.params.output_format || "png") as "jpeg" | "png" | "webp",
      prompt: generation.prompt,
      quality: String(generation.params.quality || "auto") as "auto" | "high" | "low" | "medium",
      quantity: generation.requestedCount,
      referenceAssetIds: generation.referenceAssetIds,
      referenceUploadIds: generation.referenceUploadIds ?? [],
      routeKey: generation.routeKey,
      size: String(generation.params.size || generation.params.imageSize || "1k").toLowerCase(),
    });
  }, []);

  const handleSendToProject = React.useCallback(async (input: { projectName?: string }) => {
    if (!selectedResult) return;
    const created = await sendWorkbenchResultToProject(selectedResult.id, input);
    setSendDialogOpen(false);
    setSelectedResult(null);
    navigate(`/projects/${created.projectId}`);
  }, [selectedResult]);

  const featuredGeneration = getFeaturedGeneration(generations);

  return (
    <section
      data-testid="workbench-page"
      className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(73,149,255,0.16),transparent_24%),radial-gradient(circle_at_top_right,rgba(63,233,255,0.10),transparent_22%),linear-gradient(180deg,#07090e,#0b0d13_44%,#090b10)] text-white"
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:44px_44px] opacity-[0.08]" />

      <header className="relative z-10 flex items-center justify-between gap-4 px-4 pb-3 pt-4 md:px-6 md:pb-4 md:pt-5">
        <div className="flex min-w-0 items-center gap-4">
          <button
            aria-label="返回首页"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-slate-200 transition hover:bg-white/[0.12]"
            onClick={() => navigate(HOME_ROUTE)}
            type="button"
          >
            <ChevronLeft size={17} />
          </button>
          <button
            aria-label="打开工作空间"
            className="flex min-w-0 items-center gap-3 text-left"
            onClick={() => navigate(WORKSPACE_ROUTE)}
            type="button"
          >
            <BrandMark size="canvas" showCaption={false} />
            <span className="min-w-0">
              <span className="block text-[11px] font-black uppercase tracking-[0.22em] text-cyan-300">Workbench</span>
              <span className="block truncate text-[32px] font-black leading-none text-white md:text-[34px]">独立生图工作台</span>
            </span>
          </button>
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <div className="flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 text-xs font-bold text-white/90">
            <Sparkles size={15} className="text-cyan-300" />
            全屏创作流模式
          </div>
          <div className="flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 text-sm font-black text-[#ffe35a]">
            <Coins size={14} />
            19071
          </div>
          <button
            aria-label="历史"
            className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-slate-200 transition hover:bg-white/[0.12]"
            type="button"
          >
            <Clock3 size={16} />
          </button>
          <button
            aria-label="通知"
            className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-slate-200 transition hover:bg-white/[0.12]"
            type="button"
          >
            <Bell size={16} />
          </button>
          <button
            aria-label="分享"
            className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-slate-200 transition hover:bg-white/[0.12]"
            type="button"
          >
            <Share2 size={16} />
          </button>
        </div>
      </header>

      <div className="relative z-10 px-4 pb-4 md:px-6 md:pb-6">
        {error ? (
          <div className="mb-4 rounded-[18px] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        <div className="grid min-h-[calc(100vh-96px)] w-full gap-5 md:grid-cols-[390px_minmax(0,1fr)] xl:grid-cols-[390px_minmax(780px,1fr)_360px]">
          <div className="hidden min-h-0 overflow-hidden rounded-[26px] border border-white/8 bg-[#0f1015]/92 shadow-[0_26px_80px_rgba(0,0,0,0.28)] md:block">
            <WorkbenchComposer
              draft={draft}
              isGenerating={submitting}
              models={models}
              onChangeDraft={(patch) => setDraft((current) => ({ ...current, ...patch }))}
              onGenerate={() => void submit(draft)}
            />
          </div>

          <WorkbenchStage
            generation={featuredGeneration}
            loading={loading}
            onSelectResult={setSelectedResult}
          />

          <div className="md:col-start-2 xl:col-start-3">
            <WorkbenchHistoryPanel
              generations={generations}
              onReuseParams={reuseParams}
              onRetry={(generationId) => void retry(generationId)}
              onSelectResult={setSelectedResult}
            />
          </div>
        </div>
      </div>

      <WorkbenchMobileComposer
        draft={draft}
        isGenerating={submitting}
        models={models}
        onChangeDraft={(patch) => setDraft((current) => ({ ...current, ...patch }))}
        onGenerate={() => void submit(draft)}
      />

      <SendToProjectDialog
        onClose={() => setSendDialogOpen(false)}
        onConfirm={(input) => void handleSendToProject(input)}
        open={sendDialogOpen}
      />
      <WorkbenchResultSheet
        onClose={() => setSelectedResult(null)}
        onSendToProject={() => setSendDialogOpen(true)}
        result={selectedResult}
      />
    </section>
  );
}
