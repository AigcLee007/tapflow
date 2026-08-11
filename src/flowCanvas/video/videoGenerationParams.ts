import { normalizeVideoModelId } from "../../config/videoModels";
import { isFileLike, isTransientMediaUrl } from "../utils/transientMedia";
import type {
  VideoAspectRatio,
  VideoContextPaletteRef,
  VideoCount,
  VideoGenerationDiagnostic,
  VideoGenerationMode,
  VideoGenerationNormalizationResult,
  VideoGenerationParamsRuntime,
  VideoGenerationParamsV2,
  VideoGenerationParamsV1,
  VideoHumanReview,
  VideoReferenceRole,
  VideoReferenceRoleAssignment,
  VideoReferenceSource,
  VideoReferenceInputV2,
  VideoResolution,
} from "./videoTypes";

const VIDEO_MODES: readonly VideoGenerationMode[] = [
  "text_to_video",
  "all_reference",
  "image_to_video",
  "first_last_frame",
  "image_reference",
];

const VIDEO_ASPECT_RATIOS: readonly VideoAspectRatio[] = [
  "auto",
  "16:9",
  "4:3",
  "1:1",
  "3:4",
  "9:16",
  "21:9",
];

const VIDEO_RESOLUTIONS: readonly VideoResolution[] = ["480P", "720P", "1080P", "2K", "4K"];
const VIDEO_COUNTS: readonly VideoCount[] = [1, 2, 4];
const VIDEO_REFERENCE_ROLES: readonly VideoReferenceRole[] = [
  "subject",
  "scene",
  "prop",
  "style",
  "first_frame",
  "last_frame",
  "reference",
];
const HUMAN_REVIEW_STATUSES: readonly VideoHumanReview["status"][] = [
  "not_required",
  "required",
  "verified",
  "expired",
];

const TRANSIENT_PARAM_KEYS = new Set([
  "blob",
  "data",
  "downloadUrl",
  "evidenceUrl",
  "imageUrl",
  "originalImageUrl",
  "posterUrl",
  "previewUrl",
  "signedUrl",
  "src",
  "thumbnailUrl",
]);

const URL_VALUE_RE = /^(?:blob:|data:|https?:\/\/)/i;

export function createDefaultVideoGenerationParams(): VideoGenerationParamsV2 {
  return {
    schemaVersion: 2,
    mode: "text_to_video",
    aspectRatio: "16:9",
    resolution: "720P",
    durationSeconds: 4,
    generateAudio: true,
    count: 1,
    referenceInputs: [],
    cameraMotionId: null,
    visualTone: null,
  };
}

/**
 * Normalize both the current nested params.videoGeneration payload and the
 * legacy flat video params. The function never mutates its input and returns
 * a fresh object on every call so autosave/hash callers can safely reuse it.
 */
