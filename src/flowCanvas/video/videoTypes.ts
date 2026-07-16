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

export type VideoGenerationParamsV1 = {
  schemaVersion: 1;
  mode: VideoGenerationMode;
  aspectRatio: VideoAspectRatio;
  resolution: VideoResolution;
  durationSeconds: number;
  generateAudio: boolean;
  count: VideoCount;
  cameraMotionId: string | null;
  visualTone: string | null;
  contextPaletteRefs: VideoContextPaletteRef[];
  humanReview: VideoHumanReview;
  referenceRolesByKey: Record<string, VideoReferenceRoleAssignment | null>;
};

export type VideoGenerationDiagnostic = {
  code: "INVALID_VALUE" | "COUNT_CLAMPED" | "UNSUPPORTED_REFERENCE";
  field: string;
  value?: unknown;
  message: string;
};

export type VideoGenerationNormalizationResult = {
  params: VideoGenerationParamsV1;
  diagnostics: VideoGenerationDiagnostic[];
  requiresUserCorrection: boolean;
  modelId?: string;
  routeKey?: string;
  referenceAssetItemIds?: string[];
  referenceOrder?: string[];
};
