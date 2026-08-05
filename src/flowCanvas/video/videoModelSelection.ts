import { correctVideoGenerationParams } from "./videoGenerationCapabilities";
import { normalizeVideoGenerationParams } from "./videoGenerationParams";
import { resolveAutomaticVideoMode } from "./videoReferenceRules";
import type { FlowNodeData } from "../types";
import type { VideoModelOption } from "./videoTypes";

export function createVideoModelSelectionPatch(
  data: FlowNodeData,
  option: VideoModelOption | null | undefined,
): Partial<FlowNodeData> | null {
  if (!option || option.blocker !== null) return null;

  const videoParams = normalizeVideoGenerationParams(data).params;

  const corrected = option.capabilities.confirmedByRoute
    ? correctVideoGenerationParams(videoParams, option.capabilities).params
    : videoParams;
  const automatic = resolveAutomaticVideoMode(option.capabilities, corrected.referenceInputs, corrected.mode);

  return {
    modelId: option.id,
    params: {
      ...(data.params ?? {}),
      videoGeneration: { ...corrected, mode: automatic.mode, referenceInputs: automatic.references },
    },
    routeKey: option.routeKey,
  };
}
