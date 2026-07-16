const EVENT_NAMES = new Set([
  "catalog_error",
  "manifest_error",
  "capability_corrected",
  "preflight_blocked",
] as const);

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
  const errorCode = stableToken(value.errorCode);
  const modelId = stableToken(value.modelId);
  const motionId = stableToken(value.motionId);
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

function stableToken(value: unknown) {
  if (typeof value !== "string") return "";
  const token = value.trim();
  return token && !/^(?:blob:|data:|https?:\/\/)/i.test(token) ? token : "";
}
