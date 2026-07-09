import { apiGet } from "./v2HttpClient";

export type V2RuntimeRouteCapabilities = {
  supportedGenerationModes?: string[];
  supportedVideoWorkflows?: string[];
};

export type V2RuntimeRouteItem = {
  capabilities?: V2RuntimeRouteCapabilities;
  estimatedCredits: number | null;
  minChargeCredits: number | null;
  modality: string;
  modelDisplayName: string | null;
  modelKey: string | null;
  providerKey: string;
  providerName: string;
  pricingUnit: string | null;
  routeKey: string;
};

export async function listRuntimeRoutes(modality?: string): Promise<V2RuntimeRouteItem[]> {
  const query = modality ? `?modality=${encodeURIComponent(modality)}` : "";
  return apiGet<V2RuntimeRouteItem[]>(`/ai/routes${query}`);
}

