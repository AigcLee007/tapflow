import { apiGet } from './v2HttpClient';

export interface AssetDownloadUrlResponse {
  expiresAt: string;
  method: 'GET';
  url: string;
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