export function normalizeVideoGenerationParams(data: unknown): VideoGenerationNormalizationResult {
  const input = asRecord(data);
  const root = input ?? {};
  const rootParams = asRecord(root.params);
  const nestedVideoGeneration = asRecord(rootParams?.videoGeneration) || asRecord(root.videoGeneration);
  const source = nestedVideoGeneration || rootParams || root;
  const diagnostics: VideoGenerationDiagnostic[] = [];
  if (!input) {
    addDiagnostic(diagnostics, "input", data, "Video generation params must be an object");
  }
  const persistedCorrection = readPersistedCorrection(source.normalization);
  const defaults = createDefaultVideoGenerationParams();

  if (source.schemaVersion !== undefined && source.schemaVersion !== 1 && source.schemaVersion !== 2) {
    addDiagnostic(diagnostics, "schemaVersion", source.schemaVersion, "Unsupported video generation schema version");
  }

  const labels = readStringArray(source.referenceLabels ?? root.referenceLabels);
  const referenceAssetItemIds = readStableStringArray(
    root.referenceAssetItemIds ?? source.referenceAssetItemIds,
  );
  const referenceOrder = readStableStringArray(root.referenceOrder ?? source.referenceOrder);
  const referenceNodeIds = readStableStringArray(root.referenceNodeIds ?? source.referenceNodeIds);

  const explicitMode = source.mode ?? source.generationMode;
  const inferredMode = inferMode(explicitMode, labels, referenceAssetItemIds);
  let mode = defaults.mode;
  if (explicitMode === undefined || explicitMode === null || explicitMode === "") {
    mode = inferredMode;
  } else if (isVideoMode(explicitMode)) {
    mode = explicitMode;
  } else {
    addDiagnostic(diagnostics, "mode", explicitMode, "Unsupported video generation mode");
  }

  const aspectRatio = normalizeAspectRatio(source, diagnostics);
  const resolution = normalizeResolution(source, diagnostics);
  const durationSeconds = normalizeDuration(source, diagnostics);
  const generateAudio = normalizeAudio(source, diagnostics);
  const count = normalizeCount(source, root, diagnostics);
  const cameraMotionId = normalizeStableToken(source.cameraMotionId, "cameraMotionId", diagnostics);
  const visualTone = normalizeStableToken(source.visualTone, "visualTone", diagnostics);
  const contextPaletteRefs = normalizeContextPaletteRefs(source.contextPaletteRefs, diagnostics);
  const humanReview = normalizeHumanReview(source.humanReview, diagnostics);
  const referenceRolesByKey = normalizeReferenceRoles(
    source.referenceRolesByKey,
    labels,
    referenceAssetItemIds,
    referenceNodeIds,
    referenceOrder,
    diagnostics,
  );
  const referenceInputs = normalizeReferenceInputs(source, referenceRolesByKey, diagnostics);

  const allDiagnostics = [...persistedCorrection.diagnostics, ...diagnostics];
  const requiresUserCorrection = persistedCorrection.requiresUserCorrection || allDiagnostics.length > 0;
  const params = sanitizeVideoGenerationParams({
    schemaVersion: 2,
    mode,
    aspectRatio,
    resolution,
    durationSeconds,
    generateAudio,
    count: 1,
    referenceInputs,
    cameraMotionId,
    visualTone,
    contextPaletteRefs,
    humanReview,
    referenceRolesByKey,
    ...(requiresUserCorrection
      ? { normalization: { requiresUserCorrection: true as const, diagnostics: allDiagnostics } }
      : {}),
  }) as VideoGenerationParamsRuntime;

  const modelId = normalizeVideoModelId(readString(root.modelId) || readString(source.modelId));
  const routeKey = readStableToken(root.routeKey ?? source.routeKey);

  return {
    params,
    diagnostics: allDiagnostics,
    requiresUserCorrection,
    ...(modelId ? { modelId } : {}),
    ...(routeKey ? { routeKey } : {}),
    ...(referenceAssetItemIds.length ? { referenceAssetItemIds } : {}),
    ...(referenceOrder.length ? { referenceOrder } : {}),
  };
}

export function sanitizeVideoGenerationParams(value: unknown): unknown {
  return sanitizeValue(value, null);
}

function normalizeAspectRatio(
  source: Record<string, unknown>,
  diagnostics: VideoGenerationDiagnostic[],
): VideoAspectRatio {
  const raw = source.aspectRatio ?? source.aspect_ratio;
  if (raw === undefined || raw === null || raw === "") return "16:9";
  if (isVideoAspectRatio(raw)) return raw;
  addDiagnostic(diagnostics, "aspectRatio", raw, "Unsupported video aspect ratio");
  return "auto";
}

function normalizeResolution(
  source: Record<string, unknown>,
  diagnostics: VideoGenerationDiagnostic[],
): VideoResolution {
  const raw = source.resolution;
  if (isVideoResolution(raw)) return raw;
  if (raw !== undefined && raw !== null && raw !== "") {
    addDiagnostic(diagnostics, "resolution", raw, "Unsupported video resolution");
  }

  const quality = readString(source.quality).toLowerCase();
  if (quality.includes("4k")) return "4K";
  if (quality.includes("2k")) return "2K";
  if (quality.includes("1080")) return "1080P";
  if (quality.includes("480")) return "480P";
  if (source.hd === true) return "1080P";
  return "720P";
}

function normalizeDuration(
  source: Record<string, unknown>,
  diagnostics: VideoGenerationDiagnostic[],
): number {
  const raw = source.durationSeconds ?? source.duration;
  if (raw === undefined || raw === null || raw === "") return 4;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    addDiagnostic(diagnostics, "durationSeconds", raw, "Duration must be a positive number");
    return 4;
  }
  return Math.round(value * 100) / 100;
}

