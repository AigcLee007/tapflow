import type { AssetReferenceInput, VideoGenerationRequest, VideoGenerationParams } from "./types.js";

export type VideoGenerationMode =
  | "text_to_video"
  | "image_to_video"
  | "image_reference"
  | "first_last_frame"
  | "all_reference";

export type VideoMediaKind = "image" | "video" | "audio";

export type VideoAspectRatio = "auto" | "16:9" | "4:3" | "1:1" | "3:4" | "9:16" | "21:9";

export type VideoResolution = "480P" | "720P" | "1080P" | "4K";

export type VideoAudioControlMode = "toggle" | "always_on_implicit" | "unsupported";

export type VideoReferenceSemantics =
  | "style_images_and_source_video"
  | "mixed_reference_media"
  | "ordered_first_last_frames";

export type VideoReferenceRole =
  | "main_image"
  | "reference_image"
  | "source_video"
  | "reference_video"
  | "reference_audio"
  | "first_frame"
  | "last_frame";

export type VideoModeConstraint = {
  maxAudios?: number;
  maxImages?: number;
  maxTotal: number;
  maxVideos?: number;
  minAudios?: number;
  minImages?: number;
  minVideos?: number;
  requiresVideoOrAudio?: boolean;
  requiresVisualWithAudio?: boolean;
};

export type VideoGenerationCapabilities = {
  aspectRatios: VideoAspectRatio[];
  audioControlMode: VideoAudioControlMode;
  confirmedByRoute: boolean;
  defaults: VideoGenerationParams;
  durationStepSeconds: number;
  maxAudios: number;
  maxCount: 1;
  maxDurationSeconds: number;
  maxImages: number;
  maxPromptLength: number | null;
  maxTotal: number;
  maxVideos: number;
  minDurationSeconds: number;
  modeConstraints: Partial<Record<VideoGenerationMode, VideoModeConstraint>>;
  referenceSemantics: VideoReferenceSemantics;
  resolutions: VideoResolution[];
  supportedDurations: number[];
  supportedModes: VideoGenerationMode[];
};

export type VideoReferenceMetadata = {
  mediaKind: VideoMediaKind;
  order: number;
  referenceKey: string;
  role: VideoReferenceRole;
  sourceKind: "asset" | "upstream";
  sourceNodeId: string | null;
};

export type VideoValidationCode =
  | "VIDEO_PROMPT_REQUIRED"
  | "VIDEO_PROMPT_TOO_LONG"
  | "UNSUPPORTED_VIDEO_MODE"
  | "VIDEO_MODE_INPUT_REQUIRED"
  | "UNSUPPORTED_ASPECT_RATIO"
  | "UNSUPPORTED_RESOLUTION"
  | "UNSUPPORTED_DURATION"
  | "VIDEO_COUNT_UNSUPPORTED"
  | "AUDIO_SETTING_FIXED"
  | "UNSUPPORTED_REFERENCE_KIND"
  | "REFERENCE_LIMIT_EXCEEDED"
  | "REFERENCE_MEDIA_TOTAL_EXCEEDED"
  | "AUDIO_REFERENCE_REQUIRES_VISUAL"
  | "REFERENCE_ASSET_NOT_FOUND"
  | "REFERENCE_ASSET_KIND_MISMATCH";

export type VideoValidationIssue = {
  code: VideoValidationCode;
  field: string;
  message: string;
};

