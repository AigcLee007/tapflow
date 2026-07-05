import { apiGet, apiPost } from "./v2HttpClient";

export type AiModelCatalogItem = {
  capabilities: Record<string, unknown>;
  defaultRouteKey: string | null;
  displayName: string;
  id: string;
  modality: "image" | "text" | "video";
  modelFamily: string;
  modelId: string | null;
  modelKey: string;
  sortOrder: number;
  status: string;
  uiSchema: Record<string, unknown>;
};

export type AiModelCatalogRoute = {
  capabilities?: {
    supportedGenerationModes?: string[];
  };
  estimatedCredits: number | null;
  minChargeCredits: number | null;
  modality: string;
  modelFamily: string | null;
  modelKey: string | null;
  pricingUnit: string | null;
  providerKey: string;
  providerName: string;
  routeId: string;
  routeKey: string;
  routeLabel: string | null;
};

export type AiRouteTestResult = {
  checkedAt: string;
  error: Record<string, unknown> | null;
  healthCheckId: string;
  latencyMs: number;
  requestSummary: Record<string, unknown>;
  responseSummary: Record<string, unknown>;
  routeId: string;
  routeKey: string;
  status: "failed" | "ok";
};

export function listAiModelCatalog(modality?: string): Promise<AiModelCatalogItem[]> {
  const query = modality ? `?modality=${encodeURIComponent(modality)}` : "";
  return apiGet<AiModelCatalogItem[]>(`/ai/model-catalog${query}`);
}

export function listAiModelRoutes(modelKey: string): Promise<AiModelCatalogRoute[]> {
  return apiGet<AiModelCatalogRoute[]>(
    `/ai/model-catalog/${encodeURIComponent(modelKey)}/routes`,
  );
}

export function testAiRoute(
  routeId: string,
  input?: {
    metadata?: Record<string, unknown>;
    prompt?: string;
  },
): Promise<AiRouteTestResult> {
  return apiPost<AiRouteTestResult>(
    `/admin/ai/routes/${encodeURIComponent(routeId)}/test`,
    input ?? {},
  );
}
