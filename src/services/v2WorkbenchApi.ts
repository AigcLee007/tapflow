import { V2HttpError, apiGet, apiPost, getStoredAccessToken } from "./v2HttpClient";

export type WorkbenchDisplayMode = "merged" | "separate";

export type WorkbenchResultView = {
  assetId: string;
  createdAt: string;
  downloadUrl: string | null;
  downloadUrlExpiresAt: string | null;
  height: number | null;
  id: string;
  metadata: Record<string, unknown>;
  mimeType: string;
  originalFilename: string | null;
  previewUrl: string | null;
  previewUrlExpiresAt: string | null;
  sortOrder: number;
  status: string;
  width: number | null;
};

export type WorkbenchGenerationView = {
  chargedCredits: number | null;
  createdAt: string;
  displayMode: WorkbenchDisplayMode;
  errorJson: Record<string, unknown> | null;
  estimatedCredits: number;
  finishedAt: string | null;
  id: string;
  modelId: string;
  params: Record<string, unknown>;
  prompt: string;
  referenceAssetIds: string[];
  referenceUploadIds: string[];
  requestedCount: number;
  reservedCredits: number;
  reserveLedgerId: string | null;
  results: WorkbenchResultView[];
  routeKey: string;
  sessionId: string | null;
  startedAt: string | null;
  status: string;
  updatedAt: string;
};

export type ListWorkbenchGenerationsResponse = {
  generations: WorkbenchGenerationView[];
  nextCursor: string | null;
};

export type CreateWorkbenchGenerationInput = {
  displayMode: WorkbenchDisplayMode;
  idempotencyKey?: string;
  modelId: string;
  params: Record<string, unknown>;
  prompt: string;
  referenceAssetIds: string[];
  referenceUploadIds?: string[];
  requestedCount: number;
  routeKey: string;
  sessionId?: string;
};

export type WorkbenchReferenceUploadView = {
  createdAt: string;
  expiresAt: string;
  height: number | null;
  id: string;
  mimeType: string;
  originalFilename: string | null;
  previewUrl: string | null;
  sizeBytes: number;
  width: number | null;
};

export function listWorkbenchGenerations(input?: {
  cursor?: string;
  limit?: number;
}): Promise<ListWorkbenchGenerationsResponse> {
  const params = new URLSearchParams();
  if (input?.cursor) params.set("cursor", input.cursor);
  if (typeof input?.limit === "number") params.set("limit", String(input.limit));
  const query = params.toString();
  return apiGet<ListWorkbenchGenerationsResponse>(`/workbench/generations${query ? `?${query}` : ""}`);
}

export function createWorkbenchGeneration(
  input: CreateWorkbenchGenerationInput,
): Promise<WorkbenchGenerationView> {
  return apiPost<WorkbenchGenerationView>("/workbench/generations", input);
}

export function uploadWorkbenchReferenceFile(input: {
  file: File;
  height?: number | null;
  localPreviewUrl?: string | null;
  width?: number | null;
}): Promise<WorkbenchReferenceUploadView> {
  const headers: Record<string, string> = {
    "Content-Type": input.file.type || "image/png",
    "x-workbench-filename": encodeURIComponent(input.file.name),
  };
  const token = getStoredAccessToken();
  if (token) headers.Authorization = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
  if (input.width) headers["x-workbench-image-width"] = String(input.width);
  if (input.height) headers["x-workbench-image-height"] = String(input.height);

  return fetch("/api/v2/workbench/reference-uploads", {
    body: input.file,
    cache: "no-store",
    headers,
    method: "POST",
  })
    .then(async (response) => {
      const payload = (await response.json().catch(() => ({}))) as WorkbenchReferenceUploadView & {
        error?: { code?: string; details?: unknown; message?: string; requestId?: string };
      };
      if (!response.ok) {
        throw new V2HttpError({
          code: payload.error?.code,
          details: payload.error?.details,
          message: payload.error?.message || `Request failed with status ${response.status}`,
          requestId: payload.error?.requestId,
          status: response.status,
        });
      }
      return payload;
    })
    .then((upload) => ({
      ...upload,
      originalFilename: upload.originalFilename || input.file.name,
      previewUrl: input.localPreviewUrl || upload.previewUrl || null,
    }));
}

export function getWorkbenchGeneration(generationId: string): Promise<WorkbenchGenerationView> {
  return apiGet<WorkbenchGenerationView>(`/workbench/generations/${encodeURIComponent(generationId)}`);
}

export function retryWorkbenchGeneration(generationId: string): Promise<WorkbenchGenerationView> {
  return apiPost<WorkbenchGenerationView>(`/workbench/generations/${encodeURIComponent(generationId)}/retry`, {});
}

export function sendWorkbenchResultToProject(
  resultId: string,
  input: { projectId?: string; projectName?: string },
): Promise<{ nodeId: string; projectId: string }> {
  return apiPost<{ nodeId: string; projectId: string }>(
    `/workbench/results/${encodeURIComponent(resultId)}/send-to-project`,
    input,
  );
}