const VIDEO_MODES = new Set<VideoGenerationMode>([
  "text_to_video",
  "image_to_video",
  "image_reference",
  "first_last_frame",
  "all_reference",
]);
const VIDEO_ASPECT_RATIOS = new Set<VideoAspectRatio>(["auto", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"]);
const VIDEO_RESOLUTIONS = new Set<VideoResolution>(["480P", "720P", "1080P", "4K"]);
const VIDEO_MEDIA_KINDS = new Set<VideoMediaKind>(["image", "video", "audio"]);
const VIDEO_REFERENCE_ROLES = new Set<VideoReferenceRole>([
  "main_image",
  "reference_image",
  "source_video",
  "reference_video",
  "reference_audio",
  "first_frame",
  "last_frame",
]);
const VIDEO_MODE_CONSTRAINT_FIELDS = new Set<keyof VideoModeConstraint>([
  "maxAudios",
  "maxImages",
  "maxTotal",
  "maxVideos",
  "minAudios",
  "minImages",
  "minVideos",
  "requiresVideoOrAudio",
  "requiresVisualWithAudio",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isMode(value: unknown): value is VideoGenerationMode {
  return typeof value === "string" && VIDEO_MODES.has(value as VideoGenerationMode);
}

function isMediaKind(value: unknown): value is VideoMediaKind {
  return typeof value === "string" && VIDEO_MEDIA_KINDS.has(value as VideoMediaKind);
}

function isReferenceRole(value: unknown): value is VideoReferenceRole {
  return typeof value === "string" && VIDEO_REFERENCE_ROLES.has(value as VideoReferenceRole);
}

function isAspectRatio(value: unknown): value is VideoAspectRatio {
  return typeof value === "string" && VIDEO_ASPECT_RATIOS.has(value as VideoAspectRatio);
}

function isResolution(value: unknown): value is VideoResolution {
  return typeof value === "string" && VIDEO_RESOLUTIONS.has(value as VideoResolution);
}

function issue(code: VideoValidationCode, field: string, message: string): VideoValidationIssue {
  return { code, field, message };
}

function readsVideoParams(value: unknown): value is VideoGenerationParams {
  if (!isRecord(value)) return false;
  return (
    isMode(value.mode) &&
    isAspectRatio(value.aspectRatio) &&
    isResolution(value.resolution) &&
    typeof value.durationSeconds === "number" &&
    typeof value.generateAudio === "boolean" &&
    typeof value.count === "number"
  );
}

function readsVideoModeConstraint(value: unknown): value is VideoModeConstraint {
  if (!isRecord(value) || !isNonNegativeInteger(value.maxTotal)) return false;
  if (!Object.keys(value).every((field) => VIDEO_MODE_CONSTRAINT_FIELDS.has(field as keyof VideoModeConstraint))) return false;

  const limits = [
    [value.minImages, value.maxImages],
    [value.minVideos, value.maxVideos],
    [value.minAudios, value.maxAudios],
  ];
  for (const [minimum, maximum] of limits) {
    if ((minimum !== undefined && !isNonNegativeInteger(minimum)) || (maximum !== undefined && !isNonNegativeInteger(maximum))) {
      return false;
    }
    if (minimum !== undefined && maximum !== undefined && maximum < minimum) return false;
  }

  if (
    (value.requiresVideoOrAudio !== undefined && typeof value.requiresVideoOrAudio !== "boolean") ||
    (value.requiresVisualWithAudio !== undefined && typeof value.requiresVisualWithAudio !== "boolean")
  ) return false;

  return Number(value.minImages ?? 0) + Number(value.minVideos ?? 0) + Number(value.minAudios ?? 0) <= Number(value.maxTotal);
}

export function readVideoCapabilities(value: unknown): VideoGenerationCapabilities | null {
  if (!isRecord(value) || value.confirmedByRoute !== true) return null;
  if (!Array.isArray(value.supportedModes) || !value.supportedModes.every(isMode)) return null;
  if (!Array.isArray(value.supportedDurations) || !value.supportedDurations.every((duration) => typeof duration === "number")) return null;
  if (!Array.isArray(value.aspectRatios) || !value.aspectRatios.every(isAspectRatio)) return null;
  if (!Array.isArray(value.resolutions) || !value.resolutions.every(isResolution)) return null;
  if (!readsVideoParams(value.defaults)) return null;
  if (!isRecord(value.modeConstraints) || !Object.entries(value.modeConstraints).every(([mode, constraint]) => isMode(mode) && readsVideoModeConstraint(constraint))) return null;
  if (value.audioControlMode !== "toggle" && value.audioControlMode !== "always_on_implicit" && value.audioControlMode !== "unsupported") return null;
  if (
    value.referenceSemantics !== "style_images_and_source_video" &&
    value.referenceSemantics !== "mixed_reference_media" &&
    value.referenceSemantics !== "ordered_first_last_frames"
  ) return null;
  if (
    value.maxCount !== 1 ||
    !isNonNegativeInteger(value.maxImages) ||
    !isNonNegativeInteger(value.maxVideos) ||
    !isNonNegativeInteger(value.maxAudios) ||
    !isNonNegativeInteger(value.maxTotal) ||
    typeof value.minDurationSeconds !== "number" ||
    typeof value.maxDurationSeconds !== "number" ||
    typeof value.durationStepSeconds !== "number" ||
    (value.maxPromptLength !== null && !isNonNegativeInteger(value.maxPromptLength))
  ) return null;

  return value as VideoGenerationCapabilities;
}

export function readVideoReferenceMetadata(asset: AssetReferenceInput | null | undefined): VideoReferenceMetadata | null {
  if (!asset || !isRecord(asset.metadata) || !isRecord(asset.metadata.videoReference)) return null;
  const metadata = asset.metadata.videoReference;
  if (
    !isMediaKind(metadata.mediaKind) ||
    !isNonNegativeInteger(metadata.order) ||
    typeof metadata.referenceKey !== "string" ||
    metadata.referenceKey.trim().length === 0 ||
    !isReferenceRole(metadata.role) ||
    (metadata.sourceKind !== "asset" && metadata.sourceKind !== "upstream") ||
    (metadata.sourceNodeId !== null && typeof metadata.sourceNodeId !== "string")
  ) return null;

  return {
    mediaKind: metadata.mediaKind,
    order: metadata.order,
    referenceKey: metadata.referenceKey,
    role: metadata.role,
    sourceKind: metadata.sourceKind,
    sourceNodeId: metadata.sourceNodeId,
  };
}

function addLimitIssues(
  issues: VideoValidationIssue[],
  field: string,
  counts: Record<VideoMediaKind, number>,
  maxImages: number | undefined,
  maxVideos: number | undefined,
  maxAudios: number | undefined,
  maxTotal: number | undefined,
): void {
  if (
    (maxImages !== undefined && counts.image > maxImages) ||
    (maxVideos !== undefined && counts.video > maxVideos) ||
    (maxAudios !== undefined && counts.audio > maxAudios)
  ) {
    issues.push(issue("REFERENCE_LIMIT_EXCEEDED", field, "The selected references exceed the supported media limit."));
  }
  if (maxTotal !== undefined && counts.image + counts.video + counts.audio > maxTotal) {
    issues.push(issue("REFERENCE_MEDIA_TOTAL_EXCEEDED", field, "The selected references exceed the total media limit."));
  }
}

export function validateVideoGenerationRequest(
  request: VideoGenerationRequest,
  capabilities: VideoGenerationCapabilities,
): VideoValidationIssue[] {
  const issues: VideoValidationIssue[] = [];
  const prompt = typeof request.prompt === "string" ? request.prompt.trim() : "";
  if (!prompt) issues.push(issue("VIDEO_PROMPT_REQUIRED", "prompt", "A video prompt is required."));
  if (capabilities.maxPromptLength !== null && prompt.length > capabilities.maxPromptLength) {
    issues.push(issue("VIDEO_PROMPT_TOO_LONG", "prompt", "The video prompt exceeds the route limit."));
  }

  if (!readsVideoParams(request.params)) {
    issues.push(issue("UNSUPPORTED_VIDEO_MODE", "params", "Structured video generation parameters are required."));
    return issues;
  }
  const { params } = request;
  const modeSupported = capabilities.supportedModes.includes(params.mode);
  if (!modeSupported) issues.push(issue("UNSUPPORTED_VIDEO_MODE", "params.mode", "This video mode is not supported by the route."));
  if (!capabilities.aspectRatios.includes(params.aspectRatio)) {
    issues.push(issue("UNSUPPORTED_ASPECT_RATIO", "params.aspectRatio", "This aspect ratio is not supported by the route."));
  }
  if (!capabilities.resolutions.includes(params.resolution)) {
    issues.push(issue("UNSUPPORTED_RESOLUTION", "params.resolution", "This resolution is not supported by the route."));
  }
  if (
    !capabilities.supportedDurations.includes(params.durationSeconds)
  ) {
    issues.push(issue("UNSUPPORTED_DURATION", "params.durationSeconds", "This duration is not supported by the route."));
  }
  if (params.count !== 1 || capabilities.maxCount !== 1) {
    issues.push(issue("VIDEO_COUNT_UNSUPPORTED", "params.count", "Video generation supports exactly one output."));
  }
  if (capabilities.audioControlMode === "always_on_implicit" && params.generateAudio === false) {
    issues.push(issue("AUDIO_SETTING_FIXED", "params.generateAudio", "Audio is always enabled for this route."));
  }

  const assets = Array.isArray(request.inputAssets) ? request.inputAssets : [];
  const references: VideoReferenceMetadata[] = [];
  for (let index = 0; index < assets.length; index += 1) {
    const asset = assets[index];
    if (!asset || typeof asset.assetId !== "string" || asset.assetId.trim().length === 0) {
      issues.push(issue("REFERENCE_ASSET_NOT_FOUND", `inputAssets.${index}`, "The referenced asset was not found."));
      continue;
    }
    const reference = readVideoReferenceMetadata(asset);
    if (!reference) {
      issues.push(issue("UNSUPPORTED_REFERENCE_KIND", `inputAssets.${index}`, "The asset does not contain valid video reference metadata."));
      continue;
    }
    const assetKind = typeof asset.kind === "string" ? asset.kind.toLowerCase() : null;
    if (assetKind && isMediaKind(assetKind) && assetKind !== reference.mediaKind) {
      issues.push(issue("REFERENCE_ASSET_KIND_MISMATCH", `inputAssets.${index}`, "The asset kind does not match its video reference metadata."));
      continue;
    }
    references.push(reference);
  }

  const counts: Record<VideoMediaKind, number> = { audio: 0, image: 0, video: 0 };
  for (const reference of references) counts[reference.mediaKind] += 1;
  const constraint = modeSupported ? capabilities.modeConstraints[params.mode] : undefined;
  addLimitIssues(issues, "inputAssets", counts, capabilities.maxImages, capabilities.maxVideos, capabilities.maxAudios, capabilities.maxTotal);
  addLimitIssues(
    issues,
    "inputAssets",
    counts,
    constraint?.maxImages,
    constraint?.maxVideos,
    constraint?.maxAudios,
    constraint?.maxTotal,
  );

  if (
    (constraint?.minImages !== undefined && counts.image < constraint.minImages) ||
    (constraint?.minVideos !== undefined && counts.video < constraint.minVideos) ||
    (constraint?.minAudios !== undefined && counts.audio < constraint.minAudios) ||
    (constraint?.requiresVideoOrAudio && counts.video + counts.audio === 0)
  ) {
    issues.push(issue("VIDEO_MODE_INPUT_REQUIRED", "inputAssets", "This video mode requires additional input media."));
  }
  if (constraint?.requiresVisualWithAudio && counts.audio > 0 && counts.image + counts.video === 0) {
    issues.push(issue("AUDIO_REFERENCE_REQUIRES_VISUAL", "inputAssets", "Audio references require an image or video reference."));
  }
  if (params.mode === "image_to_video") {
    const requiredRole = capabilities.referenceSemantics === "ordered_first_last_frames"
      ? "first_frame"
      : "main_image";
    const matchingImages = references.filter((reference) => reference.mediaKind === "image" && reference.role === requiredRole);
    if (references.length !== 1 || counts.image !== 1 || matchingImages.length !== 1) {
      issues.push(issue("VIDEO_MODE_INPUT_REQUIRED", "inputAssets", `Image-to-video requires exactly one ${requiredRole}.`));
    }
  }
  if (params.mode === "all_reference" && capabilities.referenceSemantics === "style_images_and_source_video") {
    const sourceVideos = references.filter((reference) => reference.mediaKind === "video" && reference.role === "source_video");
    if (
      sourceVideos.length !== 1 ||
      references.some((reference) =>
        (reference.mediaKind === "video" && reference.role !== "source_video") ||
        (reference.mediaKind === "image" && reference.role !== "reference_image"),
      )
    ) {
      issues.push(issue("VIDEO_MODE_INPUT_REQUIRED", "inputAssets", "All-reference requires reference images and exactly one source video."));
    }
  }
  if (params.mode === "first_last_frame" && capabilities.referenceSemantics === "ordered_first_last_frames") {
    const firstFrameOnly =
      references.length === 1 &&
      references[0]!.mediaKind === "image" &&
      references[0]!.role === "first_frame";
    const firstFrames = references.filter((reference) => reference.mediaKind === "image" && reference.role === "first_frame");
    const lastFrames = references.filter((reference) => reference.mediaKind === "image" && reference.role === "last_frame");
    const orderedPair =
      references.length === 2 &&
      counts.image === 2 &&
      firstFrames.length === 1 &&
      lastFrames.length === 1 &&
      firstFrames[0]!.order < lastFrames[0]!.order;
    if (!firstFrameOnly && !orderedPair) {
      issues.push(issue("VIDEO_MODE_INPUT_REQUIRED", "inputAssets", "First and last frame references must be ordered images."));
    }
  }

  return issues;
}
