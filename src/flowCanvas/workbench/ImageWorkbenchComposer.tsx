import React from "react";

import type { ImageModelConfig } from "../../config/imageModels";
import { MenuSelect } from "../../components/menu/MenuSelect";
import { listAiModelRoutes, type AiModelCatalogRoute } from "../../services/v2AiModelCatalogApi";
import { getDisplayImageCredits, getOfficialImageRouteSizeCredits } from "../utils/imageRoutePricing";
import { mapCatalogRoutesToRuntimeOptions } from "../utils/modelCatalogOptions";
import { GptImage2ParamPanel } from "../nodes/GptImage2ParamPanel";
import { NanoBananaParamPanel } from "../nodes/NanoBananaParamPanel";
import type { ImageWorkbenchDraft } from "./imageWorkbenchTypes";
import {
  WORKBENCH_FORMAT_OPTIONS,
  WORKBENCH_MODERATION_OPTIONS,
  WORKBENCH_QUALITY_OPTIONS,
  WORKBENCH_QUANTITY_OPTIONS,
  buildWorkbenchImageSizeParamPatch,
  buildWorkbenchModelOptions,
  getWorkbenchAspectRatioOptions,
  getWorkbenchModelSummaryLabel,
} from "./imageWorkbenchUtils";

type RuntimeRouteOption = ReturnType<typeof mapCatalogRoutesToRuntimeOptions>[number];

type ImageWorkbenchComposerProps = {
  catalogItems: ImageModelConfig[];
  draft: ImageWorkbenchDraft;
  isGenerating: boolean;
  onChangeDraft: (patch: Partial<ImageWorkbenchDraft>) => void;
  onGenerate: () => void;
};

function isNanoBananaModel(modelId: string) {
  return modelId === "pixellelabs.nano-banana-pro" || modelId === "pixellelabs.nano-banana-2";
}

function isGptImage2Model(modelId: string) {
  return modelId === "gpt-image-2";
}

function creditLabel(routeKey: string, size: string, batchCount: number) {
  const total = getDisplayImageCredits(getOfficialImageRouteSizeCredits(routeKey, size), batchCount);
  if (typeof total !== "number") return "--";
  return Number.isInteger(total) ? `${total}` : total.toFixed(1);
}

function normalizeRouteOptions(routes: AiModelCatalogRoute[]): RuntimeRouteOption[] {
  return mapCatalogRoutesToRuntimeOptions(routes);
}

