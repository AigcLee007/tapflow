import React from "react";

import type { ImageModelConfig } from "../config/imageModels";
import { MenuSelect } from "../components/menu/MenuSelect";
import { listAiModelRoutes, type AiModelCatalogRoute } from "../services/v2AiModelCatalogApi";
import { mapCatalogRoutesToRuntimeOptions } from "../flowCanvas/utils/modelCatalogOptions";
import { GptImage2ParamPanel } from "../flowCanvas/nodes/GptImage2ParamPanel";
import { NanoBananaParamPanel } from "../flowCanvas/nodes/NanoBananaParamPanel";
import {
  WORKBENCH_QUANTITY_OPTIONS,
} from "../flowCanvas/workbench/imageWorkbenchUtils";
import { buildWorkbenchModelOptions } from "../flowCanvas/workbench/imageWorkbenchUtils";
import { getWorkbenchAspectOptions, getWorkbenchModelSizeOptions } from "./workbenchModelParams";
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

function isNanoBananaModel(modelId: string) {
  return modelId === "pixellelabs.nano-banana-pro" || modelId === "pixellelabs.nano-banana-2";
}

function isGptImage2Model(modelId: string) {
  return modelId === "gpt-image-2";
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
  const modelOptions = React.useMemo(() => buildWorkbenchModelOptions(models), [models]);
  const aspectOptions = React.useMemo(() => getWorkbenchAspectOptions(models, draft.modelId), [draft.modelId, models]);
  const sizeOptions = React.useMemo(() => getWorkbenchModelSizeOptions(models, draft.modelId), [draft.modelId, models]);
  const [routeOptions, setRouteOptions] = React.useState<Array<ReturnType<typeof mapCatalogRoutesToRuntimeOptions>[number]>>([]);

  React.useEffect(() => {
    let active = true;
    const routeLookupKey = modelOptions.find((item) => item.id === draft.modelId)?.routeLookupKey || draft.modelId;
    void listAiModelRoutes(routeLookupKey)
      .then((routes: AiModelCatalogRoute[]) => {
        if (!active) return;
        setRouteOptions(mapCatalogRoutesToRuntimeOptions(routes));
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
    if (draft.routeKey && routeOptions.some((item) => item.routeKey === draft.routeKey)) return;
    onChangeDraft({ routeKey: routeOptions[0].routeKey });
  }, [draft.routeKey, onChangeDraft, routeOptions]);

  return (
    <aside
      data-testid="workbench-composer"
      className={`flex min-h-0 flex-col gap-4 overflow-y-auto border-white/8 bg-[#101014] p-5 ${
        compact ? "max-h-[88vh]" : "border-r"
      }`}
    >
      <div className="grid gap-2">
        <div className="text-xs font-bold text-slate-300">参考图片</div>
        <div className="flex min-h-[56px] items-center rounded-[14px] border border-dashed border-white/12 px-3 text-xs text-slate-400">
          {draft.referenceAssetIds.length > 0 ? `${draft.referenceAssetIds.length} 张参考图` : "暂未添加参考图"}
        </div>
      </div>

      <label className="grid gap-2">
        <span className="text-xs font-bold text-slate-300">Prompt</span>
        <textarea
          aria-label="Prompt"
          className="min-h-[120px] resize-y rounded-[14px] border border-white/10 bg-white/[0.045] px-3 py-3 text-sm text-white outline-none"
          onChange={(event) => onChangeDraft({ prompt: event.target.value })}
          placeholder="描述你想生成的画面"
          value={draft.prompt}
        />
      </label>

      <div className="grid gap-3">
        <label className="grid gap-2">
          <span className="text-xs font-bold text-slate-300">模型</span>
          <MenuSelect
            fullWidth
            label="Model"
            onChange={(value) => {
              const nextModel = modelOptions.find((item) => item.id === value);
              onChangeDraft({
                modelId: value,
                routeKey: "",
                size: String(nextModel?.defaultSize || "1k").toLowerCase(),
              });
            }}
            options={modelOptions.map((item) => ({ label: item.label, value: item.id }))}
            value={draft.modelId}
          />
        </label>

        <label className="grid gap-2">
          <span className="text-xs font-bold text-slate-300">线路</span>
          <MenuSelect
            fullWidth
            label="Route"
            onChange={(value) => onChangeDraft({ routeKey: value })}
            options={routeOptions.length > 0
              ? routeOptions.map((item) => ({ label: item.userFacingLabel || item.label, value: item.routeKey }))
              : [{ label: "加载线路中...", value: "" }]}
            value={draft.routeKey}
          />
        </label>

        <div className="grid grid-cols-3 gap-3">
          <label className="grid gap-2">
            <span className="text-xs font-bold text-slate-300">比例</span>
            <MenuSelect
              fullWidth
              label="Aspect ratio"
              onChange={(value) => onChangeDraft({ aspectRatio: value })}
              options={aspectOptions.map((value) => ({ label: value, value }))}
              value={draft.aspectRatio}
            />
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-bold text-slate-300">分辨率</span>
            <MenuSelect
              fullWidth
              label="Size"
              onChange={(value) => onChangeDraft({ size: value })}
              options={sizeOptions.map((value) => ({ label: String(value).toUpperCase(), value }))}
              value={draft.size}
            />
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-bold text-slate-300">数量</span>
            <MenuSelect
              fullWidth
              label="Quantity"
              onChange={(value) => onChangeDraft({ quantity: Number(value) || 1 })}
              options={WORKBENCH_QUANTITY_OPTIONS.map((value) => ({ label: value, value }))}
              value={String(draft.quantity)}
            />
          </label>
        </div>
      </div>

      {draft.quantity > 1 ? (
        <label className="grid gap-2">
          <span className="text-xs font-bold text-slate-300">多图展示</span>
          <div className="grid grid-cols-2 gap-3">
            <button
              className={`h-11 rounded-[14px] border text-sm font-bold ${
                draft.displayMode === "merged"
                  ? "border-white/20 bg-white/[0.11] text-white"
                  : "border-white/10 bg-white/[0.03] text-slate-400"
              }`}
              onClick={() => onChangeDraft({ displayMode: "merged" })}
              type="button"
            >
              合并显示
            </button>
            <button
              className={`h-11 rounded-[14px] border text-sm font-bold ${
                draft.displayMode === "separate"
                  ? "border-white/20 bg-white/[0.11] text-white"
                  : "border-white/10 bg-white/[0.03] text-slate-400"
              }`}
              onClick={() => onChangeDraft({ displayMode: "separate" })}
              type="button"
            >
              多节点显示
            </button>
          </div>
        </label>
      ) : null}

      {isNanoBananaModel(draft.modelId) ? (
        <NanoBananaParamPanel
          onChangeRatio={(value) => onChangeDraft({ aspectRatio: value })}
          onChangeSize={(value) => onChangeDraft({ size: value })}
          ratio={draft.aspectRatio}
          ratios={aspectOptions}
          size={draft.size}
          sizes={sizeOptions}
        />
      ) : null}

      {isGptImage2Model(draft.modelId) ? (
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
          size={draft.size}
          sizes={sizeOptions}
        />
      ) : null}

      <div className="mt-auto flex items-center justify-between rounded-[16px] border border-white/10 bg-white/[0.05] px-4 py-3">
        <div>
          <div className="text-xs font-bold text-slate-400">操作</div>
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
          {isGenerating ? "生成中" : "开始生成"}
        </button>
      </div>
    </aside>
  );
}
