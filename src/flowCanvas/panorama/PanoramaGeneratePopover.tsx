import React, { useEffect, useMemo, useState } from "react";
import { Globe2, X } from "lucide-react";

import { MenuSelect } from "../../components/menu/MenuSelect";
import { MenuSurface } from "../../components/menu/MenuSurface";
import {
  PANORAMA_SUPPORTED_ASPECT_RATIOS,
  type PanoramaAspectRatio,
  type PanoramaGenerateSettings,
  type PanoramaGenerateSize,
} from "./panoramaTypes";

export type PanoramaGenerateModelOption = {
  id: string;
  label: string;
  sizeOptions?: string[];
};

export type PanoramaGenerateRouteOption = {
  disabled?: boolean;
  label: string;
  routeKey: string;
};

export type PanoramaGeneratePopoverProps = {
  creditLabel: string;
  initialAspectRatio?: PanoramaAspectRatio;
  initialModelId: string;
  initialRouteKey: string;
  initialSize?: PanoramaGenerateSize;
  modelOptions: PanoramaGenerateModelOption[];
  onClose: () => void;
  onModelChange?: (modelId: string) => void;
  onSubmit: (input: PanoramaGenerateSettings) => void;
  routeOptions: PanoramaGenerateRouteOption[];
  routesLoading?: boolean;
  sourceNodeTitle: string;
  sourcePromptAvailable: boolean;
};

const SIZE_OPTIONS: Array<{ label: string; value: PanoramaGenerateSize }> = [
  { label: "1K", value: "1k" },
  { label: "2K", value: "2k" },
  { label: "4K", value: "4k" },
];

const normalizeSize = (value: unknown): PanoramaGenerateSize => {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "2k" || normalized === "4k" ? normalized : "1k";
};

const isPanoramaAspectRatio = (value: unknown): value is PanoramaAspectRatio =>
  PANORAMA_SUPPORTED_ASPECT_RATIOS.includes(value as PanoramaAspectRatio);

export function PanoramaGeneratePopover({
  creditLabel,
  initialAspectRatio = "2:1",
  initialModelId,
  initialRouteKey,
  initialSize = "1k",
  modelOptions,
  onClose,
  onModelChange,
  onSubmit,
  routeOptions,
  routesLoading = false,
  sourceNodeTitle,
  sourcePromptAvailable,
}: PanoramaGeneratePopoverProps) {
  const [aspectRatio, setAspectRatio] = useState<PanoramaAspectRatio>(
    isPanoramaAspectRatio(initialAspectRatio) ? initialAspectRatio : "2:1",
  );
  const [modelId, setModelId] = useState(initialModelId || modelOptions[0]?.id || "");
  const [routeKey, setRouteKey] = useState(initialRouteKey || routeOptions[0]?.routeKey || "");
  const [size, setSize] = useState<PanoramaGenerateSize>(normalizeSize(initialSize));

  const modelSelectOptions = useMemo(
    () => modelOptions.map((option) => ({ label: option.label, value: option.id })),
    [modelOptions],
  );
  const routeSelectOptions = useMemo(
    () => routeOptions.map((option) => ({ label: option.label, value: option.routeKey })),
    [routeOptions],
  );
  const activeRoute = routeOptions.find((option) => option.routeKey === routeKey) || routeOptions[0];
  const canSubmit = sourcePromptAvailable && Boolean(modelId) && Boolean(activeRoute?.routeKey) && !activeRoute?.disabled;

  useEffect(() => {
    const nextModelId = initialModelId || modelOptions[0]?.id || "";
    setModelId(nextModelId);
  }, [initialModelId, modelOptions]);

  useEffect(() => {
    const routeExists = routeOptions.some((option) => option.routeKey === routeKey);
    if (!routeExists) {
      setRouteKey(initialRouteKey && routeOptions.some((option) => option.routeKey === initialRouteKey)
        ? initialRouteKey
        : routeOptions[0]?.routeKey || "");
    }
  }, [initialRouteKey, routeKey, routeOptions]);

  return (
    <MenuSurface aria-label="360 全景生成" className="w-[360px] p-3" role="dialog">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-bold text-white">
              <Globe2 size={14} />
              <span>360 全景生成</span>
            </div>
            <div className="mt-1 truncate text-[11px] text-white/55">{sourceNodeTitle}</div>
          </div>
          <button
            aria-label="关闭全景生成"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/8 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white"
            onClick={onClose}
            type="button"
          >
            <X size={14} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex min-w-0 flex-col gap-1 text-[11px] font-semibold text-white/72">
            模型
            <MenuSelect
              disabled={modelSelectOptions.length === 0}
              label="全景模型"
              onChange={(value) => {
                setModelId(value);
                onModelChange?.(value);
              }}
              options={modelSelectOptions}
              size="compact"
              value={modelId}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-[11px] font-semibold text-white/72">
            线路
            <MenuSelect
              disabled={routeSelectOptions.length === 0 || routesLoading}
              label="全景线路"
              onChange={setRouteKey}
              options={routeSelectOptions}
              size="compact"
              value={routeKey}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-[11px] font-semibold text-white/72">
            清晰度
            <MenuSelect
              label="全景清晰度"
              onChange={(value) => setSize(normalizeSize(value))}
              options={SIZE_OPTIONS}
              size="compact"
              value={size}
            />
          </label>
          <div className="flex min-w-0 flex-col gap-1">
            <div className="text-[11px] font-semibold text-white/72">全景比例</div>
            <div className="grid grid-cols-2 gap-2">
              {PANORAMA_SUPPORTED_ASPECT_RATIOS.map((ratio) => {
                const active = ratio === aspectRatio;
                return (
                  <button
                    aria-pressed={active}
                    className={`h-[38px] rounded-[10px] border text-xs font-bold transition ${
                      active
                        ? "border-sky-400/60 bg-sky-400/16 text-sky-100"
                        : "border-white/10 bg-white/5 text-white/78 hover:bg-white/8"
                    }`}
                    key={ratio}
                    onClick={() => setAspectRatio(ratio)}
                    type="button"
                  >
                    {ratio}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {!sourcePromptAvailable ? (
          <div className="rounded-xl border border-amber-300/20 bg-amber-400/8 px-3 py-2 text-[11px] text-amber-200">
            缺少生成提示词
          </div>
        ) : null}

        {!activeRoute?.routeKey && !routesLoading ? (
          <div className="rounded-xl border border-amber-300/20 bg-amber-400/8 px-3 py-2 text-[11px] text-amber-200">
            当前模型没有可用的 360 全景线路
          </div>
        ) : null}

        <div className="rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2 text-[11px] text-white/68">
          {creditLabel}
        </div>

        <div className="flex justify-end gap-2">
          <button
            className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-bold text-white/80 transition hover:bg-white/8"
            onClick={onClose}
            type="button"
          >
            取消
          </button>
          <button
            className="h-10 rounded-xl bg-white px-3 text-xs font-bold text-black transition disabled:cursor-not-allowed disabled:bg-white/16 disabled:text-white/42"
            disabled={!canSubmit}
            onClick={() => onSubmit({
              aspectRatio,
              modelId,
              routeKey: activeRoute?.routeKey || routeKey,
              size,
            })}
            type="button"
          >
            生成全景
          </button>
        </div>
      </div>
    </MenuSurface>
  );
}
