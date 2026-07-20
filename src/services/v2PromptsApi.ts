import { apiDelete, apiGet, apiPatch, apiPost } from "./v2HttpClient";

export type PromptMedia = {
  altText: string;
  assetId: string;
  sortOrder: number;
};

export type PromptEntry = {
  category: string;
  createdAt: string;
  createdBy: string | null;
  description: string;
  externalKey: string;
  id: string;
  isFavorite: boolean;
  media: PromptMedia[];
  negativePrompt: string | null;
  promptText: string;
  publishedAt: string | null;
  sortWeight: number;
  status: "archived" | "draft" | "published";
  tags: string[];
  tenantId: string | null;
  title: string;
  updatedAt: string;
  version: number;
};

export type PromptListResponse = {
  items: PromptEntry[];
  nextCursor: string | null;
};

export type PromptListOptions = {
  category?: string;
  cursor?: string;
  limit?: number;
  query?: string;
  view?: "featured" | "favorites" | "latest";
};

export type PromptInteractionInput = {
  eventType: "copy" | "reference" | "view";
  projectId?: string;
};

export type PromptAdminInput = {
  category: string;
  description: string;
  externalKey: string;
  negativePrompt?: string;
  promptText: string;
  sortWeight?: number;
  status?: "archived" | "draft" | "published";
  tags: string[];
  title: string;
};

export async function listPrompts(options: PromptListOptions = {}): Promise<PromptListResponse> {
  const params = new URLSearchParams();
  if (options.query) params.set("query", options.query);
  if (options.category) params.set("category", options.category);
  if (options.view) params.set("view", options.view);
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.limit) params.set("limit", String(options.limit));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiGet<PromptListResponse>(`/prompts${suffix}`);
}

export function getPrompt(promptId: string): Promise<PromptEntry> {
  return apiGet<PromptEntry>(`/prompts/${encodeURIComponent(promptId)}`);
}

export function getPromptMediaDownloadUrl(assetId: string): Promise<{ expiresAt: string; method: "GET"; url: string }> {
  return apiGet(`/prompts/media/${encodeURIComponent(assetId)}/download-url`);
}

export function favoritePrompt(promptId: string, favorite: boolean): Promise<{ isFavorite: boolean }> {
  const path = `/prompts/${encodeURIComponent(promptId)}/favorite`;
  return favorite ? apiPost<{ isFavorite: boolean }>(path) : apiDelete<{ isFavorite: boolean }>(path);
}

export function recordPromptInteraction(promptId: string, input: PromptInteractionInput): Promise<{ ok: true }> {
  return apiPost<{ ok: true }>(`/prompts/${encodeURIComponent(promptId)}/interactions`, input);
}

export function listAdminPrompts(): Promise<PromptEntry[]> {
  return apiGet<PromptEntry[]>("/admin/prompts");
}

export function createAdminPrompt(input: PromptAdminInput): Promise<PromptEntry> {
  return apiPost<PromptEntry>("/admin/prompts", input);
}

export function updateAdminPrompt(promptId: string, input: PromptAdminInput): Promise<PromptEntry> {
  return apiPatch<PromptEntry>(`/admin/prompts/${encodeURIComponent(promptId)}`, input);
}

export function setAdminPromptStatus(
  promptId: string,
  status: PromptEntry["status"],
): Promise<PromptEntry> {
  return apiPost<PromptEntry>(`/admin/prompts/${encodeURIComponent(promptId)}/status`, { status });
}

export function validatePromptImport(rows: Array<Partial<PromptAdminInput>>): Promise<{
  errors: Array<{ index: number; message: string }>;
  rows: Array<Partial<PromptAdminInput>>;
}> {
  return apiPost("/admin/prompts/import/validate", { rows });
}

export function importPrompts(rows: Array<Partial<PromptAdminInput>>): Promise<{
  created: number;
  errors: Array<{ index: number; message: string }>;
}> {
  return apiPost("/admin/prompts/import", { rows });
}
