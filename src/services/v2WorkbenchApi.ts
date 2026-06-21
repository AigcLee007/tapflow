import { apiDelete, apiGet, apiPost } from "./v2HttpClient";
import { uploadReferenceImageFile, type ReferenceUploadView } from "./referenceUploadsApi";

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

export type WorkbenchBatchChildView = {
  batchIndex: number;
  chargedCredits: number | null;
  errorJson: Record<string, unknown> | null;
  finishedAt: string | null;
  generationId: string;
  results: WorkbenchResultView[];
  startedAt: string | null;
  status: string;
  updatedAt: string;
};

export type WorkbenchBatchView = {
  batchId: string;
  children: WorkbenchBatchChildView[];
  completedCount: number;
  failedCount: number;
  parentGenerationId: string | null;
  pendingCount: number;
  runningCount: number;
  totalCount: number;
};

export type WorkbenchGenerationView = {
  batch: WorkbenchBatchView | null;
  batchId: string | null;
  batchIndex: number | null;
  batchRole: "single" | "parent" | "child";
  batchTotal: number | null;
  chargedCredits: number | null;
  createdAt: string;
  displayMode: WorkbenchDisplayMode;
  errorJson: Record<string, unknown> | null;
  estimatedCredits: number;
  finishedAt: string | null;
  id: string;
  modelId: string;
  params: Record<string, unknown>;
  parentGenerationId: string | null;
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

export type WorkbenchReferenceUploadView = ReferenceUploadView;

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
  return uploadReferenceImageFile(input);
}

export function getWorkbenchGeneration(generationId: string): Promise<WorkbenchGenerationView> {
  return apiGet<WorkbenchGenerationView>(`/workbench/generations/${encodeURIComponent(generationId)}`);
}

export function retryWorkbenchGeneration(generationId: string): Promise<WorkbenchGenerationView> {
  return apiPost<WorkbenchGenerationView>(`/workbench/generations/${encodeURIComponent(generationId)}/retry`, {});
}

export function deleteWorkbenchGeneration(generationId: string): Promise<{
  deleted: boolean;
  generationId: string;
  ok: true;
}> {
  return apiDelete<{
    deleted: boolean;
    generationId: string;
    ok: true;
  }>(`/workbench/generations/${encodeURIComponent(generationId)}`);
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