export function ImageWorkbenchComposer({
  catalogItems,
  draft,
  isGenerating,
  onChangeDraft,
  onGenerate,
}: ImageWorkbenchComposerProps) {
  const modelOptions = React.useMemo(() => buildWorkbenchModelOptions(catalogItems), [catalogItems]);
  const activeModel = React.useMemo(
    () => catalogItems.find((item) => item.id === draft.modelId) || null,
    [catalogItems, draft.modelId],
  );
  const aspectOptions = React.useMemo(() => getWorkbenchAspectRatioOptions(activeModel), [activeModel]);
  const fallbackSizeOptions = React.useMemo(
    () => modelOptions.find((item) => item.id === draft.modelId)?.sizeOptions ?? ["1k", "2k", "4k"],
    [draft.modelId, modelOptions],
  );
  const sizeOptions = React.useMemo(() => {
    if (activeModel) {
      const item = buildWorkbenchModelOptions([activeModel])[0];
      if (item?.sizeOptions?.length) return item.sizeOptions;
    }
    return fallbackSizeOptions;
  }, [activeModel, fallbackSizeOptions]);
  const [routeOptions, setRouteOptions] = React.useState<RuntimeRouteOption[]>([]);

  React.useEffect(() => {
    const routeLookupKey = modelOptions.find((item) => item.id === draft.modelId)?.routeLookupKey || draft.modelId;
    let active = true;
    void listAiModelRoutes(routeLookupKey)
      .then((routes) => {
        if (!active) return;
        setRouteOptions(normalizeRouteOptions(routes));
      })
      .catch(() => {
        if (active) setRouteOptions([]);
      });
    return () => {
      active = false;
    };
  }, [draft.modelId, modelOptions]);

  React.useEffect(() => {
    if (!routeOptions[0]) return;
    if (draft.routeKey && routeOptions.some((route) => route.routeKey === draft.routeKey)) return;
    onChangeDraft({ routeKey: routeOptions[0].routeKey });
  }, [draft.routeKey, onChangeDraft, routeOptions]);

  const modelSelectOptions = modelOptions.map((item) => ({ label: item.label, value: item.id }));
  const routeSelectOptions = routeOptions.map((item) => ({
    label: item.userFacingLabel || item.label,
    value: item.routeKey,
  }));
  const currentSize = String(draft.size || sizeOptions[0] || "1k").toLowerCase();

  const promptInput = (
    <label style={{ display: "grid", gap: 8 }}>
      <span style={{ color: "#dbe2ea", fontSize: 12, fontWeight: 700 }}>Prompt</span>
      <textarea
        aria-label="Prompt"
        onChange={(event) => onChangeDraft({ prompt: event.target.value })}
        placeholder="Describe the image you want to create"
        style={{
          background: "rgba(255,255,255,0.045)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14,
          color: "#f8fafc",
          minHeight: 108,
          outline: "none",
          padding: 12,
          resize: "vertical",
        }}
        value={draft.prompt}
      />
    </label>
  );

  return (
    <aside
      data-testid="image-workbench-composer"
      style={{
        background: "rgba(9,9,15,0.96)",
        borderRight: "1px solid rgba(255,255,255,0.08)",
        display: "grid",
        gap: 18,
        minHeight: 0,
        overflowY: "auto",
        padding: 20,
      }}
    >
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ color: "#dbe2ea", fontSize: 12, fontWeight: 700 }}>Reference images</div>
        <div
          style={{
            alignItems: "center",
            border: "1px dashed rgba(255,255,255,0.12)",
            borderRadius: 14,
            color: "#94a3b8",
            display: "flex",
            fontSize: 12,
            gap: 8,
            minHeight: 56,
            padding: "0 12px",
          }}
        >
          {draft.referenceAssetItemIds.length > 0 ? `${draft.referenceAssetItemIds.length} references` : "No references yet"}
        </div>
      </div>

      {promptInput}

      <div style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 8 }}>
          <span style={{ color: "#dbe2ea", fontSize: 12, fontWeight: 700 }}>Model</span>
          <MenuSelect
            fullWidth
            label="Model"
            onChange={(value) => {
              const nextModel = modelOptions.find((item) => item.id === value);
              onChangeDraft({
                modelId: value,
                routeKey: "",
                size: nextModel?.defaultSize || currentSize,
              });
            }}
            options={modelSelectOptions}
            value={draft.modelId}
          />
        </label>

        <label style={{ display: "grid", gap: 8 }}>
          <span style={{ color: "#dbe2ea", fontSize: 12, fontWeight: 700 }}>Route</span>
          <MenuSelect
            fullWidth
            label="Route"
            onChange={(value) => onChangeDraft({ routeKey: value })}
            options={routeSelectOptions.length > 0 ? routeSelectOptions : [{ label: "Loading routes...", value: "" }]}
            value={draft.routeKey}
          />
        </label>

        <label style={{ display: "grid", gap: 8 }}>
          <span style={{ color: "#dbe2ea", fontSize: 12, fontWeight: 700 }}>Aspect ratio</span>
          <MenuSelect
            fullWidth
            label="Aspect ratio"
            onChange={(value) => onChangeDraft({ aspectRatio: value })}
            options={aspectOptions.map((value) => ({ label: value, value }))}
            value={draft.aspectRatio}
          />
        </label>

        <label style={{ display: "grid", gap: 8 }}>
          <span style={{ color: "#dbe2ea", fontSize: 12, fontWeight: 700 }}>Size</span>
          <MenuSelect
            fullWidth
            label="Size"
            onChange={(value) => onChangeDraft({ size: buildWorkbenchImageSizeParamPatch(draft.modelId, value).size || value })}
            options={sizeOptions.map((value) => ({ label: value.toUpperCase(), value }))}
            value={currentSize}
          />
        </label>

        <label style={{ display: "grid", gap: 8 }}>
          <span style={{ color: "#dbe2ea", fontSize: 12, fontWeight: 700 }}>Quantity</span>
          <MenuSelect
            fullWidth
            label="Quantity"
            onChange={(value) => onChangeDraft({ batchCount: Number(value) || 1 })}
            options={WORKBENCH_QUANTITY_OPTIONS.map((value) => ({ label: value, value }))}
            value={String(draft.batchCount)}
          />
        </label>
      </div>

      {isNanoBananaModel(draft.modelId) ? (
        <NanoBananaParamPanel
          onChangeRatio={(value) => onChangeDraft({ aspectRatio: value })}
          onChangeSize={(value) => onChangeDraft({ size: value })}
          ratio={draft.aspectRatio}
          ratios={aspectOptions}
          size={currentSize}
          sizes={sizeOptions}
        />
      ) : isGptImage2Model(draft.modelId) ? (
        <GptImage2ParamPanel
          format={draft.outputFormat}
          moderation={draft.moderation}
          onChangeFormat={(value) => onChangeDraft({ outputFormat: value })}
          onChangeModeration={(value) => onChangeDraft({ moderation: value })}
          onChangeQuality={(value) => onChangeDraft({ quality: value })}
          onChangeRatio={(value) => onChangeDraft({ aspectRatio: value })}
          onChangeSize={(value) => onChangeDraft({ size: value })}
          quality={draft.quality}
          ratio={draft.aspectRatio}
          ratios={aspectOptions}
          size={currentSize}
          sizes={sizeOptions}
        />
      ) : null}

      <details open={false}>
        <summary style={{ color: "#dbe2ea", cursor: "pointer", fontSize: 12, fontWeight: 800 }}>Advanced</summary>
        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          <label style={{ display: "grid", gap: 8 }}>
            <span style={{ color: "#dbe2ea", fontSize: 12, fontWeight: 700 }}>Output format</span>
            <MenuSelect
              fullWidth
              label="Output format"
              onChange={(value) => onChangeDraft({ outputFormat: value as ImageWorkbenchDraft["outputFormat"] })}
              options={WORKBENCH_FORMAT_OPTIONS.map((value) => ({ label: value.toUpperCase(), value }))}
              value={draft.outputFormat}
            />
          </label>

          <label style={{ display: "grid", gap: 8 }}>
            <span style={{ color: "#dbe2ea", fontSize: 12, fontWeight: 700 }}>Quality</span>
            <MenuSelect
              fullWidth
              label="Quality"
              onChange={(value) => onChangeDraft({ quality: value as ImageWorkbenchDraft["quality"] })}
              options={WORKBENCH_QUALITY_OPTIONS.map((value) => ({ label: value.toUpperCase(), value }))}
              value={draft.quality}
            />
          </label>

          <label style={{ display: "grid", gap: 8 }}>
            <span style={{ color: "#dbe2ea", fontSize: 12, fontWeight: 700 }}>Moderation</span>
            <MenuSelect
              fullWidth
              label="Moderation"
              onChange={(value) => onChangeDraft({ moderation: value as ImageWorkbenchDraft["moderation"] })}
              options={WORKBENCH_MODERATION_OPTIONS.map((value) => ({ label: value.toUpperCase(), value }))}
              value={draft.moderation}
            />
          </label>
        </div>
      </details>

      <div
        style={{
          alignItems: "center",
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 16,
          display: "flex",
          gap: 12,
          justifyContent: "space-between",
          padding: "12px 14px",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 700 }}>点数</div>
          <div style={{ color: "#f8fafc", fontSize: 14, fontWeight: 800 }}>
            {creditLabel(draft.routeKey, draft.size, draft.batchCount)}
          </div>
          <div style={{ color: "#64748b", fontSize: 11, marginTop: 4 }}>
            {getWorkbenchModelSummaryLabel(draft.modelId)}
          </div>
        </div>
        <button
          disabled={isGenerating || !draft.prompt.trim() || !draft.routeKey}
          onClick={onGenerate}
          style={{
            background: isGenerating ? "rgba(255,255,255,0.12)" : "linear-gradient(135deg, #6366f1, #4f46e5)",
            border: "none",
            borderRadius: 999,
            color: isGenerating ? "#94a3b8" : "#fff",
            cursor: isGenerating ? "not-allowed" : "pointer",
            fontSize: 13,
            fontWeight: 800,
            height: 44,
            minWidth: 112,
            padding: "0 18px",
          }}
          type="button"
        >
          {isGenerating ? "生成中" : "开始生成"}
        </button>
      </div>
    </aside>
  );
}
