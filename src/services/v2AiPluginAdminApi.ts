import { apiGet, apiPost } from "./v2HttpClient";

export type AiPluginModality = "image" | "text" | "video";

export type AiPluginInstall = {
  credentialId: string | null;
  disabledAt: string | null;
  id: string;
  installedVersion: string;
  metadata: Record<string, unknown>;
  packageId: string;
  packageKey: string;
  providerId: string | null;
  publishedAt: string | null;
  status: string;
};

export type AiPluginSummary = {
  credentials: {
    fields: Array<{
      key: string;
      label: string;
      placeholder?: string;
      required: boolean;
      secret: boolean;
    }>;
    required: boolean;
    type: "bearer";
  };
  description: string;
  displayName: string;
  install: AiPluginInstall | null;
  modality: AiPluginModality;
  models: Array<{
    defaultRouteKey: string;
    displayName: string;
    modelFamily: string;
    modelKey: string;
  }>;
  packageKey: string;
  provider: {
    key: string;
    kind: string;
    name: string;
  };
  version: string;
};

export type InstalledAiPlugin = AiPluginInstall & {
  catalogModelKeys: string[];
  routeKeys: string[];
};

export type InstallPluginInput = {
  baseUrlOverride?: string | null;
  credential?: {
    name?: string;
    secret?: string;
  };
  pricingOverrides?: Array<{
    minChargeCredits: number;
    modelKey: string;
    routeKey: string;
    unitCredits: number;
  }>;
  publishImmediately?: boolean;
};

export function listAiPlugins(modality?: AiPluginModality): Promise<AiPluginSummary[]> {
  const query = modality ? `?modality=${encodeURIComponent(modality)}` : "";
  return apiGet<AiPluginSummary[]>(`/admin/ai/plugins${query}`);
}

export function installAiPlugin(
  packageKey: string,
  input: InstallPluginInput,
): Promise<InstalledAiPlugin> {
  return apiPost<InstalledAiPlugin>(
    `/admin/ai/plugins/${encodeURIComponent(packageKey)}/install`,
    input,
  );
}

export function publishAiPluginInstall(installId: string): Promise<InstalledAiPlugin> {
  return apiPost<InstalledAiPlugin>(`/admin/ai/plugins/${encodeURIComponent(installId)}/publish`);
}

export function disableAiPluginInstall(installId: string): Promise<InstalledAiPlugin> {
  return apiPost<InstalledAiPlugin>(`/admin/ai/plugins/${encodeURIComponent(installId)}/disable`);
}
