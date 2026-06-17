import React from "react";
import { ImagePlus, X } from "lucide-react";

import { getAsset, getAssetVariantUrl, type AssetItem, type AssetDownloadUrlResponse } from "../assets/assetApi";
import { UploadAssetButton, type UploadAssetPreview } from "../assets/UploadAssetButton";
import type { ImageModelConfig } from "../config/imageModels";
import { MenuSelect } from "../components/menu/MenuSelect";
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
  loading: boolean;
  localPreviewUrl: string | null;
  previewUrl: string | null;
};

const TEXT = {
  addReference: "\u6dfb\u52a0\u53c2\u8003\u56fe",
  aspectRatio: "\u6bd4\u4f8b",
  clear: "\u6e05\u7a7a",
  generationCount: "\u751f\u6210\u6570\u91cf",
  imageQuality: "\u753b\u8d28",
  insertReference: "\u5f15\u7528",
  loading: "\u52a0\u8f7d\u4e2d",
  loadingRoute: "\u7ebf\u8def\u52a0\u8f7d\u4e2d",
  mergeDisplay: "\u5408\u5e76\u663e\u793a",
  model: "\u6a21\u578b",
  multiDisplay: "\u591a\u56fe\u663e\u793a",
  noPreview: "\u6682\u65e0\u9884\u89c8",
  prompt: "\u63d0\u793a\u8bcd",
  promptPlaceholder: "\u63cf\u8ff0\u753b\u9762\u5185\u5bb9\u3001\u5149\u5f71\u3001\u98ce\u683c... \u652f\u6301 @\u56fe1 @\u56fe2 \u5f15\u7528\u53c2\u8003\u56fe",
  quantity: "\u6570\u91cf",
  reference: "\u53c2\u8003\u56fe",
  referenceHint: "\u652f\u6301\u5728\u63d0\u793a\u8bcd\u4e2d\u8f93\u5165 @\u56fe1 @\u56fe2 \u7cbe\u51c6\u5f15\u7528",
  removeReference: "\u79fb\u9664\u53c2\u8003\u56fe",
  route: "\u7ebf\u8def",
  separateDisplay: "\u591a\u8282\u70b9\u663e\u793a",
  start: "\u5f00\u59cb\u751f\u6210",
  submitting: "\u751f\u6210\u4e2d...",
  imagePrefix: "\u56fe",
  imageUnit: "\u5f20",
};

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

