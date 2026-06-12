import { apiDelete, apiGet, apiPatch, apiPost, getStoredAccessToken } from '../services/v2HttpClient';

export type AssetKind = 'image' | 'video' | 'audio' | 'document' | 'other' | string;

export type AssetItem = {
  bucket: string;
  checksumSha256: string | null;
  createdAt: string;
  deletedAt: string | null;
  description: string | null;
  durationMs: number | null;
  favorite: boolean;
  height: number | null;
  id: string;
  kind: AssetKind;
  metadata: Record<string, string>;
  mimeType: string;
  objectKey: string;
  originalFilename: string | null;
  ownerUserId: string | null;
  previewUrl?: string;
  projectId: string | null;
  sizeBytes: number | null;
  source: string;
  status: string;
  storageProvider: string;
  tags: string[];
  tenantId: string;
  title: string | null;
  updatedAt: string;
  variants: Array<{
    bucket: string;
    height: number | null;
    id: string;
    metadata: Record<string, string>;
    mimeType: string;
    objectKey: string;
    sizeBytes: number | null;
    variantKey: string;
    width: number | null;
  }>;
  width: number | null;
};

export type AssetFolder = {
  createdAt: string;
  createdBy: string | null;
  deletedAt: string | null;
  description: string | null;
  id: string;
  name: string;
  parentFolderId: string | null;
  tenantId: string;
  updatedAt: string;
};

export type AssetListResponse = {
  items: AssetItem[];
  page: number;
  pageSize: number;
  total: number;
};

export type AssetListParams = {
  favorite?: boolean;
  folderId?: string | null;
  kind?: string;
  page?: number;
  pageSize?: number;
  projectId?: string | null;
  query?: string;
  source?: string;
};

export type AssetDownloadUrlResponse = {
  expiresAt: string;
  method: 'GET';
  url: string;
};

export type AssetSignedUrl = {
  assetId: string;
  expiresAt: string;
  method: 'GET';
  url: string;
  variantKey: string | null;
};

export type PresignedUploadResponse = {
  asset: AssetItem;
  upload: {
    expiresAt: string;
    headers: Record<string, string>;
    method: 'PUT';
    url: string;
  };
};

function toQuery(params: AssetListParams = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

export async function listAssets(params?: AssetListParams): Promise<AssetListResponse> {
  return apiGet<AssetListResponse>(`/assets${toQuery(params)}`);
}

export async function listAssetFolders(): Promise<AssetFolder[]> {
  return apiGet<AssetFolder[]>('/assets/folders');
}

export async function createAssetFolder(input: {
  description?: string | null;
  name: string;
  parentFolderId?: string | null;
}): Promise<AssetFolder> {
  return apiPost<AssetFolder>('/assets/folders', input);
}

export async function getAsset(assetId: string): Promise<AssetItem> {
  return apiGet<AssetItem>(`/assets/${assetId}`);
}

export async function getAssetDownloadUrl(assetId: string): Promise<AssetDownloadUrlResponse> {
  return apiGet<AssetDownloadUrlResponse>(`/assets/${assetId}/download-url`);
}

export async function getAssetVariantUrl(
  assetId: string,
  variantKey?: string,
): Promise<AssetDownloadUrlResponse & { variantKey?: string | null }> {
  const query = variantKey ? `?variantKey=${encodeURIComponent(variantKey)}` : '';
  return apiGet<AssetDownloadUrlResponse & { variantKey?: string | null }>(
    `/assets/${assetId}/download-url${query}`,
  );
}

export async function getAssetSignedUrls(
  requests: Array<{ assetId: string; variantKey?: string }>,
): Promise<{ items: AssetSignedUrl[] }> {
  return apiPost<{ items: AssetSignedUrl[] }>('/assets/signed-urls', { requests });
}

export async function updateAssetMetadata(
  assetId: string,
  input: {
    description?: string | null;
    favorite?: boolean;
    metadata?: Record<string, string>;
    source?: string;
    tags?: string[];
    title?: string | null;
  },
): Promise<AssetItem> {
  return apiPatch<AssetItem>(`/assets/${assetId}/metadata`, input);
}

export async function addAssetToFolder(folderId: string, assetId: string): Promise<{ ok: true }> {
  return apiPost<{ ok: true }>(`/assets/folders/${folderId}/items`, { assetId });
}

export async function removeAssetFromFolder(folderId: string, assetId: string): Promise<{ ok: true }> {
  return apiDelete<{ ok: true }>(`/assets/folders/${folderId}/items/${assetId}`);
}

export async function deleteAsset(assetId: string): Promise<{ ok: true }> {
  return apiDelete<{ ok: true }>(`/assets/${assetId}`);
}

export async function uploadAssetFile(input: {
  file: File;
  kind?: AssetKind;
  projectId?: string | null;
}): Promise<AssetItem> {
  const file = input.file;
  const kind = input.kind ?? kindFromMimeType(file.type);
  const presigned = await apiPost<PresignedUploadResponse>('/assets/presigned-upload', {
    kind,
    mimeType: file.type || 'application/octet-stream',
    originalFilename: file.name,
    projectId: input.projectId ?? null,
    sizeBytes: file.size,
    source: 'upload',
    title: file.name,
  });

  const upload = await uploadAssetBytes(presigned.asset.id, file, presigned.upload);

  if (!upload.ok) {
    const message = (await upload.text().catch(() => '')).trim();
    if (message) {
      throw new Error(`上传失败（状态 ${upload.status}）：${message}`);
    }
    throw new Error(`上传失败（状态 ${upload.status}）。`);
  }

  const completed = await apiPost<AssetItem>(`/assets/${presigned.asset.id}/complete-upload`, {
    sizeBytes: file.size,
  });
  return updateAssetMetadata(completed.id, {
    source: 'upload',
    title: completed.title || file.name,
  });
}

export function kindFromMimeType(mimeType: string): AssetKind {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType === 'application/pdf' || mimeType.startsWith('text/')) return 'document';
  return 'other';
}

async function uploadAssetBytes(
  assetId: string,
  file: File,
  upload: PresignedUploadResponse['upload'],
): Promise<Response> {
  try {
    return await fetch(upload.url, {
      body: file,
      headers: upload.headers,
      method: upload.method,
    });
  } catch (error) {
    if (!isDirectUploadFetchFailure(error)) {
      throw error;
    }
    return uploadAssetBytesViaApi(assetId, file);
  }
}

function isDirectUploadFetchFailure(error: unknown) {
  return error instanceof TypeError || (error instanceof Error && /failed to fetch/i.test(error.message));
}

async function uploadAssetBytesViaApi(assetId: string, file: File): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/octet-stream',
  };
  if (file.type) {
    headers['x-asset-upload-content-type'] = file.type;
  }

  const token = getStoredAccessToken();
  if (token) {
    headers.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  }

  return fetch(`/api/v2/assets/${assetId}/upload-bytes`, {
    body: file,
    cache: 'no-store',
    headers,
    method: 'POST',
  });
}
