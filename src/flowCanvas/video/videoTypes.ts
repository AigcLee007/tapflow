export type VideoGenerationMode =
  | "text_to_video"
  | "all_reference"
  | "image_to_video"
  | "first_last_frame"
  | "image_reference";

export type VideoResolution = "480P" | "720P" | "1080P" | "4K";

export type VideoAspectRatio =
  | "auto"
  | "16:9"
  | "4:3"
  | "1:1"
  | "3:4"
  | "9:16"
  | "21:9";

export type VideoCount = 1 | 2 | 4;

export type VideoReferenceRole =
  | "main_image"
  | "reference_image"
  | "source_video"
  | "reference_video"
  | "reference_audio"
  | "subject"
  | "scene"
  | "prop"
  | "style"
  | "first_frame"
  | "last_frame"
  | "reference";

export type VideoReferenceSource = {
  kind: "asset" | "upstream";
  id: string;
};

export type VideoContextPaletteRef = {
  role: string;
  source: VideoReferenceSource;
  colorToken: string;
};

export type VideoHumanReview = {
  status: "not_required" | "required" | "verified" | "expired";
  verifiedAt?: string;
  verificationRef?: string;
};

export type VideoReferenceRoleAssignment = {
  role: VideoReferenceRole;
  source: VideoReferenceSource;
};

export type VideoReferenceInputV2 = {
  referenceKey: string;
  source: VideoReferenceSource;
  mediaKind: "image" | "video" | "audio";
  role: "main_image" | "reference_image" | "source_video" | "reference_video" | "reference_audio" | "first_frame" | "last_frame";
  order: number;
};

export type VideoGenerationParamsV2 = {
  schemaVersion: 2;
  mode: VideoGenerationMode;
  aspectRatio: VideoAspectRatio;
  resolution: VideoResolution;
  durationSeconds: number;
  generateAudio: boolean;
  count: 1;
  referenceInputs: VideoReferenceInputV2[];
  cameraMotionId: string | null;
  visualTone: string | null;
};

export type VideoGenerationDiagnostic = {
  code: "INVALID_VALUE" | "COUNT_CLAMPED" | "UNSUPPORTED_REFERENCE" | "CAPABILITY_CORRECTED";
  field: string;
  value?: unknown;
  message: string;
};

export type VideoGenerationCorrection = {
  requiresUserCorrection: true;
  diagnostics: VideoGenerationDiagnostic[];
};

export type VideoGenerationParamsRuntime = VideoGenerationParamsV2 & {
  contextPaletteRefs: VideoContextPaletteRef[];
  humanReview: VideoHumanReview;
  referenceRolesByKey: Record<string, VideoReferenceRoleAssignment | null>;
  normalization?: VideoGenerationCorrection;
};

/** @deprecated Use VideoGenerationParamsV2 for persistence and runtime for transitional UI state. */
export type VideoGenerationParamsV1 = VideoGenerationParamsRuntime;

export type VideoGenerationNormalizationResult = {
  params: VideoGenerationParamsRuntime;
  diagnostics: VideoGenerationDiagnostic[];
  requiresUserCorrection: boolean;
  modelId?: string;
  routeKey?: string;
  referenceAssetItemIds?: string[];
  referenceOrder?: string[];
};

export type VideoGenerationBlocker =
  | "CATALOG_LOADING"
  | "NO_VIDEO_GENERATION_ROUTE"
  | "PRICING_NOT_FOUND"
  | "UNSUPPORTED_MODE"
  | "UNSUPPORTED_ASPECT_RATIO"
  | "UNSUPPORTED_RESOLUTION"
  | "UNSUPPORTED_AUDIO"
  | "UNSUPPORTED_COUNT"
  | "HUMAN_REVIEW_REQUIRED";

export type VideoGenerationCapabilities = {
  aspectRatios: VideoAspectRatio[];
  confirmedByRoute: boolean;
  description?: string;
  durationStepSeconds: number;
  estimatedDurationLabel?: string;
  maxCount: number;
  maxDurationSeconds: number;
  minDurationSeconds: number;
  resolutions: VideoResolution[];
  supportedDurations?: number[];
  supportedModes: VideoGenerationMode[];
  supportsAudio: boolean;
  supportsHumanReview: boolean;
};

export type VideoModelOption = {
  blocker: VideoGenerationBlocker | null;
  capabilities: VideoGenerationCapabilities;
  description?: string;
  estimatedCredits: number | null;
  estimatedDurationLabel?: string;
  id: string;
  label: string;
  modelKey: string;
  minChargeCredits: number | null;
  pricing: { billingBasis: "duration_second"; exact: true; minChargeCredits: number; unit: "video_generation"; unitCredits: number } | null;
  routeKey: string;
};
