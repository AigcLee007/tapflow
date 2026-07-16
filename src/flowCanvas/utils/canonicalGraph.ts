import type { FlowDraftGraph } from "../services/flowProjectApi";

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

const SIGNED_URL_RE = /[?&](?:x-amz-signature|x-amz-credential|signature|expires)=/i;

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
      next.data = sortRecord(stripTransientValue(node.data, "node-data") as Record<string, unknown>);
      continue;
    }
    const value = stripTransientValue(node[key], "node");
    if (value !== undefined) {
      next[key] = value;
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
    const trimmed = value.trim();
    if (/^(?:blob:|data:)/i.test(trimmed)) return undefined;
    if (SIGNED_URL_RE.test(trimmed)) return undefined;
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

function isFileLike(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (typeof File !== "undefined" && value instanceof File) return true;
  if (typeof Blob !== "undefined" && value instanceof Blob) return true;
  const tag = Object.prototype.toString.call(value);
  return tag === "[object File]" || tag === "[object Blob]";
}
