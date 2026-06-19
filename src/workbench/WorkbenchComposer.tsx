import React from "react";
import { ChevronDown, Coins, Sparkles, Trash2, Upload, Wand2, X } from "lucide-react";

import { getAsset, getAssetVariantUrl, type AssetDownloadUrlResponse, type AssetItem } from "../assets/assetApi";
import { MenuSurface } from "../components/menu/MenuSurface";
import { useDismissibleLayer } from "../components/menu/useDismissibleLayer";
import type { ImageModelConfig } from "../config/imageModels";
import { listAiModelRoutes, type AiModelCatalogRoute } from "../services/v2AiModelCatalogApi";
import { uploadWorkbenchReferenceFile, type WorkbenchReferenceUploadView } from "../services/v2WorkbenchApi";
import { mapCatalogRoutesToRuntimeOptions } from "../flowCanvas/utils/modelCatalogOptions";
import type { RuntimeRouteOption } from "../flowCanvas/utils/runtimeRouteOptions";
import {
  WORKBENCH_FORMAT_OPTIONS,
  WORKBENCH_MODERATION_OPTIONS,
  WORKBENCH_QUALITY_OPTIONS,
  WORKBENCH_QUANTITY_OPTIONS,
  buildWorkbenchModelOptions,
} from "../flowCanvas/workbench/imageWorkbenchUtils";
import { getWorkbenchAspectOptions, getWorkbenchModelSizeOptions } from "./workbenchModelParams";
import { insertWorkbenchReferenceMention } from "./workbenchReferences";
import type { WorkbenchDraft } from "./workbenchTypes";

type Props = {
  compact?: boolean;
  draft: WorkbenchDraft;
  isGenerating: boolean;
  models: ImageModelConfig[];
  onAfterGenerate?: () => void;
  onChangeDraft: (patch: Partial<WorkbenchDraft>) => void;
  onGenerate: () => void;
};

type ReferencePreview = {
  asset: AssetItem | null;
  assetId: string;
  fileName?: string;
  loading: boolean;
  localPreviewUrl: string | null;
  previewUrl: string | null;
  upload?: WorkbenchReferenceUploadView | null;
};

type SelectOption = {
  icon?: React.ReactNode;
  label: string;
  value: string;
};

const TEXT = {
  addReference: "\u6dfb\u52a0\u53c2\u8003\u56fe",
  aspectRatio: "\u6bd4\u4f8b",
  aspectRatioLabel: "\u753b\u9762\u6bd4\u4f8b",
  clear: "\u6e05\u7a7a",
  configCost: "\u5f53\u524d\u914d\u7f6e\u6d88\u8017",
  imageModel: "\u56fe\u50cf\u6a21\u578b",
  imagePrefix: "\u56fe",
  imageSize: "\u753b\u8d28\u5c3a\u5bf8",
  imageUnit: "\u5f20",
  insertReference: "\u5f15\u7528",
  loading: "\u52a0\u8f7d\u4e2d",
  loadingRoute: "\u7ebf\u8def\u52a0\u8f7d\u4e2d",
  mergeDisplay: "\u5408\u5e76\u663e\u793a",
  model: "\u6a21\u578b",
  multiDisplay: "\u591a\u56fe\u663e\u793a",
  noPreview: "\u6682\u65e0\u9884\u89c8",
  optimize: "\u4f18\u5316 (0.5 \u91d1\u5e01)",
  prompt: "\u63d0\u793a\u8bcd",
  promptPlaceholder: "\u63cf\u8ff0\u4f60\u60f3\u8981\u751f\u6210\u7684\u56fe\u7247...",
  quantity: "\u6570\u91cf",
  reference: "\u53c2\u8003\u56fe",
  referenceHint: "\u53ef\u5728\u63d0\u793a\u8bcd\u4e2d\u8f93\u5165 @\u56fe1\u3001@\u56fe2 \u6307\u5b9a\u53c2\u8003\u56fe\uff0c\u8f93\u5165\u540e\u4f1a\u81ea\u52a8\u9ad8\u4eae\u5bf9\u5e94\u5361\u7247\u3002",
  removeReference: "\u79fb\u9664\u53c2\u8003\u56fe",
  route: "\u7ebf\u8def",
  routeOne: "\u7ebf\u8def\u4e00",
  separateDisplay: "\u591a\u8282\u70b9\u663e\u793a",
  start: "\u7acb\u5373\u5f00\u59cb\u521b\u4f5c",
  submitting: "\u751f\u6210\u4e2d...",
  unitPrice: "\u5355\u5f20 4.0 \u70b9\uff0c\u6700\u7ec8\u6309\u6570\u91cf\u81ea\u52a8\u5408\u8ba1\u3002",
  upload: "\u4e0a\u4f20",
};

