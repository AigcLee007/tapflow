import type {
  VideoGenerationCapabilities,
  VideoGenerationMode,
  VideoModeAvailabilityItem,
  VideoModeAvailabilityReason,
  VideoModeAvailabilityResult,
  VideoModeInputCounts,
} from "./videoTypes";

export type VideoModeInput = {
  inputKey: string;
  kind: "text" | "image" | "video" | "audio";
};

const MODES: VideoGenerationMode[] = ["text_to_video", "all_reference", "image_to_video", "first_last_frame", "image_reference"];
const FALLBACK_ORDER: VideoGenerationMode[] = ["image_reference", "first_last_frame", "all_reference", "image_to_video", "text_to_video"];

export function evaluateVideoModeAvailability(
  inputs: VideoModeInput[],
  capabilities: VideoGenerationCapabilities,
): VideoModeAvailabilityResult {
  const counts = countVideoModeInputs(inputs);
  const recommendedMode = recommendedModeFor(counts);
  const items = MODES.map((mode) => evaluateMode(mode, counts, capabilities));
  return { counts, items, recommendedMode };
}

export const getVideoModeAvailability = evaluateVideoModeAvailability;

export function resolveAvailableVideoMode(
  currentMode: VideoGenerationMode,
  inputs: VideoModeInput[],
  capabilities: VideoGenerationCapabilities,
): VideoModeAvailabilityResult & { incompatible: boolean; mode: VideoGenerationMode; switched: boolean } {
  const availability = evaluateVideoModeAvailability(inputs, capabilities);
  const current = availability.items.find((item) => item.mode === currentMode);
  if (current?.enabled) return { ...availability, incompatible: false, mode: currentMode, switched: false };

  const recommended = availability.items.find((item) => item.mode === availability.recommendedMode && item.enabled);
  const fallback = recommended ?? FALLBACK_ORDER
    .map((mode) => availability.items.find((item) => item.mode === mode))
    .find((item): item is VideoModeAvailabilityItem => item?.enabled === true);
  if (fallback) return { ...availability, incompatible: false, mode: fallback.mode, switched: fallback.mode !== currentMode };

  return {
    ...availability,
    incompatible: true,
    mode: availability.recommendedMode,
    switched: availability.recommendedMode !== currentMode,
  };
}

export function countVideoModeInputs(inputs: VideoModeInput[]): VideoModeInputCounts {
  const seen = new Set<string>();
  const counts: VideoModeInputCounts = { audio: 0, image: 0, text: 0, total: 0, video: 0 };
  for (const input of inputs) {
    if (seen.has(input.inputKey)) continue;
    seen.add(input.inputKey);
    counts[input.kind] += 1;
    if (input.kind !== "text") counts.total += 1;
  }
  return counts;
}

function evaluateMode(
  mode: VideoGenerationMode,
  counts: VideoModeInputCounts,
  capabilities: VideoGenerationCapabilities,
): VideoModeAvailabilityItem {
  const inputReason = inputIncompatibility(mode, counts);
  const modelReason = modelIncompatibility(mode, counts, capabilities);
  const inputAllowed = inputReason === null;
  const modelSupported = modelReason === null;
  return {
    enabled: inputAllowed && modelSupported,
    inputAllowed,
    mode,
    modelSupported,
    reason: inputReason ?? modelReason,
  };
}

function inputIncompatibility(mode: VideoGenerationMode, counts: VideoModeInputCounts): VideoModeAvailabilityReason | null {
  const hasVideoOrAudio = counts.video + counts.audio > 0;
  if (hasVideoOrAudio) {
    return mode === "all_reference" ? null : "INPUT_VIDEO_OR_AUDIO_REQUIRES_ALL_REFERENCE";
  }
  if (mode === "text_to_video") return counts.total === 0 ? null : "INPUT_MEDIA_NOT_ALLOWED";
  if (mode === "all_reference") return counts.total > 0 ? null : "INPUT_REQUIRES_MEDIA";
  if (mode === "image_to_video") return counts.image === 1 ? null : "INPUT_REQUIRES_EXACTLY_ONE_IMAGE";
  if (mode === "first_last_frame") return counts.image === 1 || counts.image === 2 ? null : "INPUT_REQUIRES_ONE_OR_TWO_IMAGES";
  return counts.image > 0 ? null : "INPUT_REQUIRES_IMAGE";
}

function modelIncompatibility(
  mode: VideoGenerationMode,
  counts: VideoModeInputCounts,
  capabilities: VideoGenerationCapabilities,
): VideoModeAvailabilityReason | null {
  if (!capabilities.supportedModes.includes(mode)) return "MODEL_UNSUPPORTED";
  const constraint = capabilities.modeConstraints?.[mode];
  const maxImages = numberLimit(constraint?.maxImages ?? capabilities.maxImages);
  const maxVideos = numberLimit(constraint?.maxVideos ?? capabilities.maxVideos);
  const maxAudios = numberLimit(constraint?.maxAudios ?? capabilities.maxAudios);
  const maxTotal = numberLimit(constraint?.maxTotal ?? capabilities.maxTotal);
  if (counts.image > maxImages || counts.video > maxVideos || counts.audio > maxAudios || counts.total > maxTotal) return "MODEL_CONSTRAINT_UNMET";
  if (
    (typeof constraint?.minImages === "number" && counts.image < constraint.minImages)
    || (typeof constraint?.minVideos === "number" && counts.video < constraint.minVideos)
    || (typeof constraint?.minAudios === "number" && counts.audio < constraint.minAudios)
    || (constraint?.requiresVideoOrAudio === true && counts.video + counts.audio === 0)
    || (constraint?.requiresVisualWithAudio === true && counts.audio > 0 && counts.image + counts.video === 0)
  ) return "MODEL_CONSTRAINT_UNMET";
  return null;
}

function numberLimit(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function recommendedModeFor(counts: VideoModeInputCounts): VideoGenerationMode {
  if (counts.video + counts.audio > 0) return "all_reference";
  if (counts.image === 0) return "text_to_video";
  if (counts.image === 1) return "image_to_video";
  return "image_reference";
}
