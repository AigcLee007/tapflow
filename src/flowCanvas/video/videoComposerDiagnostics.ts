const EVENT_NAMES = new Set([
  "catalog_error",
  "manifest_error",
  "capability_corrected",
  "preflight_blocked",
] as const);

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;
const SAFE_ERROR_CODE = /^[A-Z][A-Z0-9_]{0,63}$/;
const SENSITIVE_IDENTIFIER_TERM = /(?:prompt|provider|route(?:key)?|secret|credential|token|signature|authorization|auth|apikey|signed|url)/i;
const SAFE_ERROR_CODES = new Set([
  "CAPABILITY_CORRECTED",
  "CATALOG_LOADING",
  "HUMAN_REVIEW_REQUIRED",
  "MANIFEST_LOAD_FAILED",
  "NO_VIDEO_GENERATION_ROUTE",
  "PRICING_NOT_FOUND",
  "UNSUPPORTED_ASPECT_RATIO",
  "UNSUPPORTED_AUDIO",
  "UNSUPPORTED_COUNT",
  "UNSUPPORTED_MODE",
  "UNSUPPORTED_RESOLUTION",
]);

export type VideoComposerDiagnosticEvent = typeof EVENT_NAMES extends Set<infer T> ? T : never;

export type VideoComposerDiagnostic = {
  event: VideoComposerDiagnosticEvent;
  errorCode?: string;
  modelId?: string;
  motionId?: string;
};

/** Keeps composer diagnostics free of prompts, routes, providers, URLs, and credentials. */
export function createVideoComposerDiagnostic(
  event: string,
  value: Record<string, unknown> = {},
): VideoComposerDiagnostic | null {
  if (!EVENT_NAMES.has(event as VideoComposerDiagnosticEvent)) return null;
  const diagnostic: VideoComposerDiagnostic = { event: event as VideoComposerDiagnosticEvent };
  const errorCode = safeErrorCode(value.errorCode);
  const modelId = safeIdentifier(value.modelId);
  const motionId = safeIdentifier(value.motionId);
  if (errorCode) diagnostic.errorCode = errorCode;
  if (modelId) diagnostic.modelId = modelId;
  if (motionId) diagnostic.motionId = motionId;
  return diagnostic;
}

export function emitVideoComposerDiagnostic(event: string, value?: Record<string, unknown>) {
  const diagnostic = createVideoComposerDiagnostic(event, value);
  if (diagnostic && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("tapflow:video-composer-diagnostic", { detail: diagnostic }));
  }
  return diagnostic;
}

function safeIdentifier(value: unknown) {
  if (typeof value !== "string") return "";
  const token = value.trim();
  return SAFE_IDENTIFIER.test(token) && !SENSITIVE_IDENTIFIER_TERM.test(token) ? token : "";
}

function safeErrorCode(value: unknown) {
  if (typeof value !== "string") return "";
  const token = value.trim();
  return SAFE_ERROR_CODE.test(token) && SAFE_ERROR_CODES.has(token) ? token : "";
}