function normalizeAudio(source: Record<string, unknown>, diagnostics: VideoGenerationDiagnostic[]): boolean {
  const raw = source.generateAudio ?? source.generate_audio ?? source.audio;
  if (raw === undefined || raw === null || raw === "") return true;
  if (typeof raw === "boolean") return raw;
  if (raw === "true") return true;
  if (raw === "false") return false;
  addDiagnostic(diagnostics, "generateAudio", raw, "Audio flag must be boolean");
  return true;
}

function normalizeCount(
  source: Record<string, unknown>,
  root: Record<string, unknown>,
  diagnostics: VideoGenerationDiagnostic[],
): VideoCount {
  const raw = source.count ?? source.batchCount ?? source.n ?? root.batchCount;
  if (raw === undefined || raw === null || raw === "") return 1;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) {
    addDiagnostic(diagnostics, "count", raw, "Video count must be 1, 2, or 4");
    return 1;
  }

  if (VIDEO_COUNTS.includes(numeric as VideoCount)) return numeric as VideoCount;
  const clamped = VIDEO_COUNTS.reduce((nearest, candidate) => (
    Math.abs(candidate - numeric) <= Math.abs(nearest - numeric) ? candidate : nearest
  ));
  addDiagnostic(diagnostics, "count", raw, "Video count was clamped to the nearest supported value", "COUNT_CLAMPED");
  return clamped;
}

function readPersistedCorrection(value: unknown): {
  requiresUserCorrection: boolean;
  diagnostics: VideoGenerationDiagnostic[];
} {
  const input = asRecord(value);
  if (input?.requiresUserCorrection !== true || !Array.isArray(input.diagnostics)) {
    return { requiresUserCorrection: false, diagnostics: [] };
  }

  const diagnostics = input.diagnostics.flatMap((entry) => {
    const diagnostic = asRecord(entry);
    const code = diagnostic?.code;
    const field = readString(diagnostic?.field);
    const message = readString(diagnostic?.message);
    if (!isVideoGenerationDiagnosticCode(code) || !field || !message) return [];

    const sanitizedValue = sanitizeValue(diagnostic?.value, null);
    return [{
      code,
      field,
      message,
      ...(sanitizedValue !== undefined ? { value: sanitizedValue } : {}),
    }];
  });

  return { requiresUserCorrection: true, diagnostics };
}

function normalizeStableToken(
  value: unknown,
  field: string,
  diagnostics: VideoGenerationDiagnostic[],
): string | null {
  if (value === undefined || value === null || value === "") return null;
  const token = readStableToken(value);
  if (token) return token;
  addDiagnostic(diagnostics, field, value, `${field} must be a stable token`);
  return null;
}

function normalizeContextPaletteRefs(
  value: unknown,
  diagnostics: VideoGenerationDiagnostic[],
): VideoContextPaletteRef[] {
  if (!Array.isArray(value)) return [];
  const refs: VideoContextPaletteRef[] = [];
  value.forEach((entry, index) => {
    const input = asRecord(entry);
    const source = normalizeReferenceSource(input?.source);
    const role = readStableToken(input?.role);
    const colorToken = readStableToken(input?.colorToken);
    if (!source || !role || !colorToken) {
      addDiagnostic(
        diagnostics,
        `contextPaletteRefs[${index}]`,
        entry,
        "Context palette references need a role, source id, and color token",
        "UNSUPPORTED_REFERENCE",
      );
      return;
    }
    refs.push({ role, source, colorToken });
  });
  return refs;
}

function normalizeHumanReview(
  value: unknown,
  diagnostics: VideoGenerationDiagnostic[],
): VideoHumanReview {
  const input = typeof value === "string" ? { status: value } : asRecord(value);
  const status = input?.status;
  if (status !== undefined && !isHumanReviewStatus(status)) {
    addDiagnostic(diagnostics, "humanReview.status", status, "Unsupported human review status");
  }
  const normalized: VideoHumanReview = {
    status: isHumanReviewStatus(status) ? status : "not_required",
  };
  const verifiedAt = readStableToken(input?.verifiedAt);
  const verificationRef = readStableToken(input?.verificationRef);
  if (verifiedAt) normalized.verifiedAt = verifiedAt;
  if (verificationRef) normalized.verificationRef = verificationRef;
  return normalized;
}

