import { V2HttpError, getStoredAccessToken } from "./v2HttpClient";

export type ReferenceUploadView = {
  createdAt: string;
  expiresAt: string;
  height: number | null;
  id: string;
  mimeType: string;
  originalFilename: string | null;
  previewUrl: string | null;
  sizeBytes: number;
  width: number | null;
};

export async function uploadReferenceImageFile(input: {
  file: File;
  height?: number | null;
  localPreviewUrl?: string | null;
  width?: number | null;
}): Promise<ReferenceUploadView> {
  const headers: Record<string, string> = {
    "Content-Type": input.file.type || "image/png",
    "x-workbench-filename": encodeURIComponent(input.file.name),
  };
  const token = getStoredAccessToken();
  if (token) headers.Authorization = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
  if (input.width) headers["x-workbench-image-width"] = String(input.width);
  if (input.height) headers["x-workbench-image-height"] = String(input.height);

  return fetch("/api/v2/workbench/reference-uploads", {
    body: input.file,
    cache: "no-store",
    headers,
    method: "POST",
  })
    .then(async (response) => {
      const payload = (await response.json().catch(() => ({}))) as ReferenceUploadView & {
        error?: { code?: string; details?: unknown; message?: string; requestId?: string };
      };
      if (!response.ok) {
        throw new V2HttpError({
          code: payload.error?.code,
          details: payload.error?.details,
          message: payload.error?.message || `Request failed with status ${response.status}`,
          requestId: payload.error?.requestId,
          status: response.status,
        });
      }
      return payload;
    })
    .then((upload) => ({
      ...upload,
      originalFilename: upload.originalFilename || input.file.name,
      previewUrl: input.localPreviewUrl || upload.previewUrl || null,
    }));
}
