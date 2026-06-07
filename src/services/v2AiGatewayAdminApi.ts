import { apiDelete, apiGet, apiPatch, apiPost } from "./v2HttpClient";

export type AiModality = "text" | "image" | "video";
export type AiResourceStatus = "active" | "inactive";
export type PricingUnit = "text_generation" | "image_generation" | "video_generation";

export type AdminProviderConnection = {
  id: string;
  providerId: string;
  credentialId: string | null;
  name: string;
  adapterKind: string;
  baseUrl: string | null;
  environment: string;
  status: string;
  metadata: Record<string, unknown>;
  lastHealthStatus: string | null;
  lastHealthCheckedAt: string | null;
  tenantId: string;
  createdBy: string | null;
  createdAt?: string;
  updatedAt?: string;
};

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
  adminNotes?: string | null;
  apiMode?: string | null;
  id: string;
  connectionId?: string | null;
  providerId: string;
  modelId: string | null;
  credentialId: string | null;
  routeKey: string;
  routeLabel?: string | null;
  modality: AiModality;
  status: string;
  baseUrlOverride: string | null;
  internalLabel?: string | null;
  isDefault?: boolean;
  requestConfig: Record<string, unknown>;
  pricing: Record<string, unknown>;
  fallbackGroup?: string | null;
  healthStatus?: string | null;
  priority?: number;
  rateLimit?: Record<string, unknown>;
  requestPath?: string | null;
  tenantId?: string | null;
  upstreamModel?: string | null;
  weight?: number;
  deletedAt?: string | null;
  lastHealthCheckedAt?: string | null;
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

export async function listAdminProviderConnections(): Promise<AdminProviderConnection[]> {
  return apiGet<AdminProviderConnection[]>("/admin/ai/connections");
}

export async function createAdminProviderConnection(input: {
  adapterKind: string;
  baseUrl?: string | null;
  credentialId?: string | null;
  environment?: string;
  metadata?: Record<string, unknown>;
  name: string;
  providerId: string;
  status?: AiResourceStatus;
}): Promise<AdminProviderConnection> {
  return apiPost<AdminProviderConnection>("/admin/ai/connections", input);
}

export async function updateAdminProviderConnection(
  connectionId: string,
  input: {
    adapterKind?: string;
    baseUrl?: string | null;
    credentialId?: string | null;
    environment?: string;
    metadata?: Record<string, unknown>;
    name?: string;
    status?: AiResourceStatus;
  },
): Promise<AdminProviderConnection> {
  return apiPatch<AdminProviderConnection>(`/admin/ai/connections/${encodeURIComponent(connectionId)}`, input);
}

export async function deleteAdminProviderConnection(connectionId: string): Promise<{ ok: true }> {
  return apiDelete<{ ok: true }>(`/admin/ai/connections/${encodeURIComponent(connectionId)}`);
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
  adminNotes?: string | null;
  apiMode?: string | null;
  baseUrlOverride?: string | null;
  connectionId?: string | null;
  credentialId?: string | null;
  fallbackGroup?: string | null;
  internalLabel?: string | null;
  isDefault?: boolean;
  modality: AiModality;
  modelId?: string | null;
  pricing?: Record<string, unknown>;
  priority?: number;
  providerId: string;
  requestPath?: string | null;
  rateLimit?: Record<string, unknown>;
  requestConfig?: Record<string, unknown>;
  routeKey: string;
  routeLabel?: string | null;
  status?: AiResourceStatus;
  upstreamModel?: string | null;
  weight?: number;
}): Promise<AdminRoute> {
  return apiPost<AdminRoute>("/admin/ai/routes", input);
}

export async function updateAdminRoute(
  routeId: string,
  input: {
    adminNotes?: string | null;
    apiMode?: string | null;
    baseUrlOverride?: string | null;
    connectionId?: string | null;
    credentialId?: string | null;
    fallbackGroup?: string | null;
    internalLabel?: string | null;
    isDefault?: boolean;
    modelId?: string | null;
    pricing?: Record<string, unknown>;
    priority?: number;
    requestPath?: string | null;
    rateLimit?: Record<string, unknown>;
    requestConfig?: Record<string, unknown>;
    routeLabel?: string | null;
    status?: string;
    upstreamModel?: string | null;
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
