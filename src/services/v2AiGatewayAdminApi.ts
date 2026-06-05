import { apiGet, apiPatch, apiPost } from "./v2HttpClient";

export type AiModality = "text" | "image" | "video";
export type AiResourceStatus = "active" | "inactive";
export type PricingUnit = "text_generation" | "image_generation" | "video_generation";

export type AdminProvider = {
  id: string;
  key: string;
  kind: string;
  name: string;
  status: string;
  defaultBaseUrl: string | null;
  capabilities: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
};

export type AdminModel = {
  id: string;
  providerId: string;
  modelKey: string;
  displayName: string;
  modality: AiModality;
  status: string;
  capabilities?: Record<string, unknown>;
  contextWindow?: number | null;
  createdAt?: string;
  updatedAt?: string;
};

export type AdminRoute = {
  id: string;
  providerId: string;
  modelId: string | null;
  credentialId: string | null;
  routeKey: string;
  modality: AiModality;
  status: string;
  baseUrlOverride: string | null;
  requestConfig: Record<string, unknown>;
  pricing: Record<string, unknown>;
  fallbackGroup?: string | null;
  priority?: number;
  rateLimit?: Record<string, unknown>;
  tenantId?: string | null;
  weight?: number;
  createdAt?: string;
  updatedAt?: string;
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
  unit: PricingUnit;
  unitCredits: number;
  minChargeCredits: number;
  active: boolean;
  metadata: Record<string, unknown>;
  updatedAt: string;
};

export async function listAdminProviders(): Promise<AdminProvider[]> {
  return apiGet<AdminProvider[]>("/admin/ai/providers");
}

export async function createAdminProvider(input: {
  capabilities?: Record<string, unknown>;
  defaultBaseUrl?: string | null;
  key: string;
  kind: string;
  name: string;
  status?: AiResourceStatus;
}): Promise<AdminProvider> {
  return apiPost<AdminProvider>("/admin/ai/providers", input);
}

export async function listAdminModels(): Promise<AdminModel[]> {
  return apiGet<AdminModel[]>("/admin/ai/models");
}

export async function createAdminModel(input: {
  capabilities?: Record<string, unknown>;
  contextWindow?: number | null;
  displayName: string;
  modality: AiModality;
  modelKey: string;
  providerId: string;
  status?: AiResourceStatus;
}): Promise<AdminModel> {
  return apiPost<AdminModel>("/admin/ai/models", input);
}

export async function listAdminRoutes(): Promise<AdminRoute[]> {
  return apiGet<AdminRoute[]>("/admin/ai/routes");
}

export async function createAdminRoute(input: {
  baseUrlOverride?: string | null;
  credentialId?: string | null;
  fallbackGroup?: string | null;
  modality: AiModality;
  modelId?: string | null;
  pricing?: Record<string, unknown>;
  priority?: number;
  providerId: string;
  rateLimit?: Record<string, unknown>;
  requestConfig?: Record<string, unknown>;
  routeKey: string;
  status?: AiResourceStatus;
  weight?: number;
}): Promise<AdminRoute> {
  return apiPost<AdminRoute>("/admin/ai/routes", input);
}

export async function updateAdminRoute(
  routeId: string,
  input: {
    baseUrlOverride?: string | null;
    credentialId?: string | null;
    fallbackGroup?: string | null;
    modelId?: string | null;
    pricing?: Record<string, unknown>;
    priority?: number;
    rateLimit?: Record<string, unknown>;
    requestConfig?: Record<string, unknown>;
    status?: string;
    weight?: number;
  },
): Promise<AdminRoute> {
  return apiPatch<AdminRoute>(`/admin/ai/routes/${encodeURIComponent(routeId)}`, input);
}

export async function listAdminCredentials(): Promise<AdminCredential[]> {
  return apiGet<AdminCredential[]>("/admin/credentials");
}

export async function createAdminCredential(input: {
  name: string;
  providerId: string;
  secret: string;
  status?: AiResourceStatus;
}): Promise<AdminCredential> {
  return apiPost<AdminCredential>("/admin/credentials", input);
}

export async function updateAdminCredential(
  credentialId: string,
  input: {
    name?: string;
    status?: AiResourceStatus;
  },
): Promise<AdminCredential> {
  return apiPatch<AdminCredential>(`/admin/credentials/${encodeURIComponent(credentialId)}`, input);
}

export async function rotateAdminCredential(
  credentialId: string,
  secret: string,
): Promise<AdminCredential> {
  return apiPost<AdminCredential>(`/admin/credentials/${encodeURIComponent(credentialId)}/rotate`, {
    secret,
  });
}

export async function listAdminPricing(unit?: PricingUnit): Promise<ModelPricingRow[]> {
  const query = unit ? `?unit=${encodeURIComponent(unit)}` : "";
  return apiGet<ModelPricingRow[]>(`/admin/ai/pricing${query}`);
}

export async function upsertAdminPricing(input: {
  provider: string;
  model: string;
  route: string;
  unit: PricingUnit;
  minChargeCredits: number;
  unitCredits?: number;
  active?: boolean;
}): Promise<ModelPricingRow> {
  return apiPatch<ModelPricingRow>("/admin/ai/pricing", input);
}
