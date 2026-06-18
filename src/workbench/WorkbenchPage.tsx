import React from "react";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Coins,
  PanelLeftClose,
  Share2,
  Sparkles,
} from "lucide-react";

import { BrandMark } from "../app/brand/BrandMark";
import { HOME_ROUTE, WORKSPACE_ROUTE } from "../app/routes";
import { getAssetVariantUrl } from "../assets/assetApi";
import type { ImageModelConfig } from "../config/imageModels";
import { useImageModelCatalog } from "../hooks/useImageModelCatalog";
import { sendWorkbenchResultToProject } from "../services/v2WorkbenchApi";
import { SendToProjectDialog } from "./SendToProjectDialog";
import { WorkbenchComposer } from "./WorkbenchComposer";
import { createDefaultWorkbenchDraft } from "./workbenchModelParams";
import {
  getWorkbenchActiveGenerations,
  getWorkbenchCompletedGenerations,
} from "./workbenchDesktopLayout";
import { WorkbenchMobileComposer } from "./WorkbenchMobileComposer";
import { WorkbenchResultSheet } from "./WorkbenchResultSheet";
import { useWorkbenchGenerations } from "./useWorkbenchGenerations";
import type { WorkbenchDraft, WorkbenchGeneration, WorkbenchResult } from "./workbenchTypes";

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
  switch (status) {
    case "succeeded":
      return "已完成";
    case "failed":
      return "失败";
    case "running":
      return "生成中";
    case "waiting_provider":
      return "等待上游";
    case "queued":
      return "排队中";
    case "pending":
      return "准备中";
    case "canceled":
      return "已取消";
    default:
      return status;
  }
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

