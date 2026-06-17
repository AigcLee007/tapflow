import { apiGet, apiPost } from "./v2HttpClient";

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
  requestedCount: number;
  routeKey: string;
  sessionId?: string;
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