const MAX_REFERENCE_COUNT = 10;
const routeOptionsCache = new Map<string, RuntimeRouteOption[]>();
const routeOptionsRequests = new Map<string, Promise<RuntimeRouteOption[]>>();

function isGptImage2Model(modelId: string) {
  return modelId === "gpt-image-2";
}

function loadRouteOptions(routeLookupKey: string): Promise<RuntimeRouteOption[]> {
  const cached = routeOptionsCache.get(routeLookupKey);
  if (cached) return Promise.resolve(cached);
  const pending = routeOptionsRequests.get(routeLookupKey);
  if (pending) return pending;

  const request = listAiModelRoutes(routeLookupKey)
    .then((routes: AiModelCatalogRoute[]) => {
      const options = mapCatalogRoutesToRuntimeOptions(routes);
      routeOptionsCache.set(routeLookupKey, options);
      return options;
    })
    .finally(() => {
      routeOptionsRequests.delete(routeLookupKey);
    });

  routeOptionsRequests.set(routeLookupKey, request);
  return request;
}

function formatSelectLabel(value: string) {
  return value.toUpperCase();
}

function formatGptOption(value: string) {
  if (value === "auto") return "Auto";
  return value.toUpperCase();
}

function formatRouteLabel(route: RuntimeRouteOption) {
  const label = route.userFacingLabel || route.label || "";
  if (label && !label.includes("image.") && !label.includes("pixellelabs")) return label;
  const lower = route.routeKey.toLowerCase();
  if (lower.includes(".t3") || lower.includes("line-2") || lower.includes("route-2")) return "\u7ebf\u8def\u4e8c";
  return TEXT.routeOne;
}

function getEstimatedCredits(draft: WorkbenchDraft) {
  const size = String(draft.size || "").toLowerCase();
  const perImage = size === "2k" ? 2 : size === "4k" ? 4 : 4;
  return Math.max(1, draft.quantity || 1) * perImage;
}

async function loadAssetPreviewUrl(assetId: string): Promise<AssetDownloadUrlResponse | null> {
  return getAssetVariantUrl(assetId, "preview").catch(() => getAssetVariantUrl(assetId).catch(() => null));
}

function getAspectIconSize(value: string) {
  const [rawWidth, rawHeight] = value.split(":").map((item) => Number(item));
  const width = Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : 1;
  const height = Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : 1;
  const max = 18;
  const min = 8;

  if (width >= height) {
    return {
      height: Math.max(min, Math.round((height / width) * max)),
      width: max,
    };
  }

  return {
    height: max,
    width: Math.max(min, Math.round((width / height) * max)),
  };
}

function AspectIcon({ value }: { value: string }) {
  const size = getAspectIconSize(value);
  return (
    <span
      className="block rounded-[4px] border border-[#f2df28]"
      data-testid={`workbench-aspect-icon-${value}`}
      style={{ height: `${size.height}px`, width: `${size.width}px` }}
    />
  );
}

function WorkbenchSelect({
  className = "",
  icon,
  label,
  onChange,
  openDirection = "up",
  options,
  value,
  wide = false,
}: {
  className?: string;
  icon?: React.ReactNode;
  label: string;
  onChange: (value: string) => void;
  openDirection?: "down" | "up";
  options: SelectOption[];
  value: string;
  wide?: boolean;
}) {
  const layer = useDismissibleLayer(`workbench-${label}`);
  const current = options.find((option) => option.value === value) ?? options[0];

  return (
    <div className={`relative ${className}`.trim()}>
      <button
        ref={layer.triggerRef as React.RefObject<HTMLButtonElement>}
        aria-expanded={layer.open}
        aria-haspopup="menu"
        aria-label={`${label} ${current?.label ?? ""}`.trim()}
        className="flex h-[34px] w-full items-center justify-between gap-2 rounded-[5px] border border-[#344762] bg-[#152337] px-2.5 text-[12px] font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] outline-none transition hover:border-[#4d6689]"
        onClick={layer.toggle}
        type="button"
      >
        <span className="flex min-w-0 items-center gap-2">
          {icon ? <span className="shrink-0 text-[#ffd728]">{icon}</span> : null}
          {current?.icon ? <span className="shrink-0 text-[#ffd728]">{current.icon}</span> : null}
          <span className="truncate">{current?.label}</span>
        </span>
        <ChevronDown
          className={`shrink-0 text-slate-300 transition ${layer.open && openDirection === "up" ? "rotate-180" : ""}`}
          size={14}
        />
      </button>
      {layer.open ? (
        <MenuSurface
          ref={layer.ref as React.RefObject<HTMLDivElement>}
          className={`${wide ? "w-full" : "min-w-[88px]"} absolute left-0 ${openDirection === "up" ? "bottom-[calc(100%+4px)]" : "top-[calc(100%+4px)]"} z-[1300] max-h-[240px] overflow-y-auto rounded-[7px] border border-[#3c4352] bg-[#151518] p-1 shadow-[0_14px_40px_rgba(0,0,0,0.55)]`}
          data-testid={`workbench-select-menu-${label}`}
          role="menu"
        >
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                className={`flex h-[31px] w-full items-center gap-2 rounded-[3px] px-2 text-left text-[12px] font-medium ${
                  selected ? "bg-[#27313c] text-white" : "text-slate-200 hover:bg-[#2a2034]"
                }`}
                onClick={() => {
                  onChange(option.value);
                  layer.closeLayer();
                }}
                role="menuitem"
                type="button"
              >
                {icon ? <span className="shrink-0">{icon}</span> : null}
                {option.icon ? <span className="grid h-[18px] w-[22px] shrink-0 place-items-center">{option.icon}</span> : null}
                <span>{option.label}</span>
              </button>
            );
          })}
        </MenuSurface>
      ) : null}
    </div>
  );
}

