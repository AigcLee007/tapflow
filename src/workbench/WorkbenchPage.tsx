import React from "react";
import {
  Bell,
  ChevronLeft,
  Clock3,
  Coins,
  Download,
  ImagePlus,
  Share2,
  Sparkles,
  Trash2,
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
import { WorkbenchMobileShell } from "./WorkbenchMobileShell";
import { WorkbenchResultSheet } from "./WorkbenchResultSheet";
import { useWorkbenchGenerations } from "./useWorkbenchGenerations";
import type { WorkbenchDraft, WorkbenchGeneration, WorkbenchResult } from "./workbenchTypes";

function navigate(path: string) {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

type WorkbenchBatchChild = NonNullable<WorkbenchGeneration["batch"]>["children"][number];

function getGenerationDisplayResults(generation: WorkbenchGeneration): WorkbenchResult[] {
  if (generation.batch) {
    return generation.batch.children
      .slice()
      .sort((left, right) => left.batchIndex - right.batchIndex)
      .flatMap((child) => child.results);
  }
  return generation.results;
}

function getPrimaryResult(generation: WorkbenchGeneration): WorkbenchResult | null {
  return getGenerationDisplayResults(generation)[0] ?? null;
}

function getFeaturedGeneration(generations: WorkbenchGeneration[]) {
  return generations.find((generation) => getGenerationDisplayResults(generation).length > 0) ?? generations[0] ?? null;
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

function formatRouteLabel(routeKey: string) {
  const normalized = routeKey.toLowerCase();
  if (normalized.includes(".t3") || normalized.includes("line-2") || normalized.includes("route-2")) return "线路二";
  if (normalized.includes("line-3") || normalized.includes("route-3")) return "线路三";
  if (normalized.includes("line-4") || normalized.includes("route-4")) return "线路四";
  return "线路一";
}

function readGenerationParam(params: Record<string, unknown>, keys: string[], fallback: string) {
  for (const key of keys) {
    const value = params[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return fallback;
}

function formatSizeLabel(value: string) {
  const normalized = value.trim();
  return normalized ? normalized.toUpperCase() : "1K";
}

function getGenerationParameterSummary(
  generation: WorkbenchGeneration,
  models: ImageModelConfig[],
) {
  const modelLabel = models.find((model) => model.id === generation.modelId)?.label || generation.modelId;
  const aspectRatio = readGenerationParam(generation.params, ["aspect_ratio", "aspectRatio"], "1:1");
  const size = readGenerationParam(generation.params, ["imageSize", "image_size", "size"], "1k");
  return {
    aspectRatio,
    modelLabel,
    routeLabel: formatRouteLabel(generation.routeKey),
    sizeLabel: formatSizeLabel(size),
  };
}

function GenerationParameterLine({
  generation,
  models,
}: {
  generation: WorkbenchGeneration;
  models: ImageModelConfig[];
}) {
  const summary = getGenerationParameterSummary(generation, models);

  return (
    <div
      className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400"
      data-testid={`workbench-generation-params-${generation.id}`}
    >
      <span>模型：{summary.modelLabel}</span>
      <span>线路：{summary.routeLabel}</span>
      <span>比例：{summary.aspectRatio}</span>
      <span>尺寸：{summary.sizeLabel}</span>
      <span>数量：{generation.requestedCount}</span>
    </div>
  );
}

const RESULT_ACTION_BUTTON_CLASS =
  "inline-flex h-10 min-w-[116px] items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 text-xs font-bold text-slate-200 transition hover:bg-white/[0.10]";

function WorkbenchPillButton({
  children,
  className = "",
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`${RESULT_ACTION_BUTTON_CLASS} ${className}`.trim()}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
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

function CompletedResultThumbnail({
  generationId,
  onSelect,
  result,
  selected = false,
  sequenceLabel,
}: {
  generationId: string;
  onSelect: (result: WorkbenchResult) => void;
  result: WorkbenchResult;
  selected?: boolean;
  sequenceLabel?: string;
}) {
  const previewUrl = useResultPreviewUrl(result);

  return (
    <button
      aria-label={`select-result-${result.id}`}
      className={`group relative overflow-hidden rounded-[18px] border bg-[#090b11] text-left transition ${
        selected ? "border-cyan-300/70 shadow-[0_0_0_1px_rgba(103,232,249,0.28)]" : "border-white/8 hover:border-white/18"
      }`}
      data-testid={`workbench-completed-result-thumb-${generationId}`}
      onClick={() => onSelect(result)}
      type="button"
    >
      {sequenceLabel ? (
        <span
          className="pointer-events-none absolute left-2 top-2 z-10 inline-flex h-6 min-w-[28px] items-center justify-center rounded-full border border-black/30 bg-black/72 px-2 text-[10px] font-black text-white shadow-[0_10px_24px_rgba(0,0,0,0.34)]"
          data-testid={`workbench-result-sequence-${generationId}-${result.id}`}
        >
          {sequenceLabel}
        </span>
      ) : null}
      {previewUrl ? (
        <div className="flex h-[96px] items-center justify-center bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.05),transparent_58%),linear-gradient(180deg,rgba(15,18,25,0.98),rgba(8,10,14,0.98))] p-2">
          <img
            alt={result.originalFilename || "Workbench result"}
            className="h-full w-full rounded-[12px] object-contain transition duration-300 group-hover:scale-[1.02]"
            data-testid={`workbench-result-image-${generationId}-${result.id}`}
            src={previewUrl}
          />
        </div>
      ) : (
        <div className="grid h-[96px] place-items-center rounded-[16px] border border-dashed border-white/10 bg-black/15 text-xs text-slate-500">
          暂无预览
        </div>
      )}
    </button>
  );
}

function BatchChildSlot({
  child,
  generationId,
  onSelectResult,
  selected = false,
}: {
  child: WorkbenchBatchChild;
  generationId: string;
  onSelectResult: (result: WorkbenchResult) => void;
  selected?: boolean;
}) {
  const result = child.results[0] ?? null;
  const previewUrl = useResultPreviewUrl(result);

  if (result && previewUrl) {
    return (
      <button
        className={`group relative overflow-hidden rounded-[14px] border bg-[#090b11] text-left transition ${
          selected ? "border-cyan-300/70 shadow-[0_0_0_1px_rgba(103,232,249,0.28)]" : "border-white/8 hover:border-white/18"
        }`}
        data-testid={`workbench-batch-child-result-${generationId}-${child.batchIndex}`}
        onClick={() => onSelectResult(result)}
        type="button"
      >
        <span
          className="pointer-events-none absolute left-2 top-2 z-10 inline-flex h-6 min-w-[28px] items-center justify-center rounded-full border border-black/30 bg-black/72 px-2 text-[10px] font-black text-white shadow-[0_10px_24px_rgba(0,0,0,0.34)]"
          data-testid={`workbench-batch-child-badge-${generationId}-${child.batchIndex}`}
        >
          {child.batchIndex + 1}
        </span>
        <div className="flex h-[112px] items-center justify-center bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.05),transparent_58%),linear-gradient(180deg,rgba(15,18,25,0.98),rgba(8,10,14,0.98))] p-2">
          <img
            alt={result.originalFilename || "Workbench result"}
            className="h-full w-full rounded-[10px] object-contain transition duration-300 group-hover:scale-[1.015]"
            data-testid={`workbench-batch-child-image-${generationId}-${child.batchIndex}`}
            src={previewUrl}
          />
        </div>
      </button>
    );
  }

  return (
    <div
      className="grid h-[112px] place-items-center rounded-[14px] border border-dashed border-white/10 bg-black/15 text-[11px] font-bold text-slate-500"
      data-testid={`workbench-batch-child-placeholder-${generationId}-${child.batchIndex}`}
    >
      {formatStatus(child.status)}
    </div>
  );
}

function ResultStagePreview({
  generationId,
  onOpenPreview,
  result,
  testId,
}: {
  generationId: string;
  onOpenPreview?: (() => void) | null;
  result: WorkbenchResult | null;
  testId: string;
}) {
  const previewUrl = useResultPreviewUrl(result);

  return (
    <button
      aria-label={result ? `open-preview-${result.id}` : `open-preview-${generationId}`}
      className="group overflow-hidden rounded-[22px] border border-white/8 bg-[#090b11] text-left"
      data-testid={testId}
      disabled={!result || !onOpenPreview}
      onClick={() => onOpenPreview?.()}
      type="button"
    >
      {result && previewUrl ? (
        <div className="flex h-[320px] items-center justify-center bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_58%),linear-gradient(180deg,rgba(15,18,25,0.98),rgba(8,10,14,0.98))] p-4">
          <img
            alt={result.originalFilename || "Workbench result"}
            className="h-full w-full rounded-[18px] object-contain transition duration-300 group-hover:scale-[1.01]"
            data-testid={`workbench-result-stage-image-${generationId}-${result.id}`}
            src={previewUrl}
          />
        </div>
      ) : (
        <div className="grid h-[320px] place-items-center text-xs text-slate-500">暂无预览</div>
      )}
    </button>
  );
}

function DesktopResultActionButton({
  accent = false,
  ariaLabel,
  children,
  onClick,
}: {
  accent?: boolean;
  ariaLabel: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={ariaLabel}
      className={`inline-flex h-11 w-full items-center justify-center gap-2 rounded-[14px] border px-4 text-[13px] font-bold transition ${
        accent
          ? "border-cyan-300/25 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/16"
          : "border-white/10 bg-white/[0.04] text-slate-100 hover:bg-white/[0.10]"
      }`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function ResultActionTray({
  generationId,
  onDownloadOriginal,
  onRetry,
  onReuseParams,
  onUseAsReference,
  result,
}: {
  generationId: string;
  onDownloadOriginal: () => void;
  onRetry: () => void;
  onReuseParams: () => void;
  onUseAsReference: () => void;
  result: WorkbenchResult;
}) {
  return (
    <div
      className="flex items-center justify-center gap-2 rounded-[16px] border border-white/8 bg-black/24 p-2"
      data-testid={`workbench-result-action-tray-${generationId}`}
    >
      <button
        aria-label={`再次生成-${result.id}`}
        className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-slate-100 transition hover:bg-white/[0.12]"
        onClick={onRetry}
        type="button"
      >
        <Sparkles size={15} />
      </button>
      <button
        aria-label={`复用参数-${result.id}`}
        className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-slate-100 transition hover:bg-white/[0.12]"
        onClick={onReuseParams}
        type="button"
      >
        <Share2 size={15} />
      </button>
      <button
        aria-label={`下载原图-${result.id}`}
        className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-slate-100 transition hover:bg-white/[0.12]"
        onClick={onDownloadOriginal}
        type="button"
      >
        <Download size={15} />
      </button>
      <button
        aria-label={`引用参考-${result.id}`}
        className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-slate-100 transition hover:bg-white/[0.12]"
        onClick={onUseAsReference}
        type="button"
      >
        <ImagePlus size={15} />
      </button>
    </div>
  );
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
  models,
  onDelete,
  onReuseParams,
  onRetry,
  onSelectResult,
  onUseAsReference,
}: {
  generation: WorkbenchGeneration;
  models: ImageModelConfig[];
  onDelete: (generationId: string) => void;
  onReuseParams: (generation: WorkbenchGeneration) => void;
  onRetry: (generationId: string) => void;
  onSelectResult: (result: WorkbenchResult) => void;
  onUseAsReference: (result: WorkbenchResult) => void;
}) {
  const result = getPrimaryResult(generation);
  const previewUrl = useResultPreviewUrl(result);
  const hasBatch = Boolean(generation.batch);
  const [selectedBatchIndex, setSelectedBatchIndex] = React.useState(0);
  const renderBatchActionRow = React.useCallback(
    (item: WorkbenchResult) => (
      <ResultActionTray
        generationId={generation.id}
        onDownloadOriginal={() => window.open(item.downloadUrl || item.previewUrl || "", "_blank", "noopener,noreferrer")}
        onRetry={() => onRetry(generation.id)}
        onReuseParams={() => onReuseParams(generation)}
        onUseAsReference={() => onUseAsReference(item)}
        result={item}
      />
    ),
    [generation, onRetry, onReuseParams, onUseAsReference],
  );
  const selectedChild = generation.batch?.children[selectedBatchIndex] ?? generation.batch?.children.find((child) => child.results[0]) ?? null;
  const selectedBatchResult = selectedChild?.results[0] ?? null;

  return (
    <article
      className="grid grid-cols-[68px_minmax(0,1fr)_auto] items-center gap-3 rounded-[18px] border border-white/8 bg-white/[0.03] px-3 py-3"
      data-testid="workbench-active-item"
    >
      {hasBatch ? (
        <div className="flex h-full flex-col gap-2">
          <div
            className="flex h-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] px-3 text-[11px] font-black text-cyan-100"
            data-testid={`workbench-batch-progress-${generation.id}`}
          >
            {generation.batch!.completedCount}/{generation.batch!.totalCount}
          </div>
          <ResultStagePreview generationId={generation.id} result={selectedBatchResult} testId={`workbench-batch-stage-${generation.id}`} />
          <div className="grid grid-cols-4 gap-2" data-testid={`workbench-batch-thumb-row-${generation.id}`}>
            {generation.batch!.children.map((child) => (
              <div key={child.generationId} onClick={() => child.results[0] && setSelectedBatchIndex(child.batchIndex)}>
                <BatchChildSlot
                  child={child}
                  generationId={generation.id}
                  onSelectResult={onSelectResult}
                  selected={child.batchIndex === (selectedChild?.batchIndex ?? -1)}
                />
              </div>
            ))}
          </div>
          {selectedBatchResult ? renderBatchActionRow(selectedBatchResult) : null}
        </div>
      ) : (
        <button
          className="overflow-hidden rounded-[12px] border border-white/8 bg-black/20"
          disabled={!result}
          onClick={() => result && onSelectResult(result)}
          type="button"
        >
          {previewUrl ? (
            <div className="flex h-[68px] w-[68px] items-center justify-center bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.05),transparent_58%),linear-gradient(180deg,rgba(15,18,25,0.98),rgba(8,10,14,0.98))] p-1.5">
              <img
                alt={result?.originalFilename || "Workbench result"}
                className="h-full w-full rounded-[8px] object-contain"
                src={previewUrl}
              />
            </div>
          ) : (
            <div className="grid h-[68px] w-[68px] place-items-center text-[11px] text-slate-500">
              {formatStatus(generation.status)}
            </div>
          )}
        </button>
      )}

      <div className="min-w-0">
        <div className="line-clamp-1 text-[13px] font-bold text-white">{generation.prompt}</div>
        <div className="mt-1 text-[11px] text-slate-400">{formatStatus(generation.status)}</div>
        <GenerationParameterLine generation={generation} models={models} />
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
        <button
          aria-label="删除任务"
          className="h-8 rounded-full border border-red-400/20 bg-red-500/10 px-3 text-[11px] font-bold text-red-100 transition hover:bg-red-500/18"
          onClick={() => onDelete(generation.id)}
          type="button"
        >
          暂无预览
        </button>
      </div>
    </article>
  );
}
function DesktopCompletedResultCard({
  generation,
  models,
  onDelete,
  onDownloadOriginal,
  onReuseParams,
  onRetry,
  onSelectResult,
  onUseAsReference,
}: {
  generation: WorkbenchGeneration;
  models: ImageModelConfig[];
  onDelete: (generationId: string) => void;
  onDownloadOriginal: (result: WorkbenchResult) => void;
  onReuseParams: (generation: WorkbenchGeneration) => void;
  onRetry: (generationId: string) => void;
  onSelectResult: (result: WorkbenchResult) => void;
  onUseAsReference: (result: WorkbenchResult) => void;
}) {
  const displayResults = getGenerationDisplayResults(generation);
  const [selectedResultId, setSelectedResultId] = React.useState<string | null>(displayResults[0]?.id ?? null);
  const selectedDisplayResult = displayResults.find((item) => item.id === selectedResultId) ?? displayResults[0] ?? null;

  return (
    <article
      className="grid grid-cols-[minmax(0,1.45fr)_minmax(320px,0.8fr)] gap-4 rounded-[24px] border border-white/8 bg-black/20 p-4"
      data-testid={`workbench-completed-history-item-${generation.id}`}
    >
      <div className="flex min-h-0 flex-col gap-3">
        {generation.batch ? (
          <div
            className="inline-flex h-9 w-fit items-center justify-center rounded-full border border-white/10 bg-white/[0.06] px-4 text-[12px] font-black text-cyan-100"
            data-testid={`workbench-batch-progress-${generation.id}`}
          >
            {generation.batch.completedCount}/{generation.batch.totalCount} 当前选中
          </div>
        ) : null}
        <ResultStagePreview
          generationId={generation.id}
          onOpenPreview={selectedDisplayResult ? () => onSelectResult(selectedDisplayResult) : null}
          result={selectedDisplayResult}
          testId={`workbench-result-stage-${generation.id}`}
        />
        <div className="px-1 text-[12px] text-slate-400">
          点击下方缩略图切换当前图片；点击上方主图或右侧“全屏预览”查看原图。
        </div>
        <div className="grid grid-cols-4 gap-3" data-testid={`workbench-result-thumb-row-${generation.id}`}>
          {displayResults.map((item, index) => (
            <CompletedResultThumbnail
              generationId={generation.id}
              key={item.id}
              onSelect={(picked) => setSelectedResultId(picked.id)}
              result={item}
              selected={item.id === selectedDisplayResult?.id}
              sequenceLabel={String(index + 1)}
            />
          ))}
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-4 rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="line-clamp-2 text-[20px] font-bold leading-7 text-white">{generation.prompt}</div>
            <div className="mt-2 text-[13px] font-medium text-cyan-100">{formatStatus(generation.status)}</div>
            <GenerationParameterLine generation={generation} models={models} />
          </div>
          <div className="flex items-start gap-2">
            <div className="flex h-10 min-w-[72px] items-center justify-center gap-1 rounded-[12px] border border-white/8 bg-white/[0.05] px-3 text-[13px] font-black text-[#ffe35a]">
              <Coins size={14} />
              {generation.estimatedCredits}
            </div>
            <button
              aria-label={`delete-record-${generation.id}`}
              className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-slate-300 transition hover:bg-red-500/16 hover:text-red-100"
              onClick={() => onDelete(generation.id)}
              type="button"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <WorkbenchPillButton className="bg-white/[0.06] text-white" onClick={() => onRetry(generation.id)}>
            再次生成
          </WorkbenchPillButton>
          <WorkbenchPillButton className="bg-white/[0.03] text-slate-300" onClick={() => onReuseParams(generation)}>
            复用参数
          </WorkbenchPillButton>
        </div>

        {selectedDisplayResult ? (
          <div
            className="grid gap-3"
            data-testid={`workbench-result-action-panel-${generation.id}`}
          >
            <DesktopResultActionButton
              accent
              ariaLabel="全屏预览"
              onClick={() => onSelectResult(selectedDisplayResult)}
            >
              全屏预览
            </DesktopResultActionButton>
            <DesktopResultActionButton
              ariaLabel="引用参考"
              onClick={() => onUseAsReference(selectedDisplayResult)}
            >
              <ImagePlus size={15} />
              引用参考
            </DesktopResultActionButton>
            <DesktopResultActionButton
              ariaLabel="下载原图"
              onClick={() => void onDownloadOriginal(selectedDisplayResult)}
            >
              <Download size={15} />
              下载原图
            </DesktopResultActionButton>
            <DesktopResultActionButton
              ariaLabel={`删除记录-${generation.id}`}
              onClick={() => onDelete(generation.id)}
            >
              <Trash2 size={15} />
              删除记录
            </DesktopResultActionButton>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function DesktopLeftDock({
  draft,
  isGenerating,
  models,
  onChangeDraft,
  onGenerate,
}: {
  draft: WorkbenchDraft;
  isGenerating: boolean;
  models: ImageModelConfig[];
  onChangeDraft: (patch: Partial<WorkbenchDraft>) => void;
  onGenerate: () => void;
}) {
  return (
    <div
      className="flex h-full min-h-0 overflow-hidden rounded-[26px] border border-white/8 bg-[#0f1015]/92 shadow-[0_26px_80px_rgba(0,0,0,0.28)]"
      data-testid="workbench-left-dock"
    >
      <div className="min-h-0 flex-1 pt-1">
        <WorkbenchComposer
          draft={draft}
          isGenerating={isGenerating}
          models={models}
          onChangeDraft={onChangeDraft}
          onGenerate={onGenerate}
        />
      </div>
    </div>
  );
}

function DesktopResultsWorkspace({
  activeGenerations,
  completedGenerations,
  models,
  onDeleteGeneration,
  onDownloadOriginal,
  onReuseParams,
  onRetry,
  onSelectResult,
  onUseAsReference,
}: {
  activeGenerations: WorkbenchGeneration[];
  completedGenerations: WorkbenchGeneration[];
  models: ImageModelConfig[];
  onDeleteGeneration: (generationId: string) => void;
  onDownloadOriginal: (result: WorkbenchResult) => void;
  onReuseParams: (generation: WorkbenchGeneration) => void;
  onRetry: (generationId: string) => void;
  onSelectResult: (result: WorkbenchResult) => void;
  onUseAsReference: (result: WorkbenchResult) => void;
}) {
  return (
    <section
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(16,21,31,0.96),rgba(10,13,19,0.98))] shadow-[0_26px_80px_rgba(0,0,0,0.26)]"
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

      <div className="min-h-0 flex-1 overflow-y-auto p-4" data-testid="workbench-results-scroll-area">
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
                  models={models}
                  onDelete={onDeleteGeneration}
                  onReuseParams={onReuseParams}
                  onRetry={onRetry}
                  onSelectResult={onSelectResult}
                  onUseAsReference={onUseAsReference}
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
                      models={models}
                      onDelete={onDeleteGeneration}
                      onDownloadOriginal={onDownloadOriginal}
                      onReuseParams={onReuseParams}
                      onRetry={onRetry}
                      onSelectResult={onSelectResult}
                      onUseAsReference={onUseAsReference}
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
  const { error, generations, loading, remove, retry, submit, submitting } = useWorkbenchGenerations();
  const [draft, setDraft] = React.useState(() => createDefaultWorkbenchDraft());
  const [selectedResult, setSelectedResult] = React.useState<WorkbenchResult | null>(null);
  const [selectedResultBatch, setSelectedResultBatch] = React.useState<WorkbenchResult[]>([]);
  const [sendDialogOpen, setSendDialogOpen] = React.useState(false);
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
      setSelectedResultBatch([]);
      navigate(`/projects/${created.projectId}`);
    },
    [selectedResult],
  );

  const handleDownloadOriginal = React.useCallback(async (result: WorkbenchResult) => {
    const url = result.assetId
      ? await getAssetVariantUrl(result.assetId).then((signed) => signed.url).catch(() => result.downloadUrl || result.previewUrl)
      : result.downloadUrl || result.previewUrl;
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const handleUseAsReference = React.useCallback((result: WorkbenchResult) => {
    if (!result.assetId) return;
    setDraft((current) => {
      const nextReferenceAssetIds = [
        result.assetId,
        ...current.referenceAssetIds.filter((assetId) => assetId !== result.assetId),
      ].slice(0, 10);
      return {
        ...current,
        referenceAssetIds: nextReferenceAssetIds,
      };
    });
  }, []);

  const handleDeleteGeneration = React.useCallback((generationId: string) => {
    void remove(generationId);
  }, [remove]);

  const openResultPreview = React.useCallback((result: WorkbenchResult) => {
    const matchedGeneration = generations.find((generation) =>
      getGenerationDisplayResults(generation).some((item) => item.id === result.id),
    );
    setSelectedResult(result);
    setSelectedResultBatch(matchedGeneration ? getGenerationDisplayResults(matchedGeneration) : [result]);
  }, [generations]);

  const featuredGeneration = getFeaturedGeneration(generations);
  const activeGenerations = React.useMemo(
    () => getWorkbenchActiveGenerations(generations),
    [generations],
  );
  const completedGenerations = React.useMemo(
    () => getWorkbenchCompletedGenerations(generations),
    [generations],
  );
  const routeLabel = React.useMemo(() => formatRouteLabel(draft.routeKey), [draft.routeKey]);
  const featuredGenerationForMobile = React.useMemo(() => getFeaturedGeneration(generations), [generations]);
  const featuredPrimaryResultForMobile = featuredGenerationForMobile ? getPrimaryResult(featuredGenerationForMobile) : null;
  const featuredPreviewUrlForMobile = useResultPreviewUrl(featuredPrimaryResultForMobile);

  return (
    <section
      className="relative h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(73,149,255,0.16),transparent_24%),radial-gradient(circle_at_top_right,rgba(63,233,255,0.10),transparent_22%),linear-gradient(180deg,#07090e,#0b0d13_44%,#090b10)] text-white"
      data-testid="workbench-page"
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:44px_44px] opacity-[0.08]" />

      <header
        className="relative z-10 flex h-[78px] items-center justify-between gap-4 px-4 py-2 md:px-5"
        data-testid="workbench-header"
      >
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
            <BrandMark showCaption={false} size="compact" />
            <span className="min-w-0">
              <span className="block text-[11px] font-black uppercase tracking-[0.22em] text-cyan-300">
                Workbench
              </span>
              <span className="block truncate text-[26px] font-black leading-none text-white md:text-[30px]">
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

      <div className="relative z-10 px-4 pb-4 md:px-5">
        {error ? (
          <div className="mb-4 rounded-[18px] border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        {isDesktop ? (
          <div
            className="h-[calc(100vh-94px)] w-full overflow-hidden lg:grid lg:grid-cols-[minmax(430px,3fr)_minmax(0,7fr)] lg:gap-4"
            data-testid="workbench-desktop-layout"
          >
            <DesktopLeftDock
              draft={draft}
              isGenerating={submitting}
              models={models}
              onChangeDraft={(patch) => setDraft((current) => ({ ...current, ...patch }))}
              onGenerate={() => void submit(draft)}
            />

            <DesktopResultsWorkspace
              activeGenerations={activeGenerations}
              completedGenerations={completedGenerations}
              models={models}
              onDeleteGeneration={handleDeleteGeneration}
              onDownloadOriginal={handleDownloadOriginal}
              onReuseParams={reuseParams}
              onRetry={(generationId) => void retry(generationId)}
              onSelectResult={openResultPreview}
              onUseAsReference={handleUseAsReference}
            />
          </div>
        ) : isMobile ? (
          <WorkbenchMobileShell
            draft={draft}
            error={error}
            featuredPreviewUrl={featuredPreviewUrlForMobile}
            generations={generations}
            getDisplayResults={getGenerationDisplayResults}
            getFeaturedGeneration={getFeaturedGeneration}
            getPrimaryResult={getPrimaryResult}
            isGenerating={submitting}
            loading={loading}
            models={models}
            onChangeDraft={(patch) => setDraft((current) => ({ ...current, ...patch }))}
            onDeleteGeneration={handleDeleteGeneration}
            onDownloadOriginal={handleDownloadOriginal}
            onGenerate={() => void submit(draft)}
            onOpenResult={openResultPreview}
            onUseAsReference={handleUseAsReference}
            routeLabel={routeLabel}
          />
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
              onSelectResult={openResultPreview}
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
                        models={models}
                        onDelete={handleDeleteGeneration}
                        onDownloadOriginal={handleDownloadOriginal}
                        onReuseParams={reuseParams}
                        onRetry={(generationId) => void retry(generationId)}
                        onSelectResult={openResultPreview}
                        onUseAsReference={handleUseAsReference}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <SendToProjectDialog
        onClose={() => setSendDialogOpen(false)}
        onConfirm={(input) => void handleSendToProject(input)}
        open={sendDialogOpen}
      />
      <WorkbenchResultSheet
        batchResults={selectedResultBatch}
        onClose={() => {
          setSelectedResult(null);
          setSelectedResultBatch([]);
        }}
        onSendToProject={() => setSendDialogOpen(true)}
        result={selectedResult}
      />
    </section>
  );
}