function useViewportWidth() {
  const [width, setWidth] = React.useState(() =>
    typeof window === "undefined" ? 1280 : window.innerWidth,
  );

  React.useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return width;
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
    <section
      className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(96,164,255,0.18),transparent_34%),linear-gradient(180deg,rgba(18,24,38,0.96),rgba(8,10,17,0.98))] shadow-[0_30px_90px_rgba(0,0,0,0.34)]"
      data-testid="workbench-stage"
    >
      <div className="flex items-center justify-between border-b border-white/8 px-6 py-5">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-300">
            Current Task
          </div>
          <div className="mt-1 text-base font-bold text-white">
            {generation ? formatStatus(generation.status) : "准备开始创作"}
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
          <div className="grid min-h-[320px] flex-1 place-items-center rounded-[24px] border border-white/8 bg-black/20 text-sm text-slate-400">
            正在加载工作台内容...
          </div>
        ) : primaryResult && imageUrl ? (
          <button
            className="group relative block min-h-[320px] flex-1 overflow-hidden rounded-[24px] border border-white/10 bg-black/35 text-left"
            onClick={() => onSelectResult(primaryResult)}
            type="button"
          >
            <img
              alt={primaryResult.originalFilename || "Workbench result"}
              className="h-full min-h-[320px] w-full object-cover transition duration-300 group-hover:scale-[1.01]"
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
          <div className="grid min-h-[320px] flex-1 place-items-center rounded-[24px] border border-dashed border-white/10 bg-black/20 text-center">
            <div className="max-w-md px-8">
              <div className="text-lg font-bold text-white">{formatStatus(generation.status)}</div>
              <div className="mt-2 text-sm leading-6 text-slate-400">
                {generation.status === "failed"
                  ? (generation.errorJson?.message as string) || "这次生成没有成功，请稍后重试。"
                  : "任务已经提交，结果会在这里优先展示。"}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid min-h-[320px] flex-1 place-items-center rounded-[24px] border border-dashed border-white/10 bg-black/20 text-center">
            <div className="max-w-md px-8">
              <div className="text-lg font-bold text-white">开始你的第一张作品</div>
              <div className="mt-2 text-sm leading-6 text-slate-400">
                设置好提示词、模型和参数后，生成结果会在这里优先展示。
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function DesktopActiveTaskItem({
  generation,
  onReuseParams,
  onRetry,
  onSelectResult,
}: {
  generation: WorkbenchGeneration;
  onReuseParams: (generation: WorkbenchGeneration) => void;
  onRetry: (generationId: string) => void;
  onSelectResult: (result: WorkbenchResult) => void;
}) {
  const result = getPrimaryResult(generation);
  const previewUrl = useResultPreviewUrl(result);

  return (
    <article
      className="grid grid-cols-[68px_minmax(0,1fr)_auto] items-center gap-3 rounded-[18px] border border-white/8 bg-white/[0.03] px-3 py-3"
      data-testid="workbench-active-item"
    >
      <button
        className="overflow-hidden rounded-[12px] border border-white/8 bg-black/20"
        disabled={!result}
        onClick={() => result && onSelectResult(result)}
        type="button"
      >
        {previewUrl ? (
          <img
            alt={result?.originalFilename || "Workbench result"}
            className="h-[68px] w-[68px] object-cover"
            src={previewUrl}
          />
        ) : (
          <div className="grid h-[68px] w-[68px] place-items-center text-[11px] text-slate-500">
            {formatStatus(generation.status)}
          </div>
        )}
      </button>

      <div className="min-w-0">
        <div className="line-clamp-1 text-[13px] font-bold text-white">{generation.prompt}</div>
        <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-400">
          <span>{formatStatus(generation.status)}</span>
          <span>{generation.requestedCount} 张</span>
          <span>{generation.modelId}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <button
          className="h-8 rounded-full border border-white/10 bg-white/[0.06] px-3 text-[11px] font-bold text-white"
          onClick={() => onRetry(generation.id)}
          type="button"
        >
          再次生成
        </button>
        <button
          className="h-8 rounded-full border border-white/10 bg-white/[0.03] px-3 text-[11px] font-bold text-slate-300"
          onClick={() => onReuseParams(generation)}
          type="button"
        >
          复用参数
        </button>
      </div>
    </article>
  );
}

function DesktopCompletedResultCard({
  generation,
  onReuseParams,
  onRetry,
  onSelectResult,
}: {
  generation: WorkbenchGeneration;
  onReuseParams: (generation: WorkbenchGeneration) => void;
  onRetry: (generationId: string) => void;
  onSelectResult: (result: WorkbenchResult) => void;
}) {
  const result = getPrimaryResult(generation);
  const previewUrl = useResultPreviewUrl(result);

  return (
    <article
      className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 rounded-[20px] border border-white/8 bg-black/20 p-3"
      data-testid={`workbench-completed-history-item-${generation.id}`}
    >
      <button
        className="overflow-hidden rounded-[16px] border border-white/8 bg-black/20"
        disabled={!result}
        onClick={() => result && onSelectResult(result)}
        type="button"
      >
        {previewUrl ? (
          <img
            alt={result?.originalFilename || "Workbench result"}
            className="h-full min-h-[156px] w-full object-cover"
            src={previewUrl}
          />
        ) : (
          <div className="grid min-h-[156px] place-items-center rounded-[16px] border border-dashed border-white/10 bg-black/15 text-xs text-slate-500">
            暂无预览
          </div>
        )}
      </button>

      <div className="flex min-w-0 flex-col justify-between gap-3">
        <div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="line-clamp-2 text-[14px] font-bold leading-5 text-white">
                {generation.prompt}
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-400">
                <span>{formatStatus(generation.status)}</span>
                <span>{generation.requestedCount} 张</span>
                <span>{generation.modelId}</span>
              </div>
            </div>
            <div className="flex h-9 min-w-[64px] items-center justify-center gap-1 rounded-[10px] border border-white/8 bg-white/[0.05] px-2 text-[12px] font-black text-[#ffe35a]">
              <Coins size={13} />
              {generation.estimatedCredits}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
            <span>{generation.routeKey}</span>
          </div>
        </div>

        <div className="flex gap-2">
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
      </div>
    </article>
  );
}

function DesktopLeftDock({
  collapsed,
  draft,
  isGenerating,
  models,
  onChangeDraft,
  onGenerate,
  onToggle,
}: {
  collapsed: boolean;
  draft: WorkbenchDraft;
  isGenerating: boolean;
  models: ImageModelConfig[];
  onChangeDraft: (patch: Partial<WorkbenchDraft>) => void;
  onGenerate: () => void;
  onToggle: () => void;
}) {
  return (
    <div
      className={`flex min-h-0 overflow-hidden rounded-[26px] border border-white/8 bg-[#0f1015]/92 shadow-[0_26px_80px_rgba(0,0,0,0.28)] transition-all duration-200 ${
        collapsed ? "max-w-[84px]" : "max-w-none"
      }`}
      data-testid="workbench-left-dock"
    >
      {collapsed ? (
        <div className="flex w-full flex-col items-center justify-between py-4">
          <button
            aria-label="展开参数面板"
            className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-slate-200"
            onClick={onToggle}
            type="button"
          >
            <ChevronRight size={16} />
          </button>
          <div className="rotate-180 text-[11px] font-black tracking-[0.28em] text-slate-400 [writing-mode:vertical-rl]">
            PARAMS
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-300">
                Create
              </div>
              <div className="mt-1 text-sm font-bold text-white">参数面板</div>
            </div>
            <button
              aria-label="收起参数面板"
              className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-slate-200"
              onClick={onToggle}
              type="button"
            >
              <PanelLeftClose size={16} />
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <WorkbenchComposer
              draft={draft}
              isGenerating={isGenerating}
              models={models}
              onChangeDraft={onChangeDraft}
              onGenerate={onGenerate}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function DesktopResultsWorkspace({
  activeGenerations,
  completedGenerations,
  onReuseParams,
  onRetry,
  onSelectResult,
}: {
  activeGenerations: WorkbenchGeneration[];
  completedGenerations: WorkbenchGeneration[];
  onReuseParams: (generation: WorkbenchGeneration) => void;
  onRetry: (generationId: string) => void;
  onSelectResult: (result: WorkbenchResult) => void;
}) {
  return (
    <section
      className="flex min-h-0 flex-col overflow-hidden rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,21,31,0.96),rgba(10,13,19,0.98))] shadow-[0_26px_80px_rgba(0,0,0,0.26)]"
      data-testid="workbench-completed-rail"
    >
      <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">
            Results Workspace
          </div>
          <div className="mt-1 text-sm font-bold text-white">当前任务与结果</div>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-bold text-slate-300">
          {activeGenerations.length + completedGenerations.length}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="grid gap-4">
          <section
            className="overflow-hidden rounded-[22px] border border-white/8 bg-white/[0.035]"
            data-testid="workbench-active-band"
          >
            <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-300">
                  Active
                </div>
                <div className="mt-1 text-sm font-bold text-white">正在进行的任务</div>
              </div>
              <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-bold text-slate-300">
                {activeGenerations.length}
              </span>
            </div>
            <div className="grid gap-3 p-4">
              {activeGenerations.length === 0 ? (
                <div className="rounded-[16px] border border-dashed border-white/10 bg-black/15 px-4 py-5 text-sm text-slate-400">
                  当前没有进行中的任务。
                </div>
              ) : null}

              {activeGenerations.map((generation) => (
                <DesktopActiveTaskItem
                  generation={generation}
                  key={generation.id}
                  onReuseParams={onReuseParams}
                  onRetry={onRetry}
                  onSelectResult={onSelectResult}
                />
              ))}
            </div>
          </section>

          <section className="overflow-hidden rounded-[22px] border border-white/8 bg-white/[0.02]">
            <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">
                  Completed
                </div>
                <div className="mt-1 text-sm font-bold text-white">已完成结果</div>
              </div>
              <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-bold text-slate-300">
                {completedGenerations.length}
              </span>
            </div>

            <div className="p-4">
              <div className="grid grid-cols-1 gap-4" data-testid="workbench-completed-history-list">
                {completedGenerations.length === 0 ? (
                  <div className="grid min-h-[220px] place-items-center rounded-[20px] border border-dashed border-white/10 bg-black/15 text-center">
                    <div className="px-5">
                      <div className="text-sm font-bold text-white">还没有完成的结果</div>
                      <div className="mt-2 text-sm leading-6 text-slate-400">
                        完成后的作品会集中出现在这里，方便继续浏览和复用参数。
                      </div>
                    </div>
                  </div>
                ) : null}

                {completedGenerations.map((generation) => (
                  <div data-testid="workbench-completed-history-item" key={generation.id}>
                    <DesktopCompletedResultCard
                      generation={generation}
                      onReuseParams={onReuseParams}
                      onRetry={onRetry}
                      onSelectResult={onSelectResult}
                    />
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

export function WorkbenchPage() {
  const { models } = useImageModelCatalog();
  const { error, generations, loading, retry, submit, submitting } = useWorkbenchGenerations();
  const [draft, setDraft] = React.useState(() => createDefaultWorkbenchDraft());
  const [selectedResult, setSelectedResult] = React.useState<WorkbenchResult | null>(null);
  const [sendDialogOpen, setSendDialogOpen] = React.useState(false);
  const [leftCollapsed, setLeftCollapsed] = React.useState(false);
  const viewportWidth = useViewportWidth();
  const isDesktop = viewportWidth >= 1024;
  const isMobile = viewportWidth < 768;

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

  const handleSendToProject = React.useCallback(
    async (input: { projectName?: string }) => {
      if (!selectedResult) return;
      const created = await sendWorkbenchResultToProject(selectedResult.id, input);
      setSendDialogOpen(false);
      setSelectedResult(null);
      navigate(`/projects/${created.projectId}`);
    },
    [selectedResult],
  );

  const featuredGeneration = getFeaturedGeneration(generations);
  const activeGenerations = React.useMemo(
    () => getWorkbenchActiveGenerations(generations),
    [generations],
  );
  const completedGenerations = React.useMemo(
    () => getWorkbenchCompletedGenerations(generations),
    [generations],
  );

  return (
    <section
      className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(73,149,255,0.16),transparent_24%),radial-gradient(circle_at_top_right,rgba(63,233,255,0.10),transparent_22%),linear-gradient(180deg,#07090e,#0b0d13_44%,#090b10)] text-white"
      data-testid="workbench-page"
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:44px_44px] opacity-[0.08]" />

      <header className="relative z-10 flex items-center justify-between gap-4 px-4 pb-2 pt-3 md:px-5 md:pb-3 md:pt-4">
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
            aria-label="返回工作空间"
            className="flex min-w-0 items-center gap-3 text-left"
            onClick={() => navigate(WORKSPACE_ROUTE)}
            type="button"
          >
            <BrandMark showCaption={false} size="canvas" />
            <span className="min-w-0">
              <span className="block text-[11px] font-black uppercase tracking-[0.22em] text-cyan-300">
                Workbench
              </span>
              <span className="block truncate text-[32px] font-black leading-none text-white md:text-[34px]">
                创作工作台
              </span>
            </span>
          </button>
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <div className="flex h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 text-xs font-bold text-white/90">
            <Sparkles className="text-cyan-300" size={15} />
            沉浸式创作空间
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

        {isDesktop ? (
          <div
            className="min-h-[calc(100vh-88px)] w-full overflow-hidden lg:grid lg:grid-cols-[minmax(84px,3fr)_minmax(0,7fr)] lg:gap-4"
            data-testid="workbench-desktop-layout"
          >
            <DesktopLeftDock
              collapsed={leftCollapsed}
              draft={draft}
              isGenerating={submitting}
              models={models}
              onChangeDraft={(patch) => setDraft((current) => ({ ...current, ...patch }))}
              onGenerate={() => void submit(draft)}
              onToggle={() => setLeftCollapsed((current) => !current)}
            />

            <DesktopResultsWorkspace
              activeGenerations={activeGenerations}
              completedGenerations={completedGenerations}
              onReuseParams={reuseParams}
              onRetry={(generationId) => void retry(generationId)}
              onSelectResult={setSelectedResult}
            />
          </div>
        ) : (
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
              <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-[26px] border border-white/10 bg-white/[0.04] shadow-[0_24px_70px_rgba(0,0,0,0.24)]">
                <div className="flex items-center justify-between border-b border-white/8 px-4 py-4">
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">
                      History
                    </div>
                    <div className="mt-1 text-sm font-bold text-white">全部记录</div>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-bold text-slate-300">
                    {generations.length}
                  </span>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  <div className="grid gap-4">
                    {generations.map((generation) => (
                      <DesktopCompletedResultCard
                        generation={generation}
                        key={generation.id}
                        onReuseParams={reuseParams}
                        onRetry={(generationId) => void retry(generationId)}
                        onSelectResult={setSelectedResult}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {isMobile ? (
        <WorkbenchMobileComposer
          draft={draft}
          isGenerating={submitting}
          models={models}
          onChangeDraft={(patch) => setDraft((current) => ({ ...current, ...patch }))}
          onGenerate={() => void submit(draft)}
        />
      ) : null}

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
