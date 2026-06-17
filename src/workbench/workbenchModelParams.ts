import type { ImageModelConfig } from "../config/imageModels";
import {
  buildWorkbenchImageSizeParamPatch,
  buildWorkbenchModelOptions,
  getDefaultWorkbenchDraft,
  getWorkbenchAspectRatioOptions,
  WORKBENCH_FORMAT_OPTIONS,
  WORKBENCH_MODERATION_OPTIONS,
  WORKBENCH_QUALITY_OPTIONS,
} from "../flowCanvas/workbench/imageWorkbenchUtils";
import type { WorkbenchDraft } from "./workbenchTypes";

export function createDefaultWorkbenchDraft(models: ImageModelConfig[] = []): WorkbenchDraft {
  const base = getDefaultWorkbenchDraft(models);
  return {
    aspectRatio: base.aspectRatio,
    displayMode: "merged",
    modelId: base.modelId,
    moderation: base.moderation,
    outputFormat: base.outputFormat,
    prompt: base.prompt,
    quality: base.quality,
    quantity: base.batchCount,
    referenceAssetIds: base.referenceAssetItemIds,
    routeKey: base.routeKey,
    size: String(base.size || "1k").toLowerCase(),
  };
}

export function getWorkbenchModelSizeOptions(models: ImageModelConfig[], modelId: string): string[] {
  return buildWorkbenchModelOptions(models).find((item) => item.id === modelId)?.sizeOptions ?? ["1k", "2k", "4k"];
}

export function getWorkbenchAspectOptions(models: ImageModelConfig[], modelId: string): string[] {
  const model = models.find((item) => item.id === modelId) || null;
  return getWorkbenchAspectRatioOptions(model);
}

export function buildWorkbenchRequestParams(draft: WorkbenchDraft): Record<string, unknown> {
  return {
    ...buildWorkbenchImageSizeParamPatch(draft.modelId, draft.size),
    aspect_ratio: draft.aspectRatio,
    moderation: WORKBENCH_MODERATION_OPTIONS.includes(draft.moderation) ? draft.moderation : "auto",
    output_format: WORKBENCH_FORMAT_OPTIONS.includes(draft.outputFormat) ? draft.outputFormat : "png",
    quality: WORKBENCH_QUALITY_OPTIONS.includes(draft.quality) ? draft.quality : "auto",
  };
}
