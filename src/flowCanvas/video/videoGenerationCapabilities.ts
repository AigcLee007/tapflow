import type {
  VideoAspectRatio,
  VideoGenerationBlocker,
  VideoGenerationCapabilities,
  VideoGenerationDiagnostic,
  VideoGenerationMode,
  VideoGenerationParamsV1,
  VideoModelOption,
  VideoResolution,
} from "./videoTypes";

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
    maxDurationSeconds: 8,
    minDurationSeconds: 2,
    resolutions: [...RESOLUTIONS],
    supportedModes: [...MODES],
    supportsAudio: true,
    supportsHumanReview: false,
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
    if (typeof source.confirmedByRoute === "boolean") result.confirmedByRoute = source.confirmedByRoute;
    if (typeof source.supportsAudio === "boolean") result.supportsAudio = source.supportsAudio;
    if (typeof source.supportsHumanReview === "boolean") result.supportsHumanReview = source.supportsHumanReview;
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

export function correctVideoGenerationParams(
  params: VideoGenerationParamsV1,
  capabilities: VideoGenerationCapabilities | null | undefined,
): { params: VideoGenerationParamsV1; diagnostics: VideoGenerationDiagnostic[] } {
  if (!capabilities) return { params: structuredClone(params), diagnostics: [] };
  const next = structuredClone(params);
  const diagnostics: VideoGenerationDiagnostic[] = [];
  const replace = <K extends keyof VideoGenerationParamsV1>(key: K, value: VideoGenerationParamsV1[K]) => {
    if (next[key] === value) return;
    diagnostics.push({ code: "CAPABILITY_CORRECTED", field: String(key), value: next[key], message: "Value was corrected to match the selected video model" });
    next[key] = value;
  };
  if (!capabilities.supportedModes.includes(next.mode)) replace("mode", capabilities.supportedModes[0] ?? "text_to_video");
  if (!capabilities.aspectRatios.includes(next.aspectRatio)) replace("aspectRatio", capabilities.aspectRatios[0] ?? "auto");
  if (!capabilities.resolutions.includes(next.resolution)) replace("resolution", capabilities.resolutions[0] ?? "720P");
  const step = capabilities.durationStepSeconds > 0 ? capabilities.durationStepSeconds : 1;
  const boundedDuration = Math.min(capabilities.maxDurationSeconds, Math.max(capabilities.minDurationSeconds, next.durationSeconds));
  const duration = Math.round((boundedDuration - capabilities.minDurationSeconds) / step) * step + capabilities.minDurationSeconds;
  replace("durationSeconds", Math.min(capabilities.maxDurationSeconds, Math.max(capabilities.minDurationSeconds, duration)));
  if (!capabilities.supportsAudio && next.generateAudio) replace("generateAudio", false);
  if (next.count > capabilities.maxCount) {
    const count = [...COUNTS].reverse().find((candidate) => candidate <= capabilities.maxCount) ?? 1;
    replace("count", count);
  }
  return { params: next, diagnostics };
}

export function getVideoGenerationBlocker(
  option: VideoModelOption | null | undefined,
  params: VideoGenerationParamsV1,
): VideoGenerationBlocker | null {
  if (option == null) return "NO_VIDEO_GENERATION_ROUTE";
  if (!option.capabilities.confirmedByRoute) return "NO_VIDEO_GENERATION_ROUTE";
  if (option.blocker) return option.blocker;
  if (!option.capabilities.supportedModes.includes(params.mode)) return "UNSUPPORTED_MODE";
  if (!option.capabilities.aspectRatios.includes(params.aspectRatio)) return "UNSUPPORTED_ASPECT_RATIO";
  if (!option.capabilities.resolutions.includes(params.resolution)) return "UNSUPPORTED_RESOLUTION";
  if (!option.capabilities.supportsAudio && params.generateAudio) return "UNSUPPORTED_AUDIO";
  if (params.count > option.capabilities.maxCount) return "UNSUPPORTED_COUNT";
  if (option.capabilities.supportsHumanReview && params.humanReview.status !== "verified") return "HUMAN_REVIEW_REQUIRED";
  return null;
}

function readValues<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((item): item is T => typeof item === "string" && allowed.includes(item as T))));
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
