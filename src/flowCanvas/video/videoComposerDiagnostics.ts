const EVENT_NAMES = new Set([
  "catalog_error",
  "manifest_error",
  "capability_corrected",
  "preflight_blocked",
] as const);

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;
const SAFE_ERROR_CODE = /^[A-Z][A-Z0-9_]{0,63}$/;
const SENSITIVE_IDENTIFIER_TERM = /(?:prompt|provider|route(?:key)?|secret|credential|token|signature|authorization|auth|apikey|signed|url)/i;
const CREDENTIAL_IDENTIFIER_PREFIX = /^(?:sk|pk)[_-]|^api[_-]?key[_-]|^bearer[_-]|^AIza|^(?:AKIA|ASIA)[A-Z0-9]|^gh[pousr]_|^github_pat_|^xox[baprs]-|^ya29\./i;
const HIGH_ENTROPY_IDENTIFIER = /^[A-Za-z0-9_-]{40,}$/;
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
  return SAFE_IDENTIFIER.test(token) && !isCredentialLikeIdentifier(token) ? token : "";
}

function isCredentialLikeIdentifier(token: string) {
  if (SENSITIVE_IDENTIFIER_TERM.test(token) || CREDENTIAL_IDENTIFIER_PREFIX.test(token)) return true;
  if (!HIGH_ENTROPY_IDENTIFIER.test(token)) return false;

  const characterClasses = [/[a-z]/, /[A-Z]/, /\d/].filter((pattern) => pattern.test(token)).length;
  return characterClasses >= 3;
}

function safeErrorCode(value: unknown) {
  if (typeof value !== "string") return "";
  const token = value.trim();
  return SAFE_ERROR_CODE.test(token) && SAFE_ERROR_CODES.has(token) ? token : "";
}
