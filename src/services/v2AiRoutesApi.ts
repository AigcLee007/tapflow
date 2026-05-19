import { apiGet } from "./v2HttpClient";

export type V2RuntimeRouteItem = {
  modality: string;
  modelDisplayName: string | null;
  modelKey: string | null;
  providerKey: string;
  providerName: string;
  routeKey: string;
};

export async function listRuntimeRoutes(modality?: string): Promise<V2RuntimeRouteItem[]> {
  const query = modality ? `?modality=${encodeURIComponent(modality)}` : "";
  return apiGet<V2RuntimeRouteItem[]>(`/ai/routes${query}`);
}

