import { correctVideoGenerationParams } from "./videoGenerationCapabilities";
import { resolveAutomaticVideoMode } from "./videoReferenceRules";
import type { VideoGenerationParamsV1, VideoModelOption } from "./videoTypes";

export type VideoModelSelectionPatch = {
  modelId: string;
  params: Record<string, unknown>;
  routeKey: string;
};

export function createVideoModelSelectionPatch(
  models: VideoModelOption[],
  requestedModelId: string,
  baseParams: Record<string, unknown>,
  videoParams: VideoGenerationParamsV1,
): VideoModelSelectionPatch | null {
  const option = models.find((model) => model.id === requestedModelId);
  if (!option) return null;

  const corrected = option.capabilities.confirmedByRoute
    ? correctVideoGenerationParams(videoParams, option.capabilities).params
    : videoParams;
  const automatic = resolveAutomaticVideoMode(option.capabilities, corrected.referenceInputs, corrected.mode);

  return {
    modelId: option.id,
    params: {
      ...baseParams,
      videoGeneration: { ...corrected, mode: automatic.mode, referenceInputs: automatic.references },
    },
    routeKey: option.routeKey,
  };
}