function normalizeReferenceRoles(
  value: unknown,
  labels: string[],
  assetIds: string[],
  nodeIds: string[],
  referenceOrder: string[],
  diagnostics: VideoGenerationDiagnostic[],
): Record<string, VideoReferenceRoleAssignment | null> {
  if (value !== undefined) {
    const input = asRecord(value);
    if (!input) {
      addDiagnostic(diagnostics, "referenceRolesByKey", value, "Reference roles must be an object");
      return {};
    }
    const normalized: Record<string, VideoReferenceRoleAssignment | null> = {};
    Object.keys(input).forEach((key) => {
      const safeKey = readStableToken(key);
      if (!safeKey) return;
      const raw = input[key];
      if (raw === null) {
        normalized[safeKey] = null;
        return;
      }
      const assignment = asRecord(raw);
      const role = normalizeReferenceRole(assignment?.role);
      const source = normalizeReferenceSource(assignment?.source);
      if (!role || !source) {
        addDiagnostic(
          diagnostics,
          `referenceRolesByKey.${safeKey}`,
          raw,
          "Reference role needs a supported role and stable source id",
          "UNSUPPORTED_REFERENCE",
        );
        normalized[safeKey] = null;
        return;
      }
      normalized[safeKey] = { role, source };
    });
    return normalized;
  }

  const count = Math.max(labels.length, assetIds.length, nodeIds.length, referenceOrder.length);
  const normalized: Record<string, VideoReferenceRoleAssignment | null> = {};
  for (let index = 0; index < count; index += 1) {
    const key = readStableToken(referenceOrder[index]) || `reference_${index + 1}`;
    const label = labels[index] || "reference";
    const role = roleFromLabel(label);
    const sourceId = assetIds[index] || nodeIds[index];
    const source = sourceId
      ? { kind: assetIds[index] ? "asset" : "upstream", id: sourceId } as VideoReferenceSource
      : null;
    normalized[key] = source ? { role, source } : null;
  }
  return normalized;
}

function normalizeReferenceInputs(
  source: Record<string, unknown>,
  legacyRoles: Record<string, VideoReferenceRoleAssignment | null>,
  diagnostics: VideoGenerationDiagnostic[],
): VideoReferenceInputV2[] {
  const rawInputs = Array.isArray(source.referenceInputs) ? source.referenceInputs : null;
  const candidates: Array<VideoReferenceInputV2 & { sourceIndex: number }> = [];
  if (rawInputs) {
    rawInputs.forEach((entry, sourceIndex) => {
      const input = asRecord(entry);
      const stableSource = normalizeReferenceSource(input?.source);
      const referenceKey = readStableToken(input?.referenceKey) || (stableSource ? `${stableSource.kind}:${stableSource.id}:${sourceIndex}` : "");
      const role = canonicalReferenceRole(input?.role);
      const mediaKind = isVideoMediaKind(input?.mediaKind) ? input.mediaKind : null;
      const order = Number(input?.order);
      if (!stableSource || !referenceKey || !role || !mediaKind || !Number.isInteger(order) || order < 0) {
        addDiagnostic(diagnostics, `referenceInputs[${sourceIndex}]`, entry, "Reference input needs a stable source, media kind, role, and order", "UNSUPPORTED_REFERENCE");
        return;
      }
      candidates.push({ referenceKey, source: stableSource, mediaKind, role, order, sourceIndex });
    });
  } else {
    Object.entries(legacyRoles).forEach(([legacyKey, assignment], sourceIndex) => {
      if (!assignment) return;
      const role = canonicalReferenceRole(assignment.role, source.mode);
      if (!role) return;
      candidates.push({
        referenceKey: `${assignment.source.kind}:${assignment.source.id}:${sourceIndex}`,
        source: assignment.source,
        mediaKind: "image",
        role,
        order: sourceIndex,
        sourceIndex,
      });
      void legacyKey;
    });
  }

  const seen = new Set<string>();
  return candidates
    .sort((left, right) => left.order - right.order || left.sourceIndex - right.sourceIndex)
    .filter((candidate) => {
      const identity = candidate.referenceKey || `${candidate.source.kind}:${candidate.source.id}:${candidate.role}`;
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    })
    .map(({ sourceIndex: _sourceIndex, ...candidate }, order) => ({ ...candidate, order }));
}

function canonicalReferenceRole(value: unknown, mode?: unknown): VideoReferenceInputV2["role"] | null {
  if (value === "first_frame" || value === "last_frame" || value === "main_image" || value === "reference_image" || value === "source_video" || value === "reference_video" || value === "reference_audio") return value;
  if (value === "reference") return mode === "image_to_video" ? "main_image" : "reference_image";
  if (value === "subject" || value === "scene" || value === "prop" || value === "style") return mode === "image_to_video" ? "main_image" : "reference_image";
  return null;
}

