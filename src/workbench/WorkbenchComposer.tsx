import React from "react";
import { ChevronDown, Coins, Sparkles, Trash2, Upload, Wand2, X } from "lucide-react";

import { getAsset, getAssetVariantUrl, uploadAssetFile, type AssetDownloadUrlResponse, type AssetItem } from "../assets/assetApi";
import { MenuSurface } from "../components/menu/MenuSurface";
import { useDismissibleLayer } from "../components/menu/useDismissibleLayer";
import type { ImageModelConfig } from "../config/imageModels";
import { listAiModelRoutes, type AiModelCatalogRoute } from "../services/v2AiModelCatalogApi";
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
};

type SelectOption = {
  label: string;
  value: string;
};

const TEXT = {
  addReference: "\u6dfb\u52a0\u53c2\u8003\u56fe",
  aspectRatio: "\u6bd4\u4f8b",
  aspectRatioLabel: "\u753b\u9762\u6bd4\u4f8b",
  clear: "\u6e05\u7a7a",
  configCost: "\u5f53\u524d\u914d\u7f6e\u6d88\u8017",
  currentConfig: "\u5f53\u524d\u914d\u7f6e\u8be6\u60c5",
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

function AspectIcon() {
  return <span className="block h-[13px] w-[18px] rounded-[5px] border border-[#f2df28]" />;
}

function WorkbenchSelect({
  className = "",
  icon,
  label,
  onChange,
  options,
  value,
  wide = false,
}: {
  className?: string;
  icon?: React.ReactNode;
  label: string;
  onChange: (value: string) => void;
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
          <span className="truncate">{current?.label}</span>
        </span>
        <ChevronDown className={`shrink-0 text-slate-300 transition ${layer.open ? "rotate-180" : ""}`} size={14} />
      </button>
      {layer.open ? (
        <MenuSurface
          ref={layer.ref as React.RefObject<HTMLDivElement>}
          className={`${wide ? "w-full" : "min-w-[88px]"} absolute left-0 top-[calc(100%+4px)] z-[1300] overflow-hidden rounded-[7px] border border-[#3c4352] bg-[#151518] p-1 shadow-[0_14px_40px_rgba(0,0,0,0.55)]`}
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
  index,
  onInsertMention,
  onRemove,
  preview,
}: {
  index: number;
  onInsertMention: () => void;
  onRemove: () => void;
  preview: ReferencePreview;
}) {
  const imageUrl = preview.localPreviewUrl || preview.previewUrl;
  return (
    <div className="group relative h-[74px] w-[74px] shrink-0 overflow-hidden rounded-[11px] border border-[#4c5667] bg-[#182031]">
      {imageUrl ? (
        <img alt={`${TEXT.reference}${index}`} className="h-full w-full object-cover" src={imageUrl} />
      ) : (
        <div className="grid h-full place-items-center text-[11px] font-bold text-slate-500">
          {preview.loading ? TEXT.loading : TEXT.noPreview}
        </div>
      )}
      <button
        className="absolute inset-0"
        onClick={onInsertMention}
        title={`${TEXT.insertReference} @${TEXT.imagePrefix}${index}`}
        type="button"
      />
      <div className="absolute bottom-1.5 left-1.5 rounded-[5px] bg-black/70 px-1.5 py-0.5 text-[11px] font-black leading-none text-white ring-1 ring-white/15">
        {TEXT.imagePrefix}{index}
      </div>
      <button
        aria-label={`${TEXT.removeReference}${index}`}
        className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/65 text-white opacity-90 transition hover:bg-white hover:text-black"
        onClick={onRemove}
        type="button"
      >
        <X size={14} />
      </button>
    </div>
  );
}

function EmptyReferenceTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="grid h-[74px] w-[74px] shrink-0 place-items-center rounded-[11px] border border-[#46546b] bg-[#192336] text-slate-300 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]"
      onClick={onClick}
      type="button"
    >
      <span className="grid h-[45px] w-[45px] place-items-center rounded-[9px] border border-dashed border-[#8a99ad] text-[22px] font-light leading-none">+</span>
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
  const uploadedReferenceIdsRef = React.useRef<string[]>(draft.referenceAssetIds);
  const modelOptions = React.useMemo(() => buildWorkbenchModelOptions(models), [models]);
  const aspectOptions = React.useMemo(() => getWorkbenchAspectOptions(models, draft.modelId), [draft.modelId, models]);
  const sizeOptions = React.useMemo(() => getWorkbenchModelSizeOptions(models, draft.modelId), [draft.modelId, models]);
  const [pendingReferenceIds, setPendingReferenceIds] = React.useState<string[]>([]);
  const [routeOptionsByModel, setRouteOptionsByModel] = React.useState<Record<string, RuntimeRouteOption[]>>({});
  const [referencePreviews, setReferencePreviews] = React.useState<Record<string, ReferencePreview>>({});

  const routeLookupKey = modelOptions.find((item) => item.id === draft.modelId)?.routeLookupKey || draft.modelId;
  const routeOptions = routeOptionsByModel[routeLookupKey] || routeOptionsCache.get(routeLookupKey) || [];
  const activeModelLabel = modelOptions.find((item) => item.id === draft.modelId)?.label || draft.modelId;
  const activeRouteLabel = routeOptions.find((item) => item.routeKey === draft.routeKey)
    ? formatRouteLabel(routeOptions.find((item) => item.routeKey === draft.routeKey)!)
    : TEXT.routeOne;
  const visibleReferenceIds = React.useMemo(
    () => [...pendingReferenceIds, ...draft.referenceAssetIds].slice(0, MAX_REFERENCE_COUNT),
    [draft.referenceAssetIds, pendingReferenceIds],
  );
  const estimatedCredits = getEstimatedCredits(draft);

  React.useEffect(() => {
    uploadedReferenceIdsRef.current = draft.referenceAssetIds;
  }, [draft.referenceAssetIds]);

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
  }, [draft.referenceAssetIds, referencePreviews]);

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

  const handleUploadComplete = React.useCallback((asset: AssetItem, preview: Pick<ReferencePreview, "assetId" | "localPreviewUrl">) => {
    if (!asset?.id) return;
    const nextReferenceAssetIds = Array.from(new Set([...uploadedReferenceIdsRef.current, asset.id])).slice(0, MAX_REFERENCE_COUNT);
    uploadedReferenceIdsRef.current = nextReferenceAssetIds;
    setPendingReferenceIds((current) => current.filter((item) => item !== preview.assetId));
    setReferencePreviews((current) => {
      const local = current[preview.assetId]?.localPreviewUrl || preview.localPreviewUrl || null;
      const next = { ...current };
      delete next[preview.assetId];
      next[asset.id] = {
        asset,
        assetId: asset.id,
        loading: false,
        localPreviewUrl: local,
        previewUrl: asset.previewUrl || null,
      };
      return next;
    });
    onChangeDraft({ referenceAssetIds: nextReferenceAssetIds });

    void loadAssetPreviewUrl(asset.id).then((signed) => {
      setReferencePreviews((current) => ({
        ...current,
        [asset.id]: {
          ...(current[asset.id] || { asset, assetId: asset.id, localPreviewUrl: null }),
          asset,
          assetId: asset.id,
          loading: false,
          previewUrl: signed?.url || current[asset.id]?.previewUrl || asset.previewUrl || null,
        },
      }));
    });
  }, [onChangeDraft]);

  const openUpload = React.useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleReferenceFiles = React.useCallback((files: FileList | null) => {
    const selectedFiles = Array.from(files ?? []).slice(0, Math.max(0, MAX_REFERENCE_COUNT - uploadedReferenceIdsRef.current.length));
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
      void uploadAssetFile({ file })
        .then((asset) => handleUploadComplete(asset, preview))
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
  }, [handleUploadComplete, handleUploadStart]);

  return (
    <aside
      data-testid="workbench-composer"
      className={`workbench-composer flex min-h-0 flex-col gap-3 overflow-y-auto border-white/8 bg-[#101014] px-4 py-3 text-white ${
        compact ? "max-h-[88vh]" : "border-r"
      }`}
    >
      <section className="rounded-[8px] border border-dashed border-[#334153] bg-[#11151b] p-3">
        <input
          accept="image/*"
          className="hidden"
          multiple
          onChange={(event) => handleReferenceFiles(event.target.files)}
          ref={fileInputRef}
          type="file"
        />
        <div className="mb-2 flex items-center justify-between">
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
                onChangeDraft({ referenceAssetIds: [] });
              }}
              type="button"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        <div className="flex min-h-[82px] gap-2 overflow-x-auto pb-1 [scrollbar-color:#4b5563_transparent] [scrollbar-width:thin]">
          {visibleReferenceIds.length === 0 ? <EmptyReferenceTile onClick={openUpload} /> : null}
          {visibleReferenceIds.map((assetId, index) => (
            <ReferenceImageCard
              index={index + 1}
              key={assetId}
              onInsertMention={() => insertMention(index + 1)}
              onRemove={() => {
                setPendingReferenceIds((current) => current.filter((item) => item !== assetId));
                onChangeDraft({ referenceAssetIds: draft.referenceAssetIds.filter((item) => item !== assetId) });
              }}
              preview={referencePreviews[assetId] || { asset: null, assetId, loading: true, localPreviewUrl: null, previewUrl: null }}
            />
          ))}
        </div>
      </section>

      <section className="grid gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-bold text-slate-300">{TEXT.prompt}</span>
          <button className="flex items-center gap-1 text-[12px] font-black text-[#ffd928]" type="button">
            <Sparkles size={13} />
            {TEXT.optimize}
          </button>
        </div>
        <textarea
          aria-label="Prompt"
          className="min-h-[96px] resize-y rounded-[10px] border border-[#3d3d42] bg-[#1d1d1f] px-3 py-3 text-[13px] font-medium leading-6 text-white outline-none placeholder:text-slate-500 focus:border-[#60606a]"
          onChange={(event) => onChangeDraft({ prompt: event.target.value })}
          placeholder={TEXT.promptPlaceholder}
          ref={promptRef}
          value={draft.prompt}
        />
        <p className="text-[11px] leading-5 text-slate-400">{TEXT.referenceHint}</p>
      </section>

      <section className="grid gap-2">
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

      <section className="grid grid-cols-4 gap-2">
        <label className="grid gap-1.5">
          <span className="text-[11px] font-bold text-slate-500">{TEXT.aspectRatioLabel}</span>
          <WorkbenchSelect
            icon={<AspectIcon />}
            label={TEXT.aspectRatioLabel}
            onChange={(value) => onChangeDraft({ aspectRatio: value })}
            options={aspectOptions.map((value) => ({ label: value, value }))}
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
          <span className="text-[11px] font-bold text-slate-500">{TEXT.route}</span>
          <WorkbenchSelect
            label={TEXT.route}
            onChange={(value) => onChangeDraft({ routeKey: value })}
            options={routeOptions.length > 0
              ? routeOptions.map((item) => ({ label: formatRouteLabel(item), value: item.routeKey }))
              : [{ label: TEXT.loadingRoute, value: "" }]}
            value={draft.routeKey}
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

      <section className="mt-auto rounded-[11px] border border-[#6b5d0b] bg-[#171605] p-3 shadow-[inset_0_0_0_1px_rgba(255,224,32,0.08)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-slate-300">{TEXT.currentConfig}</div>
            <div className="mt-1 truncate text-[11px] text-slate-500">
              {activeModelLabel} / {activeRouteLabel} / {formatSelectLabel(draft.size)} / {draft.aspectRatio}
            </div>
            <div className="mt-1 text-[11px] text-slate-500">{TEXT.unitPrice}</div>
          </div>
          <div className="flex h-[34px] min-w-[70px] items-center justify-center gap-1 rounded-[8px] border border-[#8a7207] bg-[#1d1902] px-2 text-[17px] font-black text-[#ffdd25]">
            <Coins size={15} />
            {estimatedCredits.toFixed(1)}
          </div>
        </div>
        <span className="sr-only">{TEXT.configCost}</span>
      </section>

      <button
        aria-label={TEXT.start}
        className="flex h-[45px] w-full items-center justify-center gap-2 rounded-[8px] bg-gradient-to-r from-[#b515ff] via-[#7c29ff] to-[#236dff] text-[14px] font-black text-white shadow-[0_12px_30px_rgba(82,57,255,0.35)] transition disabled:cursor-not-allowed disabled:bg-none disabled:bg-[#3a465b] disabled:text-slate-400 disabled:shadow-none"
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
    </aside>
  );
}
