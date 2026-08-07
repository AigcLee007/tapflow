import type { FlowDraftGraph } from "../services/flowProjectApi";
import { isFileLike, isTransientMediaUrl } from "./transientMedia";
import { normalizeVideoGenerationParams } from "../video/videoGenerationParams";

const TRANSIENT_NODE_DATA_KEYS = new Set([
  "activeNodeRunId",
  "activeRunId",
  "downloadUrl",
  "errorCode",
  "errorMessage",
  "expiresAt",
  "generationStatus",
  "generating",
  "hovered",
  "imageUrl",
  "isGenerating",
  "loading",
  "nodeRun",
  "nodeRunId",
  "nodeRunStatus",
  "pending",
  "pendingNodeIds",
  "posterUrl",
  "previewUrl",
  "progress",
  "runStatus",
  "selected",
  "signedUrl",
  "src",
  "status",
  "textExcerpt",
  "thumbnailUrl",
  "updatedAt",
  "uploadErrorMessage",
  "uploadStatus",
  "workflowRun",
  "workflowRunId",
]);

const TRANSIENT_NODE_KEYS = new Set([
  "dragging",
  "measured",
  "positionAbsolute",
  "resizing",
  "selected",
]);

const LEGACY_VIDEO_GENERATION_KEYS = new Set([
  "aspectRatio",
  "aspect_ratio",
  "audio",
  "batchCount",
  "cameraMotionId",
  "contextPaletteRefs",
  "count",
  "duration",
  "durationSeconds",
  "generateAudio",
  "generate_audio",
  "generationMode",
  "hd",
  "humanReview",
  "n",
  "quality",
  "referenceLabels",
  "referenceNodeIds",
  "referenceRolesByKey",
  "resolution",
  "schemaVersion",
  "videoGeneration",
  "visualTone",
]);

export function canonicalizeGraph(graph: FlowDraftGraph): FlowDraftGraph {
  return {
    edges: graph.edges.map((edge) => sortRecord(stripTransientValue(edge, "edge") as Record<string, unknown>)),
    nodes: graph.nodes.map((node) => canonicalizeNode(node)),
    ...(graph.projectStudios
      ? { projectStudios: sortRecord(stripTransientValue(graph.projectStudios, "node-data") as Record<string, unknown>) as FlowDraftGraph["projectStudios"] }
      : {}),
    viewport: {
      x: Number(graph.viewport?.x ?? 0),
      y: Number(graph.viewport?.y ?? 0),
      zoom: Number(graph.viewport?.zoom ?? 1),
    },
  };
}

export function hashGraph(graph: FlowDraftGraph): string {
  return JSON.stringify(canonicalizeGraph(graph));
}

function canonicalizeNode(node: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  const keys = Object.keys(node).sort();

  for (const key of keys) {
    if (TRANSIENT_NODE_KEYS.has(key)) continue;
    if (key === "data" && isRecord(node.data)) {
      const durableData = stripTransientValue(node.data, "node-data") as Record<string, unknown>;
      next.data = canonicalizeNodeData(durableData, node.type);
      continue;
    }
    const value = stripTransientValue(node[key], "node");
    if (value !== undefined) {
      next[key] = value;
    }
  }

  return next;
}

function canonicalizeNodeData(data: Record<string, unknown>, nodeType: unknown): Record<string, unknown> {
  if (nodeType !== "video" && data.kind !== "video") {
    return sortRecord(data);
  }

  const normalized = normalizeVideoGenerationParams(data);
  const existingParams = isRecord(data.params) ? data.params : {};
  const nextData = stripLegacyVideoGenerationKeys(data);
  const nextParams = stripLegacyVideoGenerationKeys(existingParams);
  nextParams.videoGeneration = selectPersistedVideoGenerationParams(normalized.params);
  nextData.params = nextParams;
  if (normalized.modelId) nextData.modelId = normalized.modelId;
  if (normalized.routeKey) nextData.routeKey = normalized.routeKey;
  const sourceParams = isRecord(existingParams.videoGeneration) ? existingParams.videoGeneration : existingParams;
  if (sourceParams.schemaVersion !== 2) {
    if (normalized.referenceAssetItemIds) nextData.referenceAssetItemIds = normalized.referenceAssetItemIds;
    if (normalized.referenceOrder) nextData.referenceOrder = normalized.referenceOrder;
  } else {
    delete nextData.referenceAssetItemIds;
    delete nextData.referenceOrder;
  }

  return sortRecord(nextData);
}

function selectPersistedVideoGenerationParams(params: Record<string, unknown>): Record<string, unknown> {
  const keys = [
    "schemaVersion",
    "mode",
    "aspectRatio",
    "resolution",
    "durationSeconds",
    "generateAudio",
    "count",
    "referenceInputs",
    "cameraMotionId",
    "visualTone",
  ];
  const persisted: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in params) persisted[key] = params[key];
  }
  return persisted;
}

function stripLegacyVideoGenerationKeys(value: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!LEGACY_VIDEO_GENERATION_KEYS.has(key)) {
      next[key] = entry;
    }
  }
  return next;
}

function stripTransientValue(value: unknown, scope: "edge" | "node" | "node-data"): unknown {
  if (isFileLike(value)) return undefined;

  if (Array.isArray(value)) {
    return value
      .map((item) => stripTransientValue(item, scope))
      .filter((item) => item !== undefined);
  }

  if (isRecord(value)) {
    const next: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      if (scope === "node-data" && TRANSIENT_NODE_DATA_KEYS.has(key)) {
        continue;
      }
      const nested = stripTransientValue(value[key], scope);
      if (nested !== undefined) {
        next[key] = nested;
      }
    }
    return next;
  }

  if (typeof value === "string") {
    if (isTransientMediaUrl(value)) return undefined;
  }

  return value;
}

function sortRecord(record: Record<string, unknown>): Record<string, unknown> {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    sorted[key] = record[key];
  }
  return sorted;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