function isVideoMediaKind(value: unknown): value is VideoReferenceInputV2["mediaKind"] {
  return value === "image" || value === "video" || value === "audio";
}

function normalizeReferenceSource(value: unknown): VideoReferenceSource | null {
  const input = asRecord(value);
  const id = readStableToken(input?.id);
  if (!id || (input?.kind !== "asset" && input?.kind !== "upstream")) return null;
  return { kind: input.kind, id };
}

function normalizeReferenceRole(value: unknown): VideoReferenceRole | null {
  if (value === undefined) return "reference";
  return isVideoReferenceRole(value) ? value : null;
}

function roleFromLabel(label: string): VideoReferenceRole {
  const normalized = label.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["first", "first_frame", "首帧"].includes(normalized)) return "first_frame";
  if (["last", "last_frame", "尾帧"].includes(normalized)) return "last_frame";
  if (["subject", "主体", "character", "人物"].includes(normalized)) return "subject";
  if (["scene", "场景"].includes(normalized)) return "scene";
  if (["prop", "道具"].includes(normalized)) return "prop";
  if (["style", "风格"].includes(normalized)) return "style";
  return "reference";
}

function inferMode(
  explicitMode: unknown,
  labels: string[],
  assetIds: string[],
): VideoGenerationMode {
  if (isVideoMode(explicitMode)) return explicitMode;
  const roles = labels.map(roleFromLabel);
  if (roles.includes("first_frame") && roles.includes("last_frame")) return "first_last_frame";
  if (labels.length > 0 || assetIds.length > 1) return "image_reference";
  if (assetIds.length === 1) return "image_to_video";
  return "text_to_video";
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => readString(item)).filter(Boolean);
}

function readStableStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => readStableToken(item)).filter((item): item is string => Boolean(item));
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readStableToken(value: unknown): string {
  const token = readString(value);
  return token && !URL_VALUE_RE.test(token) && !isTransientMediaUrl(token) ? token : "";
}

function addDiagnostic(
  diagnostics: VideoGenerationDiagnostic[],
  field: string,
  value: unknown,
  message: string,
  code: VideoGenerationDiagnostic["code"] = "INVALID_VALUE",
) {
  const sanitizedValue = sanitizeVideoGenerationParams(value);
  diagnostics.push({
    code,
    field,
    message,
    ...(sanitizedValue !== undefined ? { value: sanitizedValue } : {}),
  });
}

function sanitizeValue(value: unknown, key: string | null): unknown {
  if (typeof value === "string") {
    if (isTransientMediaUrl(value)) return undefined;
    return value;
  }
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (isFileLike(value)) return undefined;
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeValue(item, null))
      .filter((item): item is Exclude<unknown, undefined> => item !== undefined);
  }
  if (asRecord(value)) {
    const output: Record<string, unknown> = {};
    Object.keys(value).forEach((entryKey) => {
      if (TRANSIENT_PARAM_KEYS.has(entryKey)) return;
      const nested = sanitizeValue(value[entryKey], entryKey);
      if (nested !== undefined) output[entryKey] = nested;
    });
    return output;
  }
  return key ? undefined : value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isVideoMode(value: unknown): value is VideoGenerationMode {
  return typeof value === "string" && VIDEO_MODES.includes(value as VideoGenerationMode);
}

function isVideoAspectRatio(value: unknown): value is VideoAspectRatio {
  return typeof value === "string" && VIDEO_ASPECT_RATIOS.includes(value as VideoAspectRatio);
}

function isVideoResolution(value: unknown): value is VideoResolution {
  return typeof value === "string" && VIDEO_RESOLUTIONS.includes(value as VideoResolution);
}

function isHumanReviewStatus(value: unknown): value is VideoHumanReview["status"] {
  return typeof value === "string" && HUMAN_REVIEW_STATUSES.includes(value as VideoHumanReview["status"]);
}

function isVideoReferenceRole(value: unknown): value is VideoReferenceRole {
  return typeof value === "string" && VIDEO_REFERENCE_ROLES.includes(value as VideoReferenceRole);
}

function isVideoGenerationDiagnosticCode(value: unknown): value is VideoGenerationDiagnostic["code"] {
  return value === "INVALID_VALUE" || value === "COUNT_CLAMPED" || value === "UNSUPPORTED_REFERENCE";
}
