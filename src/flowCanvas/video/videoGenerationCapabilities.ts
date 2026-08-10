import type {
  VideoAspectRatio,
  VideoGenerationBlocker,
  VideoGenerationCapabilities,
  VideoGenerationDiagnostic,
  VideoGenerationMode,
  VideoGenerationParamsV2,
  VideoGenerationParamsV1,
  VideoModelOption,
  VideoResolution,
} from "./videoTypes";
import { normalizeReferenceRolesForMode, validateVideoReferenceInputs } from "./videoReferenceRules";

const MODES: VideoGenerationMode[] = ["text_to_video", "all_reference", "image_to_video", "first_last_frame", "image_reference"];
const RATIOS: VideoAspectRatio[] = ["auto", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"];
const RESOLUTIONS: VideoResolution[] = ["480P", "720P", "1080P", "4K"];
const COUNTS = [1, 2, 4] as const;

export function createSafeDefaultVideoCapabilities(): VideoGenerationCapabilities {
  return {
    aspectRatios: [...RATIOS],
    confirmedByRoute: false,
    durationStepSeconds: 1,
    maxCount: 4,
    maxDurationSeconds: 15,
    minDurationSeconds: 4,
    resolutions: [...RESOLUTIONS],
    supportedDurations: [],
    supportedModes: [...MODES],
    supportsAudio: true,
    supportsHumanReview: false,
    audioControlMode: "toggle",
    maxAudios: 0,
    maxImages: 0,
    maxPromptLength: null,
    maxTotal: 0,
    maxVideos: 0,
    modeConstraints: {},
    referenceSemantics: "mixed_reference_media",
  };
}

export function mergeVideoCapabilities(
  ...sources: Array<Partial<VideoGenerationCapabilities> | Record<string, unknown> | null | undefined>
): VideoGenerationCapabilities {
  const result = createSafeDefaultVideoCapabilities();
  for (const source of sources) {
    if (!source) continue;
    const modes = readValues(source.supportedModes, MODES);
    const ratios = readValues(source.aspectRatios ?? source.supportedAspectRatios, RATIOS);
    const resolutions = readValues(source.resolutions ?? source.supportedResolutions, RESOLUTIONS);
    if (modes.length) result.supportedModes = modes;
    if (ratios.length) result.aspectRatios = ratios;
    if (resolutions.length) result.resolutions = resolutions;
    const supportedDurations = readPositiveDurations(source.supportedDurations);
    if (supportedDurations.length) result.supportedDurations = supportedDurations;
    if (typeof source.confirmedByRoute === "boolean") result.confirmedByRoute = source.confirmedByRoute;
    if (typeof source.supportsAudio === "boolean") result.supportsAudio = source.supportsAudio;
    if (typeof source.supportsHumanReview === "boolean") result.supportsHumanReview = source.supportsHumanReview;
    if (source.supportsAudio === false && source.audioControlMode === undefined) result.audioControlMode = "unsupported";
    if (source.audioControlMode === "toggle" || source.audioControlMode === "always_on_implicit" || source.audioControlMode === "unsupported") result.audioControlMode = source.audioControlMode;
    for (const key of ["maxImages", "maxVideos", "maxAudios", "maxTotal"] as const) {
      const value = Number(source[key]);
      if (Number.isInteger(value) && value >= 0) result[key] = value;
    }
    if (source.maxPromptLength === null || (typeof source.maxPromptLength === "number" && Number.isFinite(source.maxPromptLength) && source.maxPromptLength > 0)) result.maxPromptLength = source.maxPromptLength;
    if (source.referenceSemantics === "style_images_and_source_video" || source.referenceSemantics === "mixed_reference_media" || source.referenceSemantics === "ordered_first_last_frames") result.referenceSemantics = source.referenceSemantics;
    if (source.defaults && typeof source.defaults === "object" && !Array.isArray(source.defaults)) result.defaults = source.defaults as VideoGenerationCapabilities["defaults"];
    if (source.modeConstraints && typeof source.modeConstraints === "object" && !Array.isArray(source.modeConstraints)) {
      result.modeConstraints = sanitizeModeConstraints(source.modeConstraints);
    }
    for (const key of ["minDurationSeconds", "maxDurationSeconds", "durationStepSeconds", "maxCount"] as const) {
      const value = Number(source[key]);
      if (Number.isFinite(value) && value > 0) result[key] = value;
    }
    const description = readString(source.description);
    const estimatedDurationLabel = readString(source.estimatedDurationLabel);
    if (description) result.description = description;
    if (estimatedDurationLabel) result.estimatedDurationLabel = estimatedDurationLabel;
  }
  if (result.maxDurationSeconds < result.minDurationSeconds) result.maxDurationSeconds = result.minDurationSeconds;
  return result;
}

export function correctVideoGenerationParams<T extends VideoGenerationParamsV2>(
  params: T,
  capabilities: VideoGenerationCapabilities | null | undefined,
): { params: T; diagnostics: VideoGenerationDiagnostic[] } {
  if (!capabilities) return { params: structuredClone(params), diagnostics: [] };
  const next = structuredClone(params);
  const diagnostics: VideoGenerationDiagnostic[] = [];
  const replace = <K extends keyof T>(key: K, value: T[K]) => {
    if (next[key] === value) return;
    diagnostics.push({ code: "CAPABILITY_CORRECTED", field: String(key), value: next[key], message: "Value was corrected to match the selected video model" });
    next[key] = value;
  };
  if (!capabilities.aspectRatios.includes(next.aspectRatio)) replace("aspectRatio", (capabilities.defaults?.aspectRatio ?? capabilities.aspectRatios[0] ?? "16:9") as T["aspectRatio"]);
  if (!capabilities.resolutions.includes(next.resolution)) replace("resolution", (capabilities.defaults?.resolution ?? capabilities.resolutions[0] ?? "720P") as T["resolution"]);
  if (capabilities.supportedDurations?.length) {
    const nearest = capabilities.supportedDurations.reduce((best, candidate) => (
      Math.abs(candidate - next.durationSeconds) < Math.abs(best - next.durationSeconds) ? candidate : best
    ));
    replace("durationSeconds", nearest);
  } else {
    const step = capabilities.durationStepSeconds > 0 ? capabilities.durationStepSeconds : 1;
    const boundedDuration = Math.min(capabilities.maxDurationSeconds, Math.max(capabilities.minDurationSeconds, next.durationSeconds));
    const duration = Math.round((boundedDuration - capabilities.minDurationSeconds) / step) * step + capabilities.minDurationSeconds;
    replace("durationSeconds", Math.min(capabilities.maxDurationSeconds, Math.max(capabilities.minDurationSeconds, duration)));
  }
  const audioMode = capabilities.audioControlMode ?? (capabilities.supportsAudio ? "toggle" : "unsupported");
  if (audioMode === "always_on_implicit") replace("generateAudio", true as T[K]);
  if (audioMode === "unsupported") replace("generateAudio", false as T[K]);
  if (next.count !== 1) replace("count", 1 as T[K]);
  const normalizedReferences = normalizeReferenceRolesForMode(next.referenceInputs, next.mode, capabilities.referenceSemantics);
  if (JSON.stringify(normalizedReferences) !== JSON.stringify(next.referenceInputs)) {
    diagnostics.push({ code: "CAPABILITY_CORRECTED", field: "referenceInputs", value: next.referenceInputs, message: "Reference roles were corrected to match the selected video model" });
    next.referenceInputs = normalizedReferences;
  }
  return { params: next, diagnostics };
}

export function getVideoGenerationBlocker(
  option: VideoModelOption | null | undefined,
  params: VideoGenerationParamsV2,
  prompt?: string,
): VideoGenerationBlocker | null {
  if (option == null) return "NO_VIDEO_GENERATION_ROUTE";
  if (!option.capabilities.confirmedByRoute) return "NO_VIDEO_GENERATION_ROUTE";
  if (option.blocker) return option.blocker;
  if (prompt !== undefined) {
    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt) return "VIDEO_PROMPT_REQUIRED";
    if (option.capabilities.maxPromptLength && normalizedPrompt.length > option.capabilities.maxPromptLength) {
      return "VIDEO_PROMPT_TOO_LONG";
    }
  }
  if (!option.capabilities.supportedModes.includes(params.mode)) return "UNSUPPORTED_MODE";
  if (!option.capabilities.aspectRatios.includes(params.aspectRatio)) return "UNSUPPORTED_ASPECT_RATIO";
  if (!option.capabilities.resolutions.includes(params.resolution)) return "UNSUPPORTED_RESOLUTION";
  if (option.capabilities.audioControlMode === "always_on_implicit" && !params.generateAudio) return "AUDIO_SETTING_FIXED";
  if (option.capabilities.audioControlMode === "unsupported" && params.generateAudio) return "AUDIO_SETTING_FIXED";
  if (!option.capabilities.supportsAudio && params.generateAudio) return "UNSUPPORTED_AUDIO";
  if (params.count !== 1) return "UNSUPPORTED_COUNT";
  const humanReview = (params as VideoGenerationParamsV1).humanReview;
  if (option.capabilities.supportsHumanReview && humanReview && humanReview.status !== "verified") return "HUMAN_REVIEW_REQUIRED";
  const referenceIssue = validateVideoReferenceInputs(params, option.capabilities)[0];
  if (referenceIssue) return referenceIssue.code as VideoGenerationBlocker;
  return null;
}

function readValues<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((item): item is T => typeof item === "string" && allowed.includes(item as T))));
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readPositiveDurations(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((item): item is number => typeof item === "number" && Number.isFinite(item) && Number.isInteger(item) && item > 0)));
}

function sanitizeModeConstraints(value: unknown): VideoGenerationCapabilities["modeConstraints"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: NonNullable<VideoGenerationCapabilities["modeConstraints"]> = {};
  for (const [mode, candidate] of Object.entries(value as Record<string, unknown>)) {
    if (!MODES.includes(mode as VideoGenerationMode) || !candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const safe: Record<string, number | boolean> = {};
    for (const [key, item] of Object.entries(candidate as Record<string, unknown>)) {
      if (["maxAudios", "maxImages", "maxTotal", "maxVideos", "minAudios", "minImages", "minVideos"].includes(key) && typeof item === "number" && Number.isInteger(item) && item >= 0) safe[key] = item;
      if (["requiresVideoOrAudio", "requiresVisualWithAudio"].includes(key) && typeof item === "boolean") safe[key] = item;
    }
    if (Object.keys(safe).length) result[mode as VideoGenerationMode] = safe;
  }
  return result;
}
