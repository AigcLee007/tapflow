import { apiGet, apiPost, apiPut } from "../../services/v2HttpClient";
import type { WorkspaceFlow, WorkspaceProject } from "../../workspace/workspaceApi";

export type FlowDraftGraph = {
  edges: Record<string, unknown>[];
  nodes: Record<string, unknown>[];
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
};

export type FlowDraft = {
  createdAt: string;
  flowId: string;
  graph: FlowDraftGraph;
  id: string;
  lastSavedBy: string | null;
  projectId: string;
  revision: number;
  tenantId: string;
  updatedAt: string;
};

export async function getProject(projectId: string): Promise<WorkspaceProject> {
  return apiGet<WorkspaceProject>(`/projects/${projectId}`);
}

export async function listProjectFlows(projectId: string): Promise<WorkspaceFlow[]> {
  return apiGet<WorkspaceFlow[]>(`/projects/${projectId}/flows`);
}

export async function createDefaultFlow(project: WorkspaceProject): Promise<WorkspaceFlow> {
  return apiPost<WorkspaceFlow>(`/projects/${project.id}/flows`, {
    description: "Default project canvas",
    title: `${project.name} Flow`,
  });
}

export async function getFlowDraft(flowId: string): Promise<FlowDraft> {
  return apiGet<FlowDraft>(`/flows/${flowId}/draft`);
}

export async function saveFlowDraft(
  flowId: string,
  input: {
    expectedRevision?: number;
    graph: FlowDraftGraph;
  },
): Promise<FlowDraft> {
  return apiPut<FlowDraft>(`/flows/${flowId}/draft`, {
    ...input,
    graph: sanitizeFlowDraftGraph(input.graph),
  });
}

const TRANSIENT_MEDIA_FIELD_RE =
  /(?:thumbnailUrl|thumbnail_url|posterUrl|poster_url|originalImageUrl|original_image_url|previewUrl|preview_url|downloadUrl|download_url|imageUrl|image_url|src)$/i;
const FORBIDDEN_EMBEDDED_FIELD_RE =
  /(?:^|_)(?:base64|blob|file|dataUrl|data_url)$/i;

export function sanitizeFlowDraftGraph(graph: FlowDraftGraph): FlowDraftGraph {
  return {
    edges: graph.edges.map((edge) => sanitizeGraphValue(edge, false) as Record<string, unknown>),
    nodes: graph.nodes.map((node) => sanitizeNodeForDraft(node)),
    viewport: {
      x: graph.viewport.x,
      y: graph.viewport.y,
      zoom: graph.viewport.zoom,
    },
  };
}

function sanitizeNodeForDraft(node: Record<string, unknown>): Record<string, unknown> {
  const nextNode = sanitizeGraphValue(node, false);
  if (!isRecord(nextNode)) return node;
  if (!isRecord(nextNode.data)) return nextNode;
  return {
    ...nextNode,
    data: sanitizeGraphValue(nextNode.data, isAssetBackedNodeData(nextNode.data)),
  };
}

function sanitizeGraphValue(value: unknown, assetBacked: boolean): unknown {
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeGraphValue(item, assetBacked))
      .filter((item) => item !== undefined);
  }

  if (isFileLike(value)) {
    return undefined;
  }

  if (isRecord(value)) {
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_EMBEDDED_FIELD_RE.test(key)) {
        continue;
      }
      if (assetBacked && TRANSIENT_MEDIA_FIELD_RE.test(key)) {
        continue;
      }
      if (TRANSIENT_MEDIA_FIELD_RE.test(key) && isSignedAssetUrl(item)) {
        continue;
      }
      if (TRANSIENT_MEDIA_FIELD_RE.test(key) && isLocalPayloadString(item)) {
        continue;
      }
      const sanitized = sanitizeGraphValue(item, assetBacked);
      if (sanitized !== undefined) {
        next[key] = sanitized;
      }
    }
    return next;
  }

  return value;
}

function isAssetBackedNodeData(value: Record<string, unknown>) {
  return (
    typeof value.assetId === "string" ||
    typeof value.sourceAssetId === "string" ||
    typeof value.thumbnailAssetId === "string" ||
    (Array.isArray(value.assetIds) && value.assetIds.some((item) => typeof item === "string" && item.trim()))
  );
}

function isLocalPayloadString(value: unknown) {
  return typeof value === "string" && /^(?:data:|blob:)/i.test(value.trim());
}

function isSignedAssetUrl(value: unknown) {
  if (typeof value !== "string") return false;
  return /[?&](?:x-amz-signature|x-amz-credential|signature|expires)=/i.test(value);
}

function isFileLike(value: unknown) {
  if (!value || typeof value !== "object") return false;
  if (typeof File !== "undefined" && value instanceof File) return true;
  if (typeof Blob !== "undefined" && value instanceof Blob) return true;
  const tag = Object.prototype.toString.call(value);
  return tag === "[object File]" || tag === "[object Blob]";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
