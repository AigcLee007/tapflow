import { apiGet, apiPatch, apiPost } from "./v2HttpClient";

export type AdminProvider = {
  id: string;
  key: string;
  kind: string;
  name: string;
  status: string;
  defaultBaseUrl: string | null;
  capabilities: Record<string, unknown>;
};

export type AdminModel = {
  id: string;
  providerId: string;
  modelKey: string;
  displayName: string;
  modality: string;
  status: string;
};

export type AdminRoute = {
  id: string;
  providerId: string;
  modelId: string | null;
  credentialId: string | null;
  routeKey: string;
  modality: string;
  status: string;
  baseUrlOverride: string | null;
  requestConfig: Record<string, unknown>;
  pricing: Record<string, unknown>;
};

export type AdminCredential = {
  id: string;
  providerId: string;
  name: string;
  status: string;
  maskedSecret: string;
  secretFingerprint: string;
  lastUsedAt: string | null;
  rotatedAt: string | null;
  updatedAt?: string | null;
};

export type ModelPricingRow = {
  provider: string;
  model: string;
  route: string;
  unit: string;
  unitCredits: number;
  minChargeCredits: number;
  active: boolean;
  metadata: Record<string, unknown>;
  updatedAt: string;
};

export async function listAdminProviders(): Promise<AdminProvider[]> {
  return apiGet<AdminProvider[]>("/admin/ai/providers");
}

export async function listAdminModels(): Promise<AdminModel[]> {
  return apiGet<AdminModel[]>("/admin/ai/models");
}

export async function listAdminRoutes(): Promise<AdminRoute[]> {
  return apiGet<AdminRoute[]>("/admin/ai/routes");
}

export async function updateAdminRoute(
  routeId: string,
  input: {
    baseUrlOverride?: string | null;
    modelId?: string | null;
    requestConfig?: Record<string, unknown>;
    status?: string;
  },
): Promise<AdminRoute> {
  return apiPatch<AdminRoute>(`/admin/ai/routes/${encodeURIComponent(routeId)}`, input);
}

export async function listAdminCredentials(): Promise<AdminCredential[]> {
  return apiGet<AdminCredential[]>("/admin/credentials");
}

export async function rotateAdminCredential(
  credentialId: string,
  secret: string,
): Promise<AdminCredential> {
  return apiPost<AdminCredential>(`/admin/credentials/${encodeURIComponent(credentialId)}/rotate`, {
    secret,
  });
}

export async function listAdminPricing(unit?: string): Promise<ModelPricingRow[]> {
  const query = unit ? `?unit=${encodeURIComponent(unit)}` : "";
  return apiGet<ModelPricingRow[]>(`/admin/ai/pricing${query}`);
}

export async function upsertAdminPricing(input: {
  provider: string;
  model: string;
  route: string;
  unit: string;
  minChargeCredits: number;
  unitCredits?: number;
  active?: boolean;
}): Promise<ModelPricingRow> {
  return apiPatch<ModelPricingRow>("/admin/ai/pricing", input);
}
