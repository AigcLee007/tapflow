import { apiDelete, apiGet, apiPatch, apiPost, getStoredAccessToken, V2HttpError } from "./v2HttpClient";

export type PromptMedia = {
  altText: string;
  height: number | null;
  id: string;
  mimeType: string;
  originalFilename: string;
  sizeBytes: number | null;
  sortOrder: number;
  width: number | null;
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

export async function getPromptMediaBlob(mediaId: string, adminPromptId?: string): Promise<Blob> {
  const token = getStoredAccessToken();
  const path = adminPromptId
    ? `/api/v2/admin/prompts/${encodeURIComponent(adminPromptId)}/media/${encodeURIComponent(mediaId)}/bytes`
    : `/api/v2/prompts/media/${encodeURIComponent(mediaId)}/bytes`;
  const response = await fetch(path, {
    cache: "no-store",
    headers: token ? { Authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new V2HttpError({ message: `效果图加载失败 (${response.status})`, status: response.status });
  return response.blob();
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

export type PromptMediaOrderItem = { altText?: string; id: string; sortOrder: number };

export function listAdminPromptMedia(promptId: string): Promise<PromptMedia[]> {
  return apiGet(`/admin/prompts/${encodeURIComponent(promptId)}/media`);
}

export function updateAdminPromptMediaOrder(promptId: string, media: PromptMediaOrderItem[]): Promise<PromptMedia[]> {
  return apiPatch(`/admin/prompts/${encodeURIComponent(promptId)}/media`, { media });
}

export function deleteAdminPromptMedia(promptId: string, mediaId: string): Promise<{ ok: true }> {
  return apiDelete(`/admin/prompts/${encodeURIComponent(promptId)}/media/${encodeURIComponent(mediaId)}`);
}

export async function uploadAdminPromptMedia(promptId: string, file: File): Promise<PromptMedia> {
  if (!file.type.startsWith("image/")) throw new Error("请选择图片文件");
  const size = await readImageSize(file).catch(() => ({ height: 0, width: 0 }));
  const token = getStoredAccessToken();
  const response = await fetch(`/api/v2/admin/prompts/${encodeURIComponent(promptId)}/media`, {
    body: file,
    cache: "no-store",
    headers: {
      "Content-Type": "application/x-prompt-media",
      "x-prompt-media-content-type": file.type,
      "x-prompt-media-filename": encodeURIComponent(file.name),
      "x-prompt-media-height": String(size.height),
      "x-prompt-media-width": String(size.width),
      ...(token ? { Authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}` } : {}),
    },
    method: "POST",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new V2HttpError({ code: payload?.error?.code, message: payload?.error?.message || "效果图上传失败", status: response.status });
  return payload as PromptMedia;
}

function readImageSize(file: File): Promise<{ height: number; width: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve({ height: image.naturalHeight, width: image.naturalWidth }); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("图片尺寸读取失败")); };
    image.src = url;
  });
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