function ReferenceImageCard({
  compact = false,
  assetId,
  index,
  onDragEnd,
  onDragStart,
  onDrop,
  onInsertMention,
  onRemove,
  preview,
}: {
  compact?: boolean;
  assetId: string;
  index: number;
  onDragEnd: () => void;
  onDragStart: () => void;
  onDrop: () => void;
  onInsertMention: () => void;
  onRemove: () => void;
  preview: ReferencePreview;
}) {
  const imageUrl = preview.localPreviewUrl || preview.previewUrl;
  return (
    <div
      className={`group relative shrink-0 cursor-grab overflow-hidden border border-[#4c5667] bg-[#182031] active:cursor-grabbing ${
        compact ? "h-[88px] w-[72px] snap-start rounded-[14px]" : "h-[54px] w-[54px] rounded-[9px]"
      }`}
      data-testid={`workbench-reference-card-${index}`}
      draggable
      onDragEnd={onDragEnd}
      onDragOver={(event) => event.preventDefault()}
      onDragStart={(event) => {
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", assetId);
        }
        onDragStart();
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
    >
      {imageUrl ? (
        <img
          alt={`${TEXT.reference}${index}`}
          className="h-full w-full object-cover"
          src={imageUrl}
        />
      ) : (
        <div className="grid h-full place-items-center text-[11px] font-bold text-slate-500">
          {preview.loading ? TEXT.loading : TEXT.noPreview}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/68 to-transparent px-1.5 pb-1.5 pt-8">
        <div className="flex items-center justify-between gap-1">
          <div className="rounded-[6px] bg-black/50 px-1.5 py-0.5 text-[10px] font-black leading-none text-white ring-1 ring-white/15">
            {TEXT.imagePrefix}{index}
          </div>
          <button
            className={`rounded-full border border-white/15 bg-white/10 px-2 py-1 text-[10px] font-black leading-none text-white transition hover:bg-white hover:text-black ${
              compact ? "min-w-[44px]" : ""
            }`}
            onClick={onInsertMention}
            title={`${TEXT.insertReference} @${TEXT.imagePrefix}${index}`}
            type="button"
          >
            @{TEXT.imagePrefix}{index}
          </button>
        </div>
      </div>
      <button
        aria-label={`${TEXT.removeReference}${index}`}
        className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/65 text-white opacity-0 transition group-hover:opacity-90 focus:opacity-90 hover:bg-white hover:text-black"
        onClick={onRemove}
        type="button"
      >
        <X size={14} />
      </button>
    </div>
  );
}

function EmptyReferenceTile({ compact = false, onClick }: { compact?: boolean; onClick: () => void }) {
  return (
    <button
      className={`grid shrink-0 place-items-center border border-[#46546b] bg-[#192336] text-slate-300 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] ${
        compact ? "h-[88px] w-[72px] snap-start rounded-[14px]" : "h-[54px] w-[54px] rounded-[9px]"
      }`}
      onClick={onClick}
      type="button"
    >
      <span className={`grid place-items-center border border-dashed border-[#8a99ad] font-light leading-none ${compact ? "h-[42px] w-[42px] rounded-[12px] text-[22px]" : "h-[34px] w-[34px] rounded-[8px] text-[20px]"}`}>+</span>
    </button>
  );
}

export function WorkbenchComposer({
  compact = false,
  draft,
  isGenerating,
  models,
  onAfterGenerate,
  onChangeDraft,
  onGenerate,
}: Props) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const promptRef = React.useRef<HTMLTextAreaElement | null>(null);
  const referenceStripRef = React.useRef<HTMLDivElement | null>(null);
  const draggedReferenceIdRef = React.useRef<string | null>(null);
  const uploadedReferenceIdsRef = React.useRef<string[]>(draft.referenceUploadIds);
  const modelOptions = React.useMemo(() => buildWorkbenchModelOptions(models), [models]);
  const aspectOptions = React.useMemo(() => getWorkbenchAspectOptions(models, draft.modelId), [draft.modelId, models]);
  const sizeOptions = React.useMemo(() => getWorkbenchModelSizeOptions(models, draft.modelId), [draft.modelId, models]);
  const [pendingReferenceIds, setPendingReferenceIds] = React.useState<string[]>([]);
  const [routeOptionsByModel, setRouteOptionsByModel] = React.useState<Record<string, RuntimeRouteOption[]>>({});
  const [referencePreviews, setReferencePreviews] = React.useState<Record<string, ReferencePreview>>({});
  const [referenceScroll, setReferenceScroll] = React.useState({ left: 0, overflow: false, width: 100 });

  const routeLookupKey = modelOptions.find((item) => item.id === draft.modelId)?.routeLookupKey || draft.modelId;
  const routeOptions = routeOptionsByModel[routeLookupKey] || routeOptionsCache.get(routeLookupKey) || [];
  const visibleReferenceIds = React.useMemo(
    () => [...pendingReferenceIds, ...draft.referenceUploadIds, ...draft.referenceAssetIds].slice(0, MAX_REFERENCE_COUNT),
    [draft.referenceAssetIds, draft.referenceUploadIds, pendingReferenceIds],
  );
  const estimatedCredits = getEstimatedCredits(draft);

  const updateReferenceScroll = React.useCallback(() => {
    const element = referenceStripRef.current;
    if (!element) return;
    const hasMeasuredOverflow = element.scrollWidth > element.clientWidth + 1;
    const overflow = hasMeasuredOverflow || visibleReferenceIds.length > 4;
    const maxScroll = Math.max(1, element.scrollWidth - element.clientWidth);
    const width = overflow && element.scrollWidth > 0
      ? Math.max(18, Math.min(100, (element.clientWidth / element.scrollWidth) * 100))
      : 100;
    const left = Math.min(100 - width, Math.max(0, (element.scrollLeft / maxScroll) * (100 - width)));
    setReferenceScroll({ left, overflow, width });
  }, [visibleReferenceIds.length]);

  const scrollReferenceStrip = React.useCallback((direction: -1 | 1) => {
    const element = referenceStripRef.current;
    if (!element) return;
    element.scrollBy({ behavior: "smooth", left: direction * Math.max(96, Math.round(element.clientWidth * 0.72)) });
    window.setTimeout(updateReferenceScroll, 160);
  }, [updateReferenceScroll]);

  const jumpReferenceStrip = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const element = referenceStripRef.current;
    const track = event.currentTarget;
    if (!element || event.target !== track) return;
    const rect = track.getBoundingClientRect();
    const ratio = rect.width > 0 ? Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) : 0;
    element.scrollTo({ behavior: "smooth", left: ratio * Math.max(0, element.scrollWidth - element.clientWidth) });
    window.setTimeout(updateReferenceScroll, 160);
  }, [updateReferenceScroll]);

  const dragReferenceThumb = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const element = referenceStripRef.current;
    const track = event.currentTarget.parentElement;
    if (!element || !track) return;
    event.preventDefault();
    const startX = event.clientX;
    const startScrollLeft = element.scrollLeft;
    const maxScroll = Math.max(1, element.scrollWidth - element.clientWidth);
    const availableTrack = Math.max(1, track.clientWidth * (1 - referenceScroll.width / 100));

    const handleMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      element.scrollLeft = startScrollLeft + (delta / availableTrack) * maxScroll;
      updateReferenceScroll();
    };
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }, [referenceScroll.width, updateReferenceScroll]);

  React.useEffect(() => {
    uploadedReferenceIdsRef.current = draft.referenceUploadIds;
  }, [draft.referenceUploadIds]);

  React.useEffect(() => {
    updateReferenceScroll();
    const handleResize = () => updateReferenceScroll();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [updateReferenceScroll, visibleReferenceIds.length]);

  React.useEffect(() => {
    let active = true;
    modelOptions.forEach((option) => {
      const key = option.routeLookupKey || option.id;
      if (routeOptionsCache.has(key)) {
        setRouteOptionsByModel((current) => ({ ...current, [key]: routeOptionsCache.get(key) || [] }));
        return;
      }
      void loadRouteOptions(key)
        .then((options) => {
          if (!active) return;
          setRouteOptionsByModel((current) => ({ ...current, [key]: options }));
        })
        .catch(() => {
          if (!active) return;
          setRouteOptionsByModel((current) => ({ ...current, [key]: [] }));
        });
    });
    return () => {
      active = false;
    };
  }, [modelOptions]);

  React.useEffect(() => {
    if (!routeOptions[0]) return;
    if (draft.routeKey && routeOptions.some((item) => item.routeKey === draft.routeKey)) return;
    onChangeDraft({ routeKey: routeOptions[0].routeKey });
  }, [draft.routeKey, onChangeDraft, routeOptions]);

  React.useEffect(() => {
    let active = true;
    const missing = draft.referenceAssetIds.filter((assetId) => !referencePreviews[assetId]);
    if (missing.length === 0) return;

    missing.forEach((assetId) => {
      setReferencePreviews((current) => ({
        ...current,
        [assetId]: { asset: null, assetId, loading: true, localPreviewUrl: null, previewUrl: null },
      }));
      void Promise.all([
        getAsset(assetId).catch(() => null),
        loadAssetPreviewUrl(assetId),
      ]).then(([asset, signed]) => {
        if (!active) return;
        setReferencePreviews((current) => ({
          ...current,
          [assetId]: {
            asset,
            assetId,
            loading: false,
            localPreviewUrl: current[assetId]?.localPreviewUrl || null,
            previewUrl: signed?.url || asset?.previewUrl || null,
          },
        }));
      });
    });

    return () => {
      active = false;
    };
  }, [draft.referenceAssetIds]);

  const insertMention = React.useCallback((index: number) => {
    const caret = promptRef.current?.selectionStart ?? draft.prompt.length;
    const next = insertWorkbenchReferenceMention(draft.prompt, index, caret);
    onChangeDraft({ prompt: next.prompt });
    window.setTimeout(() => {
      promptRef.current?.focus();
      promptRef.current?.setSelectionRange(next.caretPosition, next.caretPosition);
    }, 0);
  }, [draft.prompt, onChangeDraft]);

  const handleUploadStart = React.useCallback((preview: ReferencePreview) => {
    setPendingReferenceIds((current) => Array.from(new Set([...current, preview.assetId])).slice(0, MAX_REFERENCE_COUNT));
    setReferencePreviews((current) => ({
      ...current,
      [preview.assetId]: {
        asset: null,
        assetId: preview.assetId,
        loading: true,
        localPreviewUrl: preview.localPreviewUrl,
        previewUrl: null,
      },
    }));
  }, []);

  const handleUploadComplete = React.useCallback((upload: WorkbenchReferenceUploadView, preview: Pick<ReferencePreview, "assetId" | "localPreviewUrl">) => {
    if (!upload?.id) return;
    const nextReferenceUploadIds = Array.from(new Set([...uploadedReferenceIdsRef.current, upload.id])).slice(0, MAX_REFERENCE_COUNT);
    uploadedReferenceIdsRef.current = nextReferenceUploadIds;
    setPendingReferenceIds((current) => current.filter((item) => item !== preview.assetId));
    setReferencePreviews((current) => {
      const local = current[preview.assetId]?.localPreviewUrl || preview.localPreviewUrl || null;
      const next = { ...current };
      delete next[preview.assetId];
      next[upload.id] = {
        asset: null,
        assetId: upload.id,
        loading: false,
        localPreviewUrl: local,
        previewUrl: upload.previewUrl || local || null,
        upload,
      };
      return next;
    });
    onChangeDraft({ referenceUploadIds: nextReferenceUploadIds });
  }, [onChangeDraft]);

  const openUpload = React.useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const reorderReferenceIds = React.useCallback((sourceId: string, targetId: string) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const current = visibleReferenceIds;
    const sourceIndex = current.indexOf(sourceId);
    const targetIndex = current.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;

    const next = [...current];
    const [moved] = next.splice(sourceIndex, 1);
    if (!moved) return;
    const nextTargetIndex = next.indexOf(targetId);
    next.splice(Math.max(0, nextTargetIndex), 0, moved);

    const nextPending = next.filter((item) => pendingReferenceIds.includes(item));
    const nextUploaded = next.filter((item) => draft.referenceUploadIds.includes(item));
    const nextAssets = next.filter((item) => draft.referenceAssetIds.includes(item));
    setPendingReferenceIds(nextPending);
    uploadedReferenceIdsRef.current = nextUploaded;
    onChangeDraft({ referenceAssetIds: nextAssets, referenceUploadIds: nextUploaded });
  }, [draft.referenceAssetIds, draft.referenceUploadIds, onChangeDraft, pendingReferenceIds, visibleReferenceIds]);

  const handleReferenceFiles = React.useCallback((files: FileList | null) => {
    const selectedFiles = Array.from(files ?? []).slice(0, Math.max(0, MAX_REFERENCE_COUNT - visibleReferenceIds.length));
    if (selectedFiles.length === 0) return;

    selectedFiles.forEach((file, index) => {
      const tempId = `${Date.now()}-${index}-${file.name}`;
      const preview: ReferencePreview = {
        asset: null,
        assetId: tempId,
        fileName: file.name,
        loading: true,
        localPreviewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
        previewUrl: null,
      };
      handleUploadStart(preview);
      void uploadWorkbenchReferenceFile({
        file,
        localPreviewUrl: preview.localPreviewUrl,
      })
        .then((upload) => handleUploadComplete(upload, preview))
        .catch(() => {
          setPendingReferenceIds((current) => current.filter((item) => item !== tempId));
          setReferencePreviews((current) => {
            const next = { ...current };
            delete next[tempId];
            return next;
          });
        });
    });

    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [handleUploadComplete, handleUploadStart, visibleReferenceIds.length]);

  const scrollBodyClassName = compact
    ? "flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain"
    : "flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overscroll-contain pr-1";

  return (
    <aside
      data-testid="workbench-composer"
      className={`workbench-composer flex h-full min-h-0 flex-col overflow-hidden border-white/8 bg-[#101014] px-2.5 py-2 text-white ${
        compact ? "max-h-[88vh]" : "border-r"
      }`}
    >
      <div data-testid="workbench-composer-scroll-body" className={scrollBodyClassName}>
      <section className={`rounded-[8px] border border-dashed border-[#334153] bg-[#11151b] ${compact ? "p-2.5" : "p-2"}`}>
        <input
          accept="image/*"
          className="hidden"
          multiple
          onChange={(event) => handleReferenceFiles(event.target.files)}
          ref={fileInputRef}
          type="file"
        />
        <div className="mb-1.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-bold text-slate-200">{TEXT.reference}</span>
            <span className="rounded-[5px] border border-[#315c9e] bg-[#17253b] px-1.5 py-0.5 text-[11px] font-black leading-none text-[#d7e8ff]">
              {visibleReferenceIds.length}/{MAX_REFERENCE_COUNT}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              aria-label={TEXT.upload}
              className="flex h-6 items-center gap-1 text-[12px] font-bold text-sky-300"
              onClick={openUpload}
              type="button"
            >
              <Upload size={13} />
              {TEXT.upload}
            </button>
            <button
              aria-label={TEXT.clear}
              className="grid h-6 w-6 place-items-center rounded-[5px] border border-white/8 bg-white/[0.03] text-slate-500 hover:text-white"
              onClick={() => {
                setPendingReferenceIds([]);
                uploadedReferenceIdsRef.current = [];
                onChangeDraft({ referenceAssetIds: [], referenceUploadIds: [] });
              }}
              type="button"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        <div className="relative">
        <div
          className={`flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
            compact ? "min-h-[94px] snap-x snap-mandatory overscroll-x-contain pr-3" : "min-h-[60px]"
          }`}
          data-scrollbar="visible"
          data-testid="workbench-reference-strip"
          onScroll={updateReferenceScroll}
          ref={referenceStripRef}
        >
          {visibleReferenceIds.length === 0 ? <EmptyReferenceTile compact={compact} onClick={openUpload} /> : null}
          {visibleReferenceIds.map((assetId, index) => (
            <ReferenceImageCard
              assetId={assetId}
              compact={compact}
              index={index + 1}
              key={assetId}
              onDragEnd={() => {
                draggedReferenceIdRef.current = null;
              }}
              onDragStart={() => {
                draggedReferenceIdRef.current = assetId;
              }}
              onDrop={() => {
                reorderReferenceIds(draggedReferenceIdRef.current || "", assetId);
              }}
              onInsertMention={() => insertMention(index + 1)}
              onRemove={() => {
                setPendingReferenceIds((current) => current.filter((item) => item !== assetId));
                const nextUploadIds = draft.referenceUploadIds.filter((item) => item !== assetId);
                uploadedReferenceIdsRef.current = nextUploadIds;
                onChangeDraft({
                  referenceAssetIds: draft.referenceAssetIds.filter((item) => item !== assetId),
                  referenceUploadIds: nextUploadIds,
                });
              }}
              preview={referencePreviews[assetId] || { asset: null, assetId, loading: true, localPreviewUrl: null, previewUrl: null }}
            />
          ))}
        </div>
        {compact && visibleReferenceIds.length > 0 ? (
          <>
            <div className="pointer-events-none absolute inset-y-0 left-0 w-5 bg-gradient-to-r from-[#11151b] to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-5 bg-gradient-to-l from-[#11151b] to-transparent" />
          </>
        ) : null}
        </div>
        {referenceScroll.overflow ? (
          compact ? (
            <div
              className="mt-2 flex items-center gap-2"
              data-testid="workbench-reference-scrollbar"
            >
              <div
                className="relative h-[4px] flex-1 rounded-full bg-white/10"
                data-testid="workbench-reference-scrollbar-track"
                onClick={jumpReferenceStrip}
              >
                <div
                  className="absolute top-0 h-[4px] cursor-grab rounded-full bg-cyan-300/80 shadow-[0_0_10px_rgba(103,232,249,0.38)] active:cursor-grabbing"
                  data-testid="workbench-reference-scrollbar-thumb"
                  onPointerDown={dragReferenceThumb}
                  style={{ left: `${referenceScroll.left}%`, width: `${referenceScroll.width}%` }}
                />
              </div>
              <div className="text-[10px] font-bold text-slate-500">滑动切换</div>
            </div>
          ) : (
            <div
              className="mt-1 grid h-[10px] grid-cols-[14px_minmax(0,1fr)_14px] items-center rounded-[3px] bg-[#202832]"
              data-testid="workbench-reference-scrollbar"
            >
              <button
                aria-label="Scroll references left"
                className="grid h-full place-items-center text-[#6f7884] hover:text-slate-200"
                data-testid="workbench-reference-scrollbar-prev"
                onClick={() => scrollReferenceStrip(-1)}
                type="button"
              >
                <span className="h-0 w-0 border-y-[4px] border-r-[5px] border-y-transparent border-r-current" />
              </button>
              <div
                className="h-[8px] rounded-[3px] bg-[#29323c] px-[2px]"
                data-testid="workbench-reference-scrollbar-track"
                onClick={jumpReferenceStrip}
              >
                <div
                  className="h-[6px] cursor-grab rounded-[3px] bg-[#6f7884] active:cursor-grabbing"
                  data-testid="workbench-reference-scrollbar-thumb"
                  onPointerDown={dragReferenceThumb}
                  style={{ marginLeft: `${referenceScroll.left}%`, width: `${referenceScroll.width}%` }}
                />
              </div>
              <button
                aria-label="Scroll references right"
                className="grid h-full place-items-center text-[#6f7884] hover:text-slate-200"
                data-testid="workbench-reference-scrollbar-next"
                onClick={() => scrollReferenceStrip(1)}
                type="button"
              >
                <span className="h-0 w-0 border-y-[4px] border-l-[5px] border-y-transparent border-l-current" />
              </button>
            </div>
          )
        ) : null}
      </section>

      <section className="grid gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-bold text-slate-300">{TEXT.prompt}</span>
          <button className="flex items-center gap-1 text-[12px] font-black text-[#ffd928]" type="button">
            <Sparkles size={13} />
            {TEXT.optimize}
          </button>
        </div>
        <textarea
          aria-label="Prompt"
          className="min-h-[66px] resize-y rounded-[9px] border border-[#3d3d42] bg-[#1d1d1f] px-3 py-1.5 text-[13px] font-medium leading-5 text-white outline-none placeholder:text-slate-500 focus:border-[#60606a]"
          onChange={(event) => onChangeDraft({ prompt: event.target.value })}
          placeholder={TEXT.promptPlaceholder}
          ref={promptRef}
          value={draft.prompt}
        />
        <p className="text-[10px] leading-4 text-slate-400">{TEXT.referenceHint}</p>
      </section>

      <section className="grid gap-1.5">
        <span className="text-[11px] font-bold text-slate-500">{TEXT.imageModel}</span>
        <WorkbenchSelect
          icon={<Sparkles size={14} />}
          label={TEXT.imageModel}
          onChange={(value) => {
            const nextModel = modelOptions.find((item) => item.id === value);
            const nextRouteLookupKey = nextModel?.routeLookupKey || value;
            const nextRoutes = routeOptionsByModel[nextRouteLookupKey] || routeOptionsCache.get(nextRouteLookupKey) || [];
            onChangeDraft({
              modelId: value,
              routeKey: nextRoutes[0]?.routeKey || "",
              size: String(nextModel?.defaultSize || "1k").toLowerCase(),
            });
          }}
          options={modelOptions.map((item) => ({ label: item.label, value: item.id }))}
          value={draft.modelId}
          wide
        />
      </section>

      <section className="grid gap-1.5" data-testid="workbench-route-row">
        <span className="text-[11px] font-bold text-slate-500">{TEXT.route}</span>
        <WorkbenchSelect
          label={TEXT.route}
          onChange={(value) => onChangeDraft({ routeKey: value })}
          options={routeOptions.length > 0
            ? routeOptions.map((item) => ({ label: formatRouteLabel(item), value: item.routeKey }))
            : [{ label: TEXT.loadingRoute, value: "" }]}
          value={draft.routeKey}
          wide
        />
      </section>

      <section className="grid grid-cols-3 gap-2" data-testid="workbench-param-row">
        <label className="grid gap-1.5">
          <span className="text-[11px] font-bold text-slate-500">{TEXT.aspectRatioLabel}</span>
          <WorkbenchSelect
            label={TEXT.aspectRatioLabel}
            onChange={(value) => onChangeDraft({ aspectRatio: value })}
            options={aspectOptions.map((value) => ({ icon: <AspectIcon value={value} />, label: value, value }))}
            value={draft.aspectRatio}
          />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[11px] font-bold text-slate-500">{TEXT.imageSize}</span>
          <WorkbenchSelect
            label={TEXT.imageSize}
            onChange={(value) => onChangeDraft({ size: value })}
            options={sizeOptions.map((value) => ({ label: formatSelectLabel(value), value }))}
            value={draft.size}
          />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[11px] font-bold text-slate-500">{TEXT.quantity}</span>
          <WorkbenchSelect
            label={TEXT.quantity}
            onChange={(value) => onChangeDraft({ quantity: Number(value) || 1 })}
            options={WORKBENCH_QUANTITY_OPTIONS.map((value) => ({ label: value, value }))}
            value={String(draft.quantity)}
          />
        </label>
      </section>

      {isGptImage2Model(draft.modelId) ? (
        <section className="grid grid-cols-3 gap-2">
          <WorkbenchSelect
            label="Quality"
            onChange={(value) => onChangeDraft({ quality: value as WorkbenchDraft["quality"] })}
            options={WORKBENCH_QUALITY_OPTIONS.map((value) => ({ label: formatGptOption(value), value }))}
            value={draft.quality}
          />
          <WorkbenchSelect
            label="Format"
            onChange={(value) => onChangeDraft({ outputFormat: value as WorkbenchDraft["outputFormat"] })}
            options={WORKBENCH_FORMAT_OPTIONS.map((value) => ({ label: formatGptOption(value), value }))}
            value={draft.outputFormat}
          />
          <WorkbenchSelect
            label="Moderation"
            onChange={(value) => onChangeDraft({ moderation: value as WorkbenchDraft["moderation"] })}
            options={WORKBENCH_MODERATION_OPTIONS.map((value) => ({ label: formatGptOption(value), value }))}
            value={draft.moderation}
          />
        </section>
      ) : null}

      {draft.quantity > 1 ? (
        <section className="grid grid-cols-2 gap-2">
          <button
            className={`h-9 rounded-[7px] border text-[12px] font-bold ${
              draft.displayMode === "merged"
                ? "border-[#f0d72d]/45 bg-[#2b2609] text-[#ffe653]"
                : "border-white/10 bg-white/[0.03] text-slate-400"
            }`}
            onClick={() => onChangeDraft({ displayMode: "merged" })}
            type="button"
          >
            {TEXT.mergeDisplay}
          </button>
          <button
            className={`h-9 rounded-[7px] border text-[12px] font-bold ${
              draft.displayMode === "separate"
                ? "border-[#f0d72d]/45 bg-[#2b2609] text-[#ffe653]"
                : "border-white/10 bg-white/[0.03] text-slate-400"
            }`}
            onClick={() => onChangeDraft({ displayMode: "separate" })}
            type="button"
          >
            {TEXT.separateDisplay}
          </button>
        </section>
      ) : null}
      </div>

      <div
        data-testid="workbench-composer-footer"
        className={`shrink-0 ${compact ? "pt-3" : "mt-1.5 border-t border-white/8 bg-[#101014] pt-1.5"}`}
      >
      <button
        aria-label={TEXT.start}
        className="flex h-[42px] w-full items-center justify-center gap-2 rounded-[8px] bg-gradient-to-r from-[#b515ff] via-[#7c29ff] to-[#236dff] text-[14px] font-black text-white shadow-[0_12px_30px_rgba(82,57,255,0.35)] transition disabled:cursor-not-allowed disabled:bg-none disabled:bg-[#3a465b] disabled:text-slate-400 disabled:shadow-none"
        disabled={isGenerating || !draft.prompt.trim() || !draft.routeKey}
        onClick={() => {
          onGenerate();
          onAfterGenerate?.();
        }}
        type="button"
      >
        <Wand2 size={16} />
        {isGenerating ? TEXT.submitting : TEXT.start}
      </button>
      <span className="sr-only">
        {TEXT.configCost} {estimatedCredits.toFixed(1)} {TEXT.unitPrice}
      </span>
      </div>
    </aside>
  );
}