async function loadAssetPreviewUrl(assetId: string): Promise<AssetDownloadUrlResponse | null> {
  return getAssetVariantUrl(assetId, "preview").catch(() => getAssetVariantUrl(assetId).catch(() => null));
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
    <div className="group overflow-hidden rounded-[14px] border border-white/10 bg-white/[0.045]">
      <div className="relative aspect-[4/3] bg-black/30">
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
        <div className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-1 text-[11px] font-black text-white">
          图{index}
        </div>
        <button
          aria-label={`${TEXT.removeReference}${index}`}
          className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/65 text-white opacity-90 transition hover:bg-white hover:text-black"
          onClick={onRemove}
          type="button"
        >
          <X size={14} />
        </button>
      </div>
      <div className="flex items-center justify-between gap-2 px-2.5 py-2">
        <div className="min-w-0">
          <div className="truncate text-[11px] font-bold text-slate-200">
            {preview.asset?.title || preview.asset?.originalFilename || preview.assetId.slice(0, 8)}
          </div>
          <div className="mt-0.5 text-[10px] text-slate-500">@图{index}</div>
        </div>
        <button
          className="h-7 shrink-0 rounded-full border border-white/10 bg-white/[0.08] px-2.5 text-[11px] font-black text-white hover:bg-white hover:text-black"
          onClick={onInsertMention}
          type="button"
        >
          {TEXT.insertReference}
        </button>
      </div>
    </div>
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
  const promptRef = React.useRef<HTMLTextAreaElement | null>(null);
  const uploadedReferenceIdsRef = React.useRef<string[]>(draft.referenceAssetIds);
  const modelOptions = React.useMemo(() => buildWorkbenchModelOptions(models), [models]);
  const aspectOptions = React.useMemo(() => getWorkbenchAspectOptions(models, draft.modelId), [draft.modelId, models]);
  const sizeOptions = React.useMemo(() => getWorkbenchModelSizeOptions(models, draft.modelId), [draft.modelId, models]);
  const [routeOptionsByModel, setRouteOptionsByModel] = React.useState<Record<string, RuntimeRouteOption[]>>({});
  const [referencePreviews, setReferencePreviews] = React.useState<Record<string, ReferencePreview>>({});

  const routeLookupKey = modelOptions.find((item) => item.id === draft.modelId)?.routeLookupKey || draft.modelId;
  const routeOptions = routeOptionsByModel[routeLookupKey] || routeOptionsCache.get(routeLookupKey) || [];

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

  const handleUploadStart = React.useCallback((preview: UploadAssetPreview) => {
    setReferencePreviews((current) => ({
      ...current,
      [preview.id]: {
        asset: null,
        assetId: preview.id,
        loading: true,
        localPreviewUrl: preview.previewUrl,
        previewUrl: null,
      },
    }));
  }, []);

  const handleUploadComplete = React.useCallback((asset: AssetItem, preview: UploadAssetPreview) => {
    if (!asset?.id) return;
    const nextReferenceAssetIds = Array.from(new Set([...uploadedReferenceIdsRef.current, asset.id]));
    uploadedReferenceIdsRef.current = nextReferenceAssetIds;
    setReferencePreviews((current) => {
      const local = current[preview.id]?.localPreviewUrl || preview.previewUrl || null;
      const next = { ...current };
      delete next[preview.id];
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

  return (
    <aside
      data-testid="workbench-composer"
      className={`flex min-h-0 flex-col gap-4 overflow-y-auto border-white/8 bg-[#101014] p-5 ${
        compact ? "max-h-[88vh]" : "border-r"
      }`}
    >
      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold text-slate-300">{TEXT.reference}</div>
          {draft.referenceAssetIds.length > 0 ? (
            <button
              className="text-[11px] font-bold text-slate-500 hover:text-white"
              onClick={() => onChangeDraft({ referenceAssetIds: [] })}
              type="button"
            >
              {TEXT.clear}
            </button>
          ) : null}
        </div>
        <div className="grid gap-3 rounded-[16px] border border-dashed border-white/12 bg-white/[0.025] p-3">
          {draft.referenceAssetIds.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {draft.referenceAssetIds.map((assetId, index) => (
                <ReferenceImageCard
                  index={index + 1}
                  key={assetId}
                  onInsertMention={() => insertMention(index + 1)}
                  onRemove={() =>
                    onChangeDraft({
                      referenceAssetIds: draft.referenceAssetIds.filter((item) => item !== assetId),
                    })
                  }
                  preview={referencePreviews[assetId] || { asset: null, assetId, loading: true, localPreviewUrl: null, previewUrl: null }}
                />
              ))}
            </div>
          ) : (
            <div className="grid min-h-[96px] place-items-center rounded-[14px] border border-white/8 bg-white/[0.035] text-center">
              <div>
                <ImagePlus className="mx-auto text-slate-500" size={22} />
                <div className="mt-2 text-xs font-bold text-slate-300">{TEXT.addReference}</div>
                <div className="mt-1 text-[11px] text-slate-500">{TEXT.referenceHint}</div>
              </div>
            </div>
          )}
          <UploadAssetButton
            onUploaded={() => undefined}
            onUploadComplete={handleUploadComplete}
            onUploadStart={handleUploadStart}
            variant="compact"
          />
        </div>
      </div>

      <label className="grid gap-2">
        <span className="text-xs font-bold text-slate-300">{TEXT.prompt}</span>
        <textarea
          aria-label="Prompt"
          className="min-h-[132px] resize-y rounded-[14px] border border-white/10 bg-white/[0.045] px-3 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-600"
          onChange={(event) => onChangeDraft({ prompt: event.target.value })}
          placeholder={TEXT.promptPlaceholder}
          ref={promptRef}
          value={draft.prompt}
        />
      </label>

      <div className="grid gap-3">
        <label className="grid gap-2">
          <span className="text-xs font-bold text-slate-300">{TEXT.model}</span>
          <MenuSelect
            fullWidth
            label="Model"
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
          />
        </label>

        <label className="grid gap-2">
          <span className="text-xs font-bold text-slate-300">{TEXT.route}</span>
          <MenuSelect
            disabled={routeOptions.length === 0}
            fullWidth
            label="Route"
            onChange={(value) => onChangeDraft({ routeKey: value })}
            options={routeOptions.length > 0
              ? routeOptions.map((item) => ({ label: item.userFacingLabel || item.label, value: item.routeKey }))
              : [{ label: TEXT.loadingRoute, value: "" }]}
            value={draft.routeKey}
          />
        </label>

        <div className="grid grid-cols-3 gap-3">
          <label className="grid gap-2">
            <span className="text-xs font-bold text-slate-300">{TEXT.aspectRatio}</span>
            <MenuSelect
              fullWidth
              label="Aspect ratio"
              onChange={(value) => onChangeDraft({ aspectRatio: value })}
              options={aspectOptions.map((value) => ({ label: value, value }))}
              value={draft.aspectRatio}
            />
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-bold text-slate-300">{TEXT.imageQuality}</span>
            <MenuSelect
              fullWidth
              label="Size"
              onChange={(value) => onChangeDraft({ size: value })}
              options={sizeOptions.map((value) => ({ label: formatSelectLabel(value), value }))}
              value={draft.size}
            />
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-bold text-slate-300">{TEXT.quantity}</span>
            <MenuSelect
              fullWidth
              label="Quantity"
              onChange={(value) => onChangeDraft({ quantity: Number(value) || 1 })}
              options={WORKBENCH_QUANTITY_OPTIONS.map((value) => ({ label: value, value }))}
              value={String(draft.quantity)}
            />
          </label>
        </div>

        {isGptImage2Model(draft.modelId) ? (
          <div className="grid grid-cols-3 gap-3">
            <MenuSelect
              fullWidth
              label="Quality"
              onChange={(value) => onChangeDraft({ quality: value as WorkbenchDraft["quality"] })}
              options={WORKBENCH_QUALITY_OPTIONS.map((value) => ({ label: formatGptOption(value), value }))}
              value={draft.quality}
            />
            <MenuSelect
              fullWidth
              label="Format"
              onChange={(value) => onChangeDraft({ outputFormat: value as WorkbenchDraft["outputFormat"] })}
              options={WORKBENCH_FORMAT_OPTIONS.map((value) => ({ label: formatGptOption(value), value }))}
              value={draft.outputFormat}
            />
            <MenuSelect
              fullWidth
              label="Moderation"
              onChange={(value) => onChangeDraft({ moderation: value as WorkbenchDraft["moderation"] })}
              options={WORKBENCH_MODERATION_OPTIONS.map((value) => ({ label: formatGptOption(value), value }))}
              value={draft.moderation}
            />
          </div>
        ) : null}
      </div>

      {draft.quantity > 1 ? (
        <label className="grid gap-2">
          <span className="text-xs font-bold text-slate-300">{TEXT.multiDisplay}</span>
          <div className="grid grid-cols-2 gap-3">
            <button
              className={`h-10 rounded-[12px] border text-xs font-bold ${
                draft.displayMode === "merged"
                  ? "border-white/20 bg-white/[0.11] text-white"
                  : "border-white/10 bg-white/[0.03] text-slate-400"
              }`}
              onClick={() => onChangeDraft({ displayMode: "merged" })}
              type="button"
            >
              {TEXT.mergeDisplay}
            </button>
            <button
              className={`h-10 rounded-[12px] border text-xs font-bold ${
                draft.displayMode === "separate"
                  ? "border-white/20 bg-white/[0.11] text-white"
                  : "border-white/10 bg-white/[0.03] text-slate-400"
              }`}
              onClick={() => onChangeDraft({ displayMode: "separate" })}
              type="button"
            >
              {TEXT.separateDisplay}
            </button>
          </div>
        </label>
      ) : null}

      <div className="mt-auto flex items-center justify-between gap-3 rounded-[16px] border border-white/10 bg-white/[0.05] px-4 py-3">
        <div className="min-w-0">
          <div className="text-xs font-bold text-slate-400">{TEXT.generationCount}</div>
          <div className="mt-1 text-sm font-bold text-white">{draft.quantity} 张</div>
        </div>
        <button
          className="h-11 min-w-[112px] rounded-full bg-white px-5 text-sm font-black text-black disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-slate-500"
          disabled={isGenerating || !draft.prompt.trim() || !draft.routeKey}
          onClick={() => {
            onGenerate();
            onAfterGenerate?.();
          }}
          type="button"
        >
          {isGenerating ? TEXT.submitting : TEXT.start}
        </button>
      </div>
    </aside>
  );
}
